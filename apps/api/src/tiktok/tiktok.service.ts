import { Injectable, BadRequestException, NotFoundException } from "@nestjs/common";
import { prisma } from "@ecomdash/database";
import axios from "axios";
import * as crypto from "crypto";

const TIKTOK_SHOP_AUTH_URL = "https://auth.tiktok-shops.com/oauth/authorize";
const TIKTOK_SHOP_TOKEN_URL = "https://auth.tiktok-shops.com/api/v2/token/get";
const TIKTOK_ADS_AUTH_URL = "https://ads.tiktok.com/marketing_api/auth";
const TIKTOK_ADS_TOKEN_URL = "https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/";

function encrypt(plaintext: string): string {
  const key = Buffer.from(process.env.ENCRYPTION_KEY || "", "base64");
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, nonce);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([nonce, encrypted, authTag]).toString("base64");
}

@Injectable()
export class TiktokService {
  // ── TikTok Shop ────────────────────────────────────────────────────────────

  getShopAuthUrl(orgId: string) {
    const appKey = process.env.TIKTOK_APP_KEY || "";
    const redirectUri = process.env.TIKTOK_REDIRECT_URI || "";
    const state = Buffer.from(JSON.stringify({ orgId, type: "shop" })).toString("base64");

    const url = `${TIKTOK_SHOP_AUTH_URL}?app_key=${appKey}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
    return { url };
  }

  private async checkShopLimit(orgId: string) {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { plan: true, _count: { select: { shops: true } } },
    });
    const limits: Record<string, number> = { STARTER: 1, PRO: 5, ENTERPRISE: Infinity };
    const limit = limits[org?.plan ?? "STARTER"] ?? 1;
    if ((org?._count.shops ?? 0) >= limit) {
      throw new BadRequestException(
        `Gói ${org?.plan} chỉ hỗ trợ tối đa ${limit} shop. Nâng cấp để thêm shop.`
      );
    }
  }

  async connectShop(orgId: string, code: string, tiktokShopId: string) {
    await this.checkShopLimit(orgId);
    const appKey = process.env.TIKTOK_APP_KEY || "";
    const appSecret = process.env.TIKTOK_APP_SECRET || "";

    const { data } = await axios.get(TIKTOK_SHOP_TOKEN_URL, {
      params: { app_key: appKey, app_secret: appSecret, code, grant_type: "authorized_code" },
    });

    if (data.code !== 0) {
      throw new BadRequestException(`TikTok token error: ${data.message}`);
    }

    const { access_token, refresh_token, access_token_expire_in } = data.data;
    const tokenExpiresAt = new Date(Date.now() + access_token_expire_in * 1000);

    // Fetch shop name from TikTok API
    let shopName = tiktokShopId;
    try {
      const shopRes = await axios.get(
        "https://open-api.tiktokglobalshop.com/authorization/202309/shops",
        { headers: { "x-tts-access-token": access_token } }
      );
      const shop = shopRes.data?.data?.shops?.find((s: any) => s.id === tiktokShopId);
      if (shop) shopName = shop.name;
    } catch {
      // fallback to tiktokShopId
    }

    const shop = await prisma.shop.upsert({
      where: { tiktokShopId },
      update: {
        accessTokenEncrypted: encrypt(access_token),
        refreshTokenEncrypted: encrypt(refresh_token),
        tokenExpiresAt,
        syncStatus: "PENDING",
        name: shopName,
      },
      create: {
        organizationId: orgId,
        tiktokShopId,
        name: shopName,
        region: "VN",
        accessTokenEncrypted: encrypt(access_token),
        refreshTokenEncrypted: encrypt(refresh_token),
        tokenExpiresAt,
        syncStatus: "PENDING",
      },
    });

    return { shopId: shop.id, name: shop.name, syncStatus: shop.syncStatus };
  }

  async listShops(orgId: string) {
    return prisma.shop.findMany({
      where: { organizationId: orgId },
      select: { id: true, name: true, region: true, syncStatus: true, lastSyncedAt: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
  }

  async removeShop(orgId: string, shopId: string) {
    const shop = await prisma.shop.findFirst({ where: { id: shopId, organizationId: orgId } });
    if (!shop) throw new NotFoundException("Shop not found");
    await prisma.shop.delete({ where: { id: shopId } });
    return { removed: true };
  }

  // ── TikTok Ads ─────────────────────────────────────────────────────────────

  getAdsAuthUrl(orgId: string) {
    const appId = process.env.TIKTOK_ADS_APP_ID || "";
    const redirectUri = process.env.TIKTOK_REDIRECT_URI || "";
    const state = Buffer.from(JSON.stringify({ orgId, type: "ads" })).toString("base64");

    const url = `${TIKTOK_ADS_AUTH_URL}?app_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
    return { url };
  }

  async connectAdAccount(
    orgId: string,
    code: string,
    advertiserId: string,
    shopId?: string
  ) {
    const appId = process.env.TIKTOK_ADS_APP_ID || "";
    const appSecret = process.env.TIKTOK_ADS_APP_SECRET || "";

    const { data } = await axios.post(TIKTOK_ADS_TOKEN_URL, {
      app_id: appId,
      secret: appSecret,
      auth_code: code,
    });

    if (data.code !== 0) {
      throw new BadRequestException(`TikTok Ads token error: ${data.message}`);
    }

    const { access_token } = data.data;

    // Fetch advertiser name
    let accountName = advertiserId;
    try {
      const infoRes = await axios.get(
        "https://business-api.tiktok.com/open_api/v1.3/advertiser/info/",
        {
          headers: { "Access-Token": access_token },
          params: { advertiser_ids: JSON.stringify([advertiserId]) },
        }
      );
      const info = infoRes.data?.data?.list?.[0];
      if (info) accountName = info.advertiser_name;
    } catch {
      // fallback
    }

    const account = await prisma.adAccount.upsert({
      where: { tiktokAdvertiserId: advertiserId },
      update: {
        accessTokenEncrypted: encrypt(access_token),
        refreshTokenEncrypted: encrypt(access_token), // TikTok Ads uses long-lived tokens
        syncStatus: "PENDING",
        name: accountName,
        shopId: shopId || null,
      },
      create: {
        organizationId: orgId,
        shopId: shopId || null,
        tiktokAdvertiserId: advertiserId,
        name: accountName,
        accessTokenEncrypted: encrypt(access_token),
        refreshTokenEncrypted: encrypt(access_token),
        syncStatus: "PENDING",
      },
    });

    return { accountId: account.id, name: account.name, syncStatus: account.syncStatus };
  }

  async listAdAccounts(orgId: string) {
    return prisma.adAccount.findMany({
      where: { organizationId: orgId },
      select: { id: true, name: true, syncStatus: true, lastSyncedAt: true, shopId: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
  }

  async removeAdAccount(orgId: string, accountId: string) {
    const account = await prisma.adAccount.findFirst({ where: { id: accountId, organizationId: orgId } });
    if (!account) throw new NotFoundException("Ad account not found");
    await prisma.adAccount.delete({ where: { id: accountId } });
    return { removed: true };
  }
}
