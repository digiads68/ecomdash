"use client";

import { DollarSign, ShoppingCart, Target, TrendingUp } from "lucide-react";
import { MetricCard } from "./MetricCard";
import { useOverviewMetrics } from "@/lib/hooks/useOverviewMetrics";
import { formatVNDCompact, formatNumber, formatROAS } from "@/lib/format";

export function OverviewMetricCards() {
  const { data, isLoading } = useOverviewMetrics();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <MetricCard
        label="Doanh thu"
        value={data ? formatVNDCompact(data.revenue) : "—"}
        change={data?.revenueChange}
        icon={<DollarSign className="w-5 h-5" />}
        loading={isLoading}
      />
      <MetricCard
        label="Đơn hàng"
        value={data ? formatNumber(data.orders) : "—"}
        change={data?.ordersChange}
        icon={<ShoppingCart className="w-5 h-5" />}
        loading={isLoading}
      />
      <MetricCard
        label="ROAS"
        value={data ? formatROAS(data.roas) : "—"}
        change={data?.roasChange}
        icon={<Target className="w-5 h-5" />}
        loading={isLoading}
      />
      <MetricCard
        label="Chi phí quảng cáo"
        value={data ? formatVNDCompact(data.adSpend) : "—"}
        change={data ? -data.adSpendChange : undefined}
        icon={<TrendingUp className="w-5 h-5" />}
        loading={isLoading}
      />
    </div>
  );
}
