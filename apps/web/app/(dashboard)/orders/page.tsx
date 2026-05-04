"use client";

import { useQuery } from "@tanstack/react-query";
import { Package, CheckCircle2, Clock, XCircle, RotateCcw } from "lucide-react";
import { useShopStore } from "@/lib/stores/shop-store";
import { useApiClient } from "@/lib/api-client";
import { MetricCard } from "@/components/metrics/MetricCard";
import { OrderStatusChart } from "@/components/charts/OrderStatusChart";

function useDateRange() {
  const { getDateRangeValues } = useShopStore();
  return getDateRangeValues();
}

interface OrderSummary {
  total: number;
  delivered: number;
  processing: number;
  cancelled: number;
  returned: number;
  returnRate: number;
  cancellationRate: number;
}

export default function OrdersPage() {
  const { selectedShopId } = useShopStore();
  const fetchWithAuth = useApiClient();
  const { from, to } = useDateRange();

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["orders-summary", selectedShopId, from, to],
    queryFn: () =>
      fetchWithAuth<OrderSummary>(
        `/orders/summary?shopId=${selectedShopId}&from=${from}&to=${to}`
      ),
    enabled: !!selectedShopId,
    staleTime: 60_000,
    placeholderData: { total: 0, delivered: 0, processing: 0, cancelled: 0, returned: 0, returnRate: 0, cancellationRate: 0 },
  });

  const { data: trend, isLoading: trendLoading } = useQuery({
    queryKey: ["orders-trend", selectedShopId, from, to],
    queryFn: () =>
      fetchWithAuth<{ data: { date: string; delivered: number; processing: number; cancelled: number; returned: number }[] }>(
        `/orders/trend?shopId=${selectedShopId}&from=${from}&to=${to}`
      ),
    enabled: !!selectedShopId,
    staleTime: 60_000,
    placeholderData: { data: [] },
  });

  const s = summary ?? { total: 0, delivered: 0, processing: 0, cancelled: 0, returned: 0, returnRate: 0, cancellationRate: 0 };
  const deliveryRate = s.total > 0 ? ((s.delivered / s.total) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Theo dõi đơn hàng</h1>
        <p className="text-sm text-gray-500 mt-1">Phân tích trạng thái đơn hàng và tỷ lệ hoàn/hủy</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Tổng đơn hàng"
          value={s.total.toLocaleString("vi-VN")}
          icon={<Package className="w-5 h-5 text-blue-500" />}
          loading={summaryLoading}
        />
        <MetricCard
          label="Đã giao thành công"
          value={`${s.delivered.toLocaleString("vi-VN")} (${deliveryRate}%)`}
          icon={<CheckCircle2 className="w-5 h-5 text-green-500" />}
          loading={summaryLoading}
        />
        <MetricCard
          label="Đã hủy"
          value={`${s.cancelled.toLocaleString("vi-VN")} (${(s.cancellationRate * 100).toFixed(1)}%)`}
          icon={<XCircle className="w-5 h-5 text-red-500" />}
          loading={summaryLoading}
        />
        <MetricCard
          label="Hoàn hàng"
          value={`${s.returned.toLocaleString("vi-VN")} (${(s.returnRate * 100).toFixed(1)}%)`}
          icon={<RotateCcw className="w-5 h-5 text-amber-500" />}
          loading={summaryLoading}
        />
      </div>

      {/* Chart */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <h2 className="text-base font-semibold text-gray-800 mb-4">Xu hướng đơn hàng theo ngày</h2>
        {trendLoading ? (
          <div className="h-[280px] flex items-center justify-center text-gray-400 text-sm">Đang tải...</div>
        ) : (trend?.data?.length ?? 0) === 0 ? (
          <div className="h-[280px] flex items-center justify-center text-gray-400 text-sm">Chưa có dữ liệu trong kỳ này</div>
        ) : (
          <OrderStatusChart data={trend!.data} />
        )}
      </div>

      {/* In-progress orders notice */}
      {s.processing > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3">
          <Clock className="w-5 h-5 text-blue-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-blue-800">
              {s.processing.toLocaleString("vi-VN")} đơn đang xử lý
            </p>
            <p className="text-xs text-blue-600 mt-0.5">
              Bao gồm đơn chờ lấy hàng, đang vận chuyển
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
