/**
 * Builds the three demo clients through the real API endpoints (docs/architecture/12 §8), against the mock TikTok:
 *  - Mỹ Phẩm Hoa Sen: signs in with TikTok Shop → links TikTok Ads itself → sets a password → invites a member (1 shop)
 *  - Thời Trang Mây: authorized the app from the App Store (unassigned) → DigiAds creates the org and links shop + ads for them
 *  - Đồ Chơi Bin: signs in with TikTok Shop only, no ads yet → sees "Hoàn tất kết nối"
 *  - DigiAds Mod is given one shop of Hoa Sen and the shop of Thời Trang Mây
 * Then waits for the backfill and enters sample costs. Safe to re-run.
 */
const API = (process.env.API_PUBLIC_URL ?? "http://localhost:4000") + "/api";
const MOCK = process.env.MOCK_URL ?? `http://localhost:${process.env.MOCK_TIKTOK_PORT ?? 4010}`;
const PW = "demo12345";

class Session {
  cookie = "";
  constructor(readonly label: string) {}
  async raw(path: string, init: RequestInit = {}) {
    const r = await fetch(path.startsWith("http") ? path : `${API}${path}`, {
      redirect: "manual", ...init,
      headers: { "content-type": "application/json", ...(this.cookie ? { cookie: this.cookie } : {}), ...(init.headers ?? {}) },
    });
    const set = r.headers.getSetCookie?.() ?? [];
    for (const c of set) if (c.startsWith("ecomdash_session=")) this.cookie = c.split(";")[0];
    return r;
  }
  async api<T = any>(path: string, init?: RequestInit): Promise<T> {
    const r = await this.raw(path, init);
    if (!r.ok) throw new Error(`[${this.label}] ${init?.method ?? "GET"} ${path} → ${r.status} ${await r.text()}`);
    return r.json() as Promise<T>;
  }
  post<T = any>(path: string, body: unknown = {}) {
    return this.api<T>(path, { method: "POST", body: JSON.stringify(body) });
  }
  async login(email: string, password = PW) {
    const r = await this.raw("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    return r.ok;
  }
}

const mockCode = async (q: string) => ((await (await fetch(`${MOCK}/__mock/auto-authorize?${q}`)).json()) as { code: string }).code;
const stateOf = (url: string) => new URL(url).searchParams.get("state")!;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function callback(s: Session, path: string) {
  const r = await s.raw(path);
  const loc = decodeURIComponent(r.headers.get("location") ?? "");
  if (loc.includes("error=")) throw new Error(`[${s.label}] ${path.split("?")[0]} → ${loc}`);
  return loc;
}

/** "Đăng nhập bằng TikTok Shop" as a given mock seller; returns the signed-in session. */
async function tiktokSignIn(label: string, seller: string) {
  const s = new Session(label);
  const start = await s.raw("/auth/tiktok/start");
  const state = stateOf(start.headers.get("location")!);
  const loc = await callback(s, `/connections/shop/callback?code=${await mockCode(`kind=shop&seller=${seller}`)}&state=${encodeURIComponent(state)}`);
  console.log(`✓ ${label}: đăng nhập TikTok Shop → ${loc.replace(/^https?:\/\/[^/]+/, "")}`);
  return s;
}

async function linkAds(s: Session, account: string, orgId: string) {
  const { url } = await s.api<{ url: string }>(`/connections/ads/authorize-url?orgId=${orgId}&returnTo=/onboarding`);
  const loc = await callback(s, `/connections/ads/callback?auth_code=${await mockCode(`kind=ads&account=${account}`)}&state=${encodeURIComponent(stateOf(url))}`);
  console.log(`✓ ${s.label}: gắn TikTok Ads → ${loc.split("?")[1]}`);
}

async function hoaSen(admin: Session) {
  const s = new Session("Hoa Sen");
  if (await s.login("owner@hoasen.vn")) { console.log("• Hoa Sen đã có — bỏ qua"); return; }
  const owner = await tiktokSignIn("Hoa Sen", "hoasen");
  const me = await owner.api("/me");
  const orgId = me.organizations[0].id;
  await linkAds(owner, "hoasen", orgId);
  await owner.post("/auth/password", { email: "owner@hoasen.vn", newPassword: PW });
  await owner.post(`/connections/orgs/${orgId}/onboarded`);
  const { shops } = await owner.api(`/orgs/${orgId}/members`);
  const home = shops.find((x: { name: string }) => x.name.includes("Home")) ?? shops[0];
  const inv = await owner.post(`/orgs/${orgId}/members/invitations`, { email: "nhanvien@hoasen.vn", role: "MEMBER", shopIds: [home.id] });
  const token = inv.inviteUrl.split("/invite/")[1];
  await new Session("Nhân viên").post("/auth/invitations/accept", { token, name: "Nhân viên Hoa Sen", password: PW });
  console.log(`✓ Hoa Sen: đặt mật khẩu owner@hoasen.vn, mời nhanvien@hoasen.vn (chỉ xem "${home.name}")`);
  void admin;
}

async function thoiTrangMay(admin: Session) {
  const orgs = await admin.api<{ id: string; name: string }[]>("/admin/orgs");
  if (orgs.some((o) => o.name === "Thời Trang Mây")) { console.log("• Thời Trang Mây đã có — bỏ qua"); return; }
  // 1. Seller authorized the app in the Seller Center App Store — no state, lands in the unassigned pool.
  const { url } = (await (await fetch(`${MOCK}/__mock/app-store-authorize?seller=may&follow=0`)).json()) as { url: string };
  await callback(new Session("App Store"), `/connections/shop/callback${new URL(url).search}`);
  console.log("✓ Thời Trang Mây: uỷ quyền từ App Store → kho chưa gán");
  // 2. DigiAds Business Center (agency) — sees the ad accounts clients shared with DigiAds.
  const agency = await admin.api<unknown[]>("/admin/agency");
  if (!agency.length) {
    const { url: aurl } = await admin.post<{ url: string }>("/admin/agency/authorize-url");
    const loc = await callback(admin, `/connections/ads/callback?auth_code=${await mockCode("kind=ads&account=digiads")}&state=${encodeURIComponent(stateOf(aurl))}`);
    console.log(`✓ DigiAds: kết nối Business Center agency → ${loc.split("?")[1]}`);
  }
  // 3. Admin creates the client and links shop + ads on their behalf.
  const { id } = await admin.post<{ id: string }>("/admin/orgs", { name: "Thời Trang Mây", ownerEmail: "owner@thoitrangmay.vn" });
  const pool = await admin.api("/admin/pool");
  const seller = pool.sellerAuthorizations.find((a: { sellerName: string }) => a.sellerName === "Thời Trang Mây");
  const adv = pool.advertisers.find((a: { name: string }) => a.name.startsWith("Thời Trang Mây"));
  await admin.post(`/admin/orgs/${id}/assign-seller`, { sellerAuthorizationId: seller.id });
  await admin.post(`/admin/orgs/${id}/assign-advertiser`, { advertiserId: adv.id });
  console.log("✓ Thời Trang Mây: admin tạo khách, gắn thay shop + tài khoản QC từ BC DigiAds");
}

async function doChoiBin(admin: Session) {
  const orgs = await admin.api<{ name: string }[]>("/admin/orgs");
  if (orgs.some((o) => o.name === "Đồ Chơi Bin")) { console.log("• Đồ Chơi Bin đã có — bỏ qua"); return; }
  await tiktokSignIn("Đồ Chơi Bin", "bin");
  console.log("✓ Đồ Chơi Bin: chỉ gắn TikTok Shop, chưa gắn Ads");
}

async function giveModShops(admin: Session) {
  const { staff, shops } = await admin.api("/admin/staff");
  const mod = staff.find((u: { email: string }) => u.email === "mod@digiads.vn");
  if (!mod) return;
  const pick = [shops.find((x: { name: string }) => x.name.includes("Beauty")), shops.find((x: { name: string }) => x.name.includes("Mây"))].filter(Boolean);
  await admin.api(`/admin/staff/${mod.id}`, { method: "PATCH", body: JSON.stringify({ shopIds: pick.map((x: { id: string }) => x.id) }) });
  console.log(`✓ Mod DigiAds xem: ${pick.map((x: { name: string }) => x.name).join(", ")}`);
}

async function waitForBackfill(admin: Session, orgIds: string[]) {
  for (let i = 0; i < 200; i++) {
    const all = (await Promise.all(orgIds.map((o) => admin.api<any[]>(`/sync/status?orgId=${o}`)))).flat();
    const need = ["orders", "products", "returns", "finance"];
    const done = need.every((r) => all.some((x) => x.resource === r && x.status === "OK")) && all.some((x) => x.resource === "ads_reports" && x.status === "OK");
    const failed = all.filter((x) => x.status === "ERROR");
    process.stdout.write(`\r… ${all.filter((x) => x.status === "OK").length}/${all.length} sync jobs done${failed.length ? `, ${failed.length} error` : ""}   `);
    if (done && all.every((x) => x.status !== "RUNNING" && x.status !== "IDLE")) { console.log(); return; }
    await sleep(2000);
  }
  throw new Error("Backfill did not finish in 7 minutes — check the API log");
}

async function enterCosts(admin: Session) {
  const shops = await admin.api<{ id: string; name: string; organizationId: string }[]>("/shops");
  const back = new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10);
  for (const shop of shops) {
    const skus = await admin.api<{ items: { skuId: string; salePrice: number }[] }>(`/costs/skus?shopId=${shop.id}&pageSize=500`);
    // ~80% of SKUs get a cost; the rest stay on the default % so the "missing cost" warning shows.
    const items = skus.items
      .filter((_, i) => i % 5 !== 3)
      .map((s, i) => ({ skuId: s.skuId, unitCost: Math.round((s.salePrice * (0.3 + ((i * 7) % 17) / 100)) / 1000) * 1000, effectiveFrom: back }));
    if (items.length) await admin.api("/costs/skus", { method: "PUT", body: JSON.stringify({ shopId: shop.id, items }) });
    const existing = await admin.api<unknown[]>(`/costs/items?shopId=${shop.id}`);
    if (!existing.length) {
      const big = shop.name.includes("Beauty");
      const add = (b: object) => admin.post("/costs/items", { shopId: shop.id, effectiveFrom: back, ...b });
      await add({ name: "Đóng gói + băng keo", method: "PER_ORDER", amount: 3500, appliesTo: "SHIPPED" });
      await add({ name: "Quà tặng kèm", method: "PER_ORDER", amount: 6000, appliesTo: "SUCCESS" });
      await add({ name: "Lương CSKH", method: "MONTHLY_FIXED", amount: big ? 12_000_000 : 6_000_000 });
      await add({ name: "Thuê kho", method: "MONTHLY_FIXED", amount: big ? 6_000_000 : 3_000_000 });
    }
    const reports = await admin.api<{ shopId: string }[]>(`/reports/configs?orgId=${shop.organizationId}`);
    if (!reports.some((r) => r.shopId === shop.id)) {
      await admin.post(`/reports/configs?orgId=${shop.organizationId}`, { shopId: shop.id, frequency: "weekly", dayOfWeek: 1, recipientEmail: "baocao@digiads.vn" });
    }
    console.log(`✓ ${shop.name}: giá vốn ${items.length}/${skus.items.length} SKU, chi phí tự nhập, báo cáo tuần`);
  }
}

