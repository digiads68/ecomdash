import { Injectable, Logger } from "@nestjs/common";
import { prisma } from "@ecomdash/database";
import { RateLimitError, ScopeError, TikTokApiError, TokenExpiredError, TransientError } from "@ecomdash/tiktok-client";

export type Scope = { organizationId: string | null; scopeType: "SHOP" | "ADVERTISER"; scopeId: string; resource: string };

/** Wraps a sync run: RUNNING lock, cursor, outcome and error classification (04 §4). */
@Injectable()
export class SyncStateService {
  private readonly logger = new Logger("Sync");

  async run<T>(scope: Scope, fn: (cursor: Date | null) => Promise<{ cursor?: Date; items: number; warning?: string | null; result?: T }>): Promise<T | undefined> {
    const key = { scopeType_scopeId_resource: { scopeType: scope.scopeType, scopeId: scope.scopeId, resource: scope.resource } };
    const state = await prisma.syncState.upsert({ where: key, update: {}, create: { ...scope, status: "IDLE" } });
    const stale = new Date(Date.now() - 30 * 60_000);
    const claimed = await prisma.syncState.updateMany({
      where: { id: state.id, OR: [{ status: { not: "RUNNING" } }, { lastStartedAt: { lt: stale } }] },
      data: { status: "RUNNING", lastStartedAt: new Date() },
    });
    if (!claimed.count) {
      this.logger.debug(`${scope.resource}:${scope.scopeId} already running — skipped`);
      return undefined;
    }
    const t0 = Date.now();
    try {
      const out = await fn(state.cursor);
      await prisma.syncState.update({
        where: { id: state.id },
        data: { status: "OK", lastSuccessAt: new Date(), lastError: null, cursor: out.cursor ?? state.cursor, itemsLastRun: out.items, ...(out.warning !== undefined ? { lastWarning: out.warning } : {}) },
      });
      this.logger.log(`${scope.resource} ${scope.scopeType.toLowerCase()}=${scope.scopeId} items=${out.items} ${Date.now() - t0}ms`);
      return out.result;
    } catch (e) {
      const blocked = e instanceof ScopeError;
      const msg = e instanceof TikTokApiError ? e.message : (e as Error).message ?? String(e);
      await prisma.syncState.update({ where: { id: state.id }, data: { status: blocked ? "BLOCKED" : "ERROR", lastError: msg.slice(0, 500) } });
      this.logger.error(`${scope.resource} ${scope.scopeId} failed: ${msg}`);
      const retryable = e instanceof RateLimitError || e instanceof TransientError;
      if (retryable) throw e;
      if (e instanceof TokenExpiredError) return undefined;
      throw e;
    }
  }
}
