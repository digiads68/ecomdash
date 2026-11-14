import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { JobsOptions, Queue } from "bullmq";
import IORedis from "ioredis";
import { config } from "../config";

export const SYNC_QUEUE = "sync";

export type JobName =
  | "shop.backfill" | "shop.orders" | "shop.orders.ids" | "shop.products" | "shop.returns" | "shop.finance" | "shop.analytics"
  | "ads.backfill" | "ads.entities" | "ads.reports"
  | "token.refresh" | "pnl.recompute" | "pnl.window" | "alerts.evaluate" | "reports.send";

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  readonly connection = new IORedis(config().REDIS_URL, { maxRetriesPerRequest: null });
  readonly queue = new Queue(SYNC_QUEUE, { connection: this.connection, defaultJobOptions: { removeOnComplete: 200, removeOnFail: 500 } });

  async onModuleDestroy() {
    await this.queue.close();
    this.connection.disconnect();
  }

  /** Deduplicated by jobId while waiting; removed on completion so it can be queued again. */
  async enqueue(name: JobName, data: Record<string, unknown> = {}, opts: JobsOptions = {}) {
    const scope = (data.shopId ?? data.advertiserId ?? "global") as string;
    const jobId = (opts.jobId ?? `${name}|${scope}${data.mode ? `|${data.mode}` : ""}`).replace(/:/g, "|");
    opts = { ...opts, jobId };
    await this.queue.add(name, data, { jobId, removeOnComplete: true, removeOnFail: 100, attempts: 3, backoff: { type: "exponential", delay: 30_000 }, ...opts });
  }

  /** Recompute P&L from the earliest requested date; bursts are merged into one job (11 §10). */
  async requestPnlRecompute(shopId: string, fromDate: string) {
    const key = `pnl:pending:${shopId}`;
    const cur = await this.connection.get(key);
    if (!cur || fromDate < cur) await this.connection.set(key, fromDate, "EX", 86_400);
    await this.enqueue("pnl.recompute", { shopId }, { jobId: `pnl.recompute|${shopId}|${Math.floor(Date.now() / 2000)}`, delay: 1500, attempts: 2 });
  }

  async takePnlFrom(shopId: string): Promise<string | null> {
    const key = `pnl:pending:${shopId}`;
    const v = await this.connection.get(key);
    if (v) await this.connection.del(key);
    return v;
  }

  /** First run after one interval — connecting a shop already queues a backfill, the schedule must not race it. */
  async every(schedulerId: string, name: JobName, data: Record<string, unknown>, everyMs: number) {
    await this.queue.upsertJobScheduler(schedulerId, { every: everyMs, startDate: Date.now() + everyMs }, { name, data, opts: { removeOnComplete: true, removeOnFail: 100 } });
  }

  async cron(schedulerId: string, name: JobName, pattern: string, tz: string) {
    await this.queue.upsertJobScheduler(schedulerId, { pattern, tz }, { name, data: {}, opts: { removeOnComplete: true, removeOnFail: 100 } });
  }

  async removeSchedulersFor(scopeId: string) {
    const all = await this.queue.getJobSchedulers();
    for (const s of all) if (s.key.includes(scopeId)) await this.queue.removeJobScheduler(s.key);
    this.logger.log(`Removed schedulers for ${scopeId}`);
  }
}
