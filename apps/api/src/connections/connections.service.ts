import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import * as jwt from "jsonwebtoken";
import { randomBytes } from "crypto";
import { prisma } from "@ecomdash/database";
import type { ConnectionsDto } from "@ecomdash/shared";
import { config } from "../config";
import { encryptToken } from "../common/crypto";
import { adsAuthClient, rootShopClient, shopAuthClient } from "../tiktok/clients";
import { QueueService } from "../sync/queue.service";
import { SchedulerService } from "../sync/scheduler.service";

const PLAN_LIMITS: Record<string, number | null> = { STARTER: 1, PRO: 5, ENTERPRISE: null };

@Injectable()
export class ConnectionsService {
  constructor(private readonly queue: QueueService, private readonly scheduler: SchedulerService) {}

  signState(orgId: string, kind: "shop" | "ads") {
    return jwt.sign({ orgId, kind, nonce: randomBytes(8).toString("hex") }, config().STATE_JWT_SECRET, { expiresIn: "30m" });
  }

  private verifyState(state: string, kind: "shop" | "ads"): string {
    try {
      const p = jwt.verify(state, config().STATE_JWT_SECRET) as { orgId: string; kind: string };
      if (p.kind !== kind) throw new Error("kind");
      return p.orgId;
    } catch {
      throw new BadRequestException("Invalid or expired state");
    }
  }

  shopAuthorizeUrl(orgId: string) {
    return { url: shopAuthClient().buildAuthorizeUrl(this.signState(orgId, "shop")) };
  }

  adsAuthorizeUrl(orgId: string) {
    return { url: adsAuthClient().buildAuthorizeUrl(this.signState(orgId, "ads"), config().TIKTOK_ADS_REDIRECT_URI) };
  }

