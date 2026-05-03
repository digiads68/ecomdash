"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/api-client";
import { useShopStore, getDateRangeValues } from "@/lib/stores/shop-store";
import { formatVND, formatVNDCompact, formatNumber, formatROAS } from "@/lib/format";
import { MetricCard } from "@/components/metrics/MetricCard";
import { DateRangePicker } from "@/components/metrics/DateRangePicker";
import { cn } from "@/lib/utils";

interface Campaign {
  campaignId: string;
  campaignName: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  gmv: number;
  ctr: number;
  roas: number;
}

function ROASBadge({ value }: { value: number }) {
  const label = formatROAS(value);

  const colorClass =
    value >= 4
      ? "bg-green-100 text-green-700 ring-green-200"
      : value >= 2
      ? "bg-blue-100 text-blue-700 ring-blue-200"
      : value >= 1
      ? "bg-yellow-100 text-yellow-700 ring-yellow-200"
      : "bg-red-100 text-red-700 ring-red-200";

  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ring-1 ring-inset",
        colorClass
      )}
    >
      {label}
    </span>
  );
}

function TableSkeleton() {
  return (
    <div className="divide-y divide-gray-100">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-6 py-4">
          <div className="animate-pulse bg-gray-200 rounded h-4 flex-1" />
          <div className="animate-pulse bg-gray-200 rounded h-4 w-24" />
          <div className="animate-pulse bg-gray-200 rounded h-4 w-20" />
          <div className="animate-pulse bg-gray-200 rounded h-4 w-16" />
          <div className="animate-pulse bg-gray-200 rounded h-4 w-14" />
          <div className="animate-pulse bg-gray-200 rounded h-4 w-16" />
          <div className="animate-pulse bg-gray-200 rounded h-6 w-16" />
        </div>
      ))}
    </div>
  );
}

export default function AdsPage() {
  const fetchWithAuth = useApiClient();
  const { selectedAdAccountId, dateRange } = useShopStore();

  const { from, to } = getDateRangeValues(dateRange);

  const { data: campaigns, isLoading } = useQuery<Campaign[]>({
    queryKey: ["campaigns", selectedAdAccountId, dateRange],
    queryFn: () =>
      fetchWithAuth<Campaign[]>(
        `/campaigns?adAccountId=${selectedAdAccountId}&from=${from.toISOString()}&to=${to.toISOString()}`
      ),
    enabled: !!selectedAdAccountId,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });

  // Aggregated KPI totals
  const totalSpend = campaigns?.reduce((sum, c) => sum + c.spend, 0) ?? 0;
  const totalImpressions = campaigns?.reduce((sum, c) => sum + c.impressions, 0) ?? 0;
  const totalClicks = campaigns?.reduce((sum, c) => sum + c.clicks, 0) ?? 0;
  const totalGmv = campaigns?.reduce((sum, c) => sum + c.gmv, 0) ?? 0;
  const totalROAS = totalSpend > 0 ? totalGmv / totalSpend : 0;

  // Empty state — no ad account selected
  if (!selectedAdAccountId) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-10 text-center max-w-sm w-full">
          <div className="text-4xl mb-4">📢</div>
          <h2 className="text-lg font-semibold text-gray-800 mb-2">
            Chưa có tài khoản quảng cáo
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            Vui lòng kết nối tài khoản quảng cáo TikTok để xem dữ liệu chiến dịch.
          </p>
          <Link
            href="/settings"
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors"
          >
            Đi đến Cài đặt
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quảng cáo TikTok</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Hiệu suất chiến dịch quảng cáo — dữ liệu cập nhật mỗi 15 phút
          </p>
        </div>
        <DateRangePicker />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Chi phí"
          value={isLoading ? "—" : formatVNDCompact(totalSpend)}
          loading={isLoading && !campaigns}
        />
        <MetricCard
          label="ROAS"
          value={isLoading ? "—" : formatROAS(totalROAS)}
          loading={isLoading && !campaigns}
        />
        <MetricCard
          label="Lượt hiển thị"
          value={isLoading ? "—" : formatNumber(totalImpressions)}
          loading={isLoading && !campaigns}
        />
        <MetricCard
          label="Lượt nhấp"
          value={isLoading ? "—" : formatNumber(totalClicks)}
          loading={isLoading && !campaigns}
        />
      </div>

      {/* Campaigns Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Chiến dịch</h2>
        </div>

        {isLoading && !campaigns ? (
          <TableSkeleton />
        ) : !campaigns || campaigns.length === 0 ? (
          <div className="px-6 py-12 text-center text-sm text-gray-500">
            Không có dữ liệu chiến dịch cho khoảng thời gian này.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Chiến dịch
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Chi phí (VND)
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Lượt hiển thị
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Lượt nhấp
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    CTR (%)
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Chuyển đổi
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    ROAS
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {campaigns.map((campaign) => (
                  <tr
                    key={campaign.campaignId}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    <td className="px-6 py-4 text-sm font-medium text-gray-900 max-w-xs truncate">
                      {campaign.campaignName}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700 text-right tabular-nums">
                      {formatVND(campaign.spend)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700 text-right tabular-nums">
                      {formatNumber(campaign.impressions)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700 text-right tabular-nums">
                      {formatNumber(campaign.clicks)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700 text-right tabular-nums">
                      {campaign.ctr.toFixed(2)}%
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700 text-right tabular-nums">
                      {formatNumber(campaign.conversions)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <ROASBadge value={campaign.roas} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
