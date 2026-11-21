import { fetchText, FetchLike, resolveFetch } from "../http";
import { classifyShopCode, errorFor } from "../errors";
import type { Envelope, TokenData } from "./types";

export interface ShopAuthOptions {
  authBaseUrl: string;   // https://auth.tiktok-shops.com
  authorizeUrl: string;  // https://services.tiktokshop.com/open/authorize
  serviceId: string;
  appKey: string;
  appSecret: string;
  fetchImpl?: FetchLike;
}

/** OAuth for TikTok Shop sellers (01 §2). The auth host is not signed. */
export class ShopAuthClient {
  private readonly fetchImpl: FetchLike;
  constructor(private readonly o: ShopAuthOptions) {
    this.fetchImpl = resolveFetch(o.fetchImpl);
  }

  buildAuthorizeUrl(state: string): string {
    return `${this.o.authorizeUrl}?${new URLSearchParams({ service_id: this.o.serviceId, state })}`;
  }

  getToken(authCode: string): Promise<TokenData> {
    return this.call("/api/v2/token/get", { auth_code: authCode, grant_type: "authorized_code" });
  }

  refreshToken(refreshToken: string): Promise<TokenData> {
    return this.call("/api/v2/token/refresh", { refresh_token: refreshToken, grant_type: "refresh_token" });
  }

  private async call(path: string, params: Record<string, string>): Promise<TokenData> {
    const q = new URLSearchParams({ app_key: this.o.appKey, app_secret: this.o.appSecret, ...params });
    const { status, text } = await fetchText(this.fetchImpl, `${this.o.authBaseUrl.replace(/\/$/, "")}${path}?${q}`, { method: "GET", headers: {} }, 30_000);
    let env: Envelope<TokenData> | undefined;
    try { env = JSON.parse(text); } catch { /* ignore */ }
    if (env && env.code === 0) return env.data;
    const code = env?.code ?? -1;
    throw errorFor(code === 36004004 ? "validation" : classifyShopCode(code), `${env?.message ?? `HTTP ${status}`} on ${path}`, code, env?.request_id, status);
  }
}
