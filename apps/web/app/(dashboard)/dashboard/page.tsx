"use client";

import type { PnlDailyRowDto, PnlSummaryDto, ShopDto, SyncWatermarkDto } from "@ecomdash/shared";
import { Chart, C, axisX, axisY, legend } from "@/components/Chart";
import { Badge, Empty, ErrorBox, KpiCard, Loading, Notice, PageHeader, Panel, Tag, TableWrap, Td, Th } from "@/components/ui";
import { useApi } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { formatDay, formatFullDate, formatNumber, formatPct, formatRoas, formatVND, formatVNDCompact } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS: Record<string, [string, "green" | "amber" | "red" | "gray"]> = {
  PROFIT: ["Quảng cáo đang có lãi", "green"], NEAR_BREAKEVEN: ["Quảng cáo sát hoà vốn", "amber"], LOSS: ["Quảng cáo đang lỗ", "red"], NO_SPEND: ["Không chạy quảng cáo", "gray"],
};
const GROUP_LABEL: Record<string, string> = { COGS: "Giá vốn", PLATFORM: "Phí sàn", PLATFORM_OTHER: "Phí khác trên sàn", CUSTOM: "Chi phí tự nhập", ADS: "Quảng cáo" };

export default function DashboardPage() {
  const shopId = useAppStore((s) => s.shopId);
  const shops = useApi<ShopDto[]>("/shops", {}, { shop: false });
  const s = useApi<PnlSummaryDto>("/pnl/summary");
  const daily = useApi<PnlDailyRowDto[]>("/pnl/daily");
  const wm = useApi<SyncWatermarkDto>("/sync/watermark", {}, { shop: false, org: true, refetchInterval: 60_000 });
  const shop = shops.data?.find((x) => x.id === shopId);

  if (shops.data && !shops.data.length) return <><PageHeader title="Dashboard" /><Empty title="Chưa có shop nào">Khách mới đăng nhập bằng TikTok Shop sẽ tự gắn shop; nhân viên DigiAds gắn thay khách ở <a className="text-primary-600 underline" href="/admin/clients">Quản trị → Khách hàng</a>.</Empty></>;
  if (s.error) return <ErrorBox error={s.error} onRetry={() => s.refetch()} />;
  if (!s.data) return <><PageHeader title="Dashboard" /><Loading rows={4} /></>;
  const d = s.data;
  if (!d.orders.paid.count) return <><PageHeader title="Dashboard" /><Empty /></>;

  const o = d.orders;
  const st = STATUS[d.roas.status];
  const wf = Object.fromEntries(d.waterfall.map((w) => [w.key, w]));
  const settled = d.period.settledShare ?? 1;
  const spark = (k: keyof PnlDailyRowDto) => (daily.data ?? []).slice(-14).map((r) => Number(r[k]) || 0);
  const outcomes = [
    { label: "Thành công", count: o.success.count + o.partialReturn.count, amount: o.success.amount, color: "bg-green-500", pct: (o.success.count + o.partialReturn.count) / o.paid.count },
    { label: "Hoàn", count: o.returned.count + o.partialReturn.count, amount: o.returned.amount + o.partialReturn.amount, color: "bg-amber-500", pct: (o.returned.count + o.partialReturn.count) / o.paid.count, note: o.partialReturn.count ? `${o.partialReturn.count} hoàn một phần` : undefined },
    { label: "Huỷ", count: o.cancelled.count, amount: o.cancelled.amount, color: "bg-red-500", pct: o.cancelled.pctOfPaid },
    { label: "Đang chờ", count: o.pending.count, amount: o.pending.amount, color: "bg-gray-400", pct: o.pending.pctOfPaid },
  ];
  let lastGroup = "";

  return (
    <>
      <PageHeader title="Dashboard" subtitle={<>{shop?.name} · đơn đặt {formatFullDate(d.period.from)} – {formatFullDate(d.period.to)} · đã chốt <b>{formatPct(settled, 0)}</b> giá trị đơn{settled < 0.995 && ", phần còn lại là ước tính"}</>} />

      <Panel title={`Kết cục ${formatNumber(o.paid.count)} đơn đặt trong kỳ`} hint="gom theo ngày đặt đơn">
        <div className="mb-3.5 flex h-3.5 gap-0.5 overflow-hidden rounded-full">
          {outcomes.map((x) => <i key={x.label} className={cn("block min-w-[3px]", x.color)} style={{ flex: Math.max(x.amount, 1) }} title={x.label} />)}
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <div className="col-span-2 flex flex-col md:col-span-1 md:border-r md:border-gray-200 md:pr-3">
            <span className="text-xs text-gray-500">Đơn đặt (đã thanh toán)</span>
            <b className="text-lg tabular-nums">{formatNumber(o.paid.count)}</b>
            <span className="text-[13px] tabular-nums text-gray-500">{formatVNDCompact(o.paid.amount)} giá trị hàng</span>
          </div>
          {outcomes.map((x) => (
            <div key={x.label} className="flex min-w-0 flex-col">
              <span className="flex items-center gap-1.5 text-xs text-gray-500"><i className={cn("h-2.5 w-2.5 rounded-sm", x.color)} />{x.label}</span>
              <b className="text-lg tabular-nums">{formatNumber(x.count)} <small className="text-xs font-medium text-gray-500">{formatPct(x.pct)}</small></b>
              <span className="text-[13px] tabular-nums text-gray-500">{formatVNDCompact(x.amount)}{x.note && ` · ${x.note}`}</span>
            </div>
          ))}
        </div>
      </Panel>

      <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-[1fr_20px_1fr_20px_1fr_1fr]">
        <RoasTile label="ROAS TikTok báo" value={d.roas.tiktok} note="Tính cả đơn huỷ và hoàn" />
        <div className="hidden place-items-center text-lg text-gray-400 xl:grid" aria-hidden>→</div>
        <RoasTile label="ROAS thực" value={d.roas.real} note={`Sau huỷ/hoàn: giữ lại ${formatPct(d.roas.realizationRate, 0)} doanh thu`} highlight />
        <div className="hidden place-items-center text-lg text-gray-400 xl:grid" aria-hidden>→</div>
        <RoasTile label="ROAS thực nhận" value={d.roas.realSettlement} note="Sau phí sàn và phí khác" />
        <div className="flex flex-col gap-1 rounded-[10px] border border-dashed border-gray-300 bg-white p-3.5 xl:ml-2">
          <span className="text-xs text-gray-500">ROAS hoà vốn</span>
          <b className="text-[26px] tracking-tight tabular-nums">{d.roas.breakEven == null ? "Không hoà vốn" : formatRoas(d.roas.breakEven)}</b>
          <span className="self-start"><Badge tone={st[1]}>{st[0]}</Badge></span>
        </div>
      </div>
      <p className="-mt-1.5 text-xs text-gray-500">
        ROAS toàn shop (doanh thu thực ÷ chi QC, gồm cả đơn tự nhiên): {formatRoas(d.roas.shopWide)} · Chi QC / đơn thành công: {formatVND(d.ads.spendPerSuccessOrder)} · Chi QC / đơn đặt: {formatVND(d.ads.spendPerPaidOrder)}
      </p>

      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <KpiCard label="Doanh thu thực" value={formatVNDCompact(d.kpis.realizedRevenue.value)} kpi={d.kpis.realizedRevenue} spark={spark("realizedRevenue")} />
        <KpiCard label="Lãi ròng" value={formatVNDCompact(d.kpis.netProfit.value)} kpi={d.kpis.netProfit} spark={spark("netProfit")} />
        <KpiCard label="Biên lãi ròng" value={formatPct(d.kpis.netMargin.value)} kpi={d.kpis.netMargin} />
        <KpiCard label="Lãi ròng / đơn thành công" value={formatVND(d.kpis.netProfitPerOrder.value)} kpi={d.kpis.netProfitPerOrder} />
      </div>

      <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel title="Từ GMV đặt hàng tới lãi ròng" hint="phần nhạt = ước tính">
          <Waterfall steps={d.waterfall} />
        </Panel>
        <Panel title="Một đơn thành công" hint={`≈ ${formatNumber(d.unit.successOrders)} đơn`}>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-[13px]">
            <UnitRow label="Doanh thu thực" v={d.unit.revenue} />
            <UnitRow label="Phí sàn" v={d.unit.platformFees} neg />
            <UnitRow label="Phí khác trên sàn" v={d.unit.otherFees} neg />
            <UnitRow label="Giá vốn" v={d.unit.cogs} neg />
            <UnitRow label="Chi phí tự nhập" v={d.unit.custom} neg />
            <UnitRow label="Lãi trước quảng cáo" v={d.unit.contribution} sum />
            <UnitRow label="Quảng cáo" v={d.unit.adSpend} neg />
            <UnitRow label="Lãi ròng" v={d.unit.netProfit} sum good />
          </dl>
          <div className="mt-3.5 grid gap-2">
            {d.dataQuality.missingCostSkus > 0 && (
              <Notice href="/settings/costs" title={`${d.dataQuality.missingCostSkus} SKU chưa nhập giá vốn`}>
                Chiếm {formatPct(d.dataQuality.missingCostRevenueShare)} giá trị hàng trong kỳ · đang dùng % mặc định → Nhập giá vốn
              </Notice>
            )}
            {d.dataQuality.unsettledOrders > 0 && (
              <Notice href="/finance" title={`${formatNumber(d.dataQuality.unsettledOrders)} đơn chưa đối soát`}>Phí sàn của các đơn này đang ước tính theo tỉ lệ thực tế 75 ngày gần nhất</Notice>
            )}
            {wm.data?.adsMode === "TIKTOK" && wm.data.adsLagMinutes != null && wm.data.adsLagMinutes > 20 && (
              <Notice tone="amber" title={`Quảng cáo đang trễ ${wm.data.adsLagMinutes} phút`}>Chi phí quảng cáo hôm nay chưa đầy đủ — ROAS và lãi ròng hôm nay sẽ còn thay đổi</Notice>
            )}
            {(d.dataQuality.shopGmvMaxAdFee > 0 || d.dataQuality.adsPaidFromBalance > 0 || d.dataQuality.gmvMaxRevenueShare != null) && (
              <Notice tone="blue" href="/finance" title="Đối chiếu quảng cáo phía TikTok Shop">
                {d.dataQuality.gmvMaxRevenueShare != null && <>{formatPct(d.dataQuality.gmvMaxRevenueShare, 0)} doanh thu đến từ GMV Max · </>}
                {d.dataQuality.shopGmvMaxAdFee > 0 && <>phí GMV Max trừ vào đơn {formatVNDCompact(d.dataQuality.shopGmvMaxAdFee)}{d.dataQuality.gmvMaxFeeGap != null && ` (lệch ${formatPct(d.dataQuality.gmvMaxFeeGap)} so với Ads API)`} · </>}
                {d.dataQuality.adsPaidFromBalance > 0 && <>QC trừ vào số dư shop {formatVNDCompact(d.dataQuality.adsPaidFromBalance)} · </>}
                chỉ để đối chiếu, chi phí QC lấy từ TikTok for Business
              </Notice>
            )}
          </div>
        </Panel>
      </div>

      <Panel title="Bóc tách chi phí" hint="% trên doanh thu thực · trên mỗi đơn thành công">
        <TableWrap>
          <thead><tr><Th>Khoản chi phí</Th><Th right>Số tiền</Th><Th right>% doanh thu thực</Th><Th right>/ đơn thành công</Th><Th /></tr></thead>
          <tbody>
            {d.costs.map((c) => {
              const head = c.group !== lastGroup ? <tr key={`g-${c.group}`}><Td colSpan={5} className="bg-gray-50 text-xs font-semibold text-gray-500">{GROUP_LABEL[c.group]}</Td></tr> : null;
              lastGroup = c.group;
              return [head, (
                <tr key={c.key} className="hover:bg-gray-50">
                  <Td className="pl-6 whitespace-normal">{c.label}</Td>
                  <Td right>{formatVND(c.amount)}</Td>
                  <Td right>{formatPct(c.pctOfRevenue)}</Td>
                  <Td right>{formatVND(c.perSuccessOrder)}</Td>
                  <Td className="whitespace-normal">{c.estimated && <span title={c.note}><Tag>≈ {c.note ?? "một phần ước tính"}</Tag></span>}</Td>
                </tr>
              )];
            })}
            <tr><Td className="bg-gray-50 font-semibold">Tổng chi phí</Td><Td right className="bg-gray-50 font-semibold">{formatVND(sum(d.costs))}</Td><Td right className="bg-gray-50 font-semibold">{formatPct(sum(d.costs) / (wf.revenue?.amount || 1))}</Td><Td right className="bg-gray-50 font-semibold">{formatVND(d.unit.successOrders ? sum(d.costs) / d.unit.successOrders : null)}</Td><Td className="bg-gray-50" /></tr>
          </tbody>
        </TableWrap>
      </Panel>

      <Panel title="Theo ngày đặt đơn" hint="ROAS thực so với ROAS hoà vốn">
        {daily.data && <Chart height={300} option={{
          legend,
          xAxis: axisX(daily.data.map((r) => formatDay(r.date))),
          yAxis: [axisY((v) => formatVNDCompact(v)), axisY((v) => `${v}×`, { splitLine: { show: false } })],
          series: [
            { name: "Doanh thu thực", type: "bar", data: daily.data.map((r) => Math.round(r.realizedRevenue)), itemStyle: { color: C.blue, borderRadius: [3, 3, 0, 0] }, barMaxWidth: 14 },
            { name: "Lãi ròng", type: "bar", data: daily.data.map((r) => Math.round(r.netProfit)), itemStyle: { color: C.green, borderRadius: [3, 3, 0, 0] }, barMaxWidth: 14 },
            { name: "ROAS thực", type: "line", yAxisIndex: 1, data: daily.data.map((r) => (r.roasReal == null ? null : +r.roasReal.toFixed(2))), smooth: true, symbol: "none", lineStyle: { color: C.violet, width: 2 }, itemStyle: { color: C.violet } },
            { name: "ROAS hoà vốn", type: "line", yAxisIndex: 1, data: daily.data.map((r) => (r.breakEven == null ? null : +r.breakEven.toFixed(2))), symbol: "none", lineStyle: { color: C.red, width: 1.5, type: "dashed" }, itemStyle: { color: C.red } },
          ],
        }} />}
      </Panel>
    </>
  );
}

