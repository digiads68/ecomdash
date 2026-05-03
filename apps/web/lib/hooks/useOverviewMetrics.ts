"use client";

import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/api-client";
import { useShopStore, getDateRangeValues } from "@/lib/stores/shop-store";
import type { MetricOverview } from "@ecomdash/shared";

export function useOverviewMetrics() {
  const fetchWithAuth = useApiClient();
  const { selectedShopId, dateRange } = useShopStore();

  const { from, to } = getDateRangeValues(dateRange);

  return useQuery<MetricOverview>({
    queryKey: ["metrics", "overview", selectedShopId, dateRange],
    queryFn: () =>
      fetchWithAuth<MetricOverview>(
        `/metrics/overview?shopId=${selectedShopId}&from=${from.toISOString()}&to=${to.toISOString()}`
      ),
    enabled: !!selectedShopId,
    placeholderData: (prev) => prev,
  });
}
