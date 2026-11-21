import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { prisma } from "@ecomdash/database";
import { config } from "../config";
import { QueueService } from "./queue.service";

const MIN = 60_000;

/**
 * 12 §4 — orders, returns and ad reports of an organisation run together in one round so shop revenue and
 * ad spend share the same cut-off; slower resources keep their own per-shop / per-advertiser schedules.
 * SYNC_INTERVAL_FACTOR < 1 speeds everything up for demos.
 */
@Injectable()
export class SchedulerService implements OnApplicationBootstrap {
  private readonly logger = new Logger("Scheduler");
  private readonly f = Number(process.env.SYNC_INTERVAL_FACTOR ?? 1) || 1;

  constructor(private readonly queue: QueueService) {}

  private every(m: number) {
    return Math.max(MIN, m * MIN * this.f);
  }

  async onApplicationBootstrap() {
    if (config().SYNC_WORKER !== "true") return;
    await this.queue.every("global:token.refresh", "token.refresh", {}, 60 * MIN);
    await this.queue.every("global:alerts", "alerts.evaluate", {}, this.every(5));
    await this.queue.every("global:pnl.window", "pnl.window", {}, this.every(30));
    await this.queue.cron("global:reports", "reports.send", "0 8 * * *", "Asia/Ho_Chi_Minh");
    const orgs = await prisma.organization.findMany({ select: { id: true } });
    for (const o of orgs) await this.registerOrg(o.id);
    const shops = await prisma.shop.findMany({ where: { isActive: true, organizationId: { not: null } }, select: { id: true } });
    for (const s of shops) await this.registerShop(s.id);
    const advs = await prisma.advertiser.findMany({ where: { isActive: true }, select: { id: true } });
    for (const a of advs) await this.registerAdvertiser(a.id);
    this.logger.log(`Schedules: ${orgs.length} org rounds, ${shops.length} shops, ${advs.length} advertisers (factor ${this.f})`);
  }

  /** Shop orders + returns + ad reports of the organisation, every 15 minutes (scaled). */
  async registerOrg(orgId: string) {
    await this.queue.every(`org:${orgId}:round`, "org.round", { orgId }, this.every(15));
  }

  /** Slow per-shop resources: catalogue, settlements, traffic analytics. */
  async registerShop(shopId: string) {
    await this.queue.every(`shop:${shopId}:products`, "shop.products", { shopId }, this.every(60));
    await this.queue.every(`shop:${shopId}:finance`, "shop.finance", { shopId }, this.every(360));
    await this.queue.every(`shop:${shopId}:analytics`, "shop.analytics", { shopId }, this.every(360));
  }

  /** Campaigns and store links change rarely; reports are pulled by the org round. */
  async registerAdvertiser(advertiserId: string) {
    await this.queue.every(`adv:${advertiserId}:entities`, "ads.entities", { advertiserId }, this.every(60));
  }

  async unregister(scopeId: string) {
    await this.queue.removeSchedulersFor(scopeId);
  }
}
