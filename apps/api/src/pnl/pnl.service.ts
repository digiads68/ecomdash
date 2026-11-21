import type { Access } from "../access/access";
import { Injectable } from "@nestjs/common";
import { prisma, Prisma } from "@ecomdash/database";
import {
  addDays, buildWaterfall, CostRowDto, DailyPnl, dateOnly, OrderOutcome, PnlDailyRowDto, PnlOrderRowDto, PnlProductRowDto, PnlSummaryDto,
  PnlTotals, roasMetrics, successEquivalent, sumDays, toBusinessDate, ymd,
} from "@ecomdash/shared";
import { div, getShopForUser, kpi, n, pageParams, parsePeriod } from "../common/util";

type PnlRow = Prisma.ShopDailyPnlGetPayload<object>;

export function toDaily(r: PnlRow): DailyPnl {
  return {
    date: ymd(r.date),
    ordersPaid: r.ordersPaid, ordersSuccess: r.ordersSuccess, ordersPartial: r.ordersPartial, ordersReturned: r.ordersReturned,
    ordersCancelled: r.ordersCancelled, ordersPending: r.ordersPending,
    grossItemValue: n(r.grossItemValue), buyerPaid: n(r.buyerPaid), cancelledAmount: n(r.cancelledAmount), refundAmount: n(r.refundAmount),
    pendingAmount: n(r.pendingAmount), pendingExpected: n(r.pendingExpected), realizedRevenue: n(r.realizedRevenue), platformFees: n(r.platformFees),
    otherPlatformFees: n(r.otherPlatformFees), settlementAmount: n(r.settlementAmount), feesEstimated: n(r.feesEstimated), cogs: n(r.cogs),
    cogsEstimated: n(r.cogsEstimated), customCostsOrder: n(r.customCostsOrder), customCostsFixed: n(r.customCostsFixed),
    customBreakdown: (r.customBreakdown ?? {}) as Record<string, number>,
    feeBreakdown: { commission: 0, transaction: 0, affiliate: 0, infrastructure: 0, ...((r.feeBreakdown ?? {}) as object) },
    contribution: n(r.contribution), adSpend: n(r.adSpend), adSpendManual: n(r.adSpendManual), adSpendGmvMax: n(r.adSpendGmvMax),
    tiktokAdRevenue: n(r.tiktokAdRevenue), tiktokAdOrders: r.tiktokAdOrders, netProfit: n(r.netProfit), estimatedShare: n(r.estimatedShare),
  };
}

const successRateOf = (t: PnlTotals) => (t.pendingAmount > 0 ? t.pendingExpected / t.pendingAmount : 1);
const METHOD_LABEL: Record<string, string> = { PER_ORDER: "/ đơn", PERCENT_REVENUE: "% doanh thu thực", MONTHLY_FIXED: "/ tháng" };
const APPLIES_LABEL: Record<string, string> = { PAID: "mọi đơn đã thanh toán", SHIPPED: "đơn đã gửi đi", SUCCESS: "đơn thành công" };

@Injectable()
export class PnlService {
  async loadDays(shopId: string, from: string, to: string): Promise<DailyPnl[]> {
    const rows = await prisma.shopDailyPnl.findMany({ where: { shopId, date: { gte: dateOnly(from), lte: dateOnly(to) } }, orderBy: { date: "asc" } });
    return rows.map(toDaily);
  }

  async totals(shopId: string, from: string, to: string) {
    const days = await this.loadDays(shopId, from, to);
    return { days, totals: sumDays(days) };
  }

