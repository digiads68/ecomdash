import { Injectable } from "@nestjs/common";
import { prisma, Prisma } from "@ecomdash/database";
import type { ShopOrder, ShopStatement } from "@ecomdash/tiktok-client";
import { addDays, dateOnly, toBusinessDate, ymd } from "@ecomdash/shared";
import { config } from "../config";
import { shopClientFor } from "../tiktok/clients";
import { QueueService } from "./queue.service";
import { SyncStateService } from "./sync-state.service";
import { mapCancellation, mapLineItems, mapOrder, mapProduct, mapReturn, mapSettlement, mapStatement } from "./mappers";

const DAY = 86_400;
const nowSec = () => Math.floor(Date.now() / 1000);

@Injectable()
export class ShopSyncService {
  constructor(private readonly state: SyncStateService, private readonly queue: QueueService) {}

  private async shop(shopId: string) {
    return prisma.shop.findUniqueOrThrow({ where: { id: shopId } });
  }

  private scope(shop: { id: string; organizationId: string }, resource: string) {
    return { organizationId: shop.organizationId, scopeType: "SHOP" as const, scopeId: shop.id, resource };
  }

  /** First connection: everything for BACKFILL_DAYS, then P&L. */
  async backfill(shopId: string) {
    await this.products(shopId);
    await this.orders(shopId, "backfill");
    await this.returns(shopId, true);
    await this.finance(shopId, true);
    await this.analytics(shopId, config().BACKFILL_DAYS);
    await this.queue.requestPnlRecompute(shopId, addDays(toBusinessDate(new Date()), -config().BACKFILL_DAYS - 1));
  }

  // ───── orders (04 §3) ─────
  async orders(shopId: string, mode: "incremental" | "backfill" = "incremental") {
    const shop = await this.shop(shopId);
    await this.state.run(this.scope(shop, "orders"), async (cursor) => {
      const client = await shopClientFor(shopId);
      const now = nowSec();
      const touched = new Set<string>();
      let items = 0;
      const windows: { body: Record<string, number>; sortField: string }[] = [];
      if (mode === "backfill" || !cursor) {
        for (let ge = now - config().BACKFILL_DAYS * DAY; ge < now; ge += 7 * DAY) {
          windows.push({ body: { create_time_ge: ge, create_time_lt: Math.min(now, ge + 7 * DAY) }, sortField: "create_time" });
        }
      } else {
        windows.push({ body: { update_time_ge: Math.floor(cursor.getTime() / 1000) - 300, update_time_lt: now }, sortField: "update_time" });
      }
      for (const w of windows) {
        for await (const page of client.iterateOrders(w.body, { pageSize: 50, sortField: w.sortField, sortOrder: "ASC" })) {
          items += await this.upsertOrders(shop, page, touched);
        }
      }
      if (touched.size) await this.queue.requestPnlRecompute(shopId, [...touched].sort()[0]);
      return { cursor: new Date(now * 1000), items };
    });
  }

  async ordersByIds(shopId: string, ids: string[]) {
    const shop = await this.shop(shopId);
    const client = await shopClientFor(shopId);
    const touched = new Set<string>();
    const n = await this.upsertOrders(shop, await client.getOrders(ids), touched);
    if (touched.size) await this.queue.requestPnlRecompute(shopId, [...touched].sort()[0]);
    return n;
  }

  /** New orders: createManyAndReturn + line items; existing: update only when update_time moved. */
  private async upsertOrders(shop: { id: string; timezone: string }, orders: ShopOrder[], touched: Set<string>): Promise<number> {
    if (!orders.length) return 0;
    const existing = await prisma.order.findMany({
      where: { shopId: shop.id, tiktokOrderId: { in: orders.map((o) => o.id) } },
      select: { id: true, tiktokOrderId: true, updateTime: true, businessDate: true },
    });
    const byTk = new Map(existing.map((e) => [e.tiktokOrderId, e]));
    const fresh = orders.filter((o) => !byTk.has(o.id));
    await prisma.$transaction(async (tx) => {
      if (fresh.length) {
        const created = await tx.order.createManyAndReturn({ data: fresh.map((o) => mapOrder(o, shop.id, shop.timezone)), select: { id: true, tiktokOrderId: true, businessDate: true } });
        const idOf = new Map(created.map((c) => [c.tiktokOrderId, c.id]));
        await tx.orderLineItem.createMany({ data: fresh.flatMap((o) => mapLineItems(o, idOf.get(o.id)!)), skipDuplicates: true });
        for (const c of created) touched.add(ymd(c.businessDate));
      }
      for (const o of orders) {
        const e = byTk.get(o.id);
        if (!e || e.updateTime.getTime() >= o.update_time * 1000) continue;
        const { shopId: _s, tiktokOrderId: _t, ...data } = mapOrder(o, shop.id, shop.timezone);
        await tx.order.update({ where: { id: e.id }, data });
        touched.add(ymd(e.businessDate));
      }
    }, { timeout: 60_000 });
    if (fresh.length) {
      await prisma.$executeRaw`UPDATE "ReturnRequest" r SET "orderId" = o.id FROM "Order" o
        WHERE r."orderId" IS NULL AND r."shopId" = ${shop.id} AND o."shopId" = r."shopId" AND o."tiktokOrderId" = r."tiktokOrderId"`;
    }
    return orders.length;
  }

