import { AdsAuthClient, AdsClient, ShopAuthClient, ShopClient, SignatureError, ValidationError } from "@ecomdash/tiktok-client";
import type { AddressInfo } from "net";
import { buildApp } from "../src/app";
import { loadConfig } from "../src/config";
import { buildWorld, vnDate } from "../src/world";

const cfg = { ...loadConfig({}), historyDays: 40, scale: 0.3, accessTtlSec: 3600 };
const world = buildWorld(cfg);
const { app, state } = buildApp(world);
let base = "";

beforeAll(async () => {
  await app.listen({ port: 0, host: "127.0.0.1" });
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
afterAll(() => app.close());

async function connectShop(seller = "hoasen") {
  const auth = new ShopAuthClient({ authBaseUrl: `${base}/shop-auth`, authorizeUrl: `${base}/shop-auth/open/authorize`, serviceId: "s", appKey: cfg.appKey, appSecret: cfg.appSecret });
  const { code } = await (await fetch(`${base}/__mock/auto-authorize?kind=shop&seller=${seller}`)).json();
  return { auth, token: await auth.getToken(code) };
}

describe("TikTok Shop contract", () => {
  it("exchanges an auth code once, with absolute expiry timestamps", async () => {
    const { auth, token } = await connectShop();
    expect(token.access_token_expire_in).toBeGreaterThan(Date.now() / 1000);
    expect(token.seller_base_region).toBe("VN");
    await expect(auth.getToken("reused-or-wrong")).rejects.toBeInstanceOf(ValidationError);
  });

  it("lists shops without cipher and rejects bad signature / missing cipher", async () => {
    const { token } = await connectShop();
    const c = new ShopClient({ baseUrl: `${base}/shop`, appKey: cfg.appKey, appSecret: cfg.appSecret, accessToken: token.access_token, rps: 0 });
    const shops = await c.getAuthorizedShops();
    expect(shops.map((s) => s.region)).toEqual(["VN", "VN"]);
    expect(shops[0].cipher).toMatch(/^ROW_/);

    const bad = new ShopClient({ baseUrl: `${base}/shop`, appKey: cfg.appKey, appSecret: "wrong", accessToken: token.access_token, shopCipher: shops[0].cipher, rps: 0 });
    await expect(bad.searchOrders({})).rejects.toMatchObject({ code: 106001 });
    await expect(bad.searchOrders({})).rejects.toBeInstanceOf(SignatureError);

    const res = await c.request<unknown>("POST", "/order/202309/orders/search", { shopScoped: false, body: {} }).catch((e: any) => e) as any;
    expect(res.code).toBe(106013);
  });

  it("pages through every order in a window and matches total_count", async () => {
    const { token } = await connectShop();
    const root = new ShopClient({ baseUrl: `${base}/shop`, appKey: cfg.appKey, appSecret: cfg.appSecret, accessToken: token.access_token, rps: 0 });
    const shop = (await root.getAuthorizedShops())[0];
    const c = root.withCipher(shop.cipher);
    const ge = world.now() - 10 * 86_400;
    const first = await c.searchOrders({ create_time_ge: ge }, { pageSize: 50 });
    let n = 0;
    for await (const page of c.iterateOrders({ create_time_ge: ge }, { pageSize: 50 })) n += page.length;
    expect(n).toBe(first.totalCount);
    expect(n).toBeGreaterThan(100);
    const o = first.items[0];
    expect(typeof o.payment.total_amount).toBe("string");
    expect(o.line_items.length).toBeGreaterThan(0);
  });

  it("refreshes an expired token automatically", async () => {
    const { auth, token } = await connectShop();
    const shopCipher = world.shops[0].cipher;
    state.shopTokens.set(token.access_token, 0);
    let refreshed = "";
    const c = new ShopClient({
      baseUrl: `${base}/shop`, appKey: cfg.appKey, appSecret: cfg.appSecret, accessToken: token.access_token, shopCipher, rps: 0,
      onTokenExpired: async () => (refreshed = (await auth.refreshToken(token.refresh_token)).access_token),
    });
    const page = await c.searchProducts({}, { pageSize: 5 });
    expect(refreshed).not.toBe("");
    expect(page.items).toHaveLength(5);
  });

  it("serves finance, returns and analytics", async () => {
    const { token } = await connectShop();
    const c = new ShopClient({ baseUrl: `${base}/shop`, appKey: cfg.appKey, appSecret: cfg.appSecret, accessToken: token.access_token, shopCipher: world.shops[0].cipher, rps: 0 });
    const settled = world.ordersByShop[0].find((o) => o.settleTime && o.settleTime < world.now())!;
    const tx = await c.getOrderStatementTransactions(settled.id);
    expect(Number(tx.statement_transactions[0].settlement_amount)).toBe(settled.fees!.settlement);
    const statements = await c.getStatements({});
    expect(statements.items.length).toBeGreaterThan(0);
    let returns = 0;
    for await (const p of c.iterateReturns({})) returns += p.length;
    expect(returns).toBeGreaterThan(0);
    const today = vnDate(world.now());
    const perf = await c.getShopPerformance({ startDateGe: vnDate(world.now() - 3 * 86_400), endDateLt: today });
    expect(perf).toHaveLength(3);
  });
});

describe("Several sellers (12 §3)", () => {
  it("gives each seller its own open_id and shops; another seller's cipher is refused with 101000", async () => {
    const a = await connectShop("hoasen");
    const b = await connectShop("may");
    expect(a.token.open_id).not.toBe(b.token.open_id);
    const cb = new ShopClient({ baseUrl: `${base}/shop`, appKey: cfg.appKey, appSecret: cfg.appSecret, accessToken: b.token.access_token, rps: 0 });
    const shops = await cb.getAuthorizedShops();
    expect(shops.map((s) => s.name)).toEqual(["Thời Trang Mây Official"]);
    const cross = new ShopClient({ baseUrl: `${base}/shop`, appKey: cfg.appKey, appSecret: cfg.appSecret, accessToken: b.token.access_token, shopCipher: world.shops[0].cipher, rps: 0 });
    await expect(cross.getStatements({})).rejects.toMatchObject({ code: 101000 });
  });

  it("App Store authorization calls back without state", async () => {
    const r = await (await fetch(`${base}/__mock/app-store-authorize?seller=bin&follow=0`)).json();
    const u = new URL(r.url);
    expect(u.searchParams.get("code")).toBeTruthy();
    expect(u.searchParams.has("state")).toBe(false);
  });

  it("reports shop-side ad data: GMV Max fee per order, GMV_PAYMENT_FOR_ADS adjustment, GMV Max revenue share", async () => {
    const may = await connectShop("may");
    const cm = new ShopClient({ baseUrl: `${base}/shop`, appKey: cfg.appKey, appSecret: cfg.appSecret, accessToken: may.token.access_token, shopCipher: world.shops[2].cipher, rps: 0 });
    const settled = world.ordersByShop[2].filter((o) => o.settleTime && o.settleTime < world.now() && o.fees!.revenue > 0).slice(-1)[0];
    const tx = (await cm.getOrderStatementTransactions(settled.id)).statement_transactions[0];
    expect(Number(tx.gmv_max_ad_fee_amount)).toBeLessThan(0);
    expect(Number(tx.settlement_amount)).toBe(settled.fees!.settlement + Number(tx.gmv_max_ad_fee_amount));

    const hs = await connectShop("hoasen");
    const ch = new ShopClient({ baseUrl: `${base}/shop`, appKey: cfg.appKey, appSecret: cfg.appSecret, accessToken: hs.token.access_token, shopCipher: world.shops[0].cipher, rps: 0 });
    const st = (await ch.getStatements({})).items[0];
    const lines = (await ch.getStatementTransactions(st.id)).items;
    expect(lines.find((l) => l.type === "ADJUSTMENT")).toMatchObject({ adjustment_type: "GMV_PAYMENT_FOR_ADS" });

    const perf = await ch.getShopPerformance({ startDateGe: vnDate(world.now() - 3 * 86_400), endDateLt: vnDate(world.now()) });
    expect(perf[0].gmv_breakdowns?.map((b) => b.type)).toEqual(["GMV_MAX", "NON_GMV_MAX"]);
  });
});

describe("TikTok Ads contract", () => {
  async function connectAds(account = "hoasen") {
    const auth = new AdsAuthClient({ baseUrl: `${base}/ads/open_api/v1.3`, authorizeUrl: `${base}/ads/portal/auth`, appId: cfg.adsAppId, secret: cfg.adsSecret });
    const { code } = await (await fetch(`${base}/__mock/auto-authorize?kind=ads&account=${account}`)).json();
    const t = await auth.getAccessToken(code);
    return { auth, t, client: new AdsClient({ baseUrl: `${base}/ads/open_api/v1.3`, accessToken: t.access_token, rps: 0 }) };
  }

  it("lists advertisers, campaigns and stores", async () => {
    const { auth, t, client } = await connectAds();
    const advs = await auth.getAuthorizedAdvertisers(t.access_token);
    expect(advs).toHaveLength(2);
    const info = await client.getAdvertiserInfo(advs.map((a) => a.advertiser_id));
    expect(info[0].currency).toBe("VND");
    const camps = await client.listCampaigns(advs[0].advertiser_id);
    expect(camps.some((c) => c.campaign_type === "GMV_MAX")).toBe(true);
    const stores = await client.getGmvMaxStores(advs[1].advertiser_id);
    expect(stores.map((s) => s.store_code)).toContain(world.shops[1].code);
  });

  it("splits a 40-day report into ≤30-day calls and serves GMV Max per store", async () => {
    const { client } = await connectAds();
    const end = vnDate(world.now());
    const start = vnDate(world.now() - 39 * 86_400);
    const rows = await client.integratedReport({ advertiserId: "7301122334455667788", startDate: start, endDate: end });
    expect(rows.length).toBeGreaterThan(100);
    expect(Object.keys(rows[0].metrics)).toContain("total_complete_payment_rate");
    const gmv = await client.gmvMaxReport({ advertiserId: "7301122334455667788", storeId: world.shops[0].id, startDate: start, endDate: end });
    expect(gmv.length).toBeGreaterThan(30);
    const raw = await client.request<unknown>("GET", "/gmv_max/report/get/", { advertiser_id: "7301122334455667788", store_ids: ["a", "b"], dimensions: [], metrics: [], start_date: end, end_date: end }).catch((e: any) => e) as any;
    expect(raw.code).toBe(40002);
  });

  it("DigiAds Business Center sees the 3 accounts shared with it; a client token cannot read another client's account", async () => {
    const agency = await connectAds("digiads");
    const advs = await agency.auth.getAuthorizedAdvertisers(agency.t.access_token);
    expect(advs.map((a) => a.advertiser_name).sort()).toEqual(["Hoa Sen Beauty — Ads", "Thời Trang Mây — Ads", "Đồ Chơi Bin — Ads"]);
    const bin = await connectAds("bin");
    await expect(bin.client.listCampaigns("7301122334455667788")).rejects.toMatchObject({ code: 40300 });
  });

  it("rejects an unknown token", async () => {
    const client = new AdsClient({ baseUrl: `${base}/ads/open_api/v1.3`, accessToken: "nope", rps: 0 });
    await expect(client.getAdvertiserInfo(["1"])).rejects.toMatchObject({ code: 40105 });
  });
});
