"use client";

import type { AlertInstanceDto, AlertMetric, AlertRuleDto } from "@ecomdash/shared";
import { Badge, Button, ErrorBox, Loading, PageHeader, Panel, TableWrap, Td, Th, Toggle } from "@/components/ui";
import { useApi, useApiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";

const METRIC: Record<AlertMetric, string> = {
  real_roas_below_breakeven: "ROAS thực dưới hoà vốn", real_roas: "ROAS thực", roas_tiktok: "ROAS TikTok", net_profit: "Lãi ròng", net_margin: "Biên lãi ròng",
  gmv: "GMV đặt hàng", orders: "Số đơn", ad_spend: "Chi quảng cáo", cancel_rate: "Tỉ lệ huỷ", return_rate: "Tỉ lệ hoàn",
};
const OP: Record<string, string> = { lt: "<", lte: "≤", gt: ">", gte: "≥" };
const WIN: Record<string, string> = { today: "hôm nay", "24h": "24 giờ", "7d": "7 ngày" };
const fmtTh = (m: string, v: number) => (m === "real_roas_below_breakeven" ? "" : m.includes("rate") || m === "net_margin" ? `${(v * 100).toFixed(1).replace(".", ",")}%` : m.includes("roas") ? `${v}×` : v.toLocaleString("vi-VN"));

export default function AlertsPage() {
  const f = useApiFetch();
  const qc = useQueryClient();
  const rules = useApi<AlertRuleDto[]>("/alerts/rules", {}, { shop: false });
  const inst = useApi<(AlertInstanceDto & { detail?: string })[]>("/alerts/instances", {}, { shop: false });
  const refresh = () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/alerts") });

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fm = e.currentTarget;
    const v = (n: string) => (fm.elements.namedItem(n) as HTMLInputElement).value;
    const metric = v("metric") as AlertMetric;
    const pct = metric.includes("rate") || metric === "net_margin";
    const threshold = metric === "real_roas_below_breakeven" ? 1 : Number(v("threshold").replace(",", ".")) / (pct ? 100 : 1);
    await f("/alerts/rules", { method: "POST", body: JSON.stringify({ name: v("name"), conditions: [{ metric, operator: metric === "real_roas_below_breakeven" ? "gte" : v("op"), threshold, window: v("window") }], actions: [{ type: "email", to: v("email") }] }) });
    fm.reset();
    refresh();
  }

  return (
    <>
      <PageHeader title="Cảnh báo" subtitle="Đánh giá mỗi vài phút trên số lãi lỗ theo ngày · gửi email và Telegram" actions={<Button onClick={async () => { await f("/alerts/evaluate", { method: "POST" }); refresh(); }}>Kiểm tra ngay</Button>} />
      <div className="grid gap-3.5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel title="Quy tắc">
          {rules.error && <ErrorBox error={rules.error} />}
          {!rules.data && <Loading rows={2} />}
          {rules.data && (
            <TableWrap>
              <thead><tr><Th>Quy tắc</Th><Th>Điều kiện</Th><Th>Gửi tới</Th><Th>Trạng thái</Th><Th>Bật</Th></tr></thead>
              <tbody>{rules.data.map((r) => (
                <tr key={r.id}><Td className="font-medium">{r.name}</Td>
                  <Td className="whitespace-normal">{r.conditions.map((c) => `${METRIC[c.metric]} ${c.metric === "real_roas_below_breakeven" ? "" : `${OP[c.operator]} ${fmtTh(c.metric, c.threshold)}`} · ${WIN[c.window]}`).join(" và ")}</Td>
                  <Td className="text-xs">{r.actions.map((a) => (a.type === "email" ? a.to : `Telegram ${a.chatId}`)).join(", ")}</Td>
                  <Td>{!r.isActive ? <Badge tone="gray">Tắt</Badge> : r.state === "FIRING" ? <Badge tone="red">Đang kích hoạt</Badge> : <Badge tone="green">Bình thường</Badge>}</Td>
                  <Td><Toggle label={`Bật ${r.name}`} on={r.isActive} onChange={async (v) => { await f(`/alerts/rules/${r.id}`, { method: "PUT", body: JSON.stringify({ isActive: v }) }); refresh(); }} /></Td></tr>
              ))}</tbody>
            </TableWrap>
          )}
        </Panel>
        <Panel title="Tạo quy tắc">
          <form onSubmit={create} className="grid gap-2.5 text-sm">
            <input id="a-name" name="name" required placeholder="Tên quy tắc, vd ROAS thực thấp" className="rounded-lg border border-gray-200 px-3 py-1.5" />
            <select id="a-metric" name="metric" className="rounded-lg border border-gray-200 bg-white px-2 py-1.5">{Object.entries(METRIC).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <div className="flex gap-2">
              <select id="a-op" name="op" className="rounded-lg border border-gray-200 bg-white px-2 py-1.5"><option value="lt">nhỏ hơn</option><option value="gt">lớn hơn</option></select>
              <input id="a-threshold" name="threshold" placeholder="Ngưỡng (% với tỉ lệ)" className="w-40 rounded-lg border border-gray-200 px-3 py-1.5" />
              <select id="a-window" name="window" className="rounded-lg border border-gray-200 bg-white px-2 py-1.5"><option value="7d">7 ngày</option><option value="24h">24 giờ</option><option value="today">Hôm nay</option></select>
            </div>
            <input id="a-email" name="email" type="email" required defaultValue="demo@ecomdash.vn" className="rounded-lg border border-gray-200 px-3 py-1.5" />
            <Button variant="primary" type="submit">Lưu quy tắc</Button>
          </form>
        </Panel>
      </div>
      <Panel title="Lịch sử">
        {inst.data && (
          <TableWrap>
            <thead><tr><Th>Thời điểm</Th><Th>Nội dung</Th><Th>Chi tiết</Th><Th>Trạng thái</Th><Th /></tr></thead>
            <tbody>
              {inst.data.map((i) => (
                <tr key={i.id}><Td>{formatDateTime(i.firedAt)}</Td><Td className="whitespace-normal font-medium">{i.title}</Td><Td className="whitespace-normal text-xs text-gray-500">{i.detail}</Td>
                  <Td>{i.state === "RESOLVED" ? <Badge tone="green">Đã hết</Badge> : i.acknowledgedAt ? <Badge tone="amber">Đã xem</Badge> : <Badge tone="red">Đang kích hoạt</Badge>}</Td>
                  <Td>{i.state === "FIRING" && !i.acknowledgedAt && <Button size="sm" onClick={async () => { await f(`/alerts/instances/${i.id}/acknowledge`, { method: "POST" }); refresh(); }}>Đánh dấu đã xem</Button>}</Td></tr>
              ))}
              {!inst.data.length && <tr><Td colSpan={5} className="text-center text-gray-500">Chưa có cảnh báo nào</Td></tr>}
            </tbody>
          </TableWrap>
        )}
      </Panel>
    </>
  );
}
