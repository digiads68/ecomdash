"use client";

import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/api-client";
import { useShopStore, getDateRangeValues } from "@/lib/stores/shop-store";
import type { RevenueTrendPoint } from "@ecomdash/shared";

export function useRevenueTrend(granularity: "day" | "hour" = "day") {
  const fetchWithAuth = useApiClient();
  const { selectedShopId, dateRange } = useShopStore();

  const { from, to } = getDateRangeValues(dateRange);

  return useQuery<RevenueTrendPoint[]>({
    queryKey: ["metrics", "revenue-trend", selectedShopId, dateRange, granularity],
    queryFn: () =>
      fetchWithAuth<RevenueTrendPoint[]>(
        `/metrics/revenue-trend?shopId=${selectedShopId}&from=${from.toISOString()}&to=${to.toISOString()}&granularity=${granularity}`
      ),
    enabled: !!selectedShopId,
  });
}
