"use client";

import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, BarChart3, PieChart } from "lucide-react";
import { useApiClient } from "@/lib/api-client";
import { useShopStore, getDateRangeValues } from "@/lib/stores/shop-store";
import { DateRangePicker } from "@/components/metrics/DateRangePicker";
import { RevenueTrendChart } from "@/components/charts/RevenueTrendChart";
import { CampaignROASChart } from "@/components/charts/CampaignROASChart";
import { formatVND, formatVNDCompact, formatROAS } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function AnalyticsPage() {
  const fetchWithAuth = useApiClient();
  const { selectedShopId, selectedAdAccountId, dateRange } = useShopStore();
  const { from, to } = getDateRangeValues(dateRange);

  const { data: trend, isLoading: trendLoading } = useQuery({
    queryKey: ["revenue-trend", selectedShopId, dateRange],
    queryFn: () =>
      fetchWithAuth<any[]>(
        `/metrics/revenue-trend?shopId=${selectedShopId}&from=${from.toISOString()}&to=${to.toISOString()}&granularity=day`
      ),
    enabled: !!selectedShopId,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });

  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery({
    queryKey: ["campaigns", selectedAdAccountId, dateRange],
    queryFn: () =>
      fetchWithAuth<any[]>(
        `/campaigns?adAccountId=${selectedAdAccountId}&from=${from.toISOString()}&to=${to.toISOString()}`
      ),
    enabled: !!selectedAdAccountId,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });

  const totalSpend = campaigns.reduce((s: number, c: any) => s + (c.spend || 0), 0);
  const totalGmv = campaigns.reduce((s: number, c: any) => s + (c.gmv || 0), 0);
  const overallRoas = totalSpend > 0 ? totalGmv / totalSpend : 0;
  const totalConversions = campaigns.reduce((s: number, c: any) => s + (c.conversions || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Phân tích nâng cao</h1>
          <p className="text-sm text-gray-500 mt-0.5">Xu hướng dài hạn và so sánh hiệu suất</p>
        </div>
        <DateRangePicker />
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          {
            label: "Tổng doanh thu",
            value: formatVNDCompact(totalGmv),
            icon: TrendingUp,
            color: "text-green-500",
            bg: "bg-green-50",
          },
          {
            label: "Tổng chi phí",
            value: formatVNDCompact(totalSpend),
            icon: TrendingDown,
            color: "text-red-500",
            bg: "bg-red-50",
          },
          {
            label: "ROAS trung bình",
            value: formatROAS(overallRoas),
            icon: BarChart3,
            color: "text-blue-500",
            bg: "bg-blue-50",
          },
          {
            label: "Tổng chuyển đổi",
            value: totalConversions.toLocaleString("vi-VN"),
            icon: PieChart,
            color: "text-purple-500",
            bg: "bg-purple-50",
          },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div
            key={label}
            className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3"
          >
            <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", bg)}>
              <Icon className={cn("w-5 h-5", color)} />
            </div>
            <div>
              <p className="text-xs text-gray-500">{label}</p>
              <p className="text-base font-bold text-gray-900">{value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">Xu hướng doanh thu</h3>
          {selectedShopId ? (
            <RevenueTrendChart />
          ) : (
            <EmptyState message="Chọn shop để xem xu hướng doanh thu" />
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">ROAS theo chiến dịch</h3>
          {selectedAdAccountId ? (
            <CampaignROASChart />
          ) : (
            <EmptyState message="Kết nối tài khoản quảng cáo để xem ROAS" />
          )}
        </div>
      </div>

      {/* Top/Bottom campaign comparison */}
      {campaigns.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <CampaignList
            title="Chiến dịch hiệu quả nhất"
            campaigns={[...campaigns].sort((a: any, b: any) => b.roas - a.roas).slice(0, 5)}
            highlight="positive"
          />
          <CampaignList
            title="Chiến dịch cần cải thiện"
            campaigns={[...campaigns].sort((a: any, b: any) => a.roas - b.roas).slice(0, 5)}
            highlight="negative"
          />
        </div>
      )}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="h-48 flex items-center justify-center text-sm text-gray-400">{message}</div>
  );
}

function CampaignList({
  title,
  campaigns,
  highlight,
}: {
  title: string;
  campaigns: any[];
  highlight: "positive" | "negative";
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">{title}</h3>
      <div className="space-y-3">
        {campaigns.map((c: any, i: number) => (
          <div key={c.campaignId ?? i} className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-800 truncate">
                {c.name || `Campaign ${c.campaignId}`}
              </p>
              <p className="text-xs text-gray-400">Chi phí: {formatVNDCompact(c.spend)}</p>
            </div>
            <span
              className={cn(
                "ml-3 text-sm font-bold shrink-0",
                highlight === "positive" ? "text-green-600" : "text-red-500"
              )}
            >
              {formatROAS(c.roas)}x
            </span>
          </div>
        ))}
        {campaigns.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">Không có dữ liệu</p>
        )}
      </div>
    </div>
  );
}
