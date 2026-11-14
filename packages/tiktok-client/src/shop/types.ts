// Wire types for TikTok Shop Partner API (snake_case as sent by TikTok). See docs/architecture/01.
// Money fields are strings; times are Unix seconds.

export interface Envelope<T> {
  code: number;
  message: string;
  request_id: string;
  data: T;
}

export interface TokenData {
  access_token: string;
  access_token_expire_in: number;  // absolute unix seconds
  refresh_token: string;
  refresh_token_expire_in: number; // absolute unix seconds
  open_id: string;
  seller_name: string;
  seller_base_region: string;
  user_type: number;
  granted_scopes: string[];
}

export interface AuthorizedShop {
  id: string;
  name: string;
  region: string;
  seller_type: "LOCAL" | "CROSS_BORDER";
  cipher: string;
  code: string;
}

export type ShopOrderStatus =
  | "UNPAID" | "ON_HOLD" | "AWAITING_SHIPMENT" | "PARTIALLY_SHIPPING" | "AWAITING_COLLECTION"
  | "IN_TRANSIT" | "DELIVERED" | "COMPLETED" | "CANCELLED";

export interface ShopOrderPayment {
  currency: string;
  sub_total: string;
  shipping_fee: string;
  seller_discount: string;
  platform_discount: string;
  total_amount: string;
  original_total_product_price: string;
  original_shipping_fee?: string;
  shipping_fee_seller_discount?: string;
  shipping_fee_platform_discount?: string;
  tax?: string;
}

export interface ShopLineItem {
  id: string;
  product_id: string;
  product_name: string;
  sku_id: string;
  sku_name?: string;
  sku_image?: string;
  seller_sku?: string;
  original_price: string;
  sale_price: string;
  seller_discount: string;
  platform_discount: string;
  currency: string;
  display_status?: string;
  package_id?: string;
  is_gift?: boolean;
}

export interface ShopOrder {
  id: string;
  status: ShopOrderStatus;
  create_time: number;
  update_time: number;
  paid_time?: number;
  rts_time?: number;
  delivery_time?: number;
  collection_time?: number;
  cancel_time?: number;
  cancel_reason?: string;
  cancellation_initiator?: string;
  user_id: string;
  buyer_message?: string;
  payment: ShopOrderPayment;
  recipient_address?: {
    region_code?: string;
    full_address?: string;
    district_info?: { address_level_name: string; address_name: string; address_level: string }[];
  };
  line_items: ShopLineItem[];
  shipping_provider?: string;
  shipping_type?: string;
  tracking_number?: string;
  delivery_option_name?: string;
  payment_method_name?: string;
  is_cod?: boolean;
  is_sample_order?: boolean;
  is_replacement_order?: boolean;
}

export interface OrderSearchBody {
  order_status?: ShopOrderStatus;
  create_time_ge?: number;
  create_time_lt?: number;
  update_time_ge?: number;
  update_time_lt?: number;
}

export interface PageOpts {
  pageSize?: number;
  pageToken?: string;
  sortField?: string;
  sortOrder?: "ASC" | "DESC";
}

export interface SearchPage<T> {
  items: T[];
  nextPageToken: string;
  totalCount: number;
}

export interface ShopSku {
  id: string;
  seller_sku?: string;
  price: { currency: string; sale_price: string; tax_exclusive_price?: string };
  list_price?: { currency: string; amount: string };
  inventory: { warehouse_id: string; quantity: number }[];
  sales_attributes?: { name: string; value_name: string }[];
}

export interface ShopProductSummary {
  id: string;
  title: string;
  status: string;
  create_time: number;
  update_time: number;
  skus: ShopSku[];
}

export interface ShopProductDetail extends ShopProductSummary {
  main_images?: { uri: string; urls: string[] }[];
  category_chains?: { id: string; local_name: string; is_leaf: boolean }[];
  brand?: { id: string; name: string };
}

