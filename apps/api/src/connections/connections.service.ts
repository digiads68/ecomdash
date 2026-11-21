import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { prisma } from "@ecomdash/database";
import type { ConnectionsDto } from "@ecomdash/shared";
import { config } from "../config";
import { encryptToken } from "../common/crypto";
import { resolveOrgId } from "../common/util";
import { Access, canEditOrg, canRemoveConnections, seesAllShops } from "../access/access";
import { adsAuthClient, rootShopClient, shopAuthClient } from "../tiktok/clients";
import { QueueService } from "../sync/queue.service";
import { SchedulerService } from "../sync/scheduler.service";
import { orgLinkStatus } from "../orgs/org-status";
import { audit } from "../orgs/audit";
import { initOrganization } from "../orgs/defaults";
import { OAuthState, signState, verifyState } from "./state";

const PLAN_LIMITS: Record<string, number | null> = { STARTER: 1, PRO: 5, ENTERPRISE: null };
const slugify = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "shop";

export interface CallbackResult {
  redirect: string;
  sessionUserId?: string;
}

@Injectable()
export class ConnectionsService {
  private readonly logger = new Logger("Connections");
  constructor(private readonly queue: QueueService, private readonly scheduler: SchedulerService) {}

  // ───── authorize links ─────
  shopAuthorizeUrl(access: Access, orgId: string | undefined, returnTo?: string) {
    const id = resolveOrgId(access, orgId, "edit");
    return { url: shopAuthClient().buildAuthorizeUrl(signState({ intent: "connect", orgId: id, byUserId: access.userId, returnTo })) };
  }

  adsAuthorizeUrl(access: Access, orgId: string | undefined, returnTo?: string) {
    const id = resolveOrgId(access, orgId, "edit");
    return { url: adsAuthClient().buildAuthorizeUrl(signState({ intent: "connect", orgId: id, byUserId: access.userId, returnTo }), config().TIKTOK_ADS_REDIRECT_URI) };
  }

  agencyAuthorizeUrl(access: Access) {
    if (!seesAllShops(access)) throw new ForbiddenException();
    return { url: adsAuthClient().buildAuthorizeUrl(signState({ intent: "agency", byUserId: access.userId }), config().TIKTOK_ADS_REDIRECT_URI) };
  }

  /** Links an admin sends to a client so the client authorizes straight into their organisation (12 §3.2). Valid 7 days. */
  async inviteLinks(access: Access, orgId: string) {
    if (!seesAllShops(access) && !canEditOrg(access, orgId)) throw new ForbiddenException();
    const st = { intent: "connect" as const, orgId, byUserId: access.userId, returnTo: "/onboarding" };
    return {
      shopUrl: shopAuthClient().buildAuthorizeUrl(signState(st, "7d")),
      adsUrl: adsAuthClient().buildAuthorizeUrl(signState(st, "7d"), config().TIKTOK_ADS_REDIRECT_URI),
    };
  }

