"use client";

import { useMemo } from "react";
import ReactECharts from "echarts-for-react";
import { useRevenueTrend } from "@/lib/hooks/useRevenueTrend";
import { formatDate, formatVNDCompact, formatNumber } from "@/lib/format";

export function RevenueTrendChart() {
  const { data = [], isLoading } = useRevenueTrend("day");

  const option = useMemo(() => ({
    tooltip: {
      trigger: "axis",
      formatter: (params: any[]) => {
        const date = params[0]?.axisValue || "";
        const revenue = params[0]?.value ?? 0;
        const orders = params[1]?.value ?? 0;
        return `${date}<br/>Doanh thu: <b>${formatVNDCompact(revenue)}</b><br/>Đơn hàng: <b>${formatNumber(orders)}</b>`;
      },
    },
    legend: {
      data: ["Doanh thu", "Đơn hàng"],
      bottom: 0,
      textStyle: { fontSize: 12, color: "#6b7280" },
    },
    grid: { left: 16, right: 16, top: 16, bottom: 40, containLabel: true },
    xAxis: {
      type: "category",
      data: data.map((d) => formatDate(d.date)),
      axisLine: { lineStyle: { color: "#e5e7eb" } },
      axisTick: { show: false },
      axisLabel: { fontSize: 11, color: "#9ca3af" },
    },
    yAxis: [
      {
        type: "value",
        name: "₫",
        axisLabel: { formatter: (v: number) => formatVNDCompact(v), fontSize: 10, color: "#9ca3af" },
        splitLine: { lineStyle: { color: "#f3f4f6" } },
      },
      {
        type: "value",
        name: "Đơn",
        axisLabel: { fontSize: 10, color: "#9ca3af" },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: "Doanh thu",
        type: "line",
        data: data.map((d) => d.revenue),
        smooth: true,
        yAxisIndex: 0,
        lineStyle: { color: "#3B82F6", width: 2 },
        itemStyle: { color: "#3B82F6" },
        areaStyle: {
          color: {
            type: "linear",
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: "rgba(59,130,246,0.2)" },
              { offset: 1, color: "rgba(59,130,246,0)" },
            ],
          },
        },
        symbol: "none",
      },
      {
        name: "Đơn hàng",
        type: "bar",
        data: data.map((d) => d.orders),
        yAxisIndex: 1,
        itemStyle: { color: "rgba(16,185,129,0.6)", borderRadius: [2, 2, 0, 0] },
        barMaxWidth: 20,
      },
    ],
  }), [data]);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-4">Doanh thu theo thời gian</h3>
      {isLoading ? (
        <div className="h-[260px] animate-pulse bg-gray-100 rounded-lg" />
      ) : data.length === 0 ? (
        <div className="h-[260px] flex items-center justify-center text-gray-400 text-sm">
          Chưa có dữ liệu
        </div>
      ) : (
        <ReactECharts option={option} style={{ height: 260 }} notMerge />
      )}
    </div>
  );
}
