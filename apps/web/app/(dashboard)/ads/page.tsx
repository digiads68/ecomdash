"use client";

import { useState } from "react";
import type { AdsOverviewDto, CampaignRowDto } from "@ecomdash/shared";
import { Chart, C, axisX, axisY, legend } from "@/components/Chart";
import { Badge, Empty, ErrorBox, KpiCard, Loading, PageHeader, Panel, TableWrap, Tabs, Tag, Td, Th, Toggle } from "@/components/ui";
import { useApi } from "@/lib/api";
import { formatDay, formatNumber, formatPct, formatRoas, formatVND, formatVNDCompact } from "@/lib/format";

const VS: Record<string, [string, "green" | "amber" | "red" | "gray"]> = { PROFIT: ["Có lãi", "green"], NEAR_BREAKEVEN: ["Sát hoà vốn", "amber"], LOSS: ["Đang lỗ", "red"], NO_SPEND: ["Không chi", "gray"] };

export default function AdsPage() {
  const [tab, setTab] = useState<"overview" | "MANUAL" | "GMV_MAX">("overview");
  const ov = useApi<AdsOverviewDto>("/ads/overview");
  const camps = useApi<CampaignRowDto[]>("/ads/campaigns", { kind: tab === "overview" ? undefined : tab }, { enabled: tab !== "overview" });
  const d = ov.data;
  const be = d?.totals.breakEven.value;
  const note = d && (
    <p className="text-[13px] text-gray-500">
      ROAS thực = ROAS TikTok × {formatPct(d.realizationRate, 0)} (phần doanh thu shop giữ lại sau huỷ/hoàn trong kỳ). ROAS hoà vốn của shop: <b className="text-gray-900">{formatRoas(be)}</b>.
      Đây là ước tính vì TikTok không cho biết đơn nào của chiến dịch bị huỷ/hoàn.{d.allocation === "PROPORTIONAL" && " Tài khoản quảng cáo chạy cho nhiều shop — chi phí được chia theo tỉ lệ GMV."}
    </p>
  );
  return (
    <>
      <PageHeader title="Quảng cáo" subtitle="Shop Ads thủ công và GMV Max · so sánh ROAS TikTok báo với ROAS thực sau huỷ/hoàn" />
      <Tabs value={tab} onChange={setTab} items={[{ value: "overview", label: "Tổng quan" }, { value: "MANUAL", label: "Chiến dịch thủ công" }, { value: "GMV_MAX", label: "GMV Max" }]} />
      {ov.error && <ErrorBox error={ov.error} onRetry={() => ov.refetch()} />}
      {!d && !ov.error && <Loading />}
      {d && d.allocation === "NONE" && <Empty title="Chưa có tài khoản quảng cáo gắn với shop này">Kết nối TikTok Ads và chọn shop cho từng store ở <a className="text-primary-600 underline" href="/settings/connections">Cài đặt → Kết nối</a>.</Empty>}
      {d && d.allocation !== "NONE" && tab === "overview" && (
        <>
          <div className="grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-6">
            <KpiCard label="Chi tiêu" value={formatVNDCompact(d.totals.spend.value)} kpi={d.totals.spend} inverse />
            <KpiCard label="ROAS TikTok" value={formatRoas(d.totals.roasTiktok.value)} kpi={d.totals.roasTiktok} />
            <KpiCard label="ROAS thực" value={formatRoas(d.totals.roasReal.value)} kpi={d.totals.roasReal} tag="sau huỷ/hoàn" />
            <KpiCard label="ROAS hoà vốn" value={formatRoas(d.totals.breakEven.value)} kpi={d.totals.breakEven} inverse />
            <KpiCard label="Chi QC / đơn thành công" value={formatVND(d.totals.spendPerSuccessOrder.value)} kpi={d.totals.spendPerSuccessOrder} inverse />
            <KpiCard label="CTR" value={formatPct(d.totals.ctr.value, 2)} kpi={d.totals.ctr} />
          </div>
          <div className="grid gap-3.5 md:grid-cols-2">
            <Source title="Shop Ads thủ công" tag="Video · LIVE · Product Shopping" s={d.manual} />
            <Source title="GMV Max" tag="TikTok tính gồm cả đơn tự nhiên" s={d.gmvMax} violet />
          </div>
          <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Panel title="Chi tiêu theo nguồn và ROAS thực" actions={<Badge tone={VS[d.status][1]}>Quảng cáo: {VS[d.status][0]}</Badge>}>
              <Chart option={{
                legend, xAxis: axisX(d.daily.map((x) => formatDay(x.date))), yAxis: [axisY((v) => formatVNDCompact(v)), axisY((v) => `${v}×`, { splitLine: { show: false } })],
                series: [
                  { name: "Thủ công", type: "bar", stack: "s", data: d.daily.map((x) => Math.round(x.manualSpend)), itemStyle: { color: C.amber }, barMaxWidth: 16 },
                  { name: "GMV Max", type: "bar", stack: "s", data: d.daily.map((x) => Math.round(x.gmvMaxSpend)), itemStyle: { color: C.violet, borderRadius: [3, 3, 0, 0] } },
                  { name: "ROAS thực", type: "line", yAxisIndex: 1, data: d.daily.map((x) => (x.roasReal == null ? null : +x.roasReal.toFixed(2))), smooth: true, symbol: "none", lineStyle: { color: C.blue, width: 2 }, itemStyle: { color: C.blue } },
                  { name: "ROAS hoà vốn", type: "line", yAxisIndex: 1, data: d.daily.map((x) => (x.breakEven == null ? null : +x.breakEven.toFixed(2))), symbol: "none", lineStyle: { color: C.red, width: 1.5, type: "dashed" }, itemStyle: { color: C.red } },
                ],
              }} />
            </Panel>
            <Panel title="Dự báo ngân sách tháng này">
              <dl className="grid grid-cols-[1fr_auto] gap-y-1.5 text-[13px]">
                <dt className="text-gray-500">Đã chi tháng này</dt><dd className="text-right tabular-nums">{formatVND(d.budgetForecast.monthToDateSpend)}</dd>
                <dt className="text-gray-500">Dự kiến cả tháng</dt><dd className="text-right font-semibold tabular-nums">{formatVND(d.budgetForecast.projectedMonthSpend)}</dd>
                <dt className="text-gray-500">Ngày đã qua</dt><dd className="text-right tabular-nums">{d.budgetForecast.daysElapsed} / {d.budgetForecast.daysInMonth}</dd>
              </dl>
              <div className="mt-3.5 h-2 overflow-hidden rounded-full bg-gray-100"><i className="block h-full bg-primary-500" style={{ width: `${(d.budgetForecast.daysElapsed / d.budgetForecast.daysInMonth) * 100}%` }} /></div>
              <p className="mt-2 text-xs text-gray-500">Ước tính theo chi tiêu bình quân ngày của tháng hiện tại.</p>
            </Panel>
          </div>
        </>
      )}
      {d && d.allocation !== "NONE" && tab !== "overview" && (
        <>
          {tab === "GMV_MAX" && <p className="text-[13px] text-gray-500">Doanh thu GMV Max do TikTok tính, gồm cả đơn tự nhiên được quy cho chiến dịch.</p>}
          {note}
          {camps.error && <ErrorBox error={camps.error} />}
          {!camps.data && !camps.error && <Loading rows={2} />}
          {camps.data && (
            <TableWrap>
              <thead><tr><Th>Chiến dịch</Th><Th>Bật</Th><Th right>Ngân sách</Th>{tab === "GMV_MAX" && <Th right>ROI mục tiêu</Th>}<Th right>Chi tiêu</Th><Th right>CTR</Th><Th right>CPC</Th><Th right>Đơn (TikTok)</Th><Th right>Doanh thu (TikTok)</Th><Th right>ROAS TikTok</Th><Th right>ROAS thực ≈</Th><Th>So với hoà vốn</Th></tr></thead>
              <tbody>
                {camps.data.map((c) => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <Td><div className="font-medium">{c.name}</div><div className="text-xs text-gray-400">{c.advertiserName}</div></Td>
                    <Td><Toggle label={c.operationStatus === "ENABLE" ? "Đang bật" : "Đang tắt"} on={c.operationStatus === "ENABLE"} /></Td>
                    <Td right>{formatVND(c.budget)}<div className="text-xs text-gray-400">{c.budgetMode === "BUDGET_MODE_TOTAL" ? "Tổng" : "Ngày"}</div></Td>
                    {tab === "GMV_MAX" && <Td right>{formatRoas(c.roasBid)}</Td>}
                    <Td right>{formatVNDCompact(c.spend)}</Td>
                    <Td right>{formatPct(c.ctr, 2)}</Td>
                    <Td right>{formatVND(c.cpc)}</Td>
                    <Td right>{formatNumber(c.orders)}</Td>
                    <Td right>{formatVNDCompact(c.grossRevenue)}</Td>
                    <Td right>{formatRoas(c.roasTiktok)}</Td>
                    <Td right className="font-semibold">{formatRoas(c.realRoasEstimated)}</Td>
                    <Td><Badge tone={VS[c.vsBreakEven][1]}>{VS[c.vsBreakEven][0]}</Badge></Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </>
      )}
    </>
  );
}

function Source({ title, tag, s, violet }: { title: string; tag: string; s: AdsOverviewDto["manual"]; violet?: boolean }) {
  return (
    <div className="rounded-[10px] border border-gray-200 bg-white p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">{title} <Tag tone={violet ? "violet" : "gray"}>{tag}</Tag></h3>
      <div className={`mb-0.5 mt-2 text-[26px] font-bold tabular-nums ${violet ? "text-violet-700" : ""}`}>{formatRoas(s.roasReal)} <span className="text-[13px] font-normal text-gray-500">ROAS thực · TikTok báo {formatRoas(s.roasTiktok)}</span></div>
      <dl className="mt-3 grid grid-cols-3 gap-2">
        <div><dt className="text-[11px] text-gray-500">Chi tiêu</dt><dd className="font-semibold tabular-nums">{formatVNDCompact(s.spend)}</dd></div>
        <div><dt className="text-[11px] text-gray-500">Đơn (TikTok)</dt><dd className="font-semibold tabular-nums">{formatNumber(s.orders)}</dd></div>
        <div><dt className="text-[11px] text-gray-500">Doanh thu (TikTok)</dt><dd className="font-semibold tabular-nums">{formatVNDCompact(s.grossRevenue)}</dd></div>
      </dl>
    </div>
  );
}