  async checkShopLimit(orgId: string, adding: number) {
    if (adding <= 0) return;
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId }, include: { _count: { select: { shops: true } } } });
    const max = PLAN_LIMITS[org.plan];
    if (max != null && org._count.shops + adding > max) throw new ForbiddenException(`Gói ${org.plan} cho phép tối đa ${max} shop`);
  }

  private async uniqueSlug(name: string) {
    const base = slugify(name);
    for (let i = 0; ; i++) {
      const slug = i ? `${base}-${i + 1}` : base;
      if (!(await prisma.organization.findUnique({ where: { slug } }))) return slug;
    }
  }

  /** User that owns a seller authorization (keyed by TikTok open_id); created on first sign-in. */
  private async ownerFor(openId: string, sellerName: string, orgId: string) {
    let user = await prisma.user.findUnique({ where: { tiktokOpenId: openId } });
    if (!user) user = await prisma.user.create({ data: { tiktokOpenId: openId, name: sellerName } });
    await prisma.organizationMember.upsert({
      where: { organizationId_userId: { organizationId: orgId, userId: user.id } },
      create: { organizationId: orgId, userId: user.id, role: "OWNER" },
      update: { status: "ACTIVE" },
    });
    return user;
  }

  /**
   * TikTok Shop authorization callback (12 §3):
   * - login intent → sign up (new organisation) or sign in (existing) by open_id
   * - connect intent → attach to the organisation in state
   * - no state (Seller Center App Store) → store unassigned, DigiAds assigns it later
   */
  async completeShop(code: string, rawState: string | undefined): Promise<CallbackResult> {
    const st: OAuthState | null = verifyState(rawState);
    const t = await shopAuthClient().getToken(code);
    const shops = await rootShopClient(t.access_token).getAuthorizedShops();
    const tokenData = {
      sellerName: t.seller_name,
      sellerBaseRegion: t.seller_base_region,
      accessTokenEncrypted: encryptToken(t.access_token),
      refreshTokenEncrypted: encryptToken(t.refresh_token),
      accessExpiresAt: new Date(t.access_token_expire_in * 1000),
      refreshExpiresAt: new Date(t.refresh_token_expire_in * 1000),
      grantedScopes: t.granted_scopes,
      status: "ACTIVE" as const,
      lastRefreshedAt: new Date(),
    };
    const existing = await prisma.sellerAuthorization.findUnique({ where: { openId: t.open_id } });

    let orgId: string | null = existing?.organizationId ?? null;
    let created = false;
    if (st?.intent === "connect") {
      if (!st.orgId || !(await prisma.organization.findUnique({ where: { id: st.orgId } }))) throw new BadRequestException("Tổ chức không tồn tại");
      if (orgId && orgId !== st.orgId) throw new BadRequestException("Tài khoản TikTok Shop này đã gắn với một tổ chức khác trên EcomDash");
      orgId = st.orgId;
    } else if (st?.intent === "login" && !orgId) {
      const org = await prisma.organization.create({ data: { name: t.seller_name, slug: await this.uniqueSlug(t.seller_name), plan: "PRO" } });
      orgId = org.id;
      created = true;
      await initOrganization(org.id);
    }

    const known = await prisma.shop.findMany({ where: { tiktokShopId: { in: shops.map((s) => s.id) } } });
    const foreign = known.find((s) => s.organizationId && orgId && s.organizationId !== orgId);
    if (foreign) throw new BadRequestException(`Shop "${foreign.name}" đã thuộc một tổ chức khác`);
    if (orgId) await this.checkShopLimit(orgId, shops.length - known.filter((s) => s.organizationId === orgId).length);

    const source = st ? (st.intent === "connect" && st.byUserId && (await this.isStaff(st.byUserId)) ? "ADMIN_LINK" : "SELF_SIGNUP") : "APP_STORE";
    const auth = await prisma.sellerAuthorization.upsert({
      where: { openId: t.open_id },
      create: { openId: t.open_id, organizationId: orgId, source, ...tokenData },
      update: { ...tokenData, ...(orgId ? { organizationId: orgId } : {}) },
    });
    for (const s of shops) {
      const shop = await prisma.shop.upsert({
        where: { tiktokShopId: s.id },
        create: { organizationId: orgId, sellerAuthorizationId: auth.id, tiktokShopId: s.id, cipher: s.cipher, code: s.code, name: s.name, region: s.region, sellerType: s.seller_type },
        update: { sellerAuthorizationId: auth.id, cipher: s.cipher, code: s.code, name: s.name, region: s.region, sellerType: s.seller_type, ...(orgId ? { organizationId: orgId } : {}) },
      });
      await prisma.shopConfig.upsert({ where: { shopId: shop.id }, create: { shopId: shop.id }, update: {} });
      if (!known.some((k) => k.id === shop.id)) await this.queue.enqueue("shop.backfill", { shopId: shop.id });
      if (orgId) await this.scheduler.registerShop(shop.id);
    }
    if (orgId) await this.scheduler.registerOrg(orgId);
    await audit({ actorId: st?.byUserId ?? null, action: existing ? "shop.reauthorized" : "shop.connected", organizationId: orgId, targetType: "SellerAuthorization", targetId: auth.id, meta: { sellerName: t.seller_name, shops: shops.map((s) => s.name), source } });

    if (!st) return { redirect: `${config().APP_URL}/login?notice=app_store` };
    if (st.intent === "login") {
      const owner = await this.ownerFor(t.open_id, t.seller_name, orgId!);
      return { sessionUserId: owner.id, redirect: `${config().APP_URL}${created ? "/onboarding" : "/dashboard"}` };
    }
    return { redirect: `${config().APP_URL}${st.returnTo ?? "/settings/connections"}?connected=shop&count=${shops.length}` };
  }

  private async isStaff(userId: string) {
    return !!(await prisma.user.findFirst({ where: { id: userId, platformRole: { not: null } } }));
  }

  /** TikTok for Business callback: a client's own ad accounts, or the DigiAds Business Center (agency). */
  async completeAds(authCode: string, rawState: string | undefined): Promise<CallbackResult> {
    const st = verifyState(rawState);
    if (!st || st.intent === "login") throw new BadRequestException("Thiếu thông tin tổ chức — hãy bắt đầu từ EcomDash");
    const agency = st.intent === "agency";
    if (!agency && !(st.orgId && (await prisma.organization.findUnique({ where: { id: st.orgId } })))) throw new BadRequestException("Tổ chức không tồn tại");
    const client = adsAuthClient();
    const t = await client.getAccessToken(authCode);
    const auth = await prisma.adsAuthorization.create({
      data: { organizationId: agency ? null : st.orgId!, kind: agency ? "AGENCY_BC" : "CLIENT", label: agency ? "Business Center DigiAds" : null, accessTokenEncrypted: encryptToken(t.access_token), scopes: (t.scope ?? []).map(String) },
    });
    const advertisers = await client.getAuthorizedAdvertisers(t.access_token);
    const skipped: string[] = [];
    for (const a of advertisers) {
      const cur = await prisma.advertiser.findUnique({ where: { tiktokAdvertiserId: a.advertiser_id } });
      if (!agency && cur?.organizationId && cur.organizationId !== st.orgId) { skipped.push(a.advertiser_name); continue; }
      const adv = await prisma.advertiser.upsert({
        where: { tiktokAdvertiserId: a.advertiser_id },
        create: { tiktokAdvertiserId: a.advertiser_id, name: a.advertiser_name, organizationId: agency ? null : st.orgId! },
        update: { name: a.advertiser_name, isActive: true, ...(!agency && !cur?.organizationId ? { organizationId: st.orgId } : {}) },
      });
      await prisma.advertiserAuthorization.upsert({
        where: { advertiserId_adsAuthorizationId: { advertiserId: adv.id, adsAuthorizationId: auth.id } },
        create: { advertiserId: adv.id, adsAuthorizationId: auth.id },
        update: {},
      });
      if (!cur) await this.queue.enqueue("ads.backfill", { advertiserId: adv.id });
      else await this.queue.enqueue("ads.entities", { advertiserId: adv.id });
      await this.scheduler.registerAdvertiser(adv.id);
    }
    if (!agency) await this.scheduler.registerOrg(st.orgId!);
    await audit({ actorId: st.byUserId ?? null, action: agency ? "agency.connected" : "ads.connected", organizationId: agency ? null : st.orgId!, targetType: "AdsAuthorization", targetId: auth.id, meta: { advertisers: advertisers.map((a) => a.advertiser_name), skipped } });
    if (agency) return { redirect: `${config().APP_URL}/admin/agency?connected=1&count=${advertisers.length}` };
    return { redirect: `${config().APP_URL}${st.returnTo ?? "/settings/connections"}?connected=ads&count=${advertisers.length - skipped.length}${skipped.length ? `&skipped=${encodeURIComponent(skipped.join(", "))}` : ""}` };
  }

  // ───── views and edits ─────
  async list(access: Access, orgIdParam: string | undefined): Promise<ConnectionsDto> {
    const orgId = resolveOrgId(access, orgIdParam);
    const [org, sellers, advertisers, lastOrders, status] = await Promise.all([
      prisma.organization.findUniqueOrThrow({ where: { id: orgId }, include: { _count: { select: { shops: true } } } }),
      prisma.sellerAuthorization.findMany({ where: { organizationId: orgId }, include: { shops: { orderBy: { createdAt: "asc" } } }, orderBy: { createdAt: "asc" } }),
      prisma.advertiser.findMany({ where: { organizationId: orgId }, include: { storeLinks: { include: { shop: true } }, authorizations: { include: { adsAuthorization: true } } }, orderBy: { createdAt: "asc" } }),
      prisma.syncState.findMany({ where: { resource: "orders", scopeType: "SHOP" } }),
      orgLinkStatus(orgId),
    ]);
    const shopTz = new Map(sellers.flatMap((a) => a.shops.map((s) => [s.id, s.timezone] as const)));
    const lastSync = new Map(lastOrders.map((s) => [s.scopeId, s.lastSuccessAt?.toISOString() ?? null]));
    const byAuth = new Map<string, { auth: (typeof advertisers)[number]["authorizations"][number]["adsAuthorization"]; advs: typeof advertisers }>();
    for (const v of advertisers) for (const link of v.authorizations) {
      const g = byAuth.get(link.adsAuthorizationId) ?? { auth: link.adsAuthorization, advs: [] };
      g.advs.push(v);
      byAuth.set(link.adsAuthorizationId, g);
    }
    return {
      organizationId: orgId,
      canEdit: canEditOrg(access, orgId),
      canRemove: canRemoveConnections(access, orgId),
      status,
      sellerAuthorizations: sellers.map((a) => ({
        id: a.id, sellerName: a.sellerName, source: a.source, status: a.status, accessExpiresAt: a.accessExpiresAt.toISOString(), refreshExpiresAt: a.refreshExpiresAt.toISOString(),
        grantedScopes: a.grantedScopes,
        shops: a.shops.map((s) => ({ id: s.id, name: s.name, code: s.code, region: s.region, isActive: s.isActive, lastOrderSyncAt: lastSync.get(s.id) ?? null })),
      })),
      adsAuthorizations: [...byAuth.values()].map(({ auth, advs }) => ({
        id: auth.id, status: auth.status, kind: auth.kind, label: auth.label,
        advertisers: advs.map((v) => ({
          id: v.id, name: v.name, currency: v.currency, timezone: v.timezone,
          timezoneMismatch: v.storeLinks.some((l) => l.shopId && shopTz.get(l.shopId) && shopTz.get(l.shopId) !== v.timezone),
          storeLinks: v.storeLinks.map((l) => ({ id: l.id, storeId: l.storeId, storeName: l.storeName, shopId: l.shopId, shopName: l.shop?.name ?? null, matchedBy: l.matchedBy })),
        })),
      })),
      plan: { name: org.plan, maxShops: PLAN_LIMITS[org.plan], usedShops: org._count.shops },
    };
  }

  async setShopActive(access: Access, shopId: string, isActive: boolean) {
    const shop = await prisma.shop.findUnique({ where: { id: shopId } });
    if (!shop?.organizationId || !canEditOrg(access, shop.organizationId)) throw new NotFoundException();
    await prisma.shop.update({ where: { id: shopId }, data: { isActive } });
    if (isActive) await this.scheduler.registerShop(shopId);
    else await this.scheduler.unregister(shopId);
    return { ok: true };
  }

  async setStoreLink(access: Access, linkId: string, shopId: string | null) {
    const link = await prisma.advertiserStoreLink.findUnique({ where: { id: linkId }, include: { advertiser: true } });
    if (!link?.advertiser.organizationId || !canEditOrg(access, link.advertiser.organizationId)) throw new NotFoundException();
    if (shopId && !(await prisma.shop.findFirst({ where: { id: shopId, organizationId: link.advertiser.organizationId } }))) throw new NotFoundException("Shop not found");
    await prisma.advertiserStoreLink.update({ where: { id: linkId }, data: { shopId, matchedBy: shopId ? "MANUAL" : null } });
    for (const id of [shopId, link.shopId].filter(Boolean) as string[]) await this.queue.requestPnlRecompute(id, "2000-01-01");
    await audit({ actorId: access.userId, action: "store.matched", organizationId: link.advertiser.organizationId, targetType: "AdvertiserStoreLink", targetId: linkId, meta: { shopId } });
    return { ok: true };
  }

  async setAdsMode(access: Access, orgId: string, mode: "TIKTOK" | "NONE") {
    resolveOrgId(access, orgId, "edit");
    await prisma.organization.update({ where: { id: orgId }, data: { adsMode: mode } });
    return orgLinkStatus(orgId);
  }

  async markOnboarded(access: Access, orgId: string) {
    resolveOrgId(access, orgId, "edit");
    await prisma.organization.update({ where: { id: orgId }, data: { onboardedAt: new Date() } });
    return orgLinkStatus(orgId);
  }

  async removeSellerAuthorization(access: Access, id: string) {
    const a = await prisma.sellerAuthorization.findUnique({ where: { id }, include: { shops: true } });
    if (!a?.organizationId || !canRemoveConnections(access, a.organizationId)) throw new NotFoundException();
    for (const s of a.shops) await this.scheduler.unregister(s.id);
    await prisma.advertiserStoreLink.updateMany({ where: { shopId: { in: a.shops.map((s) => s.id) } }, data: { shopId: null, matchedBy: null } });
    await prisma.sellerAuthorization.delete({ where: { id } });
    await audit({ actorId: access.userId, action: "shop.removed", organizationId: a.organizationId, targetType: "SellerAuthorization", targetId: id, meta: { sellerName: a.sellerName } });
    return { ok: true };
  }
}

