export interface MetricOverview {
  revenue: number;
  revenueChange: number;
  orders: number;
  ordersChange: number;
  adSpend: number;
  adSpendChange: number;
  roas: number;
  roasChange: number;
}

export interface RevenueTrendPoint {
  date: string;
  revenue: number;
  orders: number;
}

export interface TopProduct {
  productId: string;
  name: string;
  thumbnailUrl: string | null;
  revenue: number;
  orders: number;
  roas: number | null;
}

export interface CampaignMetric {
  campaignId: string;
  name: string;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  conversions: number;
  roas: number;
}

export type Granularity = "hour" | "day" | "week";

export interface MetricsOverviewQuery {
  shopId: string;
  adAccountId?: string;
  from: string;
  to: string;
}

export interface RevenueTrendQuery extends MetricsOverviewQuery {
  granularity: Granularity;
}
