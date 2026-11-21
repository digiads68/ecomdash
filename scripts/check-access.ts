/**
 * End-to-end access check against a running API after `pnpm demo:connect` (docs/architecture/12 §11):
 * each demo account sees exactly its shops, out-of-scope shops are 404, read-only roles get 403 on edits,
 * and the shop-side ad signals / common watermark are present. Exit code 1 on any failure.
 */
const API = (process.env.API_PUBLIC_URL ?? "http://localhost:4000") + "/api";
let failures = 0;
const check = (ok: boolean, label: string) => {
  console.log(`${ok ? "✓" : "✗"} ${label}`);
  if (!ok) failures++;
};

async function as(email: string) {
  const r = await fetch(`${API}/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: "demo12345" }) });
  if (!r.ok) throw new Error(`login ${email} → ${r.status}`);
  const cookie = r.headers.getSetCookie().find((c) => c.startsWith("ecomdash_session="))!.split(";")[0];
  const call = (path: string, init: RequestInit = {}) => fetch(`${API}${path}`, { ...init, headers: { "content-type": "application/json", cookie, ...(init.headers ?? {}) } });
  return { call, json: async <T = any>(path: string) => (await call(path)).json() as Promise<T> };
}

async function main() {
  const admin = await as("admin@digiads.vn");
  const mod = await as("mod@digiads.vn");
  const owner = await as("owner@hoasen.vn");
  const member = await as("nhanvien@hoasen.vn");

  const all = await admin.json<{ id: string; name: string; organizationId: string; organizationName: string }[]>("/shops");
  const byName = (s: string) => all.find((x) => x.name.includes(s))!;
  check(all.length === 4 && new Set(all.map((s) => s.organizationId)).size === 3, `Super admin: 4 shop / 3 khách (${all.length})`);
  const modShops = await mod.json<{ name: string }[]>("/shops");
  check(modShops.length === 2 && new Set(modShops.map((s: any) => s.organizationId)).size === 2, `Mod: 2 shop của 2 khách (${modShops.map((s) => s.name).join(", ")})`);
  const ownerShops = await owner.json<{ name: string }[]>("/shops");
  check(ownerShops.length === 2 && ownerShops.every((s) => s.name.startsWith("Hoa Sen")), "Chủ Hoa Sen: 2 shop Hoa Sen");
  const memberShops = await member.json<{ name: string; canEdit: boolean }[]>("/shops");
  check(memberShops.length === 1 && !memberShops[0].canEdit, `Nhân viên Hoa Sen: 1 shop, chỉ xem (${memberShops[0]?.name})`);

  const may = byName("Mây"), bin = byName("Bin"), beauty = byName("Beauty");
  check((await owner.call(`/pnl/summary?shopId=${may.id}`)).status === 404, "Chủ Hoa Sen mở shop Thời Trang Mây → 404");
  check((await member.call(`/pnl/summary?shopId=${beauty.id}`)).status === 404, "Nhân viên mở shop không được giao → 404");
  check((await mod.call(`/pnl/summary?shopId=${bin.id}`)).status === 404, "Mod mở shop không được giao → 404");
  check((await mod.call(`/pnl/summary?shopId=${may.id}`)).status === 200, "Mod mở shop được giao → 200");
  const memberShop = all.find((s) => s.name === memberShops[0].name)!;
  check((await member.call("/costs/items", { method: "POST", body: JSON.stringify({ shopId: memberShop.id, name: "x", method: "PER_ORDER", amount: 1, effectiveFrom: "2026-01-01" }) })).status === 403, "Nhân viên thêm chi phí → 403");
  check((await mod.call("/costs/items", { method: "POST", body: JSON.stringify({ shopId: may.id, name: "x", method: "PER_ORDER", amount: 1, effectiveFrom: "2026-01-01" }) })).status === 403, "Mod thêm chi phí → 403");
  check((await mod.call("/admin/orgs")).status === 403, "Mod mở trang quản trị → 403");
  check((await owner.call("/admin/pool")).status === 403, "Chủ shop mở kho chưa gán → 403");
  check((await member.call(`/orgs/${memberShop.organizationId}/members`)).status === 403, "Nhân viên quản lý thành viên → 403");

  const detail = await admin.json(`/admin/orgs/${may.organizationId}`);
  check(detail.audit.some((a: any) => a.action === "shop.assigned") && detail.audit.some((a: any) => a.action === "ads.assigned"), "Gắn thay khách Thời Trang Mây có nhật ký (shop.assigned, ads.assigned)");
  check(detail.advertisers[0]?.via.includes("AGENCY_BC"), "Tài khoản QC Thời Trang Mây đồng bộ qua BC DigiAds");
  const hs = await admin.json(`/admin/orgs/${beauty.organizationId}`);
  check(hs.advertisers.some((a: any) => a.via.includes("CLIENT") && a.via.includes("AGENCY_BC")), "Hoa Sen Beauty — Ads có 2 nguồn token (khách + BC DigiAds)");
  const binOrg = (await admin.json<any[]>("/admin/orgs")).find((o) => o.id === bin.organizationId);
  check(binOrg.status.shopLinked && !binOrg.status.adsLinked && !binOrg.status.ready, "Đồ Chơi Bin: đã gắn Shop, chưa gắn Ads → chưa sẵn sàng");

  let wm: any = {};
  for (let i = 0; i < 60 && !(wm.shopSyncedTo && wm.adsSyncedTo); i++) {
    wm = await admin.json(`/sync/watermark?orgId=${beauty.organizationId}`);
    if (!(wm.shopSyncedTo && wm.adsSyncedTo)) await new Promise((r) => setTimeout(r, 3000));
  }
  check(!!wm.shopSyncedTo && !!wm.adsSyncedTo && wm.shopOk && wm.adsOk, `Mốc đồng bộ chung Hoa Sen: shop ${wm.shopSyncedTo} · ads ${wm.adsSyncedTo} · trễ ${wm.adsLagMinutes} phút`);
  const mayQ = (await admin.json(`/pnl/summary?shopId=${may.id}`)).dataQuality;
  check(mayQ.shopGmvMaxAdFee > 0 && mayQ.gmvMaxFeeGap != null && mayQ.gmvMaxFeeGap < 0.1, `Thời Trang Mây: phí GMV Max phía Shop khớp Ads API (lệch ${(mayQ.gmvMaxFeeGap * 100).toFixed(1)}%)`);
  const hsQ = (await admin.json(`/pnl/summary?shopId=${beauty.id}`)).dataQuality;
  check(hsQ.adsPaidFromBalance > 0 && hsQ.gmvMaxRevenueShare > 0, `Hoa Sen Beauty: QC trừ số dư ${Math.round(hsQ.adsPaidFromBalance).toLocaleString("vi-VN")}₫, ${(hsQ.gmvMaxRevenueShare * 100).toFixed(0)}% doanh thu từ GMV Max`);

  console.log(failures ? `\n${failures} kiểm tra thất bại` : "\nTất cả kiểm tra quyền đều đạt");
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error("✗", e.message);
  process.exit(1);
});