const sum = (rows: { amount: number }[]) => rows.reduce((s, r) => s + r.amount, 0);

function RoasTile({ label, value, note, highlight }: { label: string; value: number | null; note: string; highlight?: boolean }) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1 rounded-[10px] border p-3.5", highlight ? "border-primary-500 bg-primary-50" : "border-gray-200 bg-white")}>
      <span className="text-xs text-gray-500">{label}</span>
      <b className={cn("text-[26px] tracking-tight tabular-nums", highlight && "text-primary-700")}>{formatRoas(value)}</b>
      <span className="text-xs text-gray-500">{note}</span>
    </div>
  );
}

function UnitRow({ label, v, neg, sum: s, good }: { label: string; v: number | null; neg?: boolean; sum?: boolean; good?: boolean }) {
  return (
    <>
      <dt className={cn("text-gray-500", s && "border-t border-gray-200 pt-1.5 font-semibold text-gray-900")}>{label}</dt>
      <dd className={cn("text-right tabular-nums", neg && "text-red-600", s && "border-t border-gray-200 pt-1.5 font-bold", good && (v ?? 0) >= 0 && "text-green-600", good && (v ?? 0) < 0 && "text-red-600")}>
        {neg ? "−" : ""}{formatVND(v)}
      </dd>
    </>
  );
}