  async summary(access: Access, shopId: string, qFrom?: string, qTo?: string): Promise<PnlSummaryDto> {
    const shop = await getShopForUser(access, shopId);
    const p = parsePeriod(qFrom, qTo, shop.timezone);
    const [{ totals: t }, { totals: tp }] = await Promise.all([this.totals(shop.id, p.from, p.to), this.totals(shop.id, p.prevFrom, p.prevTo)]);
    const eq = successEquivalent(t, successRateOf(t));
    const eqPrev = successEquivalent(tp, successRateOf(tp));
    const roas = roasMetrics(t);
    const roasPrev = roasMetrics(tp);
    const waterfall = buildWaterfall(t, eq);
    const net = t.contribution - t.adSpend;
    const netPrev = tp.contribution - tp.adSpend;

    const range = { gte: dateOnly(p.from), lte: dateOnly(p.to) };
    const [buckets, items, missing, sync, unsettled] = await Promise.all([
      prisma.orderEconomics.groupBy({ by: ["outcome"], where: { shopId: shop.id, businessDate: range }, _count: true, _sum: { itemNet: true, realizedRevenue: true, refundAmount: true, cancelledAmount: true, pendingAmount: true } }),
      prisma.costItem.findMany({ where: { shopId: shop.id } }),
      this.missingCosts(shop.id, p.from, p.to),
      prisma.syncState.findFirst({ where: { scopeType: "SHOP", scopeId: shop.id, resource: "orders" } }),
      prisma.orderEconomics.count({ where: { shopId: shop.id, businessDate: range, feesEstimated: true, outcome: { in: ["SUCCESS", "PARTIAL_RETURN", "RETURNED"] } } }),
    ]);
    const b = (o: OrderOutcome) => buckets.find((x) => x.outcome === o);
    const paidCount = buckets.reduce((s, x) => s + x._count, 0);
    const bucket = (count: number, amount: number) => ({ count, amount: Math.round(amount), pctOfPaid: div(count, paidCount) });

    const per = (v: number) => div(v, eq);
    const costs: CostRowDto[] = [];
    const row = (key: string, label: string, group: CostRowDto["group"], amount: number, estimated: boolean, note?: string) => {
      if (Math.abs(amount) < 0.5) return;
      costs.push({ key, label, group, amount: Math.round(amount), pctOfRevenue: div(amount, t.realizedRevenue), perSuccessOrder: per(amount), estimated, note });
    };
    row("cogs", "Giá vốn hàng bán", "COGS", t.cogs, t.cogsEstimated > 0,
      t.cogsEstimated > 0 ? `${Math.round((t.cogsEstimated / Math.max(1, t.cogs)) * 100)}% là ước tính (SKU chưa nhập giá vốn hoặc đơn đang chờ)` : undefined);
    const fe = t.feesEstimated > 0;
    row("fee_commission", "Hoa hồng sàn", "PLATFORM", t.feeBreakdown.commission, fe);
    row("fee_transaction", "Phí giao dịch", "PLATFORM", t.feeBreakdown.transaction, fe);
    row("fee_affiliate", "Hoa hồng affiliate", "PLATFORM", t.feeBreakdown.affiliate, fe);
    row("fee_infrastructure", "Phí hạ tầng", "PLATFORM", t.feeBreakdown.infrastructure, fe);
    row("other_fees", "Phí vận chuyển người bán chịu, ship hoàn, thuế khấu trừ, điều chỉnh", "PLATFORM_OTHER", t.otherPlatformFees, fe,
      "Phần chênh giữa doanh thu thực, phí sàn và số TikTok thực trả");
    for (const [id, amount] of Object.entries(t.customBreakdown)) {
      if (id === "_pending_estimate") { row(id, "Chi phí theo đơn — phần ước tính cho đơn đang chờ", "CUSTOM", amount, true); continue; }
      const it = items.find((i) => i.id === id);
      const label = it
        ? `${it.name} (${it.method === "PERCENT_REVENUE" ? `${n(it.amount)}%` : `${Math.round(n(it.amount)).toLocaleString("vi-VN")}₫ ${METHOD_LABEL[it.method]}`}${it.method === "PER_ORDER" ? ` · ${APPLIES_LABEL[it.appliesTo]}` : ""})`
        : "Chi phí đã xoá";
      row(`custom_${id}`, label, "CUSTOM", amount, false);
    }
    row("ads_manual", "Quảng cáo Shop Ads thủ công", "ADS", t.adSpendManual, false);
    row("ads_gmvmax", "Quảng cáo GMV Max", "ADS", t.adSpendGmvMax, false);

    const shopAds = await this.shopAdSignals(shop.id, p.from, p.to);
    return {
      period: { from: p.from, to: p.to, settledShare: t.grossItemValue > 0 ? 1 - t.pendingAmount / t.grossItemValue : null },
      orders: {
        paid: bucket(paidCount, buckets.reduce((s, x) => s + n(x._sum.itemNet), 0)),
        success: bucket(b("SUCCESS")?._count ?? 0, n(b("SUCCESS")?._sum.realizedRevenue)),
        partialReturn: bucket(b("PARTIAL_RETURN")?._count ?? 0, n(b("PARTIAL_RETURN")?._sum.refundAmount)),
        returned: bucket(b("RETURNED")?._count ?? 0, n(b("RETURNED")?._sum.refundAmount)),
        cancelled: bucket(b("CANCELLED")?._count ?? 0, n(b("CANCELLED")?._sum.cancelledAmount)),
        pending: bucket(b("PENDING")?._count ?? 0, n(b("PENDING")?._sum.pendingAmount)),
      },
      waterfall,
      costs,
      roas,
      unit: {
        successOrders: Math.round(eq),
        revenue: per(t.realizedRevenue), platformFees: per(t.platformFees), otherFees: per(t.otherPlatformFees), cogs: per(t.cogs),
        custom: per(t.customCostsOrder + t.customCostsFixed), contribution: per(t.contribution), adSpend: per(t.adSpend), netProfit: per(net),
      },
      ads: {
        spend: t.adSpend, manualSpend: t.adSpendManual, gmvMaxSpend: t.adSpendGmvMax, tiktokRevenue: t.tiktokAdRevenue, tiktokOrders: t.tiktokAdOrders,
        spendPerPaidOrder: div(t.adSpend, t.ordersPaid), spendPerSuccessOrder: per(t.adSpend),
      },
      kpis: {
        realizedRevenue: kpi(t.realizedRevenue, tp.realizedRevenue),
        netProfit: kpi(net, netPrev),
        netMargin: kpi(div(net, t.realizedRevenue), div(netPrev, tp.realizedRevenue)),
        netProfitPerOrder: kpi(div(net, eq), div(netPrev, eqPrev)),
        adSpend: kpi(t.adSpend, tp.adSpend),
        roasReal: kpi(roas.real, roasPrev.real),
        roasTiktok: kpi(roas.tiktok, roasPrev.tiktok),
        breakEven: kpi(roas.breakEven, roasPrev.breakEven),
      },
      dataQuality: {
        missingCostSkus: missing.count,
        missingCostRevenueShare: missing.share,
        unsettledOrders: unsettled,
        feesEstimatedShare: div(t.feesEstimated, t.platformFees + t.otherPlatformFees),
        cogsEstimatedShare: div(t.cogsEstimated, t.cogs),
        shopGmvMaxAdFee: shopAds.shopGmvMaxAdFee, adsPaidFromBalance: shopAds.adsPaidFromBalance, gmvMaxRevenueShare: shopAds.gmvMaxRevenueShare,
        gmvMaxFeeGap: shopAds.gap,
      },
      syncedAt: sync?.lastSuccessAt?.toISOString() ?? null,
    };
  }

