"use client";

import type { CustomersSummaryDto } from "@ecomdash/shared";
import { Chart, C } from "@/components/Chart";
import { ErrorBox, KpiCard, Loading, PageHeader, Panel, TableWrap, Td, Th } from "@/components/ui";
import { useApi } from "@/lib/api";
import { formatNumber, formatPct, formatVNDCompact } from "@/lib/format";

export default function CustomersPage() {
  const q = useApi<CustomersSummaryDto>("/customers/summary");
  const d = q.data;
  const maxP = Math.max(1, ...(d?.topProvinces.map((p) => p.orders) ?? [1]));
  return (
    <>
      <PageHeader title="Khách hàng" subtitle="Không lưu thông tin cá nhân — người mua được nhận diện bằng mã băm" />
      {q.error && <ErrorBox error={q.error} />}
      {!d && !q.error && <Loading />}
      {d && (
        <>
          <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
            <KpiCard label="Người mua" value={formatNumber(d.buyers.value)} kpi={d.buyers} />
            <KpiCard label="Khách mới" value={formatNumber(d.newBuyers.value)} kpi={d.newBuyers} />
            <KpiCard label="Tỉ lệ khách quay lại" value={formatPct(d.returningRate.value)} kpi={d.returningRate} />
            <KpiCard label="Đơn / người mua" value={d.ordersPerBuyer == null ? "—" : d.ordersPerBuyer.toFixed(2).replace(".", ",")} />
          </div>
          <div className="grid gap-3.5 lg:grid-cols-2">
            <Panel title="Phân khúc" hint="theo số đơn tích luỹ">
              <Chart height={240} option={{ tooltip: { trigger: "item" }, legend: { bottom: 0, textStyle: { color: C.text } }, series: [{ type: "pie", radius: ["48%", "72%"], center: ["50%", "44%"], label: { show: false },
                data: d.segments.map((s, i) => ({ name: s.name, value: s.buyers, itemStyle: { color: [C.blue, C.green, C.violet][i % 3] } })) }] }} />
              <TableWrap><thead><tr><Th>Phân khúc</Th><Th right>Người mua</Th><Th right>Doanh thu</Th></tr></thead>
                <tbody>{d.segments.map((s) => <tr key={s.name}><Td>{s.name}</Td><Td right>{formatNumber(s.buyers)}</Td><Td right>{formatVNDCompact(s.revenue)}</Td></tr>)}</tbody></TableWrap>
            </Panel>
            <Panel title="Tỉnh/thành mua nhiều nhất">
              <div className="grid gap-2.5">{d.topProvinces.map((p) => (
                <div key={p.province} className="grid grid-cols-[150px_minmax(0,1fr)_110px] items-center gap-2.5 text-[13px]">
                  <span>{p.province}</span>
                  <div className="h-2.5 overflow-hidden rounded-full bg-gray-100"><i className="block h-full rounded-full bg-primary-500" style={{ width: `${(p.orders / maxP) * 100}%` }} /></div>
                  <span className="text-right tabular-nums text-gray-500">{formatNumber(p.orders)} · {formatVNDCompact(p.revenue)}</span>
                </div>
              ))}</div>
            </Panel>
          </div>
        </>
      )}
    </>
  );
}
