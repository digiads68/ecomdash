import type { OrderOutcome, UiStatusGroup } from "@ecomdash/shared";
import { Badge } from "@/components/ui";

const GROUP: Record<UiStatusGroup, [string, "gray" | "amber" | "blue" | "green" | "red"]> = {
  PENDING_PAYMENT: ["Chờ thanh toán", "gray"], TO_SHIP: ["Chờ xử lý", "amber"], SHIPPING: ["Đang giao", "blue"], DELIVERED: ["Đã giao", "green"], CANCELLED: ["Đã huỷ", "red"],
};
const STATUS_LABEL: Record<string, string> = { AWAITING_COLLECTION: "Chờ lấy hàng", COMPLETED: "Hoàn tất", ON_HOLD: "Tạm giữ" };
const OUTCOME: Record<OrderOutcome, [string, "green" | "amber" | "red" | "gray"]> = {
  SUCCESS: ["Thành công", "green"], PARTIAL_RETURN: ["Hoàn một phần", "amber"], RETURNED: ["Hoàn", "amber"], CANCELLED: ["Huỷ", "red"], PENDING: ["Đang chờ", "gray"],
};

export function StatusBadge({ group, status }: { group: UiStatusGroup; status: string }) {
  const [label, tone] = GROUP[group];
  return <Badge tone={tone}>{STATUS_LABEL[status] ?? label}</Badge>;
}

export function OutcomeBadge({ outcome }: { outcome: OrderOutcome | null }) {
  if (!outcome) return <span className="text-xs text-gray-400">—</span>;
  const [label, tone] = OUTCOME[outcome];
  return <Badge tone={tone} dot={false}>{label}</Badge>;
}
