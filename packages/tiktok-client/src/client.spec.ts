import { createHmac } from "crypto";
import { signShopRequest, signWebhook, verifyWebhookSignature } from "./shop/sign";
import { ShopClient } from "./shop/client";
import { AdsClient, chunkDateRange } from "./ads/client";
import { RateLimitError, SignatureError, TokenExpiredError } from "./errors";
import type { FetchLike } from "./http";

describe("signShopRequest", () => {
  it("sorts keys, skips sign/access_token, appends body, wraps in secret", () => {
    const query = { timestamp: "1700000000", app_key: "k", shop_cipher: "ROW_x", sign: "ignored", access_token: "ignored", page_size: "50" };
    const body = '{"update_time_ge":1}';
    const expectedInput = "s" + "/order/202309/orders/search" + "app_keyk" + "page_size50" + "shop_cipherROW_x" + "timestamp1700000000" + body + "s";
    const expected = createHmac("sha256", "s").update(expectedInput).digest("hex");
    expect(signShopRequest({ path: "/order/202309/orders/search", query, body, appSecret: "s" })).toBe(expected);
  });
  it("is stable for a fixed vector", () => {
    expect(signShopRequest({ path: "/authorization/202309/shops", query: { app_key: "mock_app_key", timestamp: "1731500000" }, appSecret: "mock_app_secret" }))
      .toBe(createHmac("sha256", "mock_app_secret").update("mock_app_secret/authorization/202309/shopsapp_keymock_app_keytimestamp1731500000mock_app_secret").digest("hex"));
  });
});

describe("webhook signature", () => {
  it("accepts the right header and rejects tampering", () => {
    const body = '{"type":1}';
    const h = signWebhook("k", "s", body);
    expect(verifyWebhookSignature("k", "s", body, h)).toBe(true);
    expect(verifyWebhookSignature("k", "s", body + " ", h)).toBe(false);
    expect(verifyWebhookSignature("k", "s", body, undefined)).toBe(false);
  });
});

describe("chunkDateRange", () => {
  it("splits into ≤30-day inclusive chunks", () => {
    expect(chunkDateRange("2026-10-01", "2026-11-14")).toEqual([["2026-10-01", "2026-10-30"], ["2026-10-31", "2026-11-14"]]);
    expect(chunkDateRange("2026-11-14", "2026-11-14")).toEqual([["2026-11-14", "2026-11-14"]]);
  });
});

function fakeFetch(responses: { status?: number; body: unknown }[], calls: { url: string; headers: Record<string, string> }[]): FetchLike {
  return async (url, init) => {
    calls.push({ url, headers: init?.headers ?? {} });
    const r = responses.shift()!;
    return { status: r.status ?? 200, text: async () => JSON.stringify(r.body) };
  };
}
const ok = (data: unknown) => ({ body: { code: 0, message: "Success", request_id: "r", data } });
const noSleep = async () => {};

describe("ShopClient", () => {
  const base = { baseUrl: "http://mock/shop", appKey: "k", appSecret: "s", accessToken: "t1", rps: 0, sleep: noSleep };

  it("requires shop_cipher for shop-scoped calls but not for authorization", async () => {
    const calls: any[] = [];
    const c = new ShopClient({ ...base, fetchImpl: fakeFetch([ok({ shops: [{ id: "1" }] })], calls) });
    await expect(c.searchOrders({})).rejects.toThrow(/shop_cipher/);
    expect(await c.getAuthorizedShops()).toEqual([{ id: "1" }]);
    expect(calls[0].url).not.toContain("shop_cipher");
    expect(calls[0].headers["x-tts-access-token"]).toBe("t1");
  });

  it("refreshes once on 105002 and retries with the new token", async () => {
    const calls: any[] = [];
    const onTokenExpired = jest.fn(async () => "t2");
    const c = new ShopClient({ ...base, shopCipher: "ROW_a", onTokenExpired, fetchImpl: fakeFetch([
      { body: { code: 105002, message: "expired", request_id: "r" } }, ok({ orders: [], next_page_token: "" })], calls) });
    await c.searchOrders({});
    expect(onTokenExpired).toHaveBeenCalledTimes(1);
    expect(calls[1].headers["x-tts-access-token"]).toBe("t2");
  });

  it("throws TokenExpiredError if the refreshed token is also rejected", async () => {
    const c = new ShopClient({ ...base, shopCipher: "ROW_a", onTokenExpired: async () => "t2", fetchImpl: fakeFetch([
      { body: { code: 105002, message: "expired" } }, { body: { code: 105002, message: "expired" } }], []) });
    await expect(c.searchOrders({})).rejects.toBeInstanceOf(TokenExpiredError);
  });

  it("backs off on 36009002 then gives up with RateLimitError", async () => {
    const sleeps: number[] = [];
    const c = new ShopClient({ ...base, shopCipher: "ROW_a", maxRetries: 2, sleep: async (ms) => { sleeps.push(ms); }, fetchImpl: fakeFetch([
      { body: { code: 36009002, message: "too many" } }, { body: { code: 36009002, message: "too many" } }, { body: { code: 36009002, message: "too many" } }], []) });
    await expect(c.searchOrders({})).rejects.toBeInstanceOf(RateLimitError);
    expect(sleeps).toEqual([1000, 2000]);
  });

  it("does not retry signature errors", async () => {
    const calls: any[] = [];
    const c = new ShopClient({ ...base, shopCipher: "ROW_a", fetchImpl: fakeFetch([{ body: { code: 106001, message: "bad sign" } }], calls) });
    await expect(c.searchOrders({})).rejects.toBeInstanceOf(SignatureError);
    expect(calls).toHaveLength(1);
  });

  it("iterates all pages", async () => {
    const c = new ShopClient({ ...base, shopCipher: "ROW_a", fetchImpl: fakeFetch([
      ok({ orders: [{ id: "1" }], next_page_token: "p2", total_count: 2 }), ok({ orders: [{ id: "2" }], next_page_token: "" })], []) });
    const ids: string[] = [];
    for await (const page of c.iterateOrders({})) ids.push(...page.map((o) => o.id));
    expect(ids).toEqual(["1", "2"]);
  });
});

describe("AdsClient", () => {
  it("sends Access-Token, JSON-encodes arrays and walks pages per chunk", async () => {
    const calls: any[] = [];
    const page = (n: number, total: number) => ok({ list: [{ dimensions: { campaign_id: "c" }, metrics: { spend: "1" } }], page_info: { page: n, page_size: 1000, total_number: total, total_page: total } });
    const c = new AdsClient({ baseUrl: "http://mock/ads/open_api/v1.3", accessToken: "a", rps: 0, sleep: noSleep,
      fetchImpl: fakeFetch([page(1, 2), page(2, 2), page(1, 1)], calls) });
    const rows = await c.integratedReport({ advertiserId: "adv", startDate: "2026-10-01", endDate: "2026-11-14" });
    expect(rows).toHaveLength(3);
    expect(calls[0].headers["Access-Token"]).toBe("a");
    expect(decodeURIComponent(calls[0].url)).toContain('dimensions=["campaign_id","stat_time_day"]');
    expect(decodeURIComponent(calls[2].url)).toContain("start_date=2026-10-31");
  });
});
