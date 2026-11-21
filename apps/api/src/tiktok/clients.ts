import { AdsAuthClient, AdsClient, ShopAuthClient, ShopClient, TokenExpiredError } from "@ecomdash/tiktok-client";
import { prisma } from "@ecomdash/database";
import { config } from "../config";
import { decryptToken, encryptToken } from "../common/crypto";

export function shopAuthClient(): ShopAuthClient {
  const c = config();
  return new ShopAuthClient({
    authBaseUrl: c.TIKTOK_AUTH_BASE_URL, authorizeUrl: c.TIKTOK_SHOP_AUTHORIZE_URL, serviceId: c.TIKTOK_SHOP_SERVICE_ID,
    appKey: c.TIKTOK_APP_KEY, appSecret: c.TIKTOK_APP_SECRET,
  });
}

export function adsAuthClient(): AdsAuthClient {
  const c = config();
  return new AdsAuthClient({ baseUrl: c.TIKTOK_ADS_BASE_URL, authorizeUrl: c.TIKTOK_ADS_AUTHORIZE_URL, appId: c.TIKTOK_ADS_APP_ID, secret: c.TIKTOK_ADS_APP_SECRET });
}

/** Persist a fresh token pair (01 §2: *_expire_in are absolute unix seconds). */
export async function saveShopToken(sellerAuthorizationId: string, t: { access_token: string; refresh_token: string; access_token_expire_in: number; refresh_token_expire_in: number }) {
  await prisma.sellerAuthorization.update({
    where: { id: sellerAuthorizationId },
    data: {
      accessTokenEncrypted: encryptToken(t.access_token),
      refreshTokenEncrypted: encryptToken(t.refresh_token),
      accessExpiresAt: new Date(t.access_token_expire_in * 1000),
      refreshExpiresAt: new Date(t.refresh_token_expire_in * 1000),
      lastRefreshedAt: new Date(),
      status: "ACTIVE",
    },
  });
}

/**
 * Refresh under a Postgres advisory lock so concurrent workers refresh only once (04 §4).
 * Returns the access token to use.
 */
export async function refreshSellerToken(sellerAuthorizationId: string, force = false): Promise<string> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${sellerAuthorizationId}))`;
    const a = await tx.sellerAuthorization.findUniqueOrThrow({ where: { id: sellerAuthorizationId } });
    if (!force && a.accessExpiresAt.getTime() > Date.now() + 5 * 60_000) return decryptToken(a.accessTokenEncrypted);
    try {
      const t = await shopAuthClient().refreshToken(decryptToken(a.refreshTokenEncrypted));
      await tx.sellerAuthorization.update({
        where: { id: a.id },
        data: {
          accessTokenEncrypted: encryptToken(t.access_token),
          refreshTokenEncrypted: encryptToken(t.refresh_token),
          accessExpiresAt: new Date(t.access_token_expire_in * 1000),
          refreshExpiresAt: new Date(t.refresh_token_expire_in * 1000),
          lastRefreshedAt: new Date(),
          status: "ACTIVE",
        },
      });
      return t.access_token;
    } catch (e) {
      await tx.sellerAuthorization.update({ where: { id: a.id }, data: { status: "NEEDS_REAUTH" } });
      if (a.organizationId) {
        await tx.alertInstance.create({
          data: { organizationId: a.organizationId, kind: "AUTH_EXPIRING", title: `Uỷ quyền TikTok Shop của "${a.sellerName}" cần cấp lại`, state: "FIRING", metadata: { error: String(e) } },
        });
      }
      throw e;
    }
  }, { timeout: 60_000 });
}

export async function shopClientFor(shopId: string): Promise<ShopClient> {
  const shop = await prisma.shop.findUniqueOrThrow({ where: { id: shopId }, include: { sellerAuthorization: true } });
  const auth = shop.sellerAuthorization;
  let token = decryptToken(auth.accessTokenEncrypted);
  if (auth.accessExpiresAt.getTime() < Date.now() + 5 * 60_000) token = await refreshSellerToken(auth.id);
  const c = config();
  return new ShopClient({
    baseUrl: c.TIKTOK_SHOP_BASE_URL, appKey: c.TIKTOK_APP_KEY, appSecret: c.TIKTOK_APP_SECRET, accessToken: token, shopCipher: shop.cipher,
    rps: c.TIKTOK_SHOP_RPS, onTokenExpired: () => refreshSellerToken(auth.id, true),
  });
}

export function rootShopClient(accessToken: string): ShopClient {
  const c = config();
  return new ShopClient({ baseUrl: c.TIKTOK_SHOP_BASE_URL, appKey: c.TIKTOK_APP_KEY, appSecret: c.TIKTOK_APP_SECRET, accessToken, rps: c.TIKTOK_SHOP_RPS });
}

/**
 * An advertiser can be reachable through the client's own OAuth and through DigiAds' Business Center (12 §3.2).
 * Prefer the client's active token, fall back to the agency token.
 */
export async function adsClientFor(advertiserId: string): Promise<{ client: AdsClient; tiktokAdvertiserId: string; authorizationId: string }> {
  const adv = await prisma.advertiser.findUniqueOrThrow({ where: { id: advertiserId }, include: { authorizations: { include: { adsAuthorization: true } } } });
  const tokens = adv.authorizations.map((l) => l.adsAuthorization).filter((a) => a.status === "ACTIVE")
    .sort((a, b) => (a.kind === b.kind ? b.createdAt.getTime() - a.createdAt.getTime() : a.kind === "CLIENT" ? -1 : 1));
  const auth = tokens[0];
  if (!auth) throw new TokenExpiredError(`No active TikTok for Business token for advertiser ${adv.tiktokAdvertiserId}`, 40105);
  const c = config();
  return {
    client: new AdsClient({ baseUrl: c.TIKTOK_ADS_BASE_URL, accessToken: decryptToken(auth.accessTokenEncrypted), rps: c.TIKTOK_ADS_RPS }),
    tiktokAdvertiserId: adv.tiktokAdvertiserId,
    authorizationId: auth.id,
  };
}

export { encryptToken };
