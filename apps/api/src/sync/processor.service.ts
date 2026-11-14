import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { Job, Worker } from "bullmq";
import { prisma } from "@ecomdash/database";
import { addDays, toBusinessDate } from "@ecomdash/shared";
import { config } from "../config";
import { refreshSellerToken } from "../tiktok/clients";
import { PnlComputeService } from "../pnl/pnl-compute.service";
import { AlertsEvaluator } from "../alerts/alerts.evaluator";
import { ReportsSender } from "../reports/reports.sender";
import { AdsSyncService } from "./ads-sync.service";
import { QueueService, SYNC_QUEUE } from "./queue.service";
import { ShopSyncService } from "./shop-sync.service";

@Injectable()
export class ProcessorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger("Worker");
  private worker?: Worker;

  constructor(
    private readonly queue: QueueService,
    private readonly shops: ShopSyncService,
    private readonly ads: AdsSyncService,
    private readonly pnl: PnlComputeService,
    private readonly alerts: AlertsEvaluator,
    private readonly reports: ReportsSender,
  ) {}

  onModuleInit() {
    if (config().SYNC_WORKER !== "true") return;
    this.worker = new Worker(SYNC_QUEUE, (job) => this.handle(job), { connection: this.queue.connection.duplicate(), concurrency: 3 });
    this.worker.on("failed", (job, err) => this.logger.warn(`${job?.name} ${JSON.stringify(job?.data)} failed: ${err.message}`));
    this.logger.log("Sync worker started");
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }

  async handle(job: Job): Promise<unknown> {
    const d = job.data as { shopId?: string; advertiserId?: string; ids?: string[]; days?: number };
    if (d.shopId && !(await prisma.shop.findFirst({ where: { id: d.shopId, isActive: true } }))) return "shop inactive";
    switch (job.name) {
      case "shop.backfill": return this.shops.backfill(d.shopId!);
      case "shop.orders": return this.shops.orders(d.shopId!);
      case "shop.orders.ids": return this.shops.ordersByIds(d.shopId!, d.ids ?? []);
      case "shop.products": return this.shops.products(d.shopId!);
      case "shop.returns": return this.shops.returns(d.shopId!);
      case "shop.finance": return this.shops.finance(d.shopId!);
      case "shop.analytics": return this.shops.analytics(d.shopId!, d.days ?? 7);
      case "ads.backfill": return this.ads.backfill(d.advertiserId!);
      case "ads.entities": return this.ads.entities(d.advertiserId!);
      case "ads.reports": return this.ads.reports(d.advertiserId!, d.days ?? 7);
      case "pnl.recompute": {
        // One recompute per shop at a time; requests that arrive meanwhile are picked up by the loop or a retry.
        const lock = `pnl:lock:${d.shopId}`;
        if (!(await this.queue.connection.set(lock, String(job.id), "EX", 600, "NX"))) {
          await this.queue.enqueue("pnl.recompute", { shopId: d.shopId }, { jobId: `pnl.recompute|${d.shopId}|retry|${Date.now()}`, delay: 3000 });
          return "locked";
        }
        try {
          let runs = 0;
          for (let from = await this.queue.takePnlFrom(d.shopId!); from; from = await this.queue.takePnlFrom(d.shopId!)) {
            await this.pnl.recompute(d.shopId!, from);
            runs++;
          }
          return runs;
        } finally {
          await this.queue.connection.del(lock);
        }
      }
      case "pnl.window": {
        const shops = await prisma.shop.findMany({ where: { isActive: true }, select: { id: true } });
        for (const s of shops) await this.queue.requestPnlRecompute(s.id, addDays(toBusinessDate(new Date()), -config().PNL_OPEN_WINDOW_DAYS));
        return shops.length;
      }
      case "token.refresh": {
        const due = await prisma.sellerAuthorization.findMany({ where: { status: "ACTIVE", accessExpiresAt: { lt: new Date(Date.now() + 24 * 3600_000) } } });
        for (const a of due) await refreshSellerToken(a.id).catch((e) => this.logger.warn(`refresh ${a.id}: ${e.message}`));
        return due.length;
      }
      case "alerts.evaluate": return this.alerts.evaluateAll();
      case "reports.send": return this.reports.sendDue();
      default:
        this.logger.warn(`Unknown job ${job.name}`);
        return null;
    }
  }
}
