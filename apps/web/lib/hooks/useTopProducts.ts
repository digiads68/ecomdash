"use client";

import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/api-client";
import { useShopStore, getDateRangeValues } from "@/lib/stores/shop-store";
import type { TopProduct } from "@ecomdash/shared";

export function useTopProducts(limit = 10) {
  const fetchWithAuth = useApiClient();
  const { selectedShopId, dateRange } = useShopStore();

  const { from, to } = getDateRangeValues(dateRange);

  return useQuery<TopProduct[]>({
    queryKey: ["metrics", "top-products", selectedShopId, dateRange, limit],
    queryFn: () =>
      fetchWithAuth<TopProduct[]>(
        `/metrics/top-products?shopId=${selectedShopId}&from=${from.toISOString()}&to=${to.toISOString()}&limit=${limit}`
      ),
    enabled: !!selectedShopId,
  });
}