  /** GMV Max fees on orders, ads paid from the shop balance (statements in period), and GMV Max revenue share. */
  async shopAdSignals(shopId: string, from: string, to: string) {
    const r = await prisma.$queryRaw<{ fee: number; paid: number; share: number | null }[]>`
      SELECT
        (SELECT COALESCE(SUM(s."gmvMaxAdFee"),0)::float FROM "OrderSettlement" s JOIN "Order" o ON o.id = s."orderId"
           WHERE o."shopId" = ${shopId} AND o."businessDate" BETWEEN ${dateOnly(from)} AND ${dateOnly(to)}) AS fee,
        (SELECT COALESCE(SUM(ABS(a.amount)),0)::float FROM "StatementAdjustment" a JOIN "Statement" st ON st.id = a."statementId"
           WHERE st."shopId" = ${shopId} AND a.type = 'GMV_PAYMENT_FOR_ADS' AND st."statementTime" >= ${dateOnly(from)} AND st."statementTime" < ${dateOnly(addDays(to, 1))}) AS paid,
        (SELECT (SUM("gmvMaxRevenueShare" * "analyticsGmv") / NULLIF(SUM(CASE WHEN "gmvMaxRevenueShare" IS NOT NULL THEN "analyticsGmv" END),0))::float
           FROM "ShopDailyStat" WHERE "shopId" = ${shopId} AND date BETWEEN ${dateOnly(from)} AND ${dateOnly(to)}) AS share`;
    const x = r[0] ?? { fee: 0, paid: 0, share: null };
    // Cross-check only on days old enough to be settled: GMV Max fees per order vs. GMV Max spend from the Ads API.
    const settledTo = addDays(toBusinessDate(new Date()), -14) < to ? addDays(toBusinessDate(new Date()), -14) : to;
    const g = settledTo < from ? [] : await prisma.$queryRaw<{ fee: number; spend: number }[]>`
      SELECT
        (SELECT COALESCE(SUM(s."gmvMaxAdFee"),0)::float FROM "OrderSettlement" s JOIN "Order" o ON o.id = s."orderId"
           WHERE o."shopId" = ${shopId} AND o."businessDate" BETWEEN ${dateOnly(from)} AND ${dateOnly(settledTo)}) AS fee,
        (SELECT COALESCE(SUM("adSpendGmvMax"),0)::float FROM "ShopDailyPnl" WHERE "shopId" = ${shopId} AND date BETWEEN ${dateOnly(from)} AND ${dateOnly(settledTo)}) AS spend`;
    const gap = g[0] && g[0].fee > 0 && g[0].spend > 0 ? Math.abs(g[0].fee - g[0].spend) / g[0].spend : null;
    return { shopGmvMaxAdFee: x.fee, adsPaidFromBalance: x.paid, gmvMaxRevenueShare: x.share, gap };
  }

