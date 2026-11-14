"use client";

import Link from "next/link";
import { useState } from "react";
import type { OrderListDto, UiStatusGroup } from "@ecomdash/shared";
import { Badge, Button, Empty, ErrorBox, Loading, PageHeader, ProductCell, TableWrap, Tabs, Tag, Td, Th } from "@/components/ui";
import { useApi } from "@/lib/api";
import { formatDateTime, formatNumber, formatVND } from "@/lib/format";
import { OutcomeBadge, StatusBadge } from "./status";

const TABS: { value: UiStatusGroup | "ALL"; label: string }[] = [
  { value: "ALL", label: "Tất cả" }, { value: "PENDING_PAYMENT", label: "Chờ thanh toán" }, { value: "TO_SHIP", label: "Chờ xử lý" },
  { value: "SHIPPING", label: "Đang giao" }, { value: "DELIVERED", label: "Đã giao" }, { value: "CANCELLED", label: "Đã huỷ" },
];

export default function OrdersPage() {
  const [status, setStatus] = useState<UiStatusGroup | "ALL">("ALL");
  const [q, setQ] = useState("");
  const [cod, setCod] = useState("");
  const [page, setPage] = useState(1);
  const data = useApi<OrderListDto>("/orders", { status: status === "ALL" ? undefined : status, q: q || undefined, cod: cod || undefined, page, pageSize: 25 });
  const d = data.data;
  return (
    <>
      <PageHeader title="Đơn hàng" subtitle="Đồng bộ từ TikTok Shop theo update_time · webhook đổi trạng thái đồng bộ sớm" />
      <Tabs value={status} onChange={(v) => { setStatus(v); setPage(1); }} items={TABS.map((t) => ({ value: t.value, label: <>{t.label}<span className="ml-1 rounded-full bg-gray-100 px-1.5 text-[11px]">{d ? formatNumber(d.statusCounts[t.value]) : "…"}</span></> }))} />
      <div className="flex flex-wrap gap-2">
        <input id="order-q" className="w-72 max-w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm" placeholder="Tìm mã đơn hoặc mã vận đơn" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <select id="order-cod" className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm" value={cod} onChange={(e) => { setCod(e.target.value); setPage(1); }}>
          <option value="">Mọi hình thức</option><option value="true">COD</option><option value="false">Thanh toán online</option>
        </select>
      </div>
      {data.error && <ErrorBox error={data.error} onRetry={() => data.refetch()} />}
      {!d && !data.error && <Loading />}
      {d && !d.items.length && <Empty title="Không có đơn phù hợp">Thử đổi khoảng thời gian hoặc bộ lọc.</Empty>}
      {d && d.items.length > 0 && (
        <>
          <TableWrap>
            <thead><tr><Th>Mã đơn</Th><Th>Thời gian</Th><Th>Sản phẩm</Th><Th>Tỉnh/thành</Th><Th right>Tổng tiền</Th><Th right>Thực nhận</Th><Th>Thanh toán</Th><Th>Vận chuyển</Th><Th>Trạng thái</Th><Th>Kết cục</Th></tr></thead>
            <tbody>
              {d.items.map((o) => (
                <tr key={o.id} className="hover:bg-gray-50">
                  <Td className="tabular-nums"><Link className="text-primary-700 hover:underline" href={`/orders/${o.id}`}>{o.tiktokOrderId}</Link></Td>
                  <Td className="tabular-nums">{formatDateTime(o.createTime)}</Td>
                  <Td><ProductCell title={o.firstItem.productName} image={o.firstItem.skuImage} sub={`${o.firstItem.skuName ?? ""}${o.itemCount > 1 ? ` · ${o.itemCount} sản phẩm` : ""}`} /></Td>
                  <Td>{o.province ?? "—"}</Td>
                  <Td right>{formatVND(o.totalAmount)}</Td>
                  <Td right>{o.settlementAmount == null ? <span className="text-xs text-gray-400">Chưa đối soát</span> : formatVND(o.settlementAmount)}</Td>
                  <Td><Tag>{o.isCod ? "COD" : "Online"}</Tag></Td>
                  <Td>{o.shippingProvider ?? "—"}</Td>
                  <Td><StatusBadge group={o.statusGroup} status={o.status} /></Td>
                  <Td><OutcomeBadge outcome={o.outcome} /></Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span>{formatNumber((d.page - 1) * d.pageSize + 1)}–{formatNumber(Math.min(d.total, d.page * d.pageSize))} / {formatNumber(d.total)} đơn</span>
            <div className="flex-1" />
            <Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Trước</Button>
            <Button size="sm" disabled={page * d.pageSize >= d.total} onClick={() => setPage(page + 1)}>Sau →</Button>
          </div>
        </>
      )}
    </>
  );
}
