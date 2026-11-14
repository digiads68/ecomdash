/**
 * Connects the demo organisation to the mock TikTok Shop + Ads through the real OAuth endpoints of the API,
 * waits for the backfill, then enters sample costs through the public API (docs/architecture/08 §3).
 */
const API = (process.env.API_PUBLIC_URL ?? "http://localhost:4000") + "/api";
const MOCK = process.env.MOCK_URL ?? `http://localhost:${process.env.MOCK_TIKTOK_PORT ?? 4010}`;

async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${API}${path}`, { ...init, headers: { "content-type": "application/json", ...(init?.headers ?? {}) } });
  if (!r.ok) throw new Error(`${init?.method ?? "GET"} ${path} → ${r.status} ${await r.text()}`);
  return r.json() as Promise<T>;
}

async function authorize(kind: "shop" | "ads") {
  const { url } = await api<{ url: string }>(`/connections/${kind}/authorize-url`);
  const state = new URL(url).searchParams.get("state")!;
  const { code } = (await (await fetch(`${MOCK}/__mock/auto-authorize?kind=${kind}`)).json()) as { code: string };
  const cb = kind === "shop" ? `/connections/shop/callback?code=${code}&state=${encodeURIComponent(state)}` : `/connections/ads/callback?auth_code=${code}&state=${encodeURIComponent(state)}`;
  const r = await fetch(`${API}${cb}`, { redirect: "manual" });
  const loc = r.headers.get("location") ?? "";
  if (!loc.includes("connected=")) throw new Error(`${kind} callback failed: ${decodeURIComponent(loc)}`);
  console.log(`✓ connected ${kind}: ${decodeURIComponent(loc.split("?")[1])}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForBackfill() {
  const need = ["orders", "products", "returns", "finance", "ads_entities", "ads_reports"];
  for (let i = 0; i < 180; i++) {
    const s = await api<any[]>("/sync/status");
    const done = need.every((r) => s.some((x) => x.resource === r && x.status === "OK"));
    const failed = s.filter((x) => x.status === "ERROR");
    process.stdout.write(`\r… ${s.filter((x) => x.status === "OK").length}/${s.length} sync jobs done${failed.length ? `, ${failed.length} error` : ""}   `);
    if (done && s.every((x) => x.status !== "RUNNING")) { console.log(); return; }
    await sleep(2000);
  }
  throw new Error("Backfill did not finish in 6 minutes — check the API log");
}

async function enterCosts() {
  const shops = await api<{ id: string; name: string }[]>("/shops");
  const back = new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10);
  for (const shop of shops) {
    const skus = await api<{ items: { skuId: string; salePrice: number; productTitle: string }[] }>(`/costs/skus?shopId=${shop.id}&pageSize=500`);
    // ~80% of SKUs get a cost; the rest stay on the default % so the "missing cost" warning shows.
    const items = skus.items
      .filter((_, i) => i % 5 !== 3)
      .map((s, i) => ({ skuId: s.skuId, unitCost: Math.round((s.salePrice * (0.3 + ((i * 7) % 17) / 100)) / 1000) * 1000, effectiveFrom: back }));
    if (items.length) await api("/costs/skus", { method: "PUT", body: JSON.stringify({ shopId: shop.id, items }) });
    const existing = await api<unknown[]>(`/costs/items?shopId=${shop.id}`);
    if (!existing.length) {
      const add = (b: object) => api("/costs/items", { method: "POST", body: JSON.stringify({ shopId: shop.id, effectiveFrom: back, ...b }) });
      await add({ name: "Đóng gói + băng keo", method: "PER_ORDER", amount: 3500, appliesTo: "SHIPPED" });
      await add({ name: "Quà tặng kèm", method: "PER_ORDER", amount: 6000, appliesTo: "SUCCESS" });
      await add({ name: "Lương CSKH", method: "MONTHLY_FIXED", amount: shop.name.includes("Beauty") ? 12_000_000 : 6_000_000 });
      await add({ name: "Thuê kho", method: "MONTHLY_FIXED", amount: shop.name.includes("Beauty") ? 6_000_000 : 3_000_000 });
    }
    const reports = await api<{ shopId: string }[]>("/reports/configs");
    if (!reports.some((r) => r.shopId === shop.id)) {
      await api("/reports/configs", { method: "POST", body: JSON.stringify({ shopId: shop.id, frequency: "weekly", dayOfWeek: 1, recipientEmail: "demo@ecomdash.vn" }) });
    }
    console.log(`✓ ${shop.name}: giá vốn ${items.length}/${skus.items.length} SKU, chi phí tự nhập, báo cáo tuần`);
  }
}

async function waitForPnl() {
  const shops = await api<{ id: string }[]>("/shops");
  for (let i = 0; i < 90; i++) {
    await sleep(2000);
    const sums = await Promise.all(shops.map((s) => api<any>(`/pnl/summary?shopId=${s.id}`)));
    const ready = sums.every((s) => s.orders.paid.count > 0 && s.dataQuality.missingCostSkus < 20);
    if (ready) {
      for (const [i, s] of sums.entries()) {
        console.log(`  shop ${i + 1}: ${s.orders.paid.count} đơn đặt · doanh thu thực ${Math.round(s.kpis.realizedRevenue.value).toLocaleString("vi-VN")}₫ · ROAS TikTok ${s.roas.tiktok?.toFixed(2)} → thực ${s.roas.real?.toFixed(2)} (hoà vốn ${s.roas.breakEven?.toFixed(2)}) · lãi ròng ${Math.round(s.kpis.netProfit.value).toLocaleString("vi-VN")}₫`);
      }
      return;
    }
  }
}

async function main() {
  const conns = await api<any>("/connections");
  if (!conns.sellerAuthorizations.length) await authorize("shop");
  else console.log("• TikTok Shop already connected");
  if (!conns.adsAuthorizations.length) await authorize("ads");
  else console.log("• TikTok Ads already connected");
  await waitForBackfill();
  await enterCosts();
  await waitForPnl();
  console.log("✓ Demo ready → http://localhost:3000");
}

main().catch((e) => {
  console.error("\n✗", e.message);
  process.exit(1);
});
