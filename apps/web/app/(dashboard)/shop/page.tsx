"use client";

import { useQuery } from "@tanstack/react-query";
import { ShoppingBag, Package, BarChart2, RotateCcw } from "lucide-react";
import { useApiClient } from "@/lib/api-client";
import { useShopStore, getDateRangeValues } from "@/lib/stores/shop-store";
import { formatVND } from "@/lib/format";
import { MetricCard } from "@/components/metrics/MetricCard";
import { DateRangePicker } from "@/components/metrics/DateRangePicker";
import { TopProductsTable } from "@/components/tables/TopProductsTable";

interface ShopSummary {
  revenue: number;
  revenueChange: number;
  orders: number;
  ordersChange: number;
  avgOrderValue: number;
  avgOrderValueChange: number;
  returnRate: number;
  returnRateChange?: number;
}

interface DailyOrders {
  date: string;
  revenue: number;
  orders: number;
}

export default function ShopPage() {
  const fetchWithAuth = useApiClient();
  const { selectedShopId, dateRange } = useShopStore();
  const { from, to } = getDateRangeValues(dateRange);

  const fromIso = from.toISOString();
  const toIso = to.toISOString();

  const { data: metrics, isLoading: metricsLoading } = useQuery<ShopSummary>({
    queryKey: ["shop", "metrics", selectedShopId, dateRange],
    queryFn: () =>
      fetchWithAuth<ShopSummary>(
        `/metrics/shop-summary?shopId=${selectedShopId}&from=${fromIso}&to=${toIso}`
      ),
    enabled: !!selectedShopId,
    placeholderData: (prev) => prev,
  });

  const { data: dailyOrders = [], isLoading: ordersLoading } = useQuery<DailyOrders[]>({
    queryKey: ["orders", selectedShopId, dateRange],
    queryFn: () =>
      fetchWithAuth<DailyOrders[]>(
        `/metrics/orders?shopId=${selectedShopId}&from=${fromIso}&to=${toIso}&limit=20`
      ),
    enabled: !!selectedShopId,
    placeholderData: (prev) => prev,
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quản lý Shop</h1>
          <p className="text-sm text-gray-500 mt-0.5">Theo dõi doanh thu và đơn hàng của shop</p>
        </div>
        <DateRangePicker />
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Doanh thu"
          value={metrics ? formatVND(metrics.revenue) : "—"}
          change={metrics?.revenueChange}
          icon={<ShoppingBag className="w-5 h-5" />}
          loading={metricsLoading}
        />
        <MetricCard
          label="Đơn hàng"
          value={metrics ? String(metrics.orders) : "—"}
          change={metrics?.ordersChange}
          icon={<Package className="w-5 h-5" />}
          loading={metricsLoading}
        />
        <MetricCard
          label="Giá trị TB/đơn"
          value={metrics ? formatVND(metrics.avgOrderValue) : "—"}
          change={metrics?.avgOrderValueChange}
          icon={<BarChart2 className="w-5 h-5" />}
          loading={metricsLoading}
        />
        <MetricCard
          label="Tỷ lệ hoàn"
          value={metrics ? `${metrics.returnRate.toFixed(1)}%` : "—"}
          change={metrics?.returnRateChange}
          icon={<RotateCcw className="w-5 h-5" />}
          loading={metricsLoading}
        />
      </div>

      {/* Top Products */}
      <TopProductsTable />

      {/* Daily Orders */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">Doanh thu theo ngày</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-5 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ngày
                </th>
                <th className="px-5 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Doanh thu
                </th>
                <th className="px-5 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Số đơn
                </th>
                <th className="px-5 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  TB/đơn
                </th>
              </tr>
            </thead>
            <tbody>
              {ordersLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    {Array.from({ length: 4 }).map((_, j) => (
                      <td key={j} className="px-5 py-4">
                        <div className="h-4 bg-gray-100 rounded animate-pulse w-24" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : dailyOrders.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-12 text-center text-sm text-gray-400">
                    Chưa có dữ liệu trong khoảng thời gian này
                  </td>
                </tr>
              ) : (
                dailyOrders.map((row) => (
                  <tr
                    key={row.date}
                    className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-5 py-3.5 text-sm text-gray-700">{row.date}</td>
                    <td className="px-5 py-3.5 text-sm font-semibold text-gray-900 text-right tabular-nums">
                      {formatVND(row.revenue)}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-700 text-right tabular-nums">
                      {row.orders.toLocaleString("vi-VN")}
                    </td>
                    <td className="px-5 py-3.5 text-sm text-gray-500 text-right tabular-nums">
                      {row.orders > 0 ? formatVND(row.revenue / row.orders) : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
