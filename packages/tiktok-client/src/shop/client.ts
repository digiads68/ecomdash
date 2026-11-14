import { backoffMs, defaultSleep, fetchText, FetchLike, RateLimiter, resolveFetch, TransportOptions } from "../http";
import { classifyShopCode, errorFor, TikTokApiError } from "../errors";
import { signShopRequest } from "./sign";
import type {
  AuthorizedShop, Envelope, OrderSearchBody, OrderStatementTransaction, OrderStatementTransactionsData, PageOpts, ProductSearchBody, ReturnSearchBody,
  SearchPage, ShopCancellation, ShopOrder, ShopPerformanceInterval, ShopProductDetail, ShopProductPerformance, ShopProductSummary,
  ShopReturn, ShopStatement, StatementQuery,
} from "./types";

export interface ShopClientOptions extends TransportOptions {
  baseUrl: string;
  appKey: string;
  appSecret: string;
  accessToken: string;
  shopCipher?: string;
  /** Called once when TikTok reports an expired token (105002); must return a fresh access token. */
  onTokenExpired?: () => Promise<string>;
  now?: () => number;
}

interface RequestOpts {
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  shopScoped?: boolean;
}

export class ShopClient {
  private readonly fetchImpl: FetchLike;
  private readonly limiter: RateLimiter;
  private readonly sleep: (ms: number) => Promise<void>;
  private accessToken: string;

  constructor(private readonly opts: ShopClientOptions) {
    this.fetchImpl = resolveFetch(opts.fetchImpl);
    this.sleep = opts.sleep ?? defaultSleep;
    this.limiter = new RateLimiter(opts.rps ?? 5, this.sleep);
    this.accessToken = opts.accessToken;
  }

  withCipher(shopCipher: string): ShopClient {
    const c = new ShopClient({ ...this.opts, accessToken: this.accessToken, shopCipher });
    return c;
  }