  /** SKUs without any cost row and their share of item value sold in the period. */
  async missingCosts(shopId: string, from: string, to: string) {
    const r = await prisma.$queryRaw<{ count: number; missing: number; total: number }[]>`
      WITH missing AS (
        SELECT s."tiktokSkuId" FROM "Sku" s JOIN "Product" p ON p.id = s."productId"
        WHERE p."shopId" = ${shopId} AND p.status = 'ACTIVATE' AND NOT EXISTS (SELECT 1 FROM "SkuCost" c WHERE c."skuId" = s.id)
      )
      SELECT (SELECT COUNT(*) FROM missing)::int AS count,
             COALESCE(SUM(CASE WHEN li."tiktokSkuId" IN (SELECT "tiktokSkuId" FROM missing) THEN li."originalPrice" - li."sellerDiscount" ELSE 0 END), 0)::float AS missing,
             COALESCE(SUM(li."originalPrice" - li."sellerDiscount"), 0)::float AS total
      FROM "OrderLineItem" li JOIN "Order" o ON o.id = li."orderId"
      WHERE o."shopId" = ${shopId} AND o."paidTime" IS NOT NULL AND o."businessDate" BETWEEN ${dateOnly(from)} AND ${dateOnly(to)}`;
    const x = r[0] ?? { count: 0, missing: 0, total: 0 };
    return { count: x.count, share: div(x.missing, x.total) };
  }

  async daily(access: Access, shopId: string, qFrom?: string, qTo?: string): Promise<PnlDailyRowDto[]> {
    const shop = await getShopForUser(access, shopId);
    const p = parsePeriod(qFrom, qTo, shop.timezone);
    const days = await this.loadDays(shop.id, p.from, p.to);
    return days.map((d) => {
      const r = roasMetrics({ ...sumDays([d]) });
      return {
        date: d.date, ordersPaid: d.ordersPaid, ordersSuccess: d.ordersSuccess + d.ordersPartial, ordersCancelled: d.ordersCancelled,
        ordersReturned: d.ordersReturned, ordersPending: d.ordersPending, grossItemValue: d.grossItemValue, realizedRevenue: d.realizedRevenue,
        contribution: d.contribution, adSpend: d.adSpend, netProfit: d.netProfit, roasTiktok: r.tiktok, roasReal: r.real, breakEven: r.breakEven,
      };
    });
  }

