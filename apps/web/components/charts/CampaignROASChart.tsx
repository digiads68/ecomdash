"use client";

import { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/api-client";
import { useShopStore, getDateRangeValues } from "@/lib/stores/shop-store";
import { formatVNDCompact, formatROAS } from "@/lib/format";
import type { CampaignMetric } from "@ecomdash/shared";

function roasColor(roas: number): string {
  if (roas >= 4) return "#10B981";
  if (roas >= 2) return "#3B82F6";
  if (roas >= 1) return "#F59E0B";
  return "#EF4444";
}

export function CampaignROASChart() {
  const fetchWithAuth = useApiClient();
  const { selectedShopId, selectedAdAccountId, dateRange } = useShopStore();
  const { from, to } = getDateRangeValues(dateRange);

  const { data = [], isLoading } = useQuery<CampaignMetric[]>({
    queryKey: ["campaigns", selectedAdAccountId, dateRange],
    queryFn: () =>
      fetchWithAuth<CampaignMetric[]>(
        `/campaigns?adAccountId=${selectedAdAccountId}&from=${from.toISOString()}&to=${to.toISOString()}`
      ),
    enabled: !!selectedAdAccountId,
  });

  const sorted = useMemo(
    () => [...data].sort((a, b) => b.roas - a.roas).slice(0, 8),
    [data]
  );

  const option = useMemo(() => ({
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params: any[]) => {
        const p = params[0];
        const campaign = sorted[p?.dataIndex];
        if (!campaign) return "";
        return `${campaign.name}<br/>ROAS: <b>${formatROAS(campaign.roas)}</b><br/>Chi phí: <b>${formatVNDCompact(campaign.spend)}</b>`;
      },
    },
    grid: { left: 16, right: 80, top: 8, bottom: 8, containLabel: true },
    xAxis: {
      type: "value",
      axisLabel: { formatter: (v: number) => `${v}x`, fontSize: 10, color: "#9ca3af" },
      splitLine: { lineStyle: { color: "#f3f4f6" } },
    },
    yAxis: {
      type: "category",
      data: sorted.map((c) => c.name.length > 20 ? c.name.slice(0, 20) + "…" : c.name),
      axisLabel: { fontSize: 11, color: "#6b7280" },
      axisLine: { show: false },
      axisTick: { show: false },
    },
    series: [
      {
        type: "bar",
        data: sorted.map((c) => ({
          value: c.roas,
          itemStyle: { color: roasColor(c.roas), borderRadius: [0, 4, 4, 0] },
        })),
        label: {
          show: true,
          position: "right",
          formatter: (p: any) => formatROAS(p.value),
          fontSize: 11,
          color: "#374151",
        },
        barMaxWidth: 24,
      },
    ],
  }), [sorted]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-1">ROAS theo chiến dịch</h3>
      <p className="text-xs text-gray-400 mb-4">Xanh ≥ 4x · Lam ≥ 2x · Vàng ≥ 1x · Đỏ &lt; 1x</p>
      {isLoading ? (
        <div className="h-[260px] animate-pulse bg-gray-100 rounded-lg" />
      ) : sorted.length === 0 ? (
        <div className="h-[260px] flex items-center justify-center text-gray-400 text-sm">
          Chưa có dữ liệu chiến dịch
        </div>
      ) : (
        <ReactECharts option={option} style={{ height: 260 }} notMerge />
      )}
    </div>
  );
}