  async request<T>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, { query = {}, body, shopScoped = true }: RequestOpts = {}): Promise<T> {
    if (shopScoped && !this.opts.shopCipher) throw new Error(`shop_cipher is required for ${path}`);
    const bodyStr = body === undefined ? undefined : JSON.stringify(body);
    let refreshed = false;
    for (let attempt = 0; ; attempt++) {
      await this.limiter.take();
      const q: Record<string, string> = {
        app_key: this.opts.appKey,
        timestamp: String(Math.floor((this.opts.now?.() ?? Date.now()) / 1000)),
      };
      if (shopScoped) q.shop_cipher = this.opts.shopCipher!;
      for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== "") q[k] = String(v);
      q.sign = signShopRequest({ path, query: q, body: bodyStr, appSecret: this.opts.appSecret });
      const url = `${this.opts.baseUrl.replace(/\/$/, "")}${path}?${new URLSearchParams(q).toString()}`;

      let status = 0;
      let text = "";
      try {
        ({ status, text } = await fetchText(this.fetchImpl, url, {
          method,
          headers: { "content-type": "application/json", "x-tts-access-token": this.accessToken },
          body: bodyStr,
        }, this.opts.timeoutMs ?? 30_000));
      } catch (e) {
        if (attempt < (this.opts.maxRetries ?? 6)) { await this.sleep(backoffMs(attempt)); continue; }
        throw errorFor("transient", `Network error calling ${path}: ${(e as Error).message}`, -1);
      }

      let env: Envelope<T> | undefined;
      try { env = JSON.parse(text); } catch { /* non-JSON body */ }
      const code = env?.code ?? (status >= 500 || status === 429 ? 36009007 : -1);
      if (status === 429) {
        if (attempt < (this.opts.maxRetries ?? 6)) { await this.sleep(backoffMs(attempt)); continue; }
        throw errorFor("rate", `HTTP 429 on ${path}`, 36009002, env?.request_id, status);
      }
      const kind = env ? classifyShopCode(code) : status >= 500 ? "transient" : "other";
      if (kind === "ok") return env!.data;
      if (kind === "token" && this.opts.onTokenExpired && !refreshed) {
        refreshed = true;
        this.accessToken = await this.opts.onTokenExpired();
        continue;
      }
      if ((kind === "rate" || kind === "transient") && attempt < (this.opts.maxRetries ?? 6)) {
        await this.sleep(backoffMs(attempt));
        continue;
      }
      throw errorFor(kind, `${env?.message ?? `HTTP ${status}`} on ${method} ${path}`, code, env?.request_id, status);
    }
  }

  private pageQuery(o: PageOpts = {}) {
    return { page_size: o.pageSize ?? 50, page_token: o.pageToken, sort_field: o.sortField, sort_order: o.sortOrder };
  }

  private async *paginate<T>(fetchPage: (token?: string) => Promise<SearchPage<T>>): AsyncGenerator<T[]> {
    let token: string | undefined;
    do {
      const page = await fetchPage(token);
      if (page.items.length) yield page.items;
      token = page.nextPageToken || undefined;
    } while (token);
  }

  // ───── authorization ─────
  async getAuthorizedShops(): Promise<AuthorizedShop[]> {
    const d = await this.request<{ shops: AuthorizedShop[] }>("GET", "/authorization/202309/shops", { shopScoped: false });
    return d.shops ?? [];
  }

  // ───── orders ─────
  async searchOrders(body: OrderSearchBody, opts?: PageOpts): Promise<SearchPage<ShopOrder>> {
    const d = await this.request<{ orders?: ShopOrder[]; next_page_token?: string; total_count?: number }>(
      "POST", "/order/202309/orders/search", { query: this.pageQuery(opts), body });
    return { items: d.orders ?? [], nextPageToken: d.next_page_token ?? "", totalCount: d.total_count ?? 0 };
  }

  iterateOrders(body: OrderSearchBody, opts: PageOpts = {}) {
    return this.paginate((t) => this.searchOrders(body, { ...opts, pageToken: t }));
  }

  async getOrders(ids: string[]): Promise<ShopOrder[]> {
    const out: ShopOrder[] = [];
    for (let i = 0; i < ids.length; i += 50) {
      const d = await this.request<{ orders?: ShopOrder[] }>("GET", "/order/202309/orders", { query: { ids: ids.slice(i, i + 50).join(",") } });
      out.push(...(d.orders ?? []));
    }
    return out;
  }

  // ───── products ─────
  async searchProducts(body: ProductSearchBody, opts?: PageOpts): Promise<SearchPage<ShopProductSummary>> {
    const d = await this.request<{ products?: ShopProductSummary[]; next_page_token?: string; total_count?: number }>(
      "POST", "/product/202309/products/search", { query: { page_size: opts?.pageSize ?? 50, page_token: opts?.pageToken }, body });
    return { items: d.products ?? [], nextPageToken: d.next_page_token ?? "", totalCount: d.total_count ?? 0 };
  }

  iterateProducts(body: ProductSearchBody, opts: PageOpts = {}) {
    return this.paginate((t) => this.searchProducts(body, { ...opts, pageToken: t }));
  }

  getProduct(productId: string): Promise<ShopProductDetail> {
    return this.request<ShopProductDetail>("GET", `/product/202309/products/${encodeURIComponent(productId)}`);
  }

  // ───── finance ─────
  async getStatements(q: StatementQuery, opts?: PageOpts): Promise<SearchPage<ShopStatement>> {
    const d = await this.request<{ statements?: ShopStatement[]; next_page_token?: string }>("GET", "/finance/202309/statements", {
      query: { ...q, sort_field: "statement_time", page_size: opts?.pageSize ?? 50, page_token: opts?.pageToken },
    });
    return { items: d.statements ?? [], nextPageToken: d.next_page_token ?? "", totalCount: 0 };
  }

  iterateStatements(q: StatementQuery) {
    return this.paginate((t) => this.getStatements(q, { pageToken: t }));
  }

  /** Per-order transactions of one statement (01 §8 — "Transactions by Statement"; item shape [CHƯA XÁC MINH]). */
  async getStatementTransactions(statementId: string, opts?: PageOpts): Promise<SearchPage<OrderStatementTransaction & { order_id: string }>> {
    const d = await this.request<{ statement_transactions?: (OrderStatementTransaction & { order_id: string })[]; next_page_token?: string; total_count?: number }>(
      "GET", `/finance/202501/statements/${encodeURIComponent(statementId)}/statement_transactions`,
      { query: { page_size: opts?.pageSize ?? 100, page_token: opts?.pageToken, sort_field: "order_create_time" } });
    return { items: d.statement_transactions ?? [], nextPageToken: d.next_page_token ?? "", totalCount: d.total_count ?? 0 };
  }

  iterateStatementTransactions(statementId: string) {
    return this.paginate((t) => this.getStatementTransactions(statementId, { pageToken: t }));
  }

  getOrderStatementTransactions(orderId: string): Promise<OrderStatementTransactionsData> {
    return this.request("GET", `/finance/202501/orders/${encodeURIComponent(orderId)}/statement_transactions`);
  }

  // ───── returns / cancellations ─────
  async searchReturns(body: ReturnSearchBody, opts?: PageOpts): Promise<SearchPage<ShopReturn>> {
    const d = await this.request<{ return_orders?: ShopReturn[]; next_page_token?: string; total_count?: number }>(
      "POST", "/return_refund/202309/returns/search", { query: { page_size: opts?.pageSize ?? 50, page_token: opts?.pageToken }, body });
    return { items: d.return_orders ?? [], nextPageToken: d.next_page_token ?? "", totalCount: d.total_count ?? 0 };
  }

  iterateReturns(body: ReturnSearchBody) {
    return this.paginate((t) => this.searchReturns(body, { pageToken: t }));
  }

  async searchCancellations(body: ReturnSearchBody, opts?: PageOpts): Promise<SearchPage<ShopCancellation>> {
    const d = await this.request<{ cancellations?: ShopCancellation[]; next_page_token?: string; total_count?: number }>(
      "POST", "/return_refund/202309/cancellations/search", { query: { page_size: opts?.pageSize ?? 50, page_token: opts?.pageToken }, body });
    return { items: d.cancellations ?? [], nextPageToken: d.next_page_token ?? "", totalCount: d.total_count ?? 0 };
  }

  iterateCancellations(body: ReturnSearchBody) {
    return this.paginate((t) => this.searchCancellations(body, { pageToken: t }));
  }

  // ───── analytics ─────
  async getShopPerformance(q: { startDateGe: string; endDateLt: string; granularity?: "ALL" | "1D" }): Promise<ShopPerformanceInterval[]> {
    const d = await this.request<{ performance?: { intervals?: ShopPerformanceInterval[] } }>("GET", "/analytics/202405/shop/performance", {
      query: { start_date_ge: q.startDateGe, end_date_lt: q.endDateLt, granularity: q.granularity ?? "1D", currency: "LOCAL" },
    });
    return d.performance?.intervals ?? [];
  }

  async getShopProductPerformance(q: { startDateGe: string; endDateLt: string }): Promise<ShopProductPerformance[]> {
    const out: ShopProductPerformance[] = [];
    let token: string | undefined;
    do {
      const d = await this.request<{ shop_products?: ShopProductPerformance[]; next_page_token?: string }>(
        "GET", "/analytics/202405/shop_products/performance",
        { query: { start_date_ge: q.startDateGe, end_date_lt: q.endDateLt, page_size: 100, page_token: token, currency: "LOCAL" } });
      out.push(...(d.shop_products ?? []));
      token = d.next_page_token || undefined;
    } while (token);
    return out;
  }
}

export { TikTokApiError };
