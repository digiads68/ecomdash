import { BadRequestException, Body, Controller, ForbiddenException, Get, Module, NotFoundException, Param, Patch, Post, UseGuards, CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { prisma, type PlatformRole } from "@ecomdash/database";
import type { AdminOrgDetailDto, AdminOrgRowDto, AuditLogDto, InvitationDto, PoolDto, StaffDto } from "@ecomdash/shared";
import { addDays, toBusinessDate } from "@ecomdash/shared";
import { Acc } from "../common/decorators";
import { Access, isSuperAdmin, seesAllShops } from "../access/access";
import { ConnectionsModule } from "../connections/connections.module";
import { ConnectionsService } from "../connections/connections.service";
import { SchedulerService } from "../sync/scheduler.service";
import { QueueService } from "../sync/queue.service";
import { audit } from "../orgs/audit";
import { initOrganization } from "../orgs/defaults";
import { orgLinkStatus } from "../orgs/org-status";
import { createInvitation, invitationDto, normalizeEmail, orgMembers } from "../orgs/invitations";
import { n } from "../common/util";

/** DigiAds SUPER_ADMIN / ADMIN only. MOD has no admin pages — they only see the shops they were given. */
@Injectable()
class PlatformManagerGuard implements CanActivate {
  canActivate(ctx: ExecutionContext) {
    const access: Access | undefined = ctx.switchToHttp().getRequest().access;
    if (!access || !seesAllShops(access)) throw new ForbiddenException("Chỉ quản trị DigiAds");
    return true;
  }
}

const shopBrief = (s: { id: string; name: string; code: string | null }) => ({ id: s.id, name: s.name, code: s.code });

async function viaFor(advertiserIds: string[]) {
  const links = await prisma.advertiserAuthorization.findMany({ where: { advertiserId: { in: advertiserIds }, adsAuthorization: { status: "ACTIVE" } }, include: { adsAuthorization: { select: { kind: true } } } });
  const m = new Map<string, string[]>();
  for (const l of links) m.set(l.advertiserId, [...new Set([...(m.get(l.advertiserId) ?? []), l.adsAuthorization.kind])]);
  return m;
}

@Controller("admin")
@UseGuards(PlatformManagerGuard)
class AdminController {
  constructor(private readonly connections: ConnectionsService, private readonly scheduler: SchedulerService, private readonly queue: QueueService) {}

  // ───── client organisations ─────
  private async rows(where: { id?: string } = {}): Promise<AdminOrgRowDto[]> {
    const orgs = await prisma.organization.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        shops: { where: { isActive: true }, orderBy: { createdAt: "asc" } },
        members: { where: { role: "OWNER", status: "ACTIVE" }, include: { user: true }, take: 1 },
        sellerAuthorizations: { where: { status: "ACTIVE" }, select: { refreshExpiresAt: true } },
        syncRounds: { where: { finishedAt: { not: null } }, orderBy: { startedAt: "desc" }, take: 1 },
      },
    });
    const from = new Date(`${addDays(toBusinessDate(new Date()), -29)}T00:00:00Z`);
    const revenue = await prisma.shopDailyPnl.groupBy({ by: ["shopId"], where: { date: { gte: from }, shopId: { in: orgs.flatMap((o) => o.shops.map((s) => s.id)) } }, _sum: { realizedRevenue: true } });
    const rev = new Map(revenue.map((r) => [r.shopId, n(r._sum.realizedRevenue)]));
    return Promise.all(orgs.map(async (o) => {
      const owner = o.members[0]?.user;
      const expiries = o.sellerAuthorizations.map((a) => a.refreshExpiresAt.getTime());
      return {
        id: o.id, name: o.name, owner: owner ? (owner.email ?? owner.name) : null, createdAt: o.createdAt.toISOString(),
        status: await orgLinkStatus(o.id), shops: o.shops.map(shopBrief),
        authExpiresAt: expiries.length ? new Date(Math.min(...expiries)).toISOString() : null,
        lastRoundAt: o.syncRounds[0]?.finishedAt?.toISOString() ?? null,
        realizedRevenue30d: o.shops.reduce((s, x) => s + (rev.get(x.id) ?? 0), 0),
      };
    }));
  }

  @Get("orgs")
  list(): Promise<AdminOrgRowDto[]> {
    return this.rows();
  }

  /** Creates a client organisation for a customer who has not signed in yet, and invites its owner by e-mail. */
  @Post("orgs")
  async create(@Acc() access: Access, @Body() b: { name?: string; ownerEmail?: string }) {
    const name = (b.name ?? "").trim();
    if (!name) throw new BadRequestException("Nhập tên khách hàng");
    const slugBase = name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "org";
    let slug = slugBase;
    for (let i = 2; await prisma.organization.findUnique({ where: { slug } }); i++) slug = `${slugBase}-${i}`;
    const org = await prisma.organization.create({ data: { name, slug, plan: "PRO", createdById: access.userId } });
    await initOrganization(org.id, b.ownerEmail ? normalizeEmail(b.ownerEmail) : null);
    let invitation: InvitationDto | null = null;
    if (b.ownerEmail) {
      const me = await prisma.user.findUnique({ where: { id: access.userId } });
      invitation = await createInvitation({ email: normalizeEmail(b.ownerEmail), organizationId: org.id, orgRole: "OWNER", invitedById: access.userId, inviterName: me?.name, orgName: name });
    }
    await audit({ actorId: access.userId, action: "org.created", organizationId: org.id, targetType: "Organization", targetId: org.id, meta: { name, ownerEmail: b.ownerEmail ?? null } });
    return { id: org.id, invitation };
  }

  @Get("orgs/:id")
  async detail(@Param("id") id: string): Promise<AdminOrgDetailDto> {
    const [row] = await this.rows({ id });
    if (!row) throw new NotFoundException();
    const advs = await prisma.advertiser.findMany({ where: { organizationId: id }, orderBy: { createdAt: "asc" } });
    const via = await viaFor(advs.map((a) => a.id));
    return {
      ...row,
      advertisers: advs.map((a) => ({ id: a.id, name: a.name, tiktokAdvertiserId: a.tiktokAdvertiserId, via: via.get(a.id) ?? [] })),
      members: await orgMembers(id),
      audit: await this.auditFor(id),
    };
  }

  private async auditFor(orgId: string): Promise<AuditLogDto[]> {
    const logs = await prisma.auditLog.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: "desc" }, take: 50 });
    const actors = await prisma.user.findMany({ where: { id: { in: logs.map((l) => l.actorId).filter(Boolean) as string[] } } });
    const name = new Map(actors.map((u) => [u.id, u.email ?? u.name]));
    return logs.map((l) => ({ id: l.id, action: l.action, actor: l.actorId ? (name.get(l.actorId) ?? null) : null, targetType: l.targetType, targetId: l.targetId, meta: l.meta as Record<string, unknown>, createdAt: l.createdAt.toISOString() }));
  }

  /** Authorization links (TikTok Shop + TikTok Ads) pre-bound to this organisation, valid 7 days. */
  @Get("orgs/:id/connect-links")
  async connectLinks(@Acc() access: Access, @Param("id") id: string) {
    if (!(await prisma.organization.findUnique({ where: { id } }))) throw new NotFoundException();
    return this.connections.inviteLinks(access, id);
  }

  // ───── unassigned pool and linking on the client's behalf (12 §3.2) ─────
  @Get("pool")
  async pool(): Promise<PoolDto> {
    const [auths, advs] = await Promise.all([
      prisma.sellerAuthorization.findMany({ where: { organizationId: null, status: "ACTIVE" }, include: { shops: true }, orderBy: { createdAt: "desc" } }),
      prisma.advertiser.findMany({ where: { organizationId: null, isActive: true }, include: { storeLinks: true }, orderBy: { createdAt: "desc" } }),
    ]);
    const via = await viaFor(advs.map((a) => a.id));
    const storeIds = advs.flatMap((a) => a.storeLinks.map((l) => l.storeId));
    const shops = await prisma.shop.findMany({ where: { OR: [{ tiktokShopId: { in: storeIds } }, { code: { in: advs.flatMap((a) => a.storeLinks.map((l) => l.storeCode).filter(Boolean) as string[]) } }] } });
    return {
      sellerAuthorizations: auths.map((a) => ({ id: a.id, sellerName: a.sellerName, source: a.source, createdAt: a.createdAt.toISOString(), shops: a.shops.map(shopBrief) })),
      advertisers: advs.map((a) => ({
        id: a.id, tiktokAdvertiserId: a.tiktokAdvertiserId, name: a.name, currency: a.currency, via: via.get(a.id) ?? [],
        stores: a.storeLinks.map((l) => {
          const shop = shops.find((s) => s.tiktokShopId === l.storeId) ?? (l.storeCode ? shops.find((s) => s.code === l.storeCode) : undefined);
          return { storeId: l.storeId, storeName: l.storeName, storeCode: l.storeCode, matchedShopId: shop?.id ?? null, matchedOrgId: shop?.organizationId ?? null };
        }),
      })),
    };
  }

  /** Assign a seller authorization from the pool (with all of its shops) to a client organisation. */
  @Post("orgs/:id/assign-seller")
  async assignSeller(@Acc() access: Access, @Param("id") orgId: string, @Body() b: { sellerAuthorizationId: string }) {
    const auth = await prisma.sellerAuthorization.findUnique({ where: { id: b.sellerAuthorizationId }, include: { shops: true } });
    if (!auth) throw new NotFoundException();
    if (auth.organizationId && auth.organizationId !== orgId) throw new BadRequestException("Uỷ quyền này đã thuộc một khách khác — gỡ ra trước");
    if (!(await prisma.organization.findUnique({ where: { id: orgId } }))) throw new NotFoundException();
    await this.connections.checkShopLimit(orgId, auth.shops.filter((s) => s.organizationId !== orgId).length);
    await prisma.$transaction([
      prisma.sellerAuthorization.update({ where: { id: auth.id }, data: { organizationId: orgId } }),
      prisma.shop.updateMany({ where: { sellerAuthorizationId: auth.id }, data: { organizationId: orgId } }),
      prisma.syncState.updateMany({ where: { scopeType: "SHOP", scopeId: { in: auth.shops.map((s) => s.id) } }, data: { organizationId: orgId } }),
    ]);
    for (const s of auth.shops) await this.scheduler.registerShop(s.id);
    await this.scheduler.registerOrg(orgId);
    // Advertisers of this org may sell for these shops: re-match their stores.
    for (const a of await prisma.advertiser.findMany({ where: { organizationId: orgId }, select: { id: true } })) await this.queue.enqueue("ads.entities", { advertiserId: a.id });
    await audit({ actorId: access.userId, action: "shop.assigned", organizationId: orgId, targetType: "SellerAuthorization", targetId: auth.id, meta: { sellerName: auth.sellerName, shops: auth.shops.map((s) => s.name) } });
    return { ok: true, shops: auth.shops.length };
  }

  /** Assign an ad account (seen through the DigiAds Business Center or a client token) to a client organisation. */
  @Post("orgs/:id/assign-advertiser")
  async assignAdvertiser(@Acc() access: Access, @Param("id") orgId: string, @Body() b: { advertiserId: string }) {
    const adv = await prisma.advertiser.findUnique({ where: { id: b.advertiserId } });
    if (!adv) throw new NotFoundException();
    if (adv.organizationId && adv.organizationId !== orgId) throw new BadRequestException("Tài khoản quảng cáo này đã thuộc một khách khác — gỡ ra trước");
    if (!(await prisma.organization.findUnique({ where: { id: orgId } }))) throw new NotFoundException();
    await prisma.$transaction([
      prisma.advertiser.update({ where: { id: adv.id }, data: { organizationId: orgId } }),
      prisma.syncState.updateMany({ where: { scopeType: "ADVERTISER", scopeId: adv.id }, data: { organizationId: orgId } }),
      prisma.organization.update({ where: { id: orgId }, data: { adsMode: "TIKTOK" } }),
    ]);
    await this.queue.enqueue("ads.entities", { advertiserId: adv.id });
    await this.scheduler.registerAdvertiser(adv.id);
    await this.scheduler.registerOrg(orgId);
    await audit({ actorId: access.userId, action: "ads.assigned", organizationId: orgId, targetType: "Advertiser", targetId: adv.id, meta: { name: adv.name, tiktokAdvertiserId: adv.tiktokAdvertiserId } });
    return { ok: true };
  }

  /** Move a seller authorization or an ad account back to the pool. Data stays; it no longer shows for the client. */
  @Post("unassign")
  async unassign(@Acc() access: Access, @Body() b: { type: "SELLER" | "ADVERTISER"; id: string }) {
    if (b.type === "SELLER") {
      const auth = await prisma.sellerAuthorization.findUnique({ where: { id: b.id }, include: { shops: true } });
      if (!auth?.organizationId) throw new NotFoundException();
      await prisma.$transaction([
        prisma.sellerAuthorization.update({ where: { id: auth.id }, data: { organizationId: null } }),
        prisma.shop.updateMany({ where: { sellerAuthorizationId: auth.id }, data: { organizationId: null } }),
        prisma.shopAccess.deleteMany({ where: { shopId: { in: auth.shops.map((s) => s.id) } } }),
        prisma.advertiserStoreLink.updateMany({ where: { shopId: { in: auth.shops.map((s) => s.id) } }, data: { shopId: null, matchedBy: null } }),
      ]);
      for (const s of auth.shops) await this.scheduler.unregister(s.id);
      await audit({ actorId: access.userId, action: "shop.unassigned", organizationId: auth.organizationId, targetType: "SellerAuthorization", targetId: auth.id, meta: { sellerName: auth.sellerName } });
    } else if (b.type === "ADVERTISER") {
      const adv = await prisma.advertiser.findUnique({ where: { id: b.id } });
      if (!adv?.organizationId) throw new NotFoundException();
      await prisma.advertiser.update({ where: { id: adv.id }, data: { organizationId: null } });
      await this.scheduler.unregister(adv.id);
      await audit({ actorId: access.userId, action: "ads.unassigned", organizationId: adv.organizationId, targetType: "Advertiser", targetId: adv.id, meta: { name: adv.name } });
    } else throw new BadRequestException();
    return { ok: true };
  }

  // ───── DigiAds Business Center (agency) ─────
  @Get("agency")
  async agency() {
    const auths = await prisma.adsAuthorization.findMany({ where: { kind: "AGENCY_BC" }, include: { advertisers: { include: { advertiser: { select: { id: true, name: true, organizationId: true } } } } }, orderBy: { createdAt: "desc" } });
    return auths.map((a) => ({
      id: a.id, label: a.label, status: a.status, createdAt: a.createdAt.toISOString(),
      advertisers: a.advertisers.map((x) => ({ id: x.advertiser.id, name: x.advertiser.name, assigned: !!x.advertiser.organizationId })),
    }));
  }

  @Post("agency/authorize-url")
  agencyUrl(@Acc() access: Access) {
    return this.connections.agencyAuthorizeUrl(access);
  }

  // ───── DigiAds staff ─────
  @Get("staff")
  async staff(): Promise<{ staff: StaffDto[]; invitations: InvitationDto[]; shops: { id: string; name: string; organizationName: string }[] }> {
    const [users, invitations, shops] = await Promise.all([
      prisma.user.findMany({ where: { platformRole: { not: null } }, include: { shopAccess: { select: { shopId: true } } }, orderBy: { createdAt: "asc" } }),
      prisma.invitation.findMany({ where: { platformRole: { not: null }, acceptedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } }),
      prisma.shop.findMany({ where: { organizationId: { not: null }, isActive: true }, include: { organization: { select: { name: true } } }, orderBy: [{ organization: { name: "asc" } }, { createdAt: "asc" }] }),
    ]);
    return {
      staff: users.map((u) => ({ id: u.id, name: u.name, email: u.email, platformRole: u.platformRole!, status: u.status, shopIds: u.shopAccess.map((s) => s.shopId), lastLoginAt: u.lastLoginAt?.toISOString() ?? null })),
      invitations: invitations.map((i) => invitationDto(i)),
      shops: shops.map((s) => ({ id: s.id, name: s.name, organizationName: s.organization?.name ?? "" })),
    };
  }

  private canGrantRole(access: Access, role: PlatformRole) {
    if (role !== "MOD" && !isSuperAdmin(access)) throw new ForbiddenException("Chỉ Super admin được cấp quyền Admin");
  }

  @Post("staff")
  async inviteStaff(@Acc() access: Access, @Body() b: { email?: string; platformRole?: PlatformRole; shopIds?: string[] }) {
    const email = normalizeEmail(b.email);
    const role = b.platformRole ?? "MOD";
    if (!["SUPER_ADMIN", "ADMIN", "MOD"].includes(role)) throw new BadRequestException("Vai trò không hợp lệ");
    this.canGrantRole(access, role);
    if (await prisma.user.findFirst({ where: { email, platformRole: { not: null } } })) throw new BadRequestException("Người này đã là nhân viên DigiAds");
    const shopIds = role === "MOD" ? (b.shopIds ?? []) : [];
    if (shopIds.length && (await prisma.shop.count({ where: { id: { in: shopIds } } })) !== shopIds.length) throw new BadRequestException("Shop không tồn tại");
    const me = await prisma.user.findUnique({ where: { id: access.userId } });
    const inv = await createInvitation({ email, platformRole: role, shopIds, invitedById: access.userId, inviterName: me?.name });
    await audit({ actorId: access.userId, action: "staff.invited", organizationId: null, targetType: "Invitation", targetId: inv.id, meta: { email, role } });
    return inv;
  }

  /** Change role, disable / re-enable, or set the shops a MOD can see (any organisation). */
  @Patch("staff/:id")
  async updateStaff(@Acc() access: Access, @Param("id") id: string, @Body() b: { platformRole?: PlatformRole; status?: "ACTIVE" | "DISABLED"; shopIds?: string[] }) {
    const u = await prisma.user.findUnique({ where: { id } });
    if (!u?.platformRole) throw new NotFoundException();
    if (u.platformRole !== "MOD" || (b.platformRole && b.platformRole !== "MOD")) this.canGrantRole(access, "ADMIN");
    if (id === access.userId && (b.status === "DISABLED" || (b.platformRole && b.platformRole !== u.platformRole))) throw new BadRequestException("Không thể tự đổi quyền hoặc khoá chính mình");
    if (b.platformRole || b.status) {
      await prisma.user.update({ where: { id }, data: { ...(b.platformRole ? { platformRole: b.platformRole } : {}), ...(b.status ? { status: b.status } : {}) } });
      if (b.status === "DISABLED") await prisma.session.deleteMany({ where: { userId: id } });
    }
    if (b.shopIds) {
      const shopIds = [...new Set(b.shopIds)];
      if ((await prisma.shop.count({ where: { id: { in: shopIds } } })) !== shopIds.length) throw new BadRequestException("Shop không tồn tại");
      await prisma.$transaction([
        prisma.shopAccess.deleteMany({ where: { userId: id, shopId: { notIn: shopIds } } }),
        ...shopIds.map((shopId) => prisma.shopAccess.upsert({ where: { userId_shopId: { userId: id, shopId } }, create: { userId: id, shopId, grantedById: access.userId }, update: {} })),
      ]);
    }
    await audit({ actorId: access.userId, action: "staff.updated", organizationId: null, targetType: "User", targetId: id, meta: b as Record<string, unknown> });
    return { ok: true };
  }
}

@Module({ imports: [ConnectionsModule], controllers: [AdminController], providers: [PlatformManagerGuard] })
export class AdminModule {}
