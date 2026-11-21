"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ConnectionsDto, ShopDto, SyncStateDto, SyncWatermarkDto } from "@ecomdash/shared";
import { Badge, Button, ErrorBox, LinkTabs, Loading, Notice, PageHeader, Panel, TableWrap, Td, Th, Toggle } from "@/components/ui";
import { apiFetch, useApi, useCurrentOrgId, useShops } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

const RES: Record<string, string> = { orders: "Đơn hàng", products: "Sản phẩm", returns: "Hoàn / huỷ", finance: "Đối soát", analytics: "Analytics", ads_entities: "Chiến dịch & store", ads_reports: "Báo cáo quảng cáo" };
const AUTH: Record<string, [string, "green" | "amber" | "red"]> = { ACTIVE: ["Đang hoạt động", "green"], NEEDS_REAUTH: ["Cần uỷ quyền lại", "amber"], REVOKED: ["Đã thu hồi", "red"] };
const SYNC: Record<string, [string, "green" | "amber" | "red" | "blue" | "gray"]> = { OK: ["Thành công", "green"], RUNNING: ["Đang chạy", "blue"], ERROR: ["Lỗi", "red"], BLOCKED: ["Thiếu quyền", "amber"], IDLE: ["Chưa chạy", "gray"] };
const MATCH: Record<string, string> = { STORE_ID: "Khớp theo store_id", STORE_CODE: "Khớp theo mã shop", MANUAL: "Chọn tay" };
const SOURCE: Record<string, string> = { SELF_SIGNUP: "Khách tự gắn", APP_STORE: "Uỷ quyền từ App Store", ADMIN_LINK: "DigiAds gửi link", CLIENT: "Khách tự gắn", AGENCY_BC: "Qua Business Center DigiAds" };

