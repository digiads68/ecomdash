import { classifyOutcome } from "./outcome";
import { computeOrderEconomics, EconomicsInput } from "./economics";
import { adAllocationShares, computeDailyPnl } from "./daily";
import { buildWaterfall, roasMetrics, successEquivalent, sumDays } from "./summary";
import { DEFAULT_RATES } from "./types";

const paid = new Date("2026-11-01T03:00:00Z");
const ok = "RETURN_OR_REFUND_REQUEST_COMPLETE";

describe("classifyOutcome", () => {
  const base = { status: "DELIVERED", paidTime: paid, isSampleOrder: false, itemNet: 100_000, returns: [] };
  it("excludes unpaid and sample orders", () => {
    expect(classifyOutcome({ ...base, paidTime: null })).toBeNull();
    expect(classifyOutcome({ ...base, isSampleOrder: true })).toBeNull();
  });
  it("cancelled wins over everything", () => {
    expect(classifyOutcome({ ...base, status: "CANCELLED", returns: [{ kind: "REFUND", status: ok, refundTotal: 100_000 }] })).toBe("CANCELLED");
  });
  it("in-flight orders and open return requests are pending", () => {
    expect(classifyOutcome({ ...base, status: "IN_TRANSIT" })).toBe("PENDING");
    expect(classifyOutcome({ ...base, returns: [{ kind: "RETURN_AND_REFUND", status: "AWAITING_BUYER_SHIP", refundTotal: 0 }] })).toBe("PENDING");
  });
  it("full, partial and rejected returns", () => {
    expect(classifyOutcome({ ...base, returns: [{ kind: "REFUND", status: ok, refundTotal: 99_500 }] })).toBe("RETURNED");
    expect(classifyOutcome({ ...base, returns: [{ kind: "REFUND", status: ok, refundTotal: 40_000 }] })).toBe("PARTIAL_RETURN");
    expect(classifyOutcome({ ...base, returns: [{ kind: "REFUND", status: "REFUND_OR_RETURN_REQUEST_REJECT", refundTotal: 40_000 }] })).toBe("SUCCESS");
    expect(classifyOutcome({ ...base, returns: [{ kind: "REPLACEMENT", status: "AWAITING_BUYER_SHIP", refundTotal: 0 }] })).toBe("SUCCESS");
  });
  it("refund before delivery counts as decided", () => {
    expect(classifyOutcome({ ...base, status: "IN_TRANSIT", returns: [{ kind: "REFUND", status: ok, refundTotal: 100_000 }] })).toBe("RETURNED");
  });
});

function input(over: Partial<EconomicsInput> = {}): EconomicsInput {
  return {
    outcome: "SUCCESS",
    buyerPaid: 210_000,
    lines: [
      { skuId: "a", itemNet: 100_000, unitCost: 40_000, costEstimated: false },
      { skuId: "a", itemNet: 100_000, unitCost: 40_000, costEstimated: false },
    ],
    refundAmount: 0,
    returnedUnits: 0,
    returnKind: null,
    restockReturns: true,
    shipped: true,
    settlement: null,
    rates: { ...DEFAULT_RATES, fee: 0.1, other: 0.02 },
    perOrderCosts: [
      { id: "pack", amount: 3_500, appliesTo: "SHIPPED" },
      { id: "gift", amount: 6_000, appliesTo: "SUCCESS" },
      { id: "any", amount: 1_000, appliesTo: "PAID" },
    ],
    percentCosts: [{ id: "live", percent: 2 }],
    ...over,
  };
}

describe("computeOrderEconomics", () => {
  it("settled order: other fees are the residual so settlement matches TikTok", () => {
    const r = computeOrderEconomics(input({ settlement: { feeParts: { commission: 10_000, transaction: 8_000, affiliate: 0, infrastructure: 3_000 }, settlementAmount: 170_000 } }));
    expect(r.realizedRevenue).toBe(200_000);
    expect(r.platformFees).toBe(21_000);
    expect(r.otherPlatformFees).toBe(9_000);
    expect(r.settlementAmount).toBe(170_000);
    expect(r.feesEstimated).toBe(false);
    expect(r.cogs).toBe(80_000);
    expect(r.customCosts).toBe(3_500 + 6_000 + 1_000 + 4_000);
    expect(r.contribution).toBe(170_000 - 80_000 - 14_500);
  });
  it("unsettled order uses rates", () => {
    const r = computeOrderEconomics(input());
    expect(r.feesEstimated).toBe(true);
    expect(r.platformFees).toBe(20_000);
    expect(r.otherPlatformFees).toBe(4_000);
    expect(r.settlementAmount).toBe(176_000);
  });
  it("cancelled: no revenue, only PAID-scope costs (and SHIPPED if it had shipped)", () => {
    const r = computeOrderEconomics(input({ outcome: "CANCELLED", shipped: false }));
    expect(r.cancelledAmount).toBe(200_000);
    expect(r.realizedRevenue).toBe(0);
    expect(r.customCosts).toBe(1_000);
    expect(r.contribution).toBe(-1_000);
  });
  it("returned with goods back: no COGS, return shipping estimated, no gift cost", () => {
    const r = computeOrderEconomics(input({ outcome: "RETURNED", refundAmount: 200_000, returnedUnits: 2, returnKind: "RETURN_AND_REFUND" }));
    expect(r.realizedRevenue).toBe(0);
    expect(r.cogs).toBe(0);
    expect(r.otherPlatformFees).toBe(DEFAULT_RATES.returnShipping);
    expect(r.settlementAmount).toBe(-DEFAULT_RATES.returnShipping);
    expect(r.customCosts).toBe(4_500);
  });
  it("refund without return loses the goods", () => {
    const r = computeOrderEconomics(input({ outcome: "RETURNED", refundAmount: 200_000, returnKind: "REFUND" }));
    expect(r.cogs).toBe(80_000);
  });
  it("partial return restocks returned units only", () => {
    const r = computeOrderEconomics(input({ outcome: "PARTIAL_RETURN", refundAmount: 100_000, returnedUnits: 1, returnKind: "RETURN_AND_REFUND" }));
    expect(r.realizedRevenue).toBe(100_000);
    expect(r.costedUnits).toBe(1);
    expect(r.cogs).toBe(40_000);
  });
  it("pending carries only the pending amount", () => {
    const r = computeOrderEconomics(input({ outcome: "PENDING" }));
    expect(r.pendingAmount).toBe(200_000);
    expect(r.realizedRevenue + r.cogs + r.customCosts).toBe(0);
  });
  it("flags estimated COGS", () => {
    const r = computeOrderEconomics(input({ lines: [{ skuId: "x", itemNet: 100_000, unitCost: 40_000, costEstimated: true }] }));
    expect(r.cogsEstimated).toBe(true);
  });
});

