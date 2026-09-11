import { create } from "zustand";
import { persist } from "zustand/middleware";

export type DateRangePreset = "today" | "yesterday" | "7d" | "30d" | "90d";

interface ShopState {
  selectedShopId: string | null;
  selectedAdAccountId: string | null;
  dateRange: DateRangePreset;
  customFrom: string | null;
  customTo: string | null;
  setSelectedShopId: (id: string | null) => void;
  setSelectedAdAccountId: (id: string | null) => void;
  setDateRange: (range: DateRangePreset) => void;
}

export const useShopStore = create<ShopState>()(
  persist(
    (set) => ({
      selectedShopId: null,
      selectedAdAccountId: null,
      dateRange: "30d",
      customFrom: null,
      customTo: null,
      setSelectedShopId: (id) => set({ selectedShopId: id }),
      setSelectedAdAccountId: (id) => set({ selectedAdAccountId: id }),
      setDateRange: (range) => set({ dateRange: range }),
    }),
    { name: "ecomdash-shop" }
  )
);

export function getDateRangeValues(preset: DateRangePreset): { from: Date; to: Date } {
  const now = new Date();
  const to = now;

  switch (preset) {
    case "today": {
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);
      return { from: startOfDay, to };
    }
    case "yesterday": {
      const d = new Date();
      d.setDate(d.getDate() - 1);
      return { from: new Date(d.setHours(0, 0, 0, 0)), to: new Date(d.setHours(23, 59, 59, 999)) };
    }
    case "7d":
      return { from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), to };
    case "90d":
      return { from: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), to };
    case "30d":
    default:
      return { from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), to };
  }
}
