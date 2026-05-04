"use client";

import { useQuery } from "@tanstack/react-query";
import { Users, UserPlus, Repeat2 } from "lucide-react";
import { useShopStore } from "@/lib/stores/shop-store";
import { useApiClient } from "@/lib/api-client";
import { MetricCard } from "@/components/metrics/MetricCard";
import { CustomerSegmentChart } from "@/components/charts/CustomerSegmentChart";
import { formatVNDCompact } from "@/lib/format";

interface CustomerSummary {
  totalBuyers: number;
  newBuyers: number;
  returningBuyers: number;
  returningRate: number;
}

interface TopBuyer {
  anonymousId: string;
  orderCount: number;
  totalSpend: number;
  lastOrderDate: string;
}

export default function CustomersPage() {
  const { selectedShopId, getDateRangeValues } = useShopStore();
  const { from, to } = getDateRangeValues();
  const fetchWithAuth = useApiClient();

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["customers-summary", selectedShopId, from, to],
    queryFn: () =>
      fetchWithAuth<CustomerSummary>(
        `/customers/summary?shopId=${selectedShopId}&from=${from}&to=${to}`
      ),
    enabled: !!selectedShopId,
    staleTime: 60_000,
    placeholderData: { totalBuyers: 0, newBuyers: 0, returningBuyers: 0, returningRate: 0 },
  });

  const { data: topData, isLoading: topLoading } = useQuery({
    queryKey: ["customers-top", selectedShopId, from, to],
    queryFn: () =>
      fetchWithAuth<{ customers: TopBuyer[] }>(
        `/customers/top?shopId=${selectedShopId}&from=${from}&to=${to}&limit=20`
      ),
    enabled: !!selectedShopId,
    staleTime: 60_000,
    placeholderData: { customers: [] },
  });

  const s = summary ?? { totalBuyers: 0, newBuyers: 0, returningBuyers: 0, returningRate: 0 };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Users className="w-6 h-6 text-primary-500" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Phân tích khách hàng</h1>
          <p className="text-sm text-gray-500 mt-0.5">Khách mới vs khách quay lại, dữ liệu ẩn danh để bảo vệ quyền riêng tư</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MetricCard
          label="Tổng khách hàng"
          value={s.totalBuyers.toLocaleString("vi-VN")}
          icon={<Users className="w-5 h-5 text-primary-500" />}
          loading={summaryLoading}
        />
        <MetricCard
          label="Khách mới"
          value={s.newBuyers.toLocaleString("vi-VN")}
          icon={<UserPlus className="w-5 h-5 text-blue-500" />}
          loading={summaryLoading}
        />
        <MetricCard
          label="Khách quay lại"
          value={`${s.returningBuyers.toLocaleString("vi-VN")} (${(s.returningRate * 100).toFixed(1)}%)`}
          icon={<Repeat2 className="w-5 h-5 text-green-500" />}
          loading={summaryLoading}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Donut Chart */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Phân khúc khách hàng</h2>
          {summaryLoading ? (
            <div className="h-[260px] flex items-center justify-center text-gray-400 text-sm">Đang tải...</div>
          ) : s.totalBuyers === 0 ? (
            <div className="h-[260px] flex items-center justify-center text-gray-400 text-sm">Chưa có dữ liệu</div>
          ) : (
            <CustomerSegmentChart newBuyers={s.newBuyers} returningBuyers={s.returningBuyers} />
          )}
        </div>

        {/* Top buyers table */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-base font-semibold text-gray-800 mb-4">Top khách hàng</h2>
          <p className="text-xs text-gray-400 mb-4 flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-green-400" />
            ID ẩn danh — không lưu thông tin cá nhân
          </p>
          {topLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-10 animate-pulse bg-gray-100 rounded-lg" />
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 px-3 font-medium text-gray-500">Khách hàng</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-500">Đơn</th>
                    <th className="text-right py-2 px-3 font-medium text-gray-500">Tổng chi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {(topData?.customers ?? []).map((c) => (
                    <tr key={c.anonymousId} className="hover:bg-gray-50">
                      <td className="py-2.5 px-3 font-medium text-gray-700">{c.anonymousId}</td>
                      <td className="py-2.5 px-3 text-right text-gray-500">{c.orderCount}</td>
                      <td className="py-2.5 px-3 text-right font-mono text-gray-800">
                        {formatVNDCompact(c.totalSpend)}
                      </td>
                    </tr>
                  ))}
                  {(topData?.customers ?? []).length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-gray-400">Chưa có dữ liệu</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