  // ───── products ─────
  async products(shopId: string) {
    const shop = await this.shop(shopId);
    await this.state.run(this.scope(shop, "products"), async (cursor) => {
      const client = await shopClientFor(shopId);
      const body = cursor ? { update_time_ge: Math.floor(cursor.getTime() / 1000) - 300 } : {};
      const now = new Date();
      let items = 0;
      for await (const page of client.iterateProducts(body, { pageSize: 50 })) {
        for (const summary of page) {
          const detail = await client.getProduct(summary.id);
          const { product, skus } = mapProduct(detail, shop.id);
          const p = await prisma.product.upsert({
            where: { shopId_tiktokProductId: { shopId: shop.id, tiktokProductId: product.tiktokProductId } },
            create: product, update: product,
          });
          for (const s of skus) {
            await prisma.sku.upsert({ where: { productId_tiktokSkuId: { productId: p.id, tiktokSkuId: s.tiktokSkuId } }, create: { ...s, productId: p.id }, update: s });
          }
          items++;
        }
      }
      return { cursor: now, items };
    });
  }

  // ───── returns & cancellations ─────
  async returns(shopId: string, backfill = false) {
    const shop = await this.shop(shopId);
    await this.state.run(this.scope(shop, "returns"), async (cursor) => {
      const client = await shopClientFor(shopId);
      const now = nowSec();
      const ge = backfill || !cursor ? now - (config().BACKFILL_DAYS + 20) * DAY : Math.floor(cursor.getTime() / 1000) - 300;
      const body = { update_time_ge: ge, update_time_lt: now };
      const rows: Prisma.ReturnRequestUncheckedCreateInput[] = [];
      for await (const page of client.iterateReturns(body)) rows.push(...page.map((r) => mapReturn(r, shop.id, shop.timezone)));
      for await (const page of client.iterateCancellations(body)) rows.push(...page.map((c) => mapCancellation(c, shop.id, shop.timezone)));
      const orders = await prisma.order.findMany({ where: { shopId: shop.id, tiktokOrderId: { in: rows.map((r) => r.tiktokOrderId) } }, select: { id: true, tiktokOrderId: true, businessDate: true } });
      const byTk = new Map(orders.map((o) => [o.tiktokOrderId, o]));
      const touched = new Set<string>();
      for (const r of rows) {
        const o = byTk.get(r.tiktokOrderId);
        const data = { ...r, orderId: o?.id ?? null };
        await prisma.returnRequest.upsert({ where: { shopId_tiktokReturnId: { shopId: shop.id, tiktokReturnId: r.tiktokReturnId } }, create: data, update: data });
        if (o) touched.add(ymd(o.businessDate));
      }
      if (touched.size) await this.queue.requestPnlRecompute(shopId, [...touched].sort()[0]);
      return { cursor: new Date(now * 1000), items: rows.length };
    });
  }