describe("daily P&L, waterfall and ROAS", () => {
  const rates = { ...DEFAULT_RATES, fee: 0.1, other: 0.02, successRate: 0.9, cogs: 0.4, customOrder: 0.05 };
  const orders = [
    computeOrderEconomics(input()),
    computeOrderEconomics(input({ outcome: "CANCELLED", shipped: false })),
    computeOrderEconomics(input({ outcome: "RETURNED", refundAmount: 200_000, returnedUnits: 2, returnKind: "RETURN_AND_REFUND" })),
    computeOrderEconomics(input({ outcome: "PENDING" })),
  ];
  const day = computeDailyPnl({
    date: "2026-11-01",
    orders,
    rates,
    fixedCosts: [{ id: "rent", amount: 20_000 }],
    ads: { manual: 60_000, gmvMax: 40_000, tiktokRevenue: 700_000, tiktokOrders: 3 },
  });

  it("counts outcomes and estimates pending", () => {
    expect(day.ordersPaid).toBe(4);
    expect([day.ordersSuccess, day.ordersCancelled, day.ordersReturned, day.ordersPending]).toEqual([1, 1, 1, 1]);
    expect(day.pendingExpected).toBe(180_000);
    expect(day.realizedRevenue).toBe(380_000);
    expect(day.customCostsFixed).toBe(20_000);
  });

  it("waterfall subtotals reconcile", () => {
    const t = sumDays([day, day]);
    const w = buildWaterfall(t, successEquivalent(t, rates.successRate));
    const get = (k: string) => w.find((s) => s.key === k)!.amount;
    expect(Math.abs(get("gross") - get("cancelled") - get("refund") - get("pendingLoss") - get("revenue"))).toBeLessThanOrEqual(2);
    expect(Math.abs(get("revenue") - get("platformFees") - get("otherFees") - get("settlement"))).toBeLessThanOrEqual(2);
    expect(Math.abs(get("settlement") - get("cogs") - get("custom") - get("contribution"))).toBeLessThanOrEqual(2);
    expect(Math.abs(get("contribution") - get("ads") - get("net"))).toBeLessThanOrEqual(2);
    expect(Math.abs(get("net") - t.netProfit)).toBeLessThanOrEqual(2);
  });

  it("real ROAS = TikTok ROAS × realization; break-even = revenue ÷ contribution", () => {
    const t = sumDays([day]);
    const m = roasMetrics(t);
    expect(m.tiktok).toBeCloseTo(7);
    expect(m.realizationRate).toBeCloseTo(380_000 / 800_000);
    expect(m.real).toBeCloseTo(7 * (380_000 / 800_000));
    expect(m.breakEven).toBeCloseTo(t.realizedRevenue / t.contribution);
    expect(m.shopWide).toBeCloseTo(3.8);
  });

  it("no positive contribution → break-even null and LOSS", () => {
    const m = roasMetrics({ ...sumDays([day]), contribution: -1 });
    expect(m.breakEven).toBeNull();
    expect(m.status).toBe("LOSS");
  });

  it("no spend → NO_SPEND, ROAS null", () => {
    const m = roasMetrics({ ...sumDays([day]), adSpend: 0, tiktokAdRevenue: 0 });
    expect(m.status).toBe("NO_SPEND");
    expect(m.tiktok).toBeNull();
  });
});

describe("adAllocationShares", () => {
  it("splits by gross, evenly when no sales", () => {
    expect(adAllocationShares(["a", "b"], { a: 300, b: 100 })).toEqual({ a: 0.75, b: 0.25 });
    expect(adAllocationShares(["a", "b"], {})).toEqual({ a: 0.5, b: 0.5 });
    expect(adAllocationShares([], { a: 1 })).toEqual({});
  });
});
