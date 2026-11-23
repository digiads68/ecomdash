"use client";

import Link from "next/link";
import { useState } from "react";
import type { PnlOrderRowDto, PnlSummaryDto, StatementRowDto } from "@ecomdash/shared";
import { Badge, Button, ErrorBox, KpiCard, Loading, PageHeader, Panel, TableWrap, Tabs, Td, Th } from "@/components/ui";
import { useApi } from "@/lib/api";
import { formatDate, formatDateTime, formatNumber, formatPct, formatVND, formatVNDCompact } from "@/lib/format";
import { OutcomeBadge } from "../orders/status";

interface Settlements { total: number; page: number; pageSize: number; items: PnlOrderRowDto[]; totals: { settledOrders: number; settledAmount: number; unsettledOrders: number; estimatedAmount: number; platformFees: number; otherFees: number; realizedRevenue: number } }

export default function FinancePage() {
  const [filter, setFilter] = useState<"all" | "true" | "false">("all");
  const [page, setPage] = useState(1);
  const st = useApi<StatementRowDto[]>("/finance/statements");
  const se = useApi<Settlements>("/finance/settlements", { settled: filter === "all" ? undefined : filter, page, pageSize: 20 });
  const pnl = useApi<PnlSummaryDto>("/pnl/summary");
  const t = se.data?.totals;
  const fees = pnl.data?.costs.filter((c) => c.group === "PLATFORM" || c.group === "PLATFORM_OTHER") ?? [];
  return (
    <>
      <PageHeader title="Đối soát" subtitle={<>Số tiền TikTok thực trả theo từng đơn và kỳ thanh toán · lãi ròng xem ở <Link className="text-primary-600 hover:underline" href="/dashboard">Dashboard</Link></>} />
      {t && (
        <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
          <KpiCard label="Đã đối soát" value={formatVNDCompact(t.settledAmount)} tag={`${formatNumber(t.settledOrders)} đơn`} />
          <KpiCard label="Chờ đối soát (ước tính)" value={formatVNDCompact(t.estimatedAmount)} tag={`${formatNumber(t.unsettledOrders)} đơn`} />
          <KpiCard label="Phí sàn + phí khác" value={formatVNDCompact(t.platformFees + t.otherFees)} />
          <KpiCard label="Tỉ lệ phí / doanh thu thực" value={formatPct((t.platformFees + t.otherFees) / Math.max(1, t.realizedRevenue))} />
        </div>
      )}
      <div className="grid gap-3.5 lg:grid-cols-2">
        <Panel title="Phí theo loại" hint="đã đối soát + ước tính">
          <TableWrap>
            <thead><tr><Th>Loại phí</Th><Th right>Số tiền</Th><Th right>% doanh thu thực</Th></tr></thead>
            <tbody>{fees.map((c) => <tr key={c.key}><Td className="whitespace-normal">{c.label}</Td><Td right>{formatVND(c.amount)}</Td><Td right>{formatPct(c.pctOfRevenue, 2)}</Td></tr>)}</tbody>
          </TableWrap>
        </Panel>
        <Panel title="Kỳ thanh toán" hint="statements">
          {st.error && <ErrorBox error={st.error} />}
          {st.data && (
            <TableWrap>
              <thead><tr><Th>Kỳ</Th><Th right>Doanh thu</Th><Th right>Phí</Th><Th right>Vận chuyển</Th><Th right>Thực nhận</Th><Th>Trạng thái</Th></tr></thead>
              <tbody>{st.data.map((s) => (
                <tr key={s.id}><Td>{formatDate(s.statementTime)}</Td><Td right>{formatVNDCompact(s.revenueAmount)}</Td><Td right>{formatVNDCompact(s.feeAmount)}</Td><Td right>{formatVNDCompact(s.shippingCostAmount)}</Td><Td right className="font-semibold">{formatVNDCompact(s.settlementAmount)}</Td>
                  <Td>{s.paymentStatus === "PAID" ? <Badge tone="green">Đã chuyển</Badge> : <Badge tone="amber">Đang xử lý</Badge>}</Td></tr>
              ))}</tbody>
            </TableWrap>
          )}
        </Panel>
      </div>
      <Panel title="Đối soát theo đơn">
        <Tabs value={filter} onChange={(v) => { setFilter(v); setPage(1); }} items={[{ value: "all", label: "Tất cả" }, { value: "true", label: "Đã đối soát" }, { value: "false", label: "Chưa đối soát" }]} />
        <div className="mt-3">
          {!se.data && <Loading rows={2} />}
          {se.data && (
            <>
              <TableWrap>
                <thead><tr><Th>Mã đơn</Th><Th>Ngày đặt</Th><Th>Kết cục</Th><Th right>Doanh thu thực</Th><Th right>Phí sàn</Th><Th right>Phí khác</Th><Th right>Thực nhận</Th><Th>Nguồn số</Th></tr></thead>
                <tbody>{se.data.items.map((r) => (
                  <tr key={r.orderId}><Td><Link className="text-primary-700 hover:underline" href={`/orders/${r.orderId}`}>{r.tiktokOrderId}</Link></Td><Td>{formatDateTime(r.createTime)}</Td><Td><OutcomeBadge outcome={r.outcome} /></Td>
                    <Td right>{formatVND(r.realizedRevenue)}</Td><Td right className="text-red-600">−{formatVND(r.platformFees)}</Td><Td right className="text-red-600">−{formatVND(r.otherPlatformFees)}</Td><Td right className="font-semibold">{formatVND(r.settlementAmount)}</Td>
                    <Td>{r.feesEstimated ? <Badge tone="amber">≈ ước tính</Badge> : <Badge tone="green">TikTok đối soát</Badge>}</Td></tr>
                ))}</tbody>
              </TableWrap>
              <div className="mt-2 flex items-center gap-2 text-sm text-gray-500">
                <span>{formatNumber(se.data.total)} đơn</span><div className="flex-1" />
                <Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>← Trước</Button>
                <Button size="sm" disabled={page * se.data.pageSize >= se.data.total} onClick={() => setPage(page + 1)}>Sau →</Button>
              </div>
            </>
          )}
        </div>
      </Panel>
    </>
  );
}
