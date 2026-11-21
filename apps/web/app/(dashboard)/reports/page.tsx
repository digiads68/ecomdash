"use client";

import type { PnlSummaryDto, ReportConfigDto, ShopDto } from "@ecomdash/shared";
import { addDays, toBusinessDate } from "@ecomdash/shared";
import { Button, ErrorBox, PageHeader, Panel, TableWrap, Td, Th, Toggle } from "@/components/ui";
import { useApi, useApiFetch, useCanEdit, useCurrentOrgId, useShops } from "@/lib/api";
import { formatDateTime, formatFullDate, formatRoas, formatVND } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";

const DOW = ["", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ nhật"];

export default function ReportsPage() {
  const f = useApiFetch();
  const orgId = useCurrentOrgId();
  const edit = useCanEdit();
  const q = `?orgId=${orgId}`;
  const qc = useQueryClient();
  const list = useApi<ReportConfigDto[]>("/reports/configs", {}, { shop: false, org: true });
  const allShops = useShops();
  const shops = { data: allShops.data?.filter((s: ShopDto) => s.organizationId === orgId) };
  const to = addDays(toBusinessDate(new Date()), -1);
  const preview = useApi<PnlSummaryDto>("/pnl/summary", { from: addDays(to, -6), to }, { period: false });
  const refresh = () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/reports") });

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fm = e.currentTarget;
    const v = (n: string) => (fm.elements.namedItem(n) as HTMLInputElement).value;
    await f(`/reports/configs${q}`, { method: "POST", body: JSON.stringify({ shopId: v("shopId"), frequency: v("frequency"), dayOfWeek: Number(v("dow")), dayOfMonth: 1, recipientEmail: v("email") }) });
    fm.reset();
    refresh();
  }
  const p = preview.data;
  return (
    <>
      <PageHeader title="Báo cáo định kỳ" subtitle="Gửi email lúc 08:00 giờ Việt Nam" />
      {list.error && <ErrorBox error={list.error} />}
      {list.data && (
        <TableWrap>
          <thead><tr><Th>Shop</Th><Th>Tần suất</Th><Th>Người nhận</Th><Th>Gửi lần cuối</Th><Th>Bật</Th></tr></thead>
          <tbody>{list.data.map((r) => (
            <tr key={r.id}><Td>{r.shopName}</Td><Td>{r.frequency === "daily" ? "Hằng ngày" : r.frequency === "weekly" ? `Hằng tuần · ${DOW[r.dayOfWeek ?? 1]}` : `Hằng tháng · ngày ${r.dayOfMonth ?? 1}`}</Td><Td>{r.recipientEmail}</Td><Td>{formatDateTime(r.lastSentAt)}</Td>
              <Td><Toggle label="Bật báo cáo" on={r.isActive} onChange={!edit ? undefined : async (v) => { await f(`/reports/configs/${r.id}${q}`, { method: "PUT", body: JSON.stringify({ isActive: v }) }); refresh(); }} /></Td></tr>
          ))}</tbody>
        </TableWrap>
      )}
      <div className="grid gap-3.5 lg:grid-cols-2">
        {edit ? (
        <Panel title="Thêm báo cáo">
          <form onSubmit={add} className="grid gap-2.5 text-sm">
            <select id="r-shop" name="shopId" className="rounded-lg border border-gray-200 bg-white px-2 py-1.5">{shops.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
            <div className="flex gap-2">
              <select id="r-frequency" name="frequency" className="rounded-lg border border-gray-200 bg-white px-2 py-1.5"><option value="weekly">Hằng tuần</option><option value="daily">Hằng ngày</option><option value="monthly">Hằng tháng (ngày 1)</option></select>
              <select id="r-dow" name="dow" className="rounded-lg border border-gray-200 bg-white px-2 py-1.5">{DOW.slice(1).map((d, i) => <option key={d} value={i + 1}>{d}</option>)}</select>
            </div>
            <input id="r-email" name="email" type="email" required placeholder="email@shop.vn" className="rounded-lg border border-gray-200 px-3 py-1.5" />
            <Button variant="primary" type="submit">Thêm báo cáo</Button>
          </form>
        </Panel>
        ) : <Panel title="Thêm báo cáo"><p className="text-sm text-gray-500">Chế độ chỉ xem — chỉ chủ shop hoặc quản trị được thêm báo cáo.</p></Panel>}
        <Panel title="Xem trước báo cáo tuần" hint={`${formatFullDate(addDays(to, -6))} – ${formatFullDate(to)}`}>
          {p && (
            <dl className="grid grid-cols-[1fr_auto] gap-y-1.5 text-[13px]">
              <dt className="text-gray-500">Đơn đặt · thành công · huỷ · hoàn</dt><dd className="text-right tabular-nums">{p.orders.paid.count} · {p.orders.success.count} · {p.orders.cancelled.count} · {p.orders.returned.count + p.orders.partialReturn.count}</dd>
              <dt className="text-gray-500">Doanh thu thực</dt><dd className="text-right tabular-nums">{formatVND(p.kpis.realizedRevenue.value)}</dd>
              <dt className="text-gray-500">Chi quảng cáo</dt><dd className="text-right tabular-nums">{formatVND(p.ads.spend)}</dd>
              <dt className="text-gray-500">ROAS TikTok → ROAS thực (hoà vốn)</dt><dd className="text-right tabular-nums">{formatRoas(p.roas.tiktok)} → {formatRoas(p.roas.real)} ({formatRoas(p.roas.breakEven)})</dd>
              <dt className="border-t border-gray-200 pt-1.5 font-semibold">Lãi ròng</dt><dd className="border-t border-gray-200 pt-1.5 text-right font-bold tabular-nums">{formatVND(p.kpis.netProfit.value)}</dd>
            </dl>
          )}
        </Panel>
      </div>
    </>
  );
}
