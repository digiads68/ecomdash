"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { addDays, toBusinessDate } from "@ecomdash/shared";

export type PeriodPreset = "today" | "7d" | "30d" | "this_month" | "last_month" | "custom";

interface State {
  shopId: string | null;
  preset: PeriodPreset;
  customFrom: string | null;
  customTo: string | null;
  setShopId: (id: string) => void;
  setPreset: (p: PeriodPreset) => void;
  setCustom: (from: string, to: string) => void;
}

export const useAppStore = create<State>()(
  persist(
    (set) => ({
      shopId: null,
      preset: "30d",
      customFrom: null,
      customTo: null,
      setShopId: (shopId) => set({ shopId }),
      setPreset: (preset) => set({ preset }),
      setCustom: (customFrom, customTo) => set({ preset: "custom", customFrom, customTo }),
    }),
    { name: "ecomdash-v2" },
  ),
);

/** Inclusive business-date range (Asia/Ho_Chi_Minh) for a preset. */
export function periodRange(preset: PeriodPreset, customFrom?: string | null, customTo?: string | null): { from: string; to: string; label: string } {
  const today = toBusinessDate(new Date());
  switch (preset) {
    case "today": return { from: today, to: today, label: "Hôm nay" };
    case "7d": return { from: addDays(today, -6), to: today, label: "7 ngày" };
    case "this_month": return { from: `${today.slice(0, 8)}01`, to: today, label: "Tháng này" };
    case "last_month": {
      const end = addDays(`${today.slice(0, 8)}01`, -1);
      return { from: `${end.slice(0, 8)}01`, to: end, label: "Tháng trước" };
    }
    case "custom":
      if (customFrom && customTo) return { from: customFrom, to: customTo, label: "Tuỳ chọn" };
      return { from: addDays(today, -29), to: today, label: "30 ngày" };
    default: return { from: addDays(today, -29), to: today, label: "30 ngày" };
  }
}

export function usePeriod() {
  const { preset, customFrom, customTo } = useAppStore();
  return periodRange(preset, customFrom, customTo);
}
