import { BadRequestException, Body, Controller, Get, NotFoundException, Post, Query } from "@nestjs/common";
import { prisma } from "@ecomdash/database";
import type { SyncStateDto, SyncWatermarkDto } from "@ecomdash/shared";
import { Acc } from "../common/decorators";
import { Access, canEditOrg } from "../access/access";
import { resolveOrgId } from "../common/util";
import { JobName, QueueService } from "./queue.service";

const SHOP_RESOURCES: Record<string, JobName> = { orders: "shop.orders", products: "shop.products", returns: "shop.returns", finance: "shop.finance", analytics: "shop.analytics", pnl: "pnl.recompute" };
const ADV_RESOURCES: Record<string, JobName> = { ads_entities: "ads.entities", ads_reports: "ads.reports" };

@Controller("sync")
export class SyncController {
  constructor(private readonly queue: QueueService) {}

  @Get("status")
  async status(@Acc() access: Access, @Query("orgId") orgIdParam?: string): Promise<SyncStateDto[]> {
    const orgId = resolveOrgId(access, orgIdParam);
    const [shops, advs] = await Promise.all([
      prisma.shop.findMany({ where: { organizationId: orgId }, select: { id: true, name: true } }),
      prisma.advertiser.findMany({ where: { organizationId: orgId }, select: { id: true, name: true } }),
    ]);
    const names = new Map([...shops, ...advs].map((x) => [x.id, x.name]));
    const states = await prisma.syncState.findMany({ where: { scopeId: { in: [...names.keys()] } }, orderBy: [{ scopeType: "desc" }, { resource: "asc" }] });
    return states.map((s) => ({
      id: s.id, scopeType: s.scopeType as "SHOP" | "ADVERTISER", scopeId: s.scopeId, scopeName: names.get(s.scopeId) ?? s.scopeId, resource: s.resource,
      status: s.status, lastSuccessAt: s.lastSuccessAt?.toISOString() ?? null, lastError: s.lastError, lastWarning: s.lastWarning, itemsLastRun: s.itemsLastRun,
    }));
  }

  /** Common cut-off of shop revenue and ad spend for the dashboard (12 §4). */
  @Get("watermark")
  async watermark(@Acc() access: Access, @Query("orgId") orgIdParam?: string): Promise<SyncWatermarkDto> {
    const orgId = resolveOrgId(access, orgIdParam);
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    const [last, lastShop, lastAds] = await Promise.all([
      prisma.syncRound.findFirst({ where: { organizationId: orgId, finishedAt: { not: null } }, orderBy: { startedAt: "desc" } }),
      prisma.syncRound.findFirst({ where: { organizationId: orgId, shopSyncedTo: { not: null } }, orderBy: { startedAt: "desc" } }),
      prisma.syncRound.findFirst({ where: { organizationId: orgId, adsSyncedTo: { not: null } }, orderBy: { startedAt: "desc" } }),
    ]);
    const shopTo = lastShop?.shopSyncedTo ?? null;
    const adsTo = lastAds?.adsSyncedTo ?? null;
    return {
      organizationId: orgId,
      roundAt: last?.finishedAt?.toISOString() ?? null,
      shopSyncedTo: shopTo?.toISOString() ?? null,
      adsSyncedTo: adsTo?.toISOString() ?? null,
      adsLagMinutes: shopTo && adsTo ? Math.max(0, Math.round((shopTo.getTime() - adsTo.getTime()) / 60_000)) : null,
      shopOk: last?.shopOk ?? false,
      adsOk: last?.adsOk ?? false,
      adsMode: org.adsMode,
    };
  }

  @Post("run")
  async run(@Acc() access: Access, @Body() body: { scopeType: "SHOP" | "ADVERTISER" | "ORG"; scopeId: string; resource?: string }) {
    if (body.scopeType === "ORG") {
      resolveOrgId(access, body.scopeId, "edit");
      await this.queue.enqueue("org.round", { orgId: body.scopeId }, { jobId: `org.round|${body.scopeId}|manual` });
      return { queued: true };
    }
    if (body.scopeType === "SHOP") {
      const job = SHOP_RESOURCES[body.resource ?? ""];
      if (!job) throw new BadRequestException("Unknown resource");
      const shop = await prisma.shop.findUnique({ where: { id: body.scopeId } });
      if (!shop || !canEditOrg(access, shop.organizationId)) throw new NotFoundException();
      if (job === "pnl.recompute") await this.queue.requestPnlRecompute(body.scopeId, "2000-01-01");
      else await this.queue.enqueue(job, { shopId: body.scopeId }, { jobId: `${job}|${body.scopeId}|manual` });
    } else {
      const job = ADV_RESOURCES[body.resource ?? ""];
      if (!job) throw new BadRequestException("Unknown resource");
      const adv = await prisma.advertiser.findUnique({ where: { id: body.scopeId } });
      if (!adv || !canEditOrg(access, adv.organizationId)) throw new NotFoundException();
      await this.queue.enqueue(job, { advertiserId: body.scopeId }, { jobId: `${job}|${body.scopeId}|manual` });
    }
    return { queued: true };
  }
}
