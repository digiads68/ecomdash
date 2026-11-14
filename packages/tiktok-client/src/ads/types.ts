// Wire types for TikTok Marketing API v1.3 (docs/architecture/02).

export interface PageInfo {
  page: number;
  page_size: number;
  total_number: number;
  total_page: number;
}

export interface AdsTokenData {
  access_token: string;
  advertiser_ids: string[];
  scope: number[] | string[];
}

export interface AdvertiserInfo {
  advertiser_id: string;
  name: string;
  currency: string;
  timezone: string;
  display_timezone?: string;
  status?: string;
  owner_bc_id?: string;
  balance?: number;
}

export interface AdsCampaign {
  campaign_id: string;
  campaign_name: string;
  objective_type: string;
  campaign_type?: string;
  budget: number;
  budget_mode: string;
  operation_status: "ENABLE" | "DISABLE";
  secondary_status?: string;
  is_gmv_max?: boolean;
  create_time?: string;
  modify_time?: string;
}

export interface GmvMaxCampaignInfo {
  campaign_id: string;
  store_id: string;
  store_authorized_bc_id?: string;
  shopping_ads_type?: string;
  budget?: number;
  roas_bid?: number;
  operation_status?: string;
}

export interface GmvMaxStore {
  store_id: string;
  store_name: string;
  store_code?: string;
  store_status?: string;
  store_authorized_bc_id?: string;
  store_role?: string;
  is_owner_bc?: boolean;
  is_gmv_max_available?: boolean;
  targeting_region_codes?: string[];
  thumbnail_url?: string;
}

export interface ReportRow {
  dimensions: Record<string, string>;
  metrics: Record<string, string>;
}

/** Metric names requested from /report/integrated/get/ — [CHƯA XÁC MINH] (02 §4.1), keep configurable. */
export const ADS_INTEGRATED_METRICS = ["spend", "impressions", "clicks", "conversion", "complete_payment", "total_complete_payment_rate"];
/** Metric names requested from /gmv_max/report/get/ — [CHƯA XÁC MINH] (02 §4.2). */
export const ADS_GMV_MAX_METRICS = ["cost", "net_cost", "orders", "gross_revenue", "roi"];
export const ADS_REPORT_MAX_DAYS = 30;
