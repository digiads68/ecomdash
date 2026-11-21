export type OrderOutcome = "SUCCESS" | "PARTIAL_RETURN" | "RETURNED" | "CANCELLED" | "PENDING";
export type CostMethod = "PER_ORDER" | "PERCENT_REVENUE" | "MONTHLY_FIXED";
export type CostAppliesTo = "PAID" | "SHIPPED" | "SUCCESS";

export interface FeeParts {
  commission: number;
  transaction: number;
  affiliate: number;
  infrastructure: number;
}

export const ZERO_FEES: FeeParts = { commission: 0, transaction: 0, affiliate: 0, infrastructure: 0 };

/** Historical ratios used to estimate what has not been settled or decided yet (11 §5, §6). */
export interface PnlRates {
  fee: number;            // platformFees ÷ realizedRevenue
  other: number;          // otherPlatformFees ÷ realizedRevenue
  feeMix: FeeParts;       // shares of platformFees, sum = 1
  returnShipping: number; // VND per returned order not yet settled
  successRate: number;    // realized ÷ decided gross item value
  cogs: number;           // cogs ÷ realizedRevenue on decided orders
  customOrder: number;    // per-order custom costs ÷ realizedRevenue on decided orders
}

export const DEFAULT_RATES: PnlRates = {
  fee: 0.09,
  other: 0.015,
  feeMix: { commission: 0.46, transaction: 0.3, affiliate: 0.19, infrastructure: 0.05 },
  returnShipping: 22_000,
  successRate: 0.85,
  cogs: 0.4,
  customOrder: 0.03,
};

export interface OrderEconomicsResult {
  outcome: OrderOutcome;
  itemNet: number;
  buyerPaid: number;
  cancelledAmount: number;
  refundAmount: number;
  pendingAmount: number;
  realizedRevenue: number;
  platformFees: number;
  feeParts: FeeParts;
  otherPlatformFees: number;
  settlementAmount: number;
  feesEstimated: boolean;
  units: number;
  costedUnits: number;
  cogs: number;
  cogsEstimated: boolean;
  customCosts: number;
  customByItem: Record<string, number>;
  contribution: number;
}

export interface DailyPnl {
  date: string;
  ordersPaid: number;
  ordersSuccess: number;
  ordersPartial: number;
  ordersReturned: number;
  ordersCancelled: number;
  ordersPending: number;
  grossItemValue: number;
  buyerPaid: number;
  cancelledAmount: number;
  refundAmount: number;
  pendingAmount: number;
  pendingExpected: number;
  realizedRevenue: number;
  platformFees: number;
  otherPlatformFees: number;
  settlementAmount: number;
  feesEstimated: number;
  cogs: number;
  cogsEstimated: number;
  customCostsOrder: number;
  customCostsFixed: number;
  customBreakdown: Record<string, number>;
  feeBreakdown: FeeParts;
  contribution: number;
  adSpend: number;
  adSpendManual: number;
  adSpendGmvMax: number;
  tiktokAdRevenue: number;
  tiktokAdOrders: number;
  netProfit: number;
  estimatedShare: number;
}
