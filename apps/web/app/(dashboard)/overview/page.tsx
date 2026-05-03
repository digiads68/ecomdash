import { OverviewMetricCards } from "@/components/metrics/OverviewMetricCards";
import { RevenueTrendChart } from "@/components/charts/RevenueTrendChart";
import { CampaignROASChart } from "@/components/charts/CampaignROASChart";
import { TopProductsTable } from "@/components/tables/TopProductsTable";
import { DateRangePicker } from "@/components/metrics/DateRangePicker";

export default function OverviewPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tổng quan</h1>
          <p className="text-sm text-gray-500 mt-0.5">TikTok Shop + Ads — dữ liệu cập nhật mỗi 15 phút</p>
        </div>
        <DateRangePicker />
      </div>

      {/* Row 1: 4 KPI Cards */}
      <OverviewMetricCards />

      {/* Row 2: 2 Charts side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RevenueTrendChart />
        <CampaignROASChart />
      </div>

      {/* Row 3: Top Products Table */}
      <TopProductsTable />
    </div>
  );
}
