import type { DailyPnl, FeeParts } from "./types";

export type AdStatus = "PROFIT" | "NEAR_BREAKEVEN" | "LOSS" | "NO_SPEND";

export interface PnlTotals extends Omit<DailyPnl, "date" | "customBreakdown" | "feeBreakdown" | "estimatedShare"> {
  customBreakdown: Record<string, number>;
  feeBreakdown: FeeParts;
}

export interface RoasMetrics {
  tiktok: number | null;
  realizationRate: number | null;
  real: number | null;
  realSettlement: number | null;
  breakEven: number | null;
  gapPct: number | null;
  shopWide: number | null;
  status: AdStatus;
}

export interface WaterfallStep {
  key: string;
  label: string;
  amount: number;
  kind: "start" | "minus" | "subtotal";
  pctOfRevenue: number | null;
  perSuccessOrder: number | null;
  estimatedAmount: number;
}

const NUMERIC_KEYS = [
  "ordersPaid", "ordersSuccess", "ordersPartial", "ordersReturned", "ordersCancelled", "ordersPending",
  "grossItemValue", "buyerPaid", "cancelledAmount", "refundAmount", "pendingAmount", "pendingExpected", "realizedRevenue",
  "platformFees", "otherPlatformFees", "settlementAmount", "feesEstimated", "cogs", "cogsEstimated", "customCostsOrder",
  "customCostsFixed", "contribution", "adSpend", "adSpendManual", "adSpendGmvMax", "tiktokAdRevenue", "tiktokAdOrders", "netProfit",
] as const;

export function sumDays(days: DailyPnl[]): PnlTotals {
  const t = Object.fromEntries(NUMERIC_KEYS.map((k) => [k, 0])) as unknown as PnlTotals;
  t.customBreakdown = {};
  t.feeBreakdown = { commission: 0, transaction: 0, affiliate: 0, infrastructure: 0 };
  for (const d of days) {
    for (const k of NUMERIC_KEYS) (t as any)[k] += d[k];
    for (const [k, v] of Object.entries(d.customBreakdown)) t.customBreakdown[k] = (t.customBreakdown[k] ?? 0) + v;
    for (const k of Object.keys(t.feeBreakdown) as (keyof FeeParts)[]) t.feeBreakdown[k] += d.feeBreakdown[k];
  }
  return t;
}

const div = (a: number, b: number): number | null => (b > 0 ? a / b : null);

/** Successful orders including the expected share of pending ones — the denominator for per-order economics. */
export function successEquivalent(t: PnlTotals, successRate: number): number {
  return t.ordersSuccess + t.ordersPartial + t.ordersPending * successRate;
}

/** 11 §8. */
export function roasMetrics(t: PnlTotals): RoasMetrics {
  const tiktok = div(t.tiktokAdRevenue, t.adSpend);
  const realizationRate = div(t.realizedRevenue, t.grossItemValue);
  const real = tiktok != null && realizationRate != null ? tiktok * realizationRate : null;
  const realSettlement = real != null && t.realizedRevenue > 0 ? real * (t.settlementAmount / t.realizedRevenue) : null;
  const breakEven = t.contribution > 0 ? t.realizedRevenue / t.contribution : null;
  let status: AdStatus = "NO_SPEND";
  if (t.adSpend > 0) {
    if (real == null || breakEven == null) status = "LOSS";
    else status = real >= breakEven * 1.2 ? "PROFIT" : real >= breakEven ? "NEAR_BREAKEVEN" : "LOSS";
  }
  return {
    tiktok,
    realizationRate,
    real,
    realSettlement,
    breakEven,
    gapPct: tiktok && real != null ? 1 - real / tiktok : null,
    shopWide: div(t.realizedRevenue, t.adSpend),
    status,
  };
}

/** 11 §7 — invariant: each subtotal equals the previous subtotal minus the steps between them. */
export function buildWaterfall(t: PnlTotals, successEq: number): WaterfallStep[] {
  const rev = t.realizedRevenue;
  const pendingLoss = t.pendingAmount - t.pendingExpected;
  const settlement = rev - t.platformFees - t.otherPlatformFees;
  const custom = t.customCostsOrder + t.customCostsFixed;
  const contribution = settlement - t.cogs - custom;
  const feeTotal = t.platformFees + t.otherPlatformFees;
  const raw: [string, string, number, WaterfallStep["kind"], number][] = [
    ["gross", "GMV đặt hàng", t.grossItemValue, "start", 0],
    ["cancelled", "Huỷ", t.cancelledAmount, "minus", 0],
    ["refund", "Hoàn", t.refundAmount, "minus", 0],
    ["pendingLoss", "Dự kiến huỷ/hoàn (đang chờ)", pendingLoss, "minus", pendingLoss],
    ["revenue", "Doanh thu thực", rev, "subtotal", t.pendingExpected],
    ["platformFees", "Phí sàn", t.platformFees, "minus", feeTotal > 0 ? (t.feesEstimated * t.platformFees) / feeTotal : 0],
    ["otherFees", "Phí khác trên sàn", t.otherPlatformFees, "minus", feeTotal > 0 ? (t.feesEstimated * t.otherPlatformFees) / feeTotal : 0],
    ["settlement", "Thực nhận", settlement, "subtotal", 0],
    ["cogs", "Giá vốn", t.cogs, "minus", t.cogsEstimated],
    ["custom", "Chi phí tự nhập", custom, "minus", t.customBreakdown["_pending_estimate"] ?? 0],
    ["contribution", "Lãi trước quảng cáo", contribution, "subtotal", 0],
    ["ads", "Chi phí quảng cáo", t.adSpend, "minus", 0],
    ["net", "Lãi ròng", contribution - t.adSpend, "subtotal", 0],
  ];
  return raw
    .filter(([key, , amount]) => key !== "pendingLoss" || Math.abs(amount) >= 1)
    .map(([key, label, amount, kind, est]) => ({
      key,
      label,
      amount: Math.round(amount),
      kind,
      pctOfRevenue: rev > 0 ? amount / rev : null,
      perSuccessOrder: successEq > 0 ? amount / successEq : null,
      estimatedAmount: Math.round(est),
    }));
}

export function pctChange(cur: number | null, prev: number | null): number | null {
  if (cur == null || prev == null || prev === 0) return null;
  return (cur - prev) / Math.abs(prev);
}
