import type { DailyPnl, FeeParts, OrderEconomicsResult, PnlRates } from "./types";

export interface DailyAds {
  manual: number;
  gmvMax: number;
  tiktokRevenue: number;
  tiktokOrders: number;
}

export interface DailyInput {
  date: string;
  orders: Pick<OrderEconomicsResult,
    "outcome" | "itemNet" | "buyerPaid" | "cancelledAmount" | "refundAmount" | "pendingAmount" | "realizedRevenue" |
    "platformFees" | "feeParts" | "otherPlatformFees" | "settlementAmount" | "feesEstimated" | "cogs" | "cogsEstimated" |
    "customCosts" | "customByItem">[];
  rates: PnlRates;
  fixedCosts: { id: string; amount: number }[]; // MONTHLY_FIXED already divided to this day
  ads: DailyAds;
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** 11 §6 — one shop-day of the order-date cohort, PENDING orders estimated with historical rates. */
export function computeDailyPnl(i: DailyInput): DailyPnl {
  const count = (o: string) => i.orders.filter((x) => x.outcome === o).length;
  const sum = (f: (x: DailyInput["orders"][number]) => number) => i.orders.reduce((s, x) => s + f(x), 0);

  const pendingAmount = sum((x) => x.pendingAmount);
  const pendingExpected = pendingAmount * i.rates.successRate;
  const decidedRealized = sum((x) => x.realizedRevenue);
  const realizedRevenue = decidedRealized + pendingExpected;

  const estFees = pendingExpected * i.rates.fee;
  const estOther = pendingExpected * i.rates.other;
  const platformFees = sum((x) => x.platformFees) + estFees;
  const otherPlatformFees = sum((x) => x.otherPlatformFees) + estOther;
  const settlementAmount = sum((x) => x.settlementAmount) + pendingExpected - estFees - estOther;
  const feesEstimated = sum((x) => (x.feesEstimated ? x.platformFees + x.otherPlatformFees : 0)) + estFees + estOther;

  const feeBreakdown: FeeParts = { commission: 0, transaction: 0, affiliate: 0, infrastructure: 0 };
  for (const o of i.orders) for (const k of Object.keys(feeBreakdown) as (keyof FeeParts)[]) feeBreakdown[k] += o.feeParts[k];
  for (const k of Object.keys(feeBreakdown) as (keyof FeeParts)[]) feeBreakdown[k] = r2(feeBreakdown[k] + estFees * i.rates.feeMix[k]);

  const estCogs = pendingExpected * i.rates.cogs;
  const cogs = sum((x) => x.cogs) + estCogs;
  const cogsEstimated = sum((x) => (x.cogsEstimated ? x.cogs : 0)) + estCogs;

  const customBreakdown: Record<string, number> = {};
  for (const o of i.orders) for (const [k, v] of Object.entries(o.customByItem)) customBreakdown[k] = (customBreakdown[k] ?? 0) + v;
  const estCustom = pendingExpected * i.rates.customOrder;
  if (estCustom) customBreakdown["_pending_estimate"] = estCustom;
  const customCostsOrder = sum((x) => x.customCosts) + estCustom;
  let customCostsFixed = 0;
  for (const f of i.fixedCosts) {
    customBreakdown[f.id] = (customBreakdown[f.id] ?? 0) + f.amount;
    customCostsFixed += f.amount;
  }
  for (const k of Object.keys(customBreakdown)) customBreakdown[k] = r2(customBreakdown[k]);

  const contribution = settlementAmount - cogs - customCostsOrder - customCostsFixed;
  const adSpend = i.ads.manual + i.ads.gmvMax;

  return {
    date: i.date,
    ordersPaid: i.orders.length,
    ordersSuccess: count("SUCCESS"),
    ordersPartial: count("PARTIAL_RETURN"),
    ordersReturned: count("RETURNED"),
    ordersCancelled: count("CANCELLED"),
    ordersPending: count("PENDING"),
    grossItemValue: r2(sum((x) => x.itemNet)),
    buyerPaid: r2(sum((x) => x.buyerPaid)),
    cancelledAmount: r2(sum((x) => x.cancelledAmount)),
    refundAmount: r2(sum((x) => x.refundAmount)),
    pendingAmount: r2(pendingAmount),
    pendingExpected: r2(pendingExpected),
    realizedRevenue: r2(realizedRevenue),
    platformFees: r2(platformFees),
    otherPlatformFees: r2(otherPlatformFees),
    settlementAmount: r2(settlementAmount),
    feesEstimated: r2(feesEstimated),
    cogs: r2(cogs),
    cogsEstimated: r2(cogsEstimated),
    customCostsOrder: r2(customCostsOrder),
    customCostsFixed: r2(customCostsFixed),
    customBreakdown,
    feeBreakdown,
    contribution: r2(contribution),
    adSpend: r2(adSpend),
    adSpendManual: r2(i.ads.manual),
    adSpendGmvMax: r2(i.ads.gmvMax),
    tiktokAdRevenue: r2(i.ads.tiktokRevenue),
    tiktokAdOrders: Math.round(i.ads.tiktokOrders),
    netProfit: r2(contribution - adSpend),
    estimatedShare: realizedRevenue > 0 ? Math.round((pendingExpected / realizedRevenue) * 10_000) / 10_000 : 0,
  };
}

/**
 * 11 §6 — split one advertiser-day of ad stats across the shops linked to it, proportional to each shop's gross item value.
 * Returns shopId → share (sums to 1).
 */
export function adAllocationShares(linkedShopIds: string[], grossByShop: Record<string, number>): Record<string, number> {
  if (!linkedShopIds.length) return {};
  const total = linkedShopIds.reduce((s, id) => s + (grossByShop[id] ?? 0), 0);
  const out: Record<string, number> = {};
  for (const id of linkedShopIds) out[id] = total > 0 ? (grossByShop[id] ?? 0) / total : 1 / linkedShopIds.length;
  return out;
}