function ConnectionsInner() {
  const params = useSearchParams();
  const qc = useQueryClient();
  const orgId = useCurrentOrgId();
  const c = useApi<ConnectionsDto>("/connections", {}, { shop: false, org: true, refetchInterval: 15_000 });
  const sync = useApi<SyncStateDto[]>("/sync/status", {}, { shop: false, org: true, refetchInterval: 5_000 });
  const wm = useApi<SyncWatermarkDto>("/sync/watermark", {}, { shop: false, org: true, refetchInterval: 15_000 });
  const shops = useShops();
  const orgShops = (shops.data ?? []).filter((s: ShopDto) => s.organizationId === orgId);
  const refresh = () => qc.invalidateQueries();
  const edit = !!c.data?.canEdit;

  async function connect(kind: "shop" | "ads") {
    const { url } = await apiFetch<{ url: string }>(`/connections/${kind}/authorize-url?orgId=${orgId}&returnTo=/settings/connections`);
    window.location.href = url;
  }
  const daysLeft = (iso: string) => Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
  const advertisers = (c.data?.adsAuthorizations ?? []).flatMap((a) => a.advertisers.map((v) => ({ ...v, kind: a.kind }))).reduce<(ConnectionsDto["adsAuthorizations"][number]["advertisers"][number] & { kinds: string[] })[]>((acc, v) => {
    const cur = acc.find((x) => x.id === v.id);
    if (cur) { if (!cur.kinds.includes(v.kind)) cur.kinds.push(v.kind); } else acc.push({ ...v, kinds: [v.kind] });
    return acc;
  }, []);

  return (
    <>
      <PageHeader title="Cài đặt · Kết nối" subtitle="Hai kết nối riêng: TikTok Shop (đơn, sản phẩm, đối soát) và TikTok Ads (chi phí quảng cáo) — hệ thống nhớ cả hai" />
      <LinkTabs active="/settings/connections" items={[{ href: "/settings/connections", label: "Kết nối" }, { href: "/settings/costs", label: "Chi phí" }]} />
      {params.get("connected") && <div className="rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-green-700">Đã kết nối {params.get("connected") === "shop" ? `${params.get("count")} shop` : `${params.get("count")} tài khoản quảng cáo`}{params.get("skipped") ? ` (bỏ qua ${params.get("skipped")} — đã thuộc khách khác)` : ""}. Đang đồng bộ dữ liệu…</div>}
      {params.get("error") && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">Kết nối không thành công: {params.get("error")}</div>}
      {c.data && !edit && <Notice tone="blue" title="Chế độ chỉ xem">Chỉ chủ shop, quản trị tổ chức hoặc quản trị DigiAds được thay đổi kết nối.</Notice>}
      {c.error && <ErrorBox error={c.error} />}
      {!c.data && !c.error && <Loading />}
      {c.data && (
        <>
          <div className="flex flex-wrap items-center gap-3 text-[13px] text-gray-500">
            Gói {c.data.plan.name} · {c.data.plan.usedShops} / {c.data.plan.maxShops ?? "∞"} shop
            <div className="h-2 w-40 overflow-hidden rounded-full bg-gray-100"><i className="block h-full bg-primary-500" style={{ width: `${c.data.plan.maxShops ? (c.data.plan.usedShops / c.data.plan.maxShops) * 100 : 10}%` }} /></div>
            {wm.data && <span>· Vòng đồng bộ chung: shop đến {formatDateTime(wm.data.shopSyncedTo)}, quảng cáo đến {wm.data.adsMode === "NONE" ? "— (không chạy QC)" : formatDateTime(wm.data.adsSyncedTo)}</span>}
          </div>
          <div className="grid gap-3.5 lg:grid-cols-2">
            <Panel title={<>TikTok Shop <span className="text-xs font-normal text-gray-500">· TikTok Shop Partner API</span></>} actions={edit && <Button variant="primary" size="sm" onClick={() => connect("shop")}>{c.data.status.shopLinked ? "Gắn thêm shop" : "Kết nối TikTok Shop"}</Button>}>
              {!c.data.sellerAuthorizations.length && <p className="text-sm text-gray-500">Chưa kết nối. Chủ shop uỷ quyền một lần, mỗi tài khoản Seller có thể chứa nhiều shop.</p>}
              {c.data.sellerAuthorizations.map((a) => (
                <div key={a.id} className="grid gap-2.5">
                  <div className="flex flex-wrap items-center gap-2.5"><b>{a.sellerName}</b><Badge tone={AUTH[a.status][1]}>{AUTH[a.status][0]}</Badge><Badge tone="gray" dot={false}>{SOURCE[a.source]}</Badge></div>
                  <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-[13px]">
                    <dt className="text-gray-500">Access token hết hạn</dt><dd className="text-right">{formatDateTime(a.accessExpiresAt)} · tự làm mới</dd>
                    <dt className="text-gray-500">Uỷ quyền hết hạn</dt><dd className={daysLeft(a.refreshExpiresAt) < 30 ? "text-right text-amber-700" : "text-right"}>{formatDateTime(a.refreshExpiresAt)} · còn {daysLeft(a.refreshExpiresAt)} ngày</dd>
                    <dt className="text-gray-500">Quyền đã cấp</dt><dd className="text-right text-xs">{a.grantedScopes.length} scope</dd>
                  </dl>
                  <TableWrap>
                    <thead><tr><Th>Shop</Th><Th>Mã</Th><Th>Đơn đồng bộ cuối</Th><Th>Đồng bộ</Th></tr></thead>
                    <tbody>{a.shops.map((s) => (
                      <tr key={s.id}><Td>{s.name}</Td><Td className="tabular-nums">{s.code}</Td><Td>{formatDateTime(s.lastOrderSyncAt)}</Td>
                        <Td><Toggle label={`Đồng bộ ${s.name}`} on={s.isActive} onChange={edit ? async (v) => { await apiFetch(`/connections/shops/${s.id}`, { method: "PATCH", body: JSON.stringify({ isActive: v }) }); refresh(); } : undefined} /></Td></tr>
                    ))}</tbody>
                  </TableWrap>
                </div>
              ))}
            </Panel>
            <Panel title={<>TikTok Ads <span className="text-xs font-normal text-gray-500">· TikTok for Business (Marketing API)</span></>} actions={edit && <Button variant="primary" size="sm" onClick={() => connect("ads")}>{c.data.status.adsLinked ? "Gắn thêm tài khoản" : "Kết nối TikTok Ads"}</Button>}>
              {!advertisers.length && (
                <p className="text-sm text-gray-500">
                  {c.data.status.adsMode === "NONE" ? "Tổ chức đã chọn không chạy quảng cáo TikTok." : "Chưa kết nối. Chi phí quảng cáo chỉ lấy được từ TikTok for Business; không có kết nối này ROAS và lãi ròng sẽ thiếu chi phí QC."}
                </p>
              )}
              {advertisers.length > 0 && (
                <TableWrap>
                  <thead><tr><Th>Tài khoản QC</Th><Th>Store TikTok</Th><Th>Shop</Th></tr></thead>
                  <tbody>{advertisers.flatMap((v) => (v.storeLinks.length ? v.storeLinks : [null]).map((l, i) => (
                    <tr key={`${v.id}-${l?.id ?? i}`}>
                      <Td>{v.name}<div className="text-[11px] text-gray-500">{v.currency} · {v.timezone.replace("Asia/Ho_Chi_Minh", "GMT+7")}{v.timezoneMismatch && <span className="text-amber-700"> · khác múi giờ shop</span>}</div><div className="text-[11px] text-gray-500">{v.kinds.map((k) => SOURCE[k]).join(" + ")}</div></Td>
                      <Td>{l?.storeName ?? "—"}</Td>
                      <Td>{l && (
                        <div className="flex items-center gap-2">
                          <select aria-label={`Shop cho store ${l.storeName}`} disabled={!edit} className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs disabled:bg-gray-50" value={l.shopId ?? ""}
                            onChange={async (e) => { await apiFetch(`/connections/store-links/${l.id}`, { method: "PATCH", body: JSON.stringify({ shopId: e.target.value || null }) }); refresh(); }}>
                            <option value="">— Chưa gắn shop —</option>{orgShops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                          {l.matchedBy && <Badge tone={l.matchedBy === "MANUAL" ? "blue" : "green"}>{MATCH[l.matchedBy]}</Badge>}
                        </div>
                      )}</Td>
                    </tr>
                  )))}</tbody>
                </TableWrap>
              )}
              <p className="mt-2 text-xs text-gray-500">
                Chi phí quảng cáo lấy từ TikTok for Business; số liệu QC phía TikTok Shop (phí GMV Max trừ vào đơn, tiền QC trừ số dư) chỉ dùng để đối chiếu, không cộng thêm.
                Một tài khoản có thể đồng bộ qua token của khách hoặc qua Business Center DigiAds — token của khách được ưu tiên.
              </p>
            </Panel>
          </div>
          <Panel title="Tình trạng đồng bộ">
            <TableWrap>
              <thead><tr><Th>Phạm vi</Th><Th>Dữ liệu</Th><Th>Thành công cuối</Th><Th>Trạng thái</Th><Th right>Bản ghi lần cuối</Th><Th>Chi tiết</Th><Th /></tr></thead>
              <tbody>{(sync.data ?? []).map((s) => (
                <tr key={s.id}><Td>{s.scopeName}</Td><Td>{RES[s.resource] ?? s.resource}</Td><Td>{formatDateTime(s.lastSuccessAt)}</Td><Td><Badge tone={SYNC[s.status][1]}>{SYNC[s.status][0]}</Badge></Td>
                  <Td right>{s.itemsLastRun}</Td><Td className="max-w-[320px] whitespace-normal text-xs text-gray-500">{s.lastError ?? s.lastWarning ?? ""}</Td>
                  <Td>{edit && <Button size="sm" onClick={async () => { await apiFetch("/sync/run", { method: "POST", body: JSON.stringify({ scopeType: s.scopeType, scopeId: s.scopeId, resource: s.resource }) }); refresh(); }}>Đồng bộ ngay</Button>}</Td></tr>
              ))}</tbody>
            </TableWrap>
          </Panel>
        </>
      )}
    </>
  );
}

export default function ConnectionsPage() {
  return <Suspense fallback={<Loading />}><ConnectionsInner /></Suspense>;
}