export interface ProductSearchBody {
  status?: string;
  update_time_ge?: number;
  update_time_le?: number;
}

export interface ShopStatement {
  id: string;
  statement_time: number;
  settlement_amount: string;
  revenue_amount: string;
  fee_amount: string;
  adjustment_amount: string;
  shipping_cost_amount: string;
  net_sales_amount: string;
  currency: string;
  payment_status: "PAID" | "FAILED" | "PROCESSING";
  payment_id?: string;
}

export interface StatementQuery {
  statement_time_ge?: number;
  statement_time_lt?: number;
  payment_status?: string;
}

export interface FeeBreakdown {
  platform_commission_amount?: string;
  referral_fee_amount?: string;
  transaction_fee_amount?: string;
  affiliate_commission_amount?: string;
  affiliate_ads_commission_amount?: string;
  sfp_service_fee_amount?: string;
  vn_fix_infrastructure_fee_amount?: string;
  [k: string]: string | undefined;
}

export interface SkuTransaction {
  sku_id: string;
  revenue_breakdown?: Record<string, string>;
  shipping_cost_breakdown?: Record<string, string>;
  fee_tax_breakdown?: { fee?: FeeBreakdown; tax?: Record<string, string> };
}

export interface OrderStatementTransaction {
  statement_id?: string;
  statement_time?: number;
  currency: string;
  revenue_amount: string;
  fee_tax_amount: string;
  shipping_cost_amount: string;
  settlement_amount: string;
  sku_transactions: SkuTransaction[];
}

export interface OrderStatementTransactionsData {
  order_id: string;
  statement_transactions: OrderStatementTransaction[];
}

export type ReturnStatus =
  | "RETURN_OR_REFUND_REQUEST_PENDING" | "REFUND_OR_RETURN_REQUEST_REJECT" | "AWAITING_BUYER_SHIP" | "BUYER_SHIPPED_ITEM"
  | "REJECT_RECEIVE_PACKAGE" | "RETURN_OR_REFUND_REQUEST_SUCCESS" | "RETURN_OR_REFUND_REQUEST_CANCEL"
  | "RETURN_OR_REFUND_REQUEST_COMPLETE" | "AWAITING_BUYER_RESPONSE";

export interface ShopReturn {
  return_id: string;
  order_id: string;
  return_type: "REFUND" | "RETURN_AND_REFUND" | "REPLACEMENT";
  return_status: ReturnStatus;
  return_reason?: string;
  return_reason_text?: string;
  refund_amount?: { currency: string; refund_total: string; refund_subtotal?: string; refund_shipping_fee?: string };
  return_line_items?: { return_line_item_id: string; order_line_item_id: string; sku_id: string; product_name?: string }[];
  create_time: number;
  update_time: number;
}

export interface ShopCancellation {
  cancel_id: string;
  order_id: string;
  cancel_type: "CANCEL" | "BUYER_CANCEL";
  cancel_status: string;
  cancel_reason?: string;
  cancel_reason_text?: string;
  refund_amount?: { currency: string; refund_total: string };
  create_time: number;
  update_time: number;
}

export interface ReturnSearchBody {
  update_time_ge?: number;
  update_time_lt?: number;
  create_time_ge?: number;
  create_time_lt?: number;
  order_ids?: string[];
}

export interface ShopPerformanceInterval {
  start_date: string;
  end_date: string;
  gmv: { amount: string; currency: string };
  orders: number;
  units_sold: number;
  buyers: number;
  product_page_views: number;
  avg_product_page_visitors: number;
  product_impressions?: number;
}

export interface ShopProductPerformance {
  id: string;
  gmv: { amount: string; currency: string };
  orders: number;
  units_sold: number;
  impressions?: number;
  page_views?: number;
  click_through_rate?: string;
}

export interface WebhookEnvelope<T = Record<string, unknown>> {
  type: number;
  tts_notification_id: string;
  shop_id?: string;
  timestamp: number;
  data: T;
}
