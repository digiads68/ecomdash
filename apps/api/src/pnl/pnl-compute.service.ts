import { Injectable, Logger } from "@nestjs/common";
import { prisma, Prisma } from "@ecomdash/database";
import {
  addDays, adAllocationShares, classifyOutcome, computeDailyPnl, computeOrderEconomics, dateOnly, daysInMonth, DEFAULT_RATES,
  eachDate, EconomicsLine, OrderEconomicsResult, PnlRates, successfulRefund, successfulReturnKind, successfulReturnedUnits,
  toBusinessDate, ymd,
} from "@ecomdash/shared";
import { n } from "../common/util";

type OrderRow = Prisma.OrderGetPayload<{ include: { lineItems: true; settlement: true; returns: true } }>;
const REFUND_KINDS = new Set(["REFUND", "RETURN_AND_REFUND"]);

/**
 * 11 §5–§10 — rebuilds OrderEconomics, ShopDailyPnl, ShopDailyStat and ProductDailyStat for one shop and date range.
 * Idempotent: rows in the range are replaced; analytics traffic columns are preserved.
 */
@Injectable()
export class PnlComputeService {
  private readonly logger = new Logger("Pnl");

  async recompute(shopId: string, fromDate: string, toDate?: string) {
    const t0 = Date.now();
    const shop = await prisma.shop.findUniqueOrThrow({ where: { id: shopId }, include: { config: true } });
    const tz = shop.timezone;
    const to = toDate ?? toBusinessDate(new Date(), tz);
    const from = fromDate < addDays(to, -400) ? addDays(to, -400) : fromDate;
    const restock = shop.config?.restockReturns ?? true;
    const defaultPct = n(shop.config?.defaultCogsPercent ?? 40) / 100;

    const orders: OrderRow[] = await prisma.order.findMany({
      where: { shopId, businessDate: { gte: dateOnly(from), lte: dateOnly(to) } },
      include: { lineItems: true, settlement: true, returns: true },
    });

    // ── SKU costs (11 §3.1) ──
    const products = await prisma.product.findMany({ where: { shopId }, include: { skus: { include: { costs: { orderBy: { effectiveFrom: "desc" } } } } } });
    const productIdByTk = new Map(products.map((p) => [p.tiktokProductId, p.id]));
    const skuByTk = new Map(products.flatMap((p) => p.skus.map((s) => [s.tiktokSkuId, s] as const)));
    const unitCost = (tkSku: string, itemNet: number, date: string): { cost: number; estimated: boolean } => {
      const sku = skuByTk.get(tkSku);
      const c = sku?.costs.find((x) => ymd(x.effectiveFrom) <= date);
      return c ? { cost: n(c.unitCost), estimated: false } : { cost: itemNet * defaultPct, estimated: true };
    };

    // ── cost items (11 §3.2) ──
    const items = await prisma.costItem.findMany({ where: { shopId, isActive: true } });
    const activeOn = (i: (typeof items)[number], d: string) => ymd(i.effectiveFrom) <= d && (!i.effectiveTo || ymd(i.effectiveTo) >= d);

    // ── historical fee rates from settlements (11 §5) ──
    const rates: PnlRates = { ...DEFAULT_RATES, feeMix: { ...DEFAULT_RATES.feeMix } };
    const feeAgg = await prisma.$queryRaw<{ rev: number; com: number; trx: number; aff: number; inf: number; settle: number }[]>`
      SELECT COALESCE(SUM(s."revenueAmount"),0)::float rev, COALESCE(SUM(s."platformCommission"),0)::float com,
             COALESCE(SUM(s."transactionFee"),0)::float trx, COALESCE(SUM(s."affiliateCommission"),0)::float aff,
             COALESCE(SUM(s."infrastructureFee"),0)::float inf, COALESCE(SUM(s."settlementAmount"),0)::float settle
      FROM "OrderSettlement" s JOIN "Order" o ON o.id = s."orderId"
      WHERE o."shopId" = ${shopId} AND o."businessDate" >= ${dateOnly(addDays(to, -75))} AND s."revenueAmount" > 0`;
    const fa = feeAgg[0];
    if (fa && fa.rev > 1_000_000) {
      const fees = fa.com + fa.trx + fa.aff + fa.inf;
      rates.fee = fees / fa.rev;
      rates.other = Math.max(0, (fa.rev - fees - fa.settle) / fa.rev);
      if (fees > 0) rates.feeMix = { commission: fa.com / fees, transaction: fa.trx / fees, affiliate: fa.aff / fees, infrastructure: fa.inf / fees };
    }

    // ── per-order economics ──
    const econ = new Map<string, OrderEconomicsResult & { date: string }>();
    for (const o of orders) {
      const date = ymd(o.businessDate);
      const lines: EconomicsLine[] = o.lineItems.map((l) => {
        const itemNet = n(l.originalPrice) - n(l.sellerDiscount);
        const c = unitCost(l.tiktokSkuId, itemNet, date);
        return { skuId: l.tiktokSkuId, itemNet, unitCost: c.cost, costEstimated: c.estimated };
      });
      const itemNet = lines.reduce((s, l) => s + l.itemNet, 0);
      const buyerPaid = n(o.totalAmount);
      // Buyer refunds are in buyer money; convert to item-net terms so a full refund removes the whole item value.
      const toNet = buyerPaid > 0 ? itemNet / buyerPaid : 1;
      const returns = o.returns
        .filter((r) => REFUND_KINDS.has(r.kind) || r.kind === "REPLACEMENT")
        .map((r) => ({ kind: r.kind, status: r.status, refundTotal: Math.min(itemNet, n(r.refundTotal) * toNet), returnedUnits: r.returnedUnits }));
      const outcome = classifyOutcome({ status: o.status, paidTime: o.paidTime, isSampleOrder: o.isSampleOrder, itemNet, returns });
      if (!outcome) continue;
      const s = o.settlement;
      const result = computeOrderEconomics({
        outcome, buyerPaid, lines,
        refundAmount: successfulRefund(returns, itemNet),
        returnedUnits: successfulReturnedUnits(returns),
        returnKind: successfulReturnKind(returns),
        restockReturns: restock,
        shipped: !!o.rtsTime,
        settlement: s ? {
          feeParts: { commission: n(s.platformCommission), transaction: n(s.transactionFee), affiliate: n(s.affiliateCommission), infrastructure: n(s.infrastructureFee) },
          settlementAmount: n(s.settlementAmount),
        } : null,
        rates,
        perOrderCosts: items.filter((i) => i.method === "PER_ORDER" && activeOn(i, date)).map((i) => ({ id: i.id, amount: n(i.amount), appliesTo: i.appliesTo })),
        percentCosts: items.filter((i) => i.method === "PERCENT_REVENUE" && activeOn(i, date)).map((i) => ({ id: i.id, percent: n(i.amount) })),
      });
      econ.set(o.id, { ...result, date });
    }

    // ── rates for PENDING estimates from decided orders older than 10 days (11 §6) ──
    const decided = [...econ.values()].filter((e) => e.outcome !== "PENDING" && e.date <= addDays(to, -10));
    const dGross = decided.reduce((s, e) => s + e.itemNet, 0);
    const dReal = decided.reduce((s, e) => s + e.realizedRevenue, 0);
    if (dGross > 5_000_000) rates.successRate = dReal / dGross;
    if (dReal > 5_000_000) {
      rates.cogs = decided.reduce((s, e) => s + e.cogs, 0) / dReal;
      rates.customOrder = decided.filter((e) => e.outcome !== "CANCELLED").reduce((s, e) => s + e.customCosts, 0) / dReal;
    } else rates.cogs = defaultPct;

    // ── ads allocated to this shop (11 §6) ──
    const links = await prisma.advertiserStoreLink.findMany({ where: { advertiser: { organizationId: shop.organizationId }, shopId: { not: null } } });
    const shopsOfAdv = new Map<string, string[]>();
    for (const l of links) shopsOfAdv.set(l.advertiserId, [...new Set([...(shopsOfAdv.get(l.advertiserId) ?? []), l.shopId!])]);
    const advIds = [...shopsOfAdv.entries()].filter(([, s]) => s.includes(shopId)).map(([a]) => a);
    const shopOfStore = new Map(links.map((l) => [`${l.advertiserId}|${l.storeId}`, l.shopId!]));
    const stats = advIds.length ? await prisma.adDailyStat.findMany({ where: { advertiserId: { in: advIds }, date: { gte: dateOnly(from), lte: dateOnly(to) } } }) : [];
    const otherShops = [...new Set(advIds.flatMap((a) => shopsOfAdv.get(a)!))];
    const grossByShopDate = new Map<string, number>();
    if (otherShops.length > 1) {
      const g = await prisma.$queryRaw<{ shopId: string; d: Date; gross: number }[]>`
        SELECT o."shopId" as "shopId", o."businessDate" d, SUM(o."originalProductPrice" - o."sellerDiscount")::float gross
        FROM "Order" o WHERE o."shopId" = ANY(${otherShops}) AND o."paidTime" IS NOT NULL
          AND o."businessDate" >= ${dateOnly(from)} AND o."businessDate" <= ${dateOnly(to)} GROUP BY 1, 2`;
      for (const r of g) grossByShopDate.set(`${r.shopId}|${ymd(r.d)}`, r.gross);
    }
    const adsByDate = new Map<string, { manual: number; gmvMax: number; tiktokRevenue: number; tiktokOrders: number }>();
    for (const s of stats) {
      const d = ymd(s.date);
      let share = 0;
      if (s.source === "GMV_MAX" && s.storeId) share = shopOfStore.get(`${s.advertiserId}|${s.storeId}`) === shopId ? 1 : 0;
      else {
        const linked = shopsOfAdv.get(s.advertiserId)!;
        share = linked.length === 1 ? 1 : adAllocationShares(linked, Object.fromEntries(linked.map((id) => [id, grossByShopDate.get(`${id}|${d}`) ?? 0])))[shopId] ?? 0;
      }
      if (!share) continue;
      const a = adsByDate.get(d) ?? { manual: 0, gmvMax: 0, tiktokRevenue: 0, tiktokOrders: 0 };
      if (s.source === "GMV_MAX") a.gmvMax += n(s.spend) * share; else a.manual += n(s.spend) * share;
      a.tiktokRevenue += n(s.grossRevenue) * share;
      a.tiktokOrders += s.orders * share;
      adsByDate.set(d, a);
    }

    // ── daily P&L ──
    const econByDate = new Map<string, (OrderEconomicsResult & { date: string })[]>();
    for (const e of econ.values()) econByDate.set(e.date, [...(econByDate.get(e.date) ?? []), e]);
    const dates = eachDate(from, to);
    const daily = dates.map((d) => computeDailyPnl({
      date: d,
      orders: econByDate.get(d) ?? [],
      rates,
      fixedCosts: items.filter((i) => i.method === "MONTHLY_FIXED" && activeOn(i, d)).map((i) => ({ id: i.id, amount: n(i.amount) / daysInMonth(d) })),
      ads: adsByDate.get(d) ?? { manual: 0, gmvMax: 0, tiktokRevenue: 0, tiktokOrders: 0 },
    }));

    // ── write ──
    const range = { gte: dateOnly(from), lte: dateOnly(to) };
    await prisma.$transaction(async (tx) => {
      await tx.orderEconomics.deleteMany({ where: { shopId, businessDate: range } });
      const rows = [...econ.entries()].map(([orderId, e]) => ({
        orderId, shopId, businessDate: dateOnly(e.date), outcome: e.outcome, itemNet: e.itemNet, buyerPaid: e.buyerPaid,
        cancelledAmount: e.cancelledAmount, refundAmount: e.refundAmount, pendingAmount: e.pendingAmount, realizedRevenue: e.realizedRevenue,
        platformFees: e.platformFees, otherPlatformFees: e.otherPlatformFees, settlementAmount: e.settlementAmount, feesEstimated: e.feesEstimated,
        units: e.units, costedUnits: e.costedUnits, cogs: e.cogs, cogsEstimated: e.cogsEstimated, customCosts: e.customCosts, contribution: e.contribution,
      }));
      for (let i = 0; i < rows.length; i += 2000) await tx.orderEconomics.createMany({ data: rows.slice(i, i + 2000) });
      await tx.shopDailyPnl.deleteMany({ where: { shopId, date: range } });
      await tx.shopDailyPnl.createMany({
        data: daily.map(({ date, ...d }) => ({ ...d, shopId, date: dateOnly(date), customBreakdown: d.customBreakdown, feeBreakdown: d.feeBreakdown as unknown as Prisma.InputJsonValue })),
      });
    }, { timeout: 120_000 });

    await this.writeOperationalStats(shopId, from, to, orders);
    await this.writeProductStats(shopId, from, to, orders, econ, daily, rates, unitCost, productIdByTk);
    this.logger.log(`recompute shop=${shopId} ${from}..${to} orders=${orders.length} ${Date.now() - t0}ms`);
  }

