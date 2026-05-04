"use client";

import ReactECharts from "echarts-for-react";

interface DataPoint {
  date: string;
  delivered: number;
  processing: number;
  cancelled: number;
  returned: number;
}

interface Props {
  data: DataPoint[];
}

export function OrderStatusChart({ data }: Props) {
  const dates = data.map((d) => d.date);

  const option = {
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
    legend: {
      data: ["Đã giao", "Đang xử lý", "Đã hủy", "Hoàn hàng"],
      bottom: 0,
      textStyle: { fontSize: 12 },
    },
    grid: { left: 40, right: 20, top: 20, bottom: 50 },
    xAxis: {
      type: "category",
      data: dates,
      axisLabel: { fontSize: 11, rotate: dates.length > 14 ? 45 : 0 },
    },
    yAxis: { type: "value", minInterval: 1 },
    series: [
      {
        name: "Đã giao",
        type: "bar",
        stack: "total",
        data: data.map((d) => d.delivered),
        itemStyle: { color: "#22c55e" },
      },
      {
        name: "Đang xử lý",
        type: "bar",
        stack: "total",
        data: data.map((d) => d.processing),
        itemStyle: { color: "#3b82f6" },
      },
      {
        name: "Đã hủy",
        type: "bar",
        stack: "total",
        data: data.map((d) => d.cancelled),
        itemStyle: { color: "#ef4444" },
      },
      {
        name: "Hoàn hàng",
        type: "bar",
        stack: "total",
        data: data.map((d) => d.returned),
        itemStyle: { color: "#f59e0b" },
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: 280 }} />;
}
