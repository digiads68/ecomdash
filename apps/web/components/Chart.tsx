"use client";

import dynamic from "next/dynamic";
import type { EChartsOption } from "echarts";

const ReactECharts = dynamic(() => import("echarts-for-react"), { ssr: false, loading: () => <div className="h-full w-full animate-pulse rounded-md bg-gray-50" /> });

export const C = { blue: "#3B82F6", amber: "#F59E0B", violet: "#8B5CF6", red: "#EF4444", green: "#10B981", gray: "#9CA3AF", line: "#E5E7EB", text: "#6B7280", faint: "#9CA3AF" };

export const axisX = (data: string[], extra: object = {}) => ({ type: "category" as const, data, axisLine: { lineStyle: { color: C.line } }, axisTick: { show: false }, axisLabel: { color: C.faint, fontSize: 11 }, ...extra });
export const axisY = (fmt: (v: number) => string, extra: object = {}) => ({ type: "value" as const, splitLine: { lineStyle: { color: C.line, type: "dashed" as const } }, axisLabel: { color: C.faint, fontSize: 11, formatter: fmt }, ...extra });
export const legend = { top: 0, right: 0, textStyle: { color: C.text, fontSize: 12 }, itemWidth: 10, itemHeight: 10 };

export function Chart({ option, height = 280 }: { option: EChartsOption; height?: number }) {
  const base: EChartsOption = {
    textStyle: { fontFamily: "inherit", color: C.text },
    grid: { left: 8, right: 8, top: 30, bottom: 6, containLabel: true },
    tooltip: { trigger: "axis", backgroundColor: "#fff", borderColor: C.line, textStyle: { color: "#111827" } },
  };
  return <div style={{ height }}><ReactECharts option={{ ...base, ...option }} style={{ height: "100%", width: "100%" }} notMerge opts={{ renderer: "svg" }} /></div>;
}