async function waitForPnl(admin: Session) {
  const shops = await admin.api<{ id: string; name: string }[]>("/shops");
  for (let i = 0; i < 90; i++) {
    await sleep(2000);
    const sums = await Promise.all(shops.map((s) => admin.api<any>(`/pnl/summary?shopId=${s.id}`)));
    if (sums.every((s) => s.orders.paid.count > 0 && s.dataQuality.missingCostSkus < 20)) {
      for (const [i, s] of sums.entries()) {
        const roas = s.roas.real != null ? `ROAS TikTok ${s.roas.tiktok?.toFixed(2)} → thực ${s.roas.real?.toFixed(2)}` : "chưa có QC";
        console.log(`  ${shops[i].name}: ${s.orders.paid.count} đơn · doanh thu thực ${Math.round(s.kpis.realizedRevenue.value).toLocaleString("vi-VN")}₫ · ${roas} · lãi ròng ${Math.round(s.kpis.netProfit.value).toLocaleString("vi-VN")}₫`);
      }
      return;
    }
  }
}

async function main() {
  const admin = new Session("DigiAds admin");
  if (!(await admin.login("admin@digiads.vn"))) throw new Error("Không đăng nhập được admin@digiads.vn — đã chạy seed chưa? (pnpm --filter @ecomdash/database db:seed)");
  await hoaSen(admin);
  await thoiTrangMay(admin);
  await doChoiBin(admin);
  await giveModShops(admin);
  const orgs = await admin.api<{ id: string; status: { shopLinked: boolean } }[]>("/admin/orgs");
  await waitForBackfill(admin, orgs.filter((o) => o.status.shopLinked).map((o) => o.id));
  await enterCosts(admin);
  await waitForPnl(admin);
  console.log(`✓ Demo sẵn sàng → http://localhost:3000  (mật khẩu chung: ${PW})
    admin@digiads.vn     Super admin DigiAds — 3 khách, 4 shop
    mod@digiads.vn       Mod DigiAds — 2 shop của 2 khách
    owner@hoasen.vn      Chủ Hoa Sen — 2 shop
    nhanvien@hoasen.vn   Nhân viên Hoa Sen — 1 shop, chỉ xem
    Đồ Chơi Bin: "Đăng nhập bằng TikTok Shop" → chọn Đồ Chơi Bin`);
}

main().catch((e) => {
  console.error("\n✗", e.message);
  process.exit(1);
});