  async products(access: Access, shopId: string, qFrom?: string, qTo?: string, sort = "netProfit:asc"): Promise<PnlProductRowDto[]> {
    const shop = await getShopForUser(access, shopId);
    const p = parsePeriod(qFrom, qTo, shop.timezone);
    const g = await prisma.productDailyStat.groupBy({
      by: ["productId"],
      where: { shopId: shop.id, date: { gte: dateOnly(p.from), lte: dateOnly(p.to) } },
      _sum: { unitsSold: true, grossItemValue: true, cancelledAmount: true, refundAmount: true, realizedRevenue: true, cogs: true, platformFees: true, otherPlatformFees: true, customCosts: true, adSpendAllocated: true, netProfit: true },
    });
    const est = await prisma.productDailyStat.groupBy({ by: ["productId"], where: { shopId: shop.id, date: { gte: dateOnly(p.from), lte: dateOnly(p.to) }, cogsEstimated: true }, _count: true });
    const estSet = new Set(est.map((e) => e.productId));
    const products = await prisma.product.findMany({ where: { id: { in: g.map((x) => x.productId) } }, select: { id: true, title: true, thumbnailUrl: true } });
    const meta = new Map(products.map((x) => [x.id, x]));
    const rows: PnlProductRowDto[] = g.filter((x) => n(x._sum.grossItemValue) > 0).map((x) => {
      const s = x._sum;
      const realized = n(s.realizedRevenue);
      return {
        productId: x.productId, title: meta.get(x.productId)?.title ?? "", thumbnailUrl: meta.get(x.productId)?.thumbnailUrl ?? null,
        unitsSold: s.unitsSold ?? 0, grossItemValue: n(s.grossItemValue), cancelReturnRate: div(n(s.cancelledAmount) + n(s.refundAmount), n(s.grossItemValue)),
        realizedRevenue: realized, cogs: n(s.cogs), cogsEstimated: estSet.has(x.productId), platformFees: n(s.platformFees) + n(s.otherPlatformFees),
        customCosts: n(s.customCosts), adSpendAllocated: n(s.adSpendAllocated), netProfit: n(s.netProfit), margin: div(n(s.netProfit), realized),
      };
    });
    const [field, dir] = sort.split(":") as [keyof PnlProductRowDto, string];
    rows.sort((a, b) => ((Number(a[field]) || 0) - (Number(b[field]) || 0)) * (dir === "desc" ? -1 : 1));
    return rows;
  }

  async orders(access: Access, shopId: string, q: { from?: string; to?: string; outcome?: string; page?: string; pageSize?: string }) {
    const shop = await getShopForUser(access, shopId);
    const p = parsePeriod(q.from, q.to, shop.timezone);
    const { page, pageSize, skip, take } = pageParams(q.page, q.pageSize);
    const where: Prisma.OrderEconomicsWhereInput = { shopId: shop.id, businessDate: { gte: dateOnly(p.from), lte: dateOnly(p.to) }, ...(q.outcome ? { outcome: q.outcome as OrderOutcome } : {}) };
    const [total, rows] = await Promise.all([
      prisma.orderEconomics.count({ where }),
      prisma.orderEconomics.findMany({ where, include: { order: { select: { tiktokOrderId: true, createTime: true } } }, orderBy: { contribution: "asc" }, skip, take }),
    ]);
    return { total, page, pageSize, items: rows.map((r) => econRow(r, r.order)) };
  }
}

export function econRow(r: Prisma.OrderEconomicsGetPayload<object>, o: { tiktokOrderId: string; createTime: Date }): PnlOrderRowDto {
  return {
    orderId: r.orderId, tiktokOrderId: o.tiktokOrderId, createTime: o.createTime.toISOString(), outcome: r.outcome,
    itemNet: n(r.itemNet), realizedRevenue: n(r.realizedRevenue), platformFees: n(r.platformFees), otherPlatformFees: n(r.otherPlatformFees),
    settlementAmount: n(r.settlementAmount), cogs: n(r.cogs), customCosts: n(r.customCosts), contribution: n(r.contribution),
    feesEstimated: r.feesEstimated, cogsEstimated: r.cogsEstimated,
  };
}
