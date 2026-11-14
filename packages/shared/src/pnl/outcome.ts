import type { OrderOutcome } from "./types";

export const RETURN_SUCCESS = new Set(["RETURN_OR_REFUND_REQUEST_SUCCESS", "RETURN_OR_REFUND_REQUEST_COMPLETE"]);
export const RETURN_CLOSED_NO_REFUND = new Set([
  "REFUND_OR_RETURN_REQUEST_REJECT",
  "RETURN_OR_REFUND_REQUEST_CANCEL",
  "REJECT_RECEIVE_PACKAGE",
]);
const REFUND_KINDS = new Set(["REFUND", "RETURN_AND_REFUND"]);
const DELIVERED = new Set(["DELIVERED", "COMPLETED"]);

export interface ReturnLike {
  kind: string;
  status: string;
  refundTotal: number;
  returnedUnits?: number;
}

export interface OutcomeInput {
  status: string;
  paidTime: Date | null;
  isSampleOrder: boolean;
  itemNet: number;
  returns: ReturnLike[];
}

/** 11 §4. Returns null for orders outside the P&L (unpaid or sample). */
export function classifyOutcome(o: OutcomeInput): OrderOutcome | null {
  if (!o.paidTime || o.isSampleOrder) return null;
  if (o.status === "CANCELLED") return "CANCELLED";
  const refunds = o.returns.filter((r) => REFUND_KINDS.has(r.kind));
  if (refunds.some((r) => !RETURN_SUCCESS.has(r.status) && !RETURN_CLOSED_NO_REFUND.has(r.status))) return "PENDING";
  const refunded = successfulRefund(o.returns, o.itemNet);
  if (!DELIVERED.has(o.status) && refunded === 0) return "PENDING";
  if (refunded >= o.itemNet * 0.99 && refunded > 0) return "RETURNED";
  if (refunded > 0) return "PARTIAL_RETURN";
  return "SUCCESS";
}

export function successfulRefund(returns: ReturnLike[], itemNet: number): number {
  const sum = returns
    .filter((r) => REFUND_KINDS.has(r.kind) && RETURN_SUCCESS.has(r.status))
    .reduce((s, r) => s + r.refundTotal, 0);
  return Math.min(sum, itemNet);
}

/** Dominant successful refund kind: decides whether goods came back (restock) or were lost. */
export function successfulReturnKind(returns: ReturnLike[]): "REFUND" | "RETURN_AND_REFUND" | null {
  const ok = returns.filter((r) => REFUND_KINDS.has(r.kind) && RETURN_SUCCESS.has(r.status));
  if (!ok.length) return null;
  return ok.some((r) => r.kind === "RETURN_AND_REFUND") ? "RETURN_AND_REFUND" : "REFUND";
}

export function successfulReturnedUnits(returns: ReturnLike[]): number {
  return returns
    .filter((r) => REFUND_KINDS.has(r.kind) && RETURN_SUCCESS.has(r.status))
    .reduce((s, r) => s + (r.returnedUnits ?? 0), 0);
}
