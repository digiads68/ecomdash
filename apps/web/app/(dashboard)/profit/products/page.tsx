"use client";

import { useState } from "react";
import type { PnlProductRowDto } from "@ecomdash/shared";
import { Button, Empty, ErrorBox, Loading, Notice, PageHeader, ProductCell, TableWrap, Td, Th } from "@/components/ui";
import { API_URL, useApi } from "@/lib/api";
import { usePeriod } from "@/lib/store";
import { formatFullDate, formatNumber, formatPct, formatVNDCompact } from "@/lib/format";
import { cn } from "@/lib/utils";

const SORTS: { key: string; label: string }[] = [
  { key: "netProfit:asc", label: "Lỗ nhiều nhất" }, { key: "netProfit:desc", label: "Lãi nhiều nhất" }, { key: "realizedRevenue:desc", label: "Doanh thu" }, { key: "margin:asc", label: "Biên thấp nhất" },
];

export default function ProfitProductsPage() {
  const period = usePeriod();
  const [sort, setSort] = useState("netProfit:asc");
  const q = useApi<PnlProductRowDto[]>("/pnl/products", { sort });
  const rows = q.data ?? [];
  const loss = rows.filter((r) => r.netProfit < 0);
  const total = rows.reduce((s, r) => s + r.netProfit, 0);
  return (
    <>
      <PageHeader title="Lãi lỗ sản phẩm" subtitle={`Đơn đặt ${formatFullDate(period.from)} – ${formatFullDate(period.to)} · lãi ròng sau giá vốn, phí sàn, chi phí tự nhập và quảng cáo phân bổ`}
        actions={<select id="pp-sort" className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm" value={sort} onChange={(e) => setSort(e.target.value)}>{SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>} />
      {q.error && <ErrorBox error={q.error} onRetry={() => q.refetch()} />}
      {!q.data && !q.error && <Loading />}
      {q.data && !rows.length && <Empty />}
      {loss.length > 0 && (
        <Notice tone="red" title={`${loss.length} sản phẩm đang lỗ sau quảng cáo, tổng lỗ ${formatVNDCompact(-loss.reduce((s, r) => s + r.netProfit, 0))}`}>
          {loss.slice(0, 4).map((r) => `${r.title.split(" ").slice(0, 4).join(" ")} (${(r.cancelReturnRate ?? 0) > 0.15 ? `huỷ/hoàn ${formatPct(r.cancelReturnRate, 0)}` : `QC ${formatPct(r.adSpendAllocated / Math.max(1, r.realizedRevenue), 0)} doanh thu`})`).join(" · ")}
        </Notice>
      )}
      {rows.length > 0 && (
        <TableWrap>
          <thead><tr><Th>Sản phẩm</Th><Th right>Đã bán</Th><Th right>GMV đặt</Th><Th right>Huỷ + hoàn</Th><Th right>Doanh thu thực</Th><Th right>Giá vốn</Th><Th right>Phí sàn + khác</Th><Th right>Chi phí tự nhập</Th><Th right>QC phân bổ</Th><Th right>Lãi ròng</Th><Th right>Biên</Th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.productId} className={cn(r.netProfit < 0 ? "bg-red-50/60" : "hover:bg-gray-50")}>
                <Td><ProductCell title={r.title} image={r.thumbnailUrl} /></Td>
                <Td right>{formatNumber(r.unitsSold)}</Td>
                <Td right>{formatVNDCompact(r.grossItemValue)}</Td>
                <Td right className={cn((r.cancelReturnRate ?? 0) > 0.15 && "font-semibold text-red-600")}>{formatPct(r.cancelReturnRate)}</Td>
                <Td right>{formatVNDCompact(r.realizedRevenue)}</Td>
                <Td right>{r.cogsEstimated ? "≈ " : ""}{formatVNDCompact(r.cogs)}</Td>
                <Td right>{formatVNDCompact(r.platformFees)}</Td>
                <Td right>{formatVNDCompact(r.customCosts)}</Td>
                <Td right>{formatVNDCompact(r.adSpendAllocated)}</Td>
                <Td right className={cn("font-semibold", r.netProfit < 0 ? "text-red-600" : "text-green-600")}>{formatVNDCompact(r.netProfit)}</Td>
                <Td right>{formatPct(r.margin)}</Td>
              </tr>
            ))}
            <tr><Td className="bg-gray-50 font-semibold">Tổng {rows.length} sản phẩm</Td><Td className="bg-gray-50" colSpan={8} /><Td right className="bg-gray-50 font-semibold">{formatVNDCompact(total)}</Td><Td className="bg-gray-50" /></tr>
          </tbody>
        </TableWrap>
      )}
      <p className="text-xs text-gray-500">≈ giá vốn có phần ước tính (SKU chưa nhập giá vốn hoặc đơn đang chờ). Quảng cáo và chi phí cố định theo tháng được phân bổ theo doanh thu thực của từng sản phẩm trong ngày — TikTok không trả chi phí quảng cáo theo sản phẩm cho chiến dịch thủ công.</p>
    </>
  );
}
