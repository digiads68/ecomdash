import type { UiStatusGroup } from "./dto";

export const ORDER_STATUS_GROUP: Record<string, UiStatusGroup> = {
  UNPAID: "PENDING_PAYMENT",
  ON_HOLD: "TO_SHIP",
  AWAITING_SHIPMENT: "TO_SHIP",
  PARTIALLY_SHIPPING: "TO_SHIP",
  AWAITING_COLLECTION: "TO_SHIP",
  IN_TRANSIT: "SHIPPING",
  DELIVERED: "DELIVERED",
  COMPLETED: "DELIVERED",
  CANCELLED: "CANCELLED",
};

export const STATUSES_BY_GROUP: Record<UiStatusGroup, string[]> = Object.entries(ORDER_STATUS_GROUP).reduce(
  (acc, [status, group]) => {
    (acc[group] ??= []).push(status);
    return acc;
  },
  {} as Record<UiStatusGroup, string[]>,
);

/** Webhook type 1 uses CANCEL and lacks PARTIALLY_SHIPPING (01 §6.3). */
export function normalizeOrderStatus(s: string): string {
  return s === "CANCEL" ? "CANCELLED" : s;
}
