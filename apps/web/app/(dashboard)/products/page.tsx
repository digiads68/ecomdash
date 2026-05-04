"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Package2 } from "lucide-react";
import { useShopStore } from "@/lib/stores/shop-store";
import { useApiClient } from "@/lib/api-client";
import { ProductAnalyticsTable, type ProductRow } from "@/components/tables/ProductAnalyticsTable";

type SortKey = "gmv" | "orders" | "roas";
type HealthFilter = "all" | "good" | "normal" | "warning" | "poor";

const FILTER_LABELS: Record<HealthFilter, string> = {
  all: "Tất cả",
  good: "Tốt",
  normal: "Bình thường",
  warning: "Cần chú ý",
  poor: "Kém",
};

export default function ProductsPage() {
  const { selectedShopId, getDateRangeValues } = useShopStore();
  const { from, to } = getDateRangeValues();
  const fetchWithAuth = useApiClient();
  const [sortBy, setSortBy] = useState<SortKey>("gmv");
  const [healthFilter, setHealthFilter] = useState<HealthFilter>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["products-analytics", selectedShopId, from, to, sortBy],
    queryFn: () =>
      fetchWithAuth<{ products: ProductRow[] }>(
        `/products/analytics?shopId=${selectedShopId}&from=${from}&to=${to}&sortBy=${sortBy}`
      ),
    enabled: !!selectedShopId,
    staleTime: 60_000,
    placeholderData: { products: [] },
  });

  const filtered = (data?.products ?? []).filter(
    (p) => healthFilter === "all" || p.healthScore === healthFilter
  );

  const counts = {
    good: data?.products.filter((p) => p.healthScore === "good").length ?? 0,
    warning: data?.products.filter((p) => p.healthScore === "warning").length ?? 0,
    poor: data?.products.filter((p) => p.healthScore === "poor").length ?? 0,
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Package2 className="w-6 h-6 text-primary-500" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Phân tích sản phẩm</h1>
          <p className="text-sm text-gray-500 mt-0.5">Theo dõi hiệu suất từng sản phẩm theo doanh thu và ROAS</p>
        </div>
      </div>

      {/* Health summary */}
      {(data?.products.length ?? 0) > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-green-700">{counts.good}</p>
            <p className="text-xs text-green-600 mt-1">Sản phẩm tốt (ROAS ≥ 3×)</p>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-yellow-700">{counts.warning}</p>
            <p className="text-xs text-yellow-600 mt-1">Cần chú ý (ROAS 1–1.5×)</p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
            <p className="text-2xl font-bold text-red-700">{counts.poor}</p>
            <p className="text-xs text-red-600 mt-1">Kém (ROAS &lt; 1×)</p>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
        {/* Filters */}
        <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100">
          {(Object.keys(FILTER_LABELS) as HealthFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setHealthFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                healthFilter === f
                  ? "bg-primary-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
          <span className="ml-auto text-xs text-gray-400">
            {filtered.length} sản phẩm
          </span>
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-sm text-gray-400">Đang tải dữ liệu...</div>
        ) : (
          <ProductAnalyticsTable
            products={filtered}
            onSortChange={setSortBy}
            currentSort={sortBy}
          />
        )}
      </div>
    </div>
  );
}