  /** ShopDailyStat — operational counters (03 §2), traffic columns preserved. */
  private async writeOperationalStats(shopId: string, from: string, to: string, orders: OrderRow[]) {
    const buyers = [...new Set(orders.map((o) => o.buyerHash))];
    const first = buyers.length
      ? await prisma.$queryRaw<{ b: string; d: Date }[]>`SELECT "buyerHash" b, MIN("businessDate") d FROM "Order" WHERE "shopId" = ${shopId} AND "paidTime" IS NOT NULL AND "buyerHash" = ANY(${buyers}) GROUP BY 1`
      : [];
    const firstDate = new Map(first.map((r) => [r.b, ymd(r.d)]));
    const byDate = new Map<string, OrderRow[]>();
    for (const o of orders) byDate.set(ymd(o.businessDate), [...(byDate.get(ymd(o.businessDate)) ?? []), o]);
    for (const d of eachDate(from, to)) {
      const os = byDate.get(d) ?? [];
      const valid = os.filter((o) => o.paidTime && o.status !== "CANCELLED" && !o.isSampleOrder);
      const cancelled = os.filter((o) => o.status === "CANCELLED" && o.paidTime);
      const refunds = os.flatMap((o) => o.returns.filter((r) => REFUND_KINDS.has(r.kind)));
      const buyerSet = new Set(valid.map((o) => o.buyerHash));
      const vals = {
        gmv: valid.reduce((s, o) => s + n(o.totalAmount), 0),
        orders: valid.length,
        unitsSold: valid.reduce((s, o) => s + o.lineItems.filter((l) => !l.isGift).length, 0),
        buyers: buyerSet.size,
        newBuyers: [...buyerSet].filter((b) => firstDate.get(b) === d).length,
        cancelledOrders: cancelled.length,
        cancelledAmount: cancelled.reduce((s, o) => s + n(o.totalAmount), 0),
        returnRequests: refunds.length,
        refundAmount: refunds.reduce((s, r) => s + n(r.refundTotal), 0),
        codOrders: valid.filter((o) => o.isCod).length,
        sellerDiscount: valid.reduce((s, o) => s + n(o.sellerDiscount), 0),
        computedAt: new Date(),
      };
      const date = dateOnly(d);
      await prisma.shopDailyStat.upsert({ where: { shopId_date: { shopId, date } }, create: { shopId, date, ...vals }, update: vals });
    }
  }

