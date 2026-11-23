import type { CostAppliesTo, FeeParts, OrderEconomicsResult, OrderOutcome, PnlRates } from "./types";

export interface EconomicsLine {
  skuId: string;
  itemNet: number;     // originalPrice − sellerDiscount of this unit
  unitCost: number;    // effective cost at businessDate (or default %)
  costEstimated: boolean;
}

export interface PerOrderCost {
  id: string;
  amount: number;
  appliesTo: CostAppliesTo;
}

export interface PercentCost {
  id: string;
  percent: number; // 2.5 = 2.5 %
}

export interface SettlementInput {
  feeParts: FeeParts;      // positive amounts
  settlementAmount: number;
}

export interface EconomicsInput {
  outcome: OrderOutcome;
  buyerPaid: number;
  lines: EconomicsLine[];
  refundAmount: number;        // successful refund, already capped at itemNet
  returnedUnits: number;
  returnKind: "REFUND" | "RETURN_AND_REFUND" | null;
  restockReturns: boolean;
  shipped: boolean;
  settlement: SettlementInput | null;
  rates: PnlRates;
  perOrderCosts: PerOrderCost[];
  percentCosts: PercentCost[];
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const sumFees = (f: FeeParts) => f.commission + f.transaction + f.affiliate + f.infrastructure;
const scaleFees = (mix: FeeParts, total: number): FeeParts => ({
  commission: total * mix.commission,
  transaction: total * mix.transaction,
  affiliate: total * mix.affiliate,
  infrastructure: total * mix.infrastructure,
});

function appliesTo(outcome: OrderOutcome, shipped: boolean, a: CostAppliesTo): boolean {
  if (a === "PAID") return true;
  if (a === "SHIPPED") return outcome !== "CANCELLED" || shipped;
  return outcome === "SUCCESS" || outcome === "PARTIAL_RETURN";
}

/** 11 §5 — economics of a single paid order. PENDING orders carry only pendingAmount; the day-level estimate covers them. */
export function computeOrderEconomics(i: EconomicsInput): OrderEconomicsResult {
  const itemNet = i.lines.reduce((s, l) => s + l.itemNet, 0);
  const units = i.lines.length;
  const base: OrderEconomicsResult = {
    outcome: i.outcome,
    itemNet: round2(itemNet),
    buyerPaid: round2(i.buyerPaid),
    cancelledAmount: 0,
    refundAmount: 0,
    pendingAmount: 0,
    realizedRevenue: 0,
    platformFees: 0,
    feeParts: { commission: 0, transaction: 0, affiliate: 0, infrastructure: 0 },
    otherPlatformFees: 0,
    settlementAmount: 0,
    feesEstimated: false,
    units,
    costedUnits: 0,
    cogs: 0,
    cogsEstimated: false,
    customCosts: 0,
    customByItem: {},
    contribution: 0,
  };

  if (i.outcome === "PENDING") return { ...base, pendingAmount: round2(itemNet) };

  const custom: Record<string, number> = {};
  for (const c of i.perOrderCosts) if (appliesTo(i.outcome, i.shipped, c.appliesTo)) custom[c.id] = (custom[c.id] ?? 0) + c.amount;

  if (i.outcome === "CANCELLED") {
    const customCosts = Object.values(custom).reduce((s, v) => s + v, 0);
    return { ...base, cancelledAmount: round2(itemNet), customCosts: round2(customCosts), customByItem: custom, contribution: round2(-customCosts) };
  }

  const refundAmount = Math.min(i.refundAmount, itemNet);
  const realized = itemNet - refundAmount;

  let feeParts: FeeParts;
  let platformFees: number;
  let settlementAmount: number;
  let otherPlatformFees: number;
  let feesEstimated = false;
  if (i.settlement) {
    feeParts = i.settlement.feeParts;
    platformFees = sumFees(feeParts);
    settlementAmount = i.settlement.settlementAmount;
    otherPlatformFees = realized - platformFees - settlementAmount;
  } else {
    feesEstimated = true;
    platformFees = realized * i.rates.fee;
    feeParts = scaleFees(i.rates.feeMix, platformFees);
    otherPlatformFees = realized * i.rates.other + (refundAmount > 0 && i.returnKind === "RETURN_AND_REFUND" ? i.rates.returnShipping : 0);
    settlementAmount = realized - platformFees - otherPlatformFees;
  }

  const goodsBack = i.restockReturns && i.returnKind === "RETURN_AND_REFUND";
  let costedUnits = units;
  if (i.outcome === "RETURNED" && goodsBack) costedUnits = 0;
  if (i.outcome === "PARTIAL_RETURN" && goodsBack) costedUnits = Math.max(0, units - i.returnedUnits);
  const fullCogs = i.lines.reduce((s, l) => s + l.unitCost, 0);
  const cogs = units ? (fullCogs * costedUnits) / units : 0;
  const cogsEstimated = costedUnits > 0 && i.lines.some((l) => l.costEstimated);

  for (const p of i.percentCosts) custom[p.id] = (custom[p.id] ?? 0) + (realized * p.percent) / 100;
  const customCosts = Object.values(custom).reduce((s, v) => s + v, 0);

  return {
    ...base,
    refundAmount: round2(refundAmount),
    realizedRevenue: round2(realized),
    platformFees: round2(platformFees),
    feeParts,
    otherPlatformFees: round2(otherPlatformFees),
    settlementAmount: round2(settlementAmount),
    feesEstimated,
    costedUnits,
    cogs: round2(cogs),
    cogsEstimated,
    customCosts: round2(customCosts),
    customByItem: custom,
    contribution: round2(settlementAmount - cogs - customCosts),
  };
}
