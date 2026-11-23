import { backoffMs, defaultSleep, fetchText, FetchLike, RateLimiter, resolveFetch, TransportOptions } from "../http";
import { classifyAdsCode, errorFor } from "../errors";
import type { Envelope } from "../shop/types";
import {
  ADS_GMV_MAX_METRICS, ADS_INTEGRATED_METRICS, ADS_REPORT_MAX_DAYS, AdsCampaign, AdsTokenData, AdvertiserInfo,
  GmvMaxCampaignInfo, GmvMaxStore, PageInfo, ReportRow,
} from "./types";

const DAY = 86_400_000;

/** Split [start, end] (inclusive YYYY-MM-DD) into chunks of at most maxDays days. */
export function chunkDateRange(start: string, end: string, maxDays = ADS_REPORT_MAX_DAYS): [string, string][] {
  const out: [string, string][] = [];
  let s = Date.parse(`${start}T00:00:00Z`);
  const e = Date.parse(`${end}T00:00:00Z`);
  while (s <= e) {
    const ce = Math.min(e, s + (maxDays - 1) * DAY);
    out.push([new Date(s).toISOString().slice(0, 10), new Date(ce).toISOString().slice(0, 10)]);
    s = ce + DAY;
  }
  return out;
}

export interface AdsClientOptions extends TransportOptions {
  baseUrl: string;
  accessToken: string;
}

function encodeParams(p: Record<string, unknown>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) {
    if (v === undefined || v === null) continue;
    q.set(k, typeof v === "object" ? JSON.stringify(v) : String(v));
  }
  return q.toString();
}

