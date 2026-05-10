"use client";

import ReactECharts from "echarts-for-react";

interface Props {
  newBuyers: number;
  returningBuyers: number;
}

export function CustomerSegmentChart({ newBuyers, returningBuyers }: Props) {
  const option = {
    tooltip: {
      trigger: "item",
      formatter: "{b}: {c} ({d}%)",
    },
    legend: {
      bottom: 0,
      textStyle: { fontSize: 12 },
    },
    series: [
      {
        type: "pie",
        radius: ["45%", "70%"],
        center: ["50%", "45%"],
        avoidLabelOverlap: false,
        label: { show: false },
        emphasis: {
          label: { show: true, fontSize: 14, fontWeight: "bold" },
        },
        data: [
          { value: newBuyers, name: "Khách mới", itemStyle: { color: "#3b82f6" } },
          { value: returningBuyers, name: "Khách quay lại", itemStyle: { color: "#22c55e" } },
        ],
      },
    ],
  };

  return <ReactECharts option={option} style={{ height: 260 }} />;
}
