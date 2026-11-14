import { BadRequestException, Body, Controller, Get, NotFoundException, Post } from "@nestjs/common";
import { prisma } from "@ecomdash/database";
import type { SyncStateDto } from "@ecomdash/shared";
import { OrgId } from "../common/decorators";
import { JobName, QueueService } from "./queue.service";

const SHOP_RESOURCES: Record<string, JobName> = { orders: "shop.orders", products: "shop.products", returns: "shop.returns", finance: "shop.finance", analytics: "shop.analytics", pnl: "pnl.recompute" };
const ADV_RESOURCES: Record<string, JobName> = { ads_entities: "ads.entities", ads_reports: "ads.reports" };

@Controller("sync")
export class SyncController {
  constructor(private readonly queue: QueueService) {}

  @Get("status")
  async status(@OrgId() orgId: string): Promise<SyncStateDto[]> {
    const [states, shops, advs] = await Promise.all([
      prisma.syncState.findMany({ where: { organizationId: orgId }, orderBy: [{ scopeType: "desc" }, { resource: "asc" }] }),
      prisma.shop.findMany({ where: { organizationId: orgId }, select: { id: true, name: true } }),
      prisma.advertiser.findMany({ where: { organizationId: orgId }, select: { id: true, name: true } }),
    ]);
    const names = new Map([...shops, ...advs].map((x) => [x.id, x.name]));
    return states.map((s) => ({
      id: s.id, scopeType: s.scopeType as "SHOP" | "ADVERTISER", scopeId: s.scopeId, scopeName: names.get(s.scopeId) ?? s.scopeId, resource: s.resource,
      status: s.status, lastSuccessAt: s.lastSuccessAt?.toISOString() ?? null, lastError: s.lastError, lastWarning: s.lastWarning, itemsLastRun: s.itemsLastRun,
    }));
  }

  @Post("run")
  async run(@OrgId() orgId: string, @Body() body: { scopeType: "SHOP" | "ADVERTISER"; scopeId: string; resource: string }) {
    if (body.scopeType === "SHOP") {
      const job = SHOP_RESOURCES[body.resource];
      if (!job) throw new BadRequestException("Unknown resource");
      if (!(await prisma.shop.findFirst({ where: { id: body.scopeId, organizationId: orgId } }))) throw new NotFoundException();
      if (job === "pnl.recompute") await this.queue.requestPnlRecompute(body.scopeId, "2000-01-01");
      else await this.queue.enqueue(job, { shopId: body.scopeId }, { jobId: `${job}:${body.scopeId}:manual` });
    } else {
      const job = ADV_RESOURCES[body.resource];
      if (!job) throw new BadRequestException("Unknown resource");
      if (!(await prisma.advertiser.findFirst({ where: { id: body.scopeId, organizationId: orgId } }))) throw new NotFoundException();
      await this.queue.enqueue(job, { advertiserId: body.scopeId }, { jobId: `${job}:${body.scopeId}:manual` });
    }
    return { queued: true };
  }
}