export class AdsClient {
  private readonly fetchImpl: FetchLike;
  private readonly limiter: RateLimiter;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly opts: AdsClientOptions) {
    this.fetchImpl = resolveFetch(opts.fetchImpl);
    this.sleep = opts.sleep ?? defaultSleep;
    this.limiter = new RateLimiter(opts.rps ?? 10, this.sleep);
  }

  async request<T>(method: "GET" | "POST", path: string, params: Record<string, unknown> = {}, token: string | null = this.opts.accessToken): Promise<T> {
    const base = this.opts.baseUrl.replace(/\/$/, "");
    for (let attempt = 0; ; attempt++) {
      await this.limiter.take();
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (token) headers["Access-Token"] = token;
      const url = method === "GET" ? `${base}${path}?${encodeParams(params)}` : `${base}${path}`;
      let status = 0;
      let text = "";
      try {
        ({ status, text } = await fetchText(this.fetchImpl, url, { method, headers, body: method === "POST" ? JSON.stringify(params) : undefined }, this.opts.timeoutMs ?? 60_000));
      } catch (e) {
        if (attempt < (this.opts.maxRetries ?? 6)) { await this.sleep(backoffMs(attempt)); continue; }
        throw errorFor("transient", `Network error calling ${path}: ${(e as Error).message}`, -1);
      }
      let env: Envelope<T> | undefined;
      try { env = JSON.parse(text); } catch { /* ignore */ }
      const kind = env ? classifyAdsCode(env.code) : status === 429 ? "rate" : status >= 500 ? "transient" : "other";
      if (kind === "ok") return env!.data;
      if ((kind === "rate" || kind === "transient") && attempt < (this.opts.maxRetries ?? 6)) {
        await this.sleep(backoffMs(attempt));
        continue;
      }
      throw errorFor(kind, `${env?.message ?? `HTTP ${status}`} on ${method} ${path}`, env?.code ?? -1, env?.request_id, status);
    }
  }

  async getAdvertiserInfo(ids: string[]): Promise<AdvertiserInfo[]> {
    const d = await this.request<{ list?: AdvertiserInfo[] }>("GET", "/advertiser/info/", { advertiser_ids: ids });
    return d.list ?? [];
  }

  async listCampaigns(advertiserId: string): Promise<AdsCampaign[]> {
    const out: AdsCampaign[] = [];
    for (let page = 1; ; page++) {
      const d = await this.request<{ list?: AdsCampaign[]; page_info: PageInfo }>("GET", "/campaign/get/", { advertiser_id: advertiserId, page, page_size: 100 });
      out.push(...(d.list ?? []));
      if (!d.page_info || page >= d.page_info.total_page) break;
    }
    return out;
  }

  getGmvMaxCampaign(advertiserId: string, campaignId: string): Promise<GmvMaxCampaignInfo> {
    return this.request("GET", "/campaign/gmv_max/info/", { advertiser_id: advertiserId, campaign_id: campaignId });
  }

  async getGmvMaxStores(advertiserId: string): Promise<GmvMaxStore[]> {
    const d = await this.request<{ store_list?: GmvMaxStore[] }>("GET", "/gmv_max/store/list/", { advertiser_id: advertiserId });
    return d.store_list ?? [];
  }

  /** Manual Shop Ads daily report by campaign; chunks ranges and pages automatically (02 §4.1). */
  async integratedReport(q: { advertiserId: string; startDate: string; endDate: string; metrics?: string[] }): Promise<ReportRow[]> {
    const rows: ReportRow[] = [];
    for (const [s, e] of chunkDateRange(q.startDate, q.endDate)) {
      for (let page = 1; ; page++) {
        const d = await this.request<{ list?: ReportRow[]; page_info: PageInfo }>("GET", "/report/integrated/get/", {
          advertiser_id: q.advertiserId,
          report_type: "BASIC",
          data_level: "AUCTION_CAMPAIGN",
          dimensions: ["campaign_id", "stat_time_day"],
          metrics: q.metrics ?? ADS_INTEGRATED_METRICS,
          start_date: s,
          end_date: e,
          page,
          page_size: 1000,
        });
        rows.push(...(d.list ?? []));
        if (!d.page_info || page >= d.page_info.total_page) break;
      }
    }
    return rows;
  }

  /** GMV Max daily report by campaign for exactly one store (02 §4.2). */
  async gmvMaxReport(q: { advertiserId: string; storeId: string; startDate: string; endDate: string; metrics?: string[] }): Promise<ReportRow[]> {
    const rows: ReportRow[] = [];
    for (const [s, e] of chunkDateRange(q.startDate, q.endDate)) {
      for (let page = 1; ; page++) {
        const d = await this.request<{ list?: ReportRow[]; page_info: PageInfo }>("GET", "/gmv_max/report/get/", {
          advertiser_id: q.advertiserId,
          store_ids: [q.storeId],
          dimensions: ["campaign_id", "stat_time_day"],
          metrics: q.metrics ?? ADS_GMV_MAX_METRICS,
          start_date: s,
          end_date: e,
          page,
          page_size: 1000,
        });
        rows.push(...(d.list ?? []));
        if (!d.page_info || page >= d.page_info.total_page) break;
      }
    }
    return rows;
  }
}

export interface AdsAuthOptions {
  baseUrl: string;
  authorizeUrl: string;
  appId: string;
  secret: string;
  fetchImpl?: FetchLike;
}

export class AdsAuthClient {
  private readonly api: AdsClient;
  constructor(private readonly o: AdsAuthOptions) {
    this.api = new AdsClient({ baseUrl: o.baseUrl, accessToken: "", fetchImpl: o.fetchImpl, maxRetries: 2 });
  }

  buildAuthorizeUrl(state: string, redirectUri: string): string {
    return `${this.o.authorizeUrl}?${new URLSearchParams({ app_id: this.o.appId, state, redirect_uri: redirectUri })}`;
  }

  getAccessToken(authCode: string): Promise<AdsTokenData> {
    return this.api.request("POST", "/oauth2/access_token/", { app_id: this.o.appId, secret: this.o.secret, auth_code: authCode }, null);
  }

  async getAuthorizedAdvertisers(accessToken: string): Promise<{ advertiser_id: string; advertiser_name: string }[]> {
    const d = await this.api.request<{ list?: { advertiser_id: string; advertiser_name: string }[] }>(
      "GET", "/oauth2/advertiser/get/", { app_id: this.o.appId, secret: this.o.secret }, accessToken);
    return d.list ?? [];
  }
}
