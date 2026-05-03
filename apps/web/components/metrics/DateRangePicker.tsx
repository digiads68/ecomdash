"use client";

import { useShopStore, type DateRangePreset } from "@/lib/stores/shop-store";

const PRESETS: { value: DateRangePreset; label: string }[] = [
  { value: "today", label: "Hôm nay" },
  { value: "yesterday", label: "Hôm qua" },
  { value: "7d", label: "7 ngày" },
  { value: "30d", label: "30 ngày" },
  { value: "90d", label: "90 ngày" },
];

export function DateRangePicker() {
  const { dateRange, setDateRange } = useShopStore();

  return (
    <div className="flex items-center bg-white border border-gray-200 rounded-lg p-1 gap-0.5">
      {PRESETS.map(({ value, label }) => (
        <button
          key={value}
          onClick={() => setDateRange(value)}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            dateRange === value
              ? "bg-primary-500 text-white shadow-sm"
              : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
