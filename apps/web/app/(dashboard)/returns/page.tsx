"use client";

import { useState } from "react";
import type { Paged, ReturnRowDto, ReturnsSummaryDto } from "@ecomdash/shared";
import { Chart, C, axisX, axisY, legend } from "@/components/Chart";
import { Badge, Button, ErrorBox, KpiCard, Loading, PageHeader, Panel, TableWrap, Tabs, Td, Th } from "@/components/ui";
import { useApi } from "@/lib/api";
import { formatDateTime, formatDay, formatNumber, formatPct, formatVND, formatVNDCompact } from "@/lib/format";

const KIND: Record<string, [string, "blue" | "amber" | "gray" | "red"]> = { REFUND: ["Hoàn tiền", "blue"], RETURN_AND_REFUND: ["Trả hàng hoàn tiền", "amber"], REPLACEMENT: ["Đổi hàng", "gray"], CANCEL: ["Huỷ", "red"], BUYER_CANCEL: ["Người mua huỷ", "red"] };
const STATUS: Record<string, [string, "amber" | "blue" | "green" | "red" | "gray"]> = {
  RETURN_OR_REFUND_REQUEST_PENDING: ["Chờ người bán duyệt", "amber"], AWAITING_BUYER_SHIP: ["Chờ người mua gửi hàng", "blue"], BUYER_SHIPPED_ITEM: ["Người mua đã gửi hàng", "blue"],
  RETURN_OR_REFUND_REQUEST_SUCCESS: ["Đã hoàn tiền", "green"], RETURN_OR_REFUND_REQUEST_COMPLETE: ["Hoàn tất", "green"], REFUND_OR_RETURN_REQUEST_REJECT: ["Từ chối", "red"],
  RETURN_OR_REFUND_REQUEST_CANCEL: ["Người mua rút yêu cầu", "gray"], CANCELLATION_REQUEST_COMPLETE: ["Đã huỷ", "gray"],
};

export default function ReturnsPage() {
  const [kind, setKind] = useState("REFUND,RETURN_AND_REFUND,REPLACEMENT");
  const [page, setPage] = useState(1);
  const s = useApi<ReturnsSummaryDto>("/returns/summary");
  const list = useApi<Paged<ReturnRowDto>>("/returns", { kind, page, pageSize: 20 });
  const d = s.data;
  const maxReason = Math.max(1, ...(d?.byReason.map((r) => r.count) ?? [1]));
  return (
    <>
      <PageHeader title="Hoàn / Huỷ" subtitle="Từ Returns & Cancellations API · tỉ lệ tính trên đơn đã thanh toán, gom theo ngày đặt" />
      {s.error && <ErrorBox error={s.error} />}
      {!d && !s.error && <Loading />}
      {d && (
        <>
          <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
            <KpiCard label="Tỉ lệ hoàn" value={formatPct(d.returnRate.value)} kpi={d.returnRate} inverse />
            <KpiCard label="Tỉ lệ huỷ" value={formatPct(d.cancelRate.value)} kpi={d.cancelRate} inverse />
            <KpiCard label="Tiền hoàn (giá trị hàng)" value={formatVNDCompact(d.refundAmount.value)} kpi={d.refundAmount} inverse />
            <KpiCard label="Yêu cầu đang chờ xử lý" value={formatNumber(d.openRequests)} />
          </div>
          <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Panel title="Yêu cầu hoàn và huỷ theo ngày">
              <Chart height={240} option={{ legend, xAxis: axisX(d.daily.map((x) => formatDay(x.date))), yAxis: axisY((v) => String(v)), series: [
                { name: "Yêu cầu hoàn", type: "bar", data: d.daily.map((x) => x.returns), itemStyle: { color: C.amber }, barMaxWidth: 12 },
                { name: "Huỷ", type: "line", data: d.daily.map((x) => x.cancellations), smooth: true, symbol: "none", lineStyle: { color: C.red, width: 2 }, itemStyle: { color: C.red } },
              ] }} />
            </Panel>
            <Panel title="Lý do hoàn hàng">
              <div className="grid gap-2.5">{d.byReason.map((r) => (
                <div key={r.reason} className="grid grid-cols-[130px_minmax(0,1fr)_40px] items-center gap-2.5 text-[13px]">
                  <span className="leading-tight">{r.reason}</span>
                  <div className="h-2.5 overflow-hidden rounded-full bg-gray-100"><i className="block h-full rounded-full bg-red-500" style={{ width: `${(r.count / maxReason) * 100}%` }} /></div>
                  <span className="text-right tabular-nums text-gray-500">{r.count}</span>
                </div>
              ))}</div>
            </Panel>
          </div>
        </>
      )}
      <Tabs value={kind} onChange={(v) => { setKind(v); setPage(1); }} items={[{ value: "REFUND,RETURN_AND_REFUND,REPLACEMENT", label: "Hoàn / đổi" }, { value: "CANCEL,BUYER_CANCEL", label: "Huỷ" }]} />
      {list.data && (
        <>
          <TableWrap>
            <thead><tr><Th>Mã yêu cầu</Th><Th>Mã đơn</Th><Th>Loại</Th><Th>Lý do</Th><Th right>Hoàn tiền</Th><Th>Trạng thái</Th><Th>Ngày tạo</Th></tr></thead>
            <tbody>{list.data.items.map((r) => (
              <tr key={r.id}><Td className="tabular-nums">{r.tiktokReturnId}</Td><Td className="tabular-nums">{r.tiktokOrderId}</Td><Td><Badge tone={KIND[r.kind]?.[1] ?? "gray"}>{KIND[r.kind]?.[0] ?? r.kind}</Badge></Td>
                <Td className="whitespace-normal">{r.reason}</Td><Td right>{formatVND(r.refundTotal)}</Td><Td><Badge tone={STATUS[r.status]?.[1] ?? "gray"}>{STATUS[r.status]?.[0] ?? r.status}</Badge></Td><Td>{formatDateTime(r.createTime)}</Td></tr>
            ))}</tbody>
          </TableWrap>
          <div className="flex items-center gap-2 text-sm text-gray-500"><span>{formatNumber(list.data.total)} yêu cầu</span><div className="flex-1" />
            <Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Trước</Button>
            <Button size="sm" disabled={page * list.data.pageSize >= list.data.total} onClick={() => setPage(page + 1)}>Sau →</Button></div>
        </>
      )}
    </>
  );
}