  /** Plan limits (CLAUDE.md "Plan Limits"), checked before adding shops. */
  async checkShopLimit(orgId: string, adding: number) {
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId }, include: { _count: { select: { shops: true } } } });
    const max = PLAN_LIMITS[org.plan];
    if (max != null && org._count.shops + adding > max) throw new ForbiddenException(`Gói ${org.plan} cho phép tối đa ${max} shop`);
  }

  /** 01 §2 — exchange the auth code, store the authorization and its shops, start backfill. */
  async completeShop(code: string, state: string) {
    const orgId = this.verifyState(state, "shop");
    const t = await shopAuthClient().getToken(code);
    const auth = await prisma.sellerAuthorization.upsert({
      where: { organizationId_openId: { organizationId: orgId, openId: t.open_id } },
      create: {
        organizationId: orgId, openId: t.open_id, sellerName: t.seller_name, sellerBaseRegion: t.seller_base_region,
        accessTokenEncrypted: encryptToken(t.access_token), refreshTokenEncrypted: encryptToken(t.refresh_token),
        accessExpiresAt: new Date(t.access_token_expire_in * 1000), refreshExpiresAt: new Date(t.refresh_token_expire_in * 1000),
        grantedScopes: t.granted_scopes, lastRefreshedAt: new Date(),
      },
      update: {
        sellerName: t.seller_name, accessTokenEncrypted: encryptToken(t.access_token), refreshTokenEncrypted: encryptToken(t.refresh_token),
        accessExpiresAt: new Date(t.access_token_expire_in * 1000), refreshExpiresAt: new Date(t.refresh_token_expire_in * 1000),
        grantedScopes: t.granted_scopes, status: "ACTIVE", lastRefreshedAt: new Date(),
      },
    });
    const shops = await rootShopClient(t.access_token).getAuthorizedShops();
    const known = await prisma.shop.findMany({ where: { organizationId: orgId, tiktokShopId: { in: shops.map((s) => s.id) } }, select: { tiktokShopId: true } });
    await this.checkShopLimit(orgId, shops.length - known.length);
    for (const s of shops) {
      const shop = await prisma.shop.upsert({
        where: { organizationId_tiktokShopId: { organizationId: orgId, tiktokShopId: s.id } },
        create: { organizationId: orgId, sellerAuthorizationId: auth.id, tiktokShopId: s.id, cipher: s.cipher, code: s.code, name: s.name, region: s.region, sellerType: s.seller_type },
        update: { sellerAuthorizationId: auth.id, cipher: s.cipher, code: s.code, name: s.name, region: s.region, sellerType: s.seller_type },
      });
      await prisma.shopConfig.upsert({ where: { shopId: shop.id }, create: { shopId: shop.id }, update: {} });
      await this.queue.enqueue("shop.backfill", { shopId: shop.id });
      await this.scheduler.registerShop(shop.id);
    }
    return { orgId, shops: shops.length };
  }

  /** 02 §2 — advertiser token is long-lived; list advertisers and start backfill. */
  async completeAds(authCode: string, state: string) {
    const orgId = this.verifyState(state, "ads");
    const client = adsAuthClient();
    const t = await client.getAccessToken(authCode);
    const auth = await prisma.adsAuthorization.create({
      data: { organizationId: orgId, accessTokenEncrypted: encryptToken(t.access_token), scopes: (t.scope ?? []).map(String) },
    });
    const advertisers = await client.getAuthorizedAdvertisers(t.access_token);
    for (const a of advertisers) {
      const adv = await prisma.advertiser.upsert({
        where: { organizationId_tiktokAdvertiserId: { organizationId: orgId, tiktokAdvertiserId: a.advertiser_id } },
        create: { organizationId: orgId, adsAuthorizationId: auth.id, tiktokAdvertiserId: a.advertiser_id, name: a.advertiser_name },
        update: { adsAuthorizationId: auth.id, name: a.advertiser_name, isActive: true },
      });
      await this.queue.enqueue("ads.backfill", { advertiserId: adv.id });
      await this.scheduler.registerAdvertiser(adv.id);
    }
    return { orgId, advertisers: advertisers.length };
  }

  async list(orgId: string): Promise<ConnectionsDto> {
    const [org, sellers, adsAuths, lastOrders] = await Promise.all([
      prisma.organization.findUniqueOrThrow({ where: { id: orgId }, include: { _count: { select: { shops: true } } } }),
      prisma.sellerAuthorization.findMany({ where: { organizationId: orgId }, include: { shops: { orderBy: { createdAt: "asc" } } }, orderBy: { createdAt: "asc" } }),
      prisma.adsAuthorization.findMany({ where: { organizationId: orgId }, include: { advertisers: { include: { storeLinks: { include: { shop: true } } } } }, orderBy: { createdAt: "asc" } }),
      prisma.syncState.findMany({ where: { organizationId: orgId, resource: "orders" } }),
    ]);
    const lastSync = new Map(lastOrders.map((s) => [s.scopeId, s.lastSuccessAt?.toISOString() ?? null]));
    return {
      sellerAuthorizations: sellers.map((a) => ({
        id: a.id, sellerName: a.sellerName, status: a.status, accessExpiresAt: a.accessExpiresAt.toISOString(), refreshExpiresAt: a.refreshExpiresAt.toISOString(),
        grantedScopes: a.grantedScopes,
        shops: a.shops.map((s) => ({ id: s.id, name: s.name, code: s.code, region: s.region, isActive: s.isActive, lastOrderSyncAt: lastSync.get(s.id) ?? null })),
      })),
      adsAuthorizations: adsAuths.map((a) => ({
        id: a.id, status: a.status,
        advertisers: a.advertisers.map((v) => ({
          id: v.id, name: v.name, currency: v.currency, timezone: v.timezone,
          storeLinks: v.storeLinks.map((l) => ({ id: l.id, storeId: l.storeId, storeName: l.storeName, shopId: l.shopId, shopName: l.shop?.name ?? null, matchedBy: l.matchedBy })),
        })),
      })),
      plan: { name: org.plan, maxShops: PLAN_LIMITS[org.plan], usedShops: org._count.shops },
    };
  }

  async setShopActive(orgId: string, shopId: string, isActive: boolean) {
    const shop = await prisma.shop.findFirst({ where: { id: shopId, organizationId: orgId } });
    if (!shop) throw new NotFoundException();
    await prisma.shop.update({ where: { id: shopId }, data: { isActive } });
    if (isActive) await this.scheduler.registerShop(shopId);
    else await this.scheduler.unregister(shopId);
    return { ok: true };
  }

  async setStoreLink(orgId: string, linkId: string, shopId: string | null) {
    const link = await prisma.advertiserStoreLink.findFirst({ where: { id: linkId, advertiser: { organizationId: orgId } } });
    if (!link) throw new NotFoundException();
    if (shopId && !(await prisma.shop.findFirst({ where: { id: shopId, organizationId: orgId } }))) throw new NotFoundException("Shop not found");
    await prisma.advertiserStoreLink.update({ where: { id: linkId }, data: { shopId, matchedBy: shopId ? "MANUAL" : null } });
    for (const id of [shopId, link.shopId].filter(Boolean) as string[]) await this.queue.requestPnlRecompute(id, "2000-01-01");
    return { ok: true };
  }

  async removeSellerAuthorization(orgId: string, id: string) {
    const a = await prisma.sellerAuthorization.findFirst({ where: { id, organizationId: orgId }, include: { shops: true } });
    if (!a) throw new NotFoundException();
    for (const s of a.shops) await this.scheduler.unregister(s.id);
    await prisma.advertiserStoreLink.updateMany({ where: { shopId: { in: a.shops.map((s) => s.id) } }, data: { shopId: null, matchedBy: null } });
    await prisma.sellerAuthorization.delete({ where: { id } });
    return { ok: true };
  }
}