  // ───── finance: statements + per-order settlements by statement ─────
  async finance(shopId: string, backfill = false) {
    const shop = await this.shop(shopId);
    await this.state.run(this.scope(shop, "finance"), async () => {
      const client = await shopClientFor(shopId);
      const now = nowSec();
      const ge = now - (backfill ? config().BACKFILL_DAYS + 30 : 21) * DAY;
      let items = 0;
      const touched = new Set<string>();
      const statements: ShopStatement[] = [];
      for await (const page of client.iterateStatements({ statement_time_ge: ge, statement_time_lt: now + 8 * DAY })) statements.push(...page);
      for (const s of statements) {
        const data = mapStatement(s, shop.id);
        await prisma.statement.upsert({ where: { shopId_tiktokStatementId: { shopId: shop.id, tiktokStatementId: s.id } }, create: data, update: data });
        for await (const page of client.iterateStatementTransactions(s.id)) {
          const orders = await prisma.order.findMany({ where: { shopId: shop.id, tiktokOrderId: { in: page.map((t) => t.order_id) } }, select: { id: true, tiktokOrderId: true, businessDate: true } });
          const byTk = new Map(orders.map((o) => [o.tiktokOrderId, o]));
          const rows = page.filter((t) => byTk.has(t.order_id)).map((t) => {
            const m = mapSettlement([{ ...t, statement_id: t.statement_id ?? s.id, statement_time: t.statement_time ?? s.statement_time }], byTk.get(t.order_id)!.id);
            return m;
          });
          if (rows.length) {
            await prisma.orderSettlement.createMany({ data: rows, skipDuplicates: true });
            for (const t of page) { const o = byTk.get(t.order_id); if (o) touched.add(ymd(o.businessDate)); }
          }
          items += rows.length;
        }
      }
      if (touched.size) await this.queue.requestPnlRecompute(shopId, [...touched].sort()[0]);
      return { items };
    });
  }

  // ───── analytics: traffic for ShopDailyStat / ProductDailyStat (01 §10) ─────
  async analytics(shopId: string, days = 7) {
    const shop = await this.shop(shopId);
    await this.state.run(this.scope(shop, "analytics"), async () => {
      const client = await shopClientFor(shopId);
      const today = toBusinessDate(new Date(), shop.timezone);
      const start = addDays(today, -days);
      const intervals = await client.getShopPerformance({ startDateGe: start, endDateLt: today });
      for (const i of intervals) {
        const date = dateOnly(i.start_date);
        const vals = { pageViews: i.product_page_views, visitors: i.avg_product_page_visitors, analyticsGmv: Number(i.gmv.amount) };
        await prisma.shopDailyStat.upsert({
          where: { shopId_date: { shopId: shop.id, date } },
          create: { shopId: shop.id, date, gmv: 0, orders: 0, unitsSold: 0, buyers: 0, newBuyers: 0, cancelledOrders: 0, cancelledAmount: 0, returnRequests: 0, refundAmount: 0, codOrders: 0, sellerDiscount: 0, ...vals },
          update: vals,
        });
      }
      const products = await prisma.product.findMany({ where: { shopId: shop.id }, select: { id: true, tiktokProductId: true } });
      const pid = new Map(products.map((p) => [p.tiktokProductId, p.id]));
      let items = intervals.length;
      for (let d = start; d < today; d = addDays(d, 1)) {
        const perf = await client.getShopProductPerformance({ startDateGe: d, endDateLt: addDays(d, 1) });
        const date = dateOnly(d);
        for (const p of perf) {
          const productId = pid.get(p.id);
          if (!productId) continue;
          const vals = { pageViews: p.page_views ?? null, impressions: p.impressions ?? null };
          await prisma.productDailyStat.upsert({
            where: { productId_date: { productId, date } },
            create: { shopId: shop.id, productId, date, gmv: 0, orders: 0, unitsSold: 0, ...vals },
            update: vals,
          });
          items++;
        }
      }
      const check = await prisma.$queryRaw<{ ours: number; theirs: number }[]>`
        SELECT COALESCE(SUM("realizedRevenue" + "cancelledAmount" + "refundAmount" + "pendingAmount" - "pendingExpected"),0)::float AS ours,
               (SELECT COALESCE(SUM("analyticsGmv"),0)::float FROM "ShopDailyStat" WHERE "shopId" = ${shop.id} AND date >= ${dateOnly(start)} AND date < ${dateOnly(today)}) AS theirs
        FROM "ShopDailyPnl" WHERE "shopId" = ${shop.id} AND date >= ${dateOnly(start)} AND date < ${dateOnly(today)}`;
      const { ours, theirs } = check[0] ?? { ours: 0, theirs: 0 };
      const gap = theirs > 0 && ours > 0 ? Math.abs(ours - theirs) / theirs : 0;
      return { items, warning: gap > 0.05 ? `GMV tự tính lệch ${(gap * 100).toFixed(1)}% so với Analytics API (${days} ngày)` : null };
    });
  }
}
