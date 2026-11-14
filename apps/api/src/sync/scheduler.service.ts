import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { prisma } from "@ecomdash/database";
import { config } from "../config";
import { QueueService } from "./queue.service";

const MIN = 60_000;

/** 04 §2 — repeatable jobs per shop / advertiser plus global ones. SYNC_INTERVAL_FACTOR < 1 speeds everything up for demos. */
@Injectable()
export class SchedulerService implements OnApplicationBootstrap {
  private readonly logger = new Logger("Scheduler");
  private readonly f = Number(process.env.SYNC_INTERVAL_FACTOR ?? 1) || 1;

  async onApplicationBootstrap() {
    if (config().SYNC_WORKER !== "true") return;
    await this.queue.every("global:token.refresh", "token.refresh", {}, 60 * MIN);
    await this.queue.every("global:alerts", "alerts.evaluate", {}, 5 * MIN * this.f);
    await this.queue.every("global:pnl.window", "pnl.window", {}, 30 * MIN * this.f);
    await this.queue.cron("global:reports", "reports.send", "0 8 * * *", "Asia/Ho_Chi_Minh");
    const shops = await prisma.shop.findMany({ where: { isActive: true }, select: { id: true } });
    for (const s of shops) await this.registerShop(s.id);
    const advs = await prisma.advertiser.findMany({ where: { isActive: true }, select: { id: true } });
    for (const a of advs) await this.registerAdvertiser(a.id);
    this.logger.log(`Schedules registered for ${shops.length} shops, ${advs.length} advertisers (factor ${this.f})`);
  }

  constructor(private readonly queue: QueueService) {}

  async registerShop(shopId: string) {
    const every = (m: number) => Math.max(MIN, m * MIN * this.f);
    await this.queue.every(`shop:${shopId}:orders`, "shop.orders", { shopId }, every(15));
    await this.queue.every(`shop:${shopId}:returns`, "shop.returns", { shopId }, every(30));
    await this.queue.every(`shop:${shopId}:products`, "shop.products", { shopId }, every(60));
    await this.queue.every(`shop:${shopId}:finance`, "shop.finance", { shopId }, every(360));
    await this.queue.every(`shop:${shopId}:analytics`, "shop.analytics", { shopId }, every(360));
  }

  async registerAdvertiser(advertiserId: string) {
    const every = (m: number) => Math.max(MIN, m * MIN * this.f);
    await this.queue.every(`adv:${advertiserId}:entities`, "ads.entities", { advertiserId }, every(60));
    await this.queue.every(`adv:${advertiserId}:reports`, "ads.reports", { advertiserId }, every(30));
  }

  async unregister(scopeId: string) {
    await this.queue.removeSchedulersFor(scopeId);
  }
}