  /** ProductDailyStat — 11 §9: order-level money split by item value, day-level ads/fixed split by realised revenue. */
  private async writeProductStats(
    shopId: string, from: string, to: string, orders: OrderRow[], econ: Map<string, OrderEconomicsResult & { date: string }>,
    daily: ReturnType<typeof computeDailyPnl>[], rates: PnlRates,
    unitCost: (tkSku: string, itemNet: number, date: string) => { cost: number; estimated: boolean }, productIdByTk: Map<string, string>,
  ) {
    type Acc = { gmv: number; orders: Set<string>; units: number; gross: number; cancelled: number; refund: number; realized: number; fees: number; other: number; cogs: number; cogsEst: boolean; custom: number; returnedUnits: number };
    const acc = new Map<string, Acc>();
    const get = (pid: string, d: string) => {
      const k = `${pid}|${d}`;
      let a = acc.get(k);
      if (!a) acc.set(k, (a = { gmv: 0, orders: new Set(), units: 0, gross: 0, cancelled: 0, refund: 0, realized: 0, fees: 0, other: 0, cogs: 0, cogsEst: false, custom: 0, returnedUnits: 0 }));
      return a;
    };
    for (const o of orders) {
      const e = econ.get(o.id);
      if (!e) continue;
      const d = e.date;
      for (const l of o.lineItems) {
        const pid = productIdByTk.get(l.tiktokProductId);
        if (!pid) continue;
        const itemNet = n(l.originalPrice) - n(l.sellerDiscount);
        const w = e.itemNet > 0 ? itemNet / e.itemNet : 0;
        const a = get(pid, d);
        a.gross += itemNet;
        if (e.outcome !== "CANCELLED") { a.gmv += itemNet; a.orders.add(o.id); a.units += 1; }
        if (e.outcome === "PENDING") {
          const exp = itemNet * rates.successRate;
          a.realized += exp; a.fees += exp * rates.fee; a.other += exp * rates.other; a.cogs += exp * rates.cogs; a.custom += exp * rates.customOrder; a.cogsEst = true;
          continue;
        }
        a.cancelled += e.cancelledAmount * w;
        a.refund += e.refundAmount * w;
        a.realized += e.realizedRevenue * w;
        a.fees += e.platformFees * w;
        a.other += e.otherPlatformFees * w;
        a.custom += e.customCosts * w;
        if (e.units > 0 && e.costedUnits > 0) {
          const c = unitCost(l.tiktokSkuId, itemNet, d);
          a.cogs += c.cost * (e.costedUnits / e.units);
          a.cogsEst ||= c.estimated;
        }
        if (e.refundAmount > 0) a.returnedUnits += e.itemNet > 0 ? e.refundAmount / e.itemNet : 0;
      }
    }
    const dayInfo = new Map(daily.map((d) => [d.date, d]));
    const realizedByDate = new Map<string, number>();
    for (const [k, a] of acc) { const d = k.split("|")[1]; realizedByDate.set(d, (realizedByDate.get(d) ?? 0) + a.realized); }

    const range = { gte: dateOnly(from), lte: dateOnly(to) };
    const existing = await prisma.productDailyStat.findMany({ where: { shopId, date: range }, select: { productId: true, date: true, pageViews: true, impressions: true } });
    const traffic = new Map(existing.map((x) => [`${x.productId}|${ymd(x.date)}`, x]));
    const rows: Prisma.ProductDailyStatCreateManyInput[] = [];
    for (const [k, a] of acc) {
      const [productId, d] = k.split("|");
      const day = dayInfo.get(d)!;
      const share = (realizedByDate.get(d) ?? 0) > 0 ? a.realized / realizedByDate.get(d)! : 0;
      const adAlloc = day.adSpend * share;
      const fixedAlloc = day.customCostsFixed * share;
      const custom = a.custom + fixedAlloc;
      const contribution = a.realized - a.fees - a.other - a.cogs - custom;
      const t = traffic.get(k);
      rows.push({
        shopId, productId, date: dateOnly(d), gmv: a.gmv, orders: a.orders.size, unitsSold: a.units, pageViews: t?.pageViews ?? null, impressions: t?.impressions ?? null,
        grossItemValue: a.gross, cancelledAmount: a.cancelled, refundAmount: a.refund, realizedRevenue: a.realized, platformFees: a.fees, otherPlatformFees: a.other,
        cogs: a.cogs, cogsEstimated: a.cogsEst, customCosts: custom, adSpendAllocated: adAlloc, contribution, netProfit: contribution - adAlloc, returnedUnits: Math.round(a.returnedUnits),
      });
    }
    for (const [k, t] of traffic) if (!acc.has(k)) {
      const [productId, d] = k.split("|");
      rows.push({ shopId, productId, date: dateOnly(d), gmv: 0, orders: 0, unitsSold: 0, pageViews: t.pageViews, impressions: t.impressions });
    }
    await prisma.$transaction(async (tx) => {
      await tx.productDailyStat.deleteMany({ where: { shopId, date: range } });
      for (let i = 0; i < rows.length; i += 2000) await tx.productDailyStat.createMany({ data: rows.slice(i, i + 2000) });
    }, { timeout: 120_000 });
  }
}