function Waterfall({ steps }: { steps: PnlSummaryDto["waterfall"] }) {
  let run = 0;
  const base: number[] = [], solid: object[] = [], est: object[] = [];
  steps.forEach((s, i) => {
    const last = i === steps.length - 1;
    const color = s.kind === "minus" ? C.red : last ? (s.amount >= 0 ? C.green : C.red) : C.blue;
    const e = Math.min(Math.abs(s.estimatedAmount), Math.abs(s.amount));
    // Negative subtotals stack downward from zero (ECharts stacks negatives separately).
    const sign = s.kind !== "minus" && s.amount < 0 ? -1 : 1;
    if (s.kind === "minus") { run -= s.amount; base.push(run); }
    else { base.push(0); run = s.amount; }
    solid.push({ value: sign * (Math.abs(s.amount) - e), itemStyle: { color } });
    est.push({ value: sign * e, itemStyle: { color, opacity: 0.35 } });
  });
  return <Chart height={320} option={{
    grid: { left: 8, right: 8, top: 26, bottom: 6, containLabel: true },
    tooltip: { trigger: "axis", formatter: (p: any) => { const s = steps[p[0].dataIndex]; return `${s.label}: <b>${formatVND(s.amount)}</b>${s.estimatedAmount ? `<br/>trong đó ước tính ${formatVND(s.estimatedAmount)}` : ""}`; } },
    xAxis: axisX(steps.map((s) => s.label), { axisLabel: { color: C.faint, fontSize: 10, interval: 0, rotate: 32 } }),
    yAxis: axisY((v) => formatVNDCompact(v)),
    series: [
      { type: "bar", stack: "w", data: base, itemStyle: { color: "transparent" }, silent: true, barMaxWidth: 34 },
      { type: "bar", stack: "w", data: solid as any, barMaxWidth: 34 },
      { type: "bar", stack: "w", data: est as any, barMaxWidth: 34, label: { show: true, position: "top", color: C.text, fontSize: 10, formatter: (p: any) => formatVNDCompact(steps[p.dataIndex].amount) } },
    ],
  }} />;
}
