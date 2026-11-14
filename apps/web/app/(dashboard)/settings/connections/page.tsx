"use client";

import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import type { ConnectionsDto, ShopDto, SyncStateDto } from "@ecomdash/shared";
import { Badge, Button, ErrorBox, LinkTabs, Loading, PageHeader, Panel, TableWrap, Td, Th, Toggle } from "@/components/ui";
import { useApi, useApiFetch } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";

const RES: Record<string, string> = { orders: "Đơn hàng", products: "Sản phẩm", returns: "Hoàn / huỷ", finance: "Đối soát", analytics: "Analytics", ads_entities: "Chiến dịch & store", ads_reports: "Báo cáo quảng cáo" };
const AUTH: Record<string, [string, "green" | "amber" | "red"]> = { ACTIVE: ["Đang hoạt động", "green"], NEEDS_REAUTH: ["Cần uỷ quyền lại", "amber"], REVOKED: ["Đã thu hồi", "red"] };
const SYNC: Record<string, [string, "green" | "amber" | "red" | "blue" | "gray"]> = { OK: ["Thành công", "green"], RUNNING: ["Đang chạy", "blue"], ERROR: ["Lỗi", "red"], BLOCKED: ["Thiếu quyền", "amber"], IDLE: ["Chưa chạy", "gray"] };
const MATCH: Record<string, string> = { STORE_ID: "Khớp theo store_id", STORE_CODE: "Khớp theo mã shop", MANUAL: "Chọn tay" };

function ConnectionsInner() {
  const params = useSearchParams();
  const f = useApiFetch();
  const qc = useQueryClient();
  const c = useApi<ConnectionsDto>("/connections", {}, { shop: false, refetchInterval: 15_000 });
  const sync = useApi<SyncStateDto[]>("/sync/status", {}, { shop: false, refetchInterval: 5_000 });
  const shops = useApi<ShopDto[]>("/shops", {}, { shop: false });
  const refresh = () => qc.invalidateQueries();

  async function connect(kind: "shop" | "ads") {
    const { url } = await f<{ url: string }>(`/connections/${kind}/authorize-url`);
    window.location.href = url;
  }
  const daysLeft = (iso: string) => Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);

  return (
    <>
      <PageHeader title="Cài đặt · Kết nối" subtitle="Uỷ quyền TikTok Shop, tài khoản quảng cáo và tình trạng đồng bộ"
        actions={<><Button onClick={() => connect("ads")}>Kết nối TikTok Ads</Button><Button variant="primary" onClick={() => connect("shop")}>Kết nối TikTok Shop</Button></>} />
      <LinkTabs active="/settings/connections" items={[{ href: "/settings/connections", label: "Kết nối" }, { href: "/settings/costs", label: "Chi phí" }]} />
      {params.get("connected") && <div className="rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-green-700">Đã kết nối {params.get("connected") === "shop" ? `${params.get("count")} shop` : `${params.get("count")} tài khoản quảng cáo`}. Đang đồng bộ dữ liệu 60 ngày gần nhất…</div>}
      {params.get("error") && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700">Kết nối không thành công: {params.get("error")}</div>}
      {c.error && <ErrorBox error={c.error} />}
      {!c.data && !c.error && <Loading />}
      {c.data && (
        <>
          <div className="flex items-center gap-3 text-[13px] text-gray-500">
            Gói {c.data.plan.name} · {c.data.plan.usedShops} / {c.data.plan.maxShops ?? "∞"} shop
            <div className="h-2 w-40 overflow-hidden rounded-full bg-gray-100"><i className="block h-full bg-primary-500" style={{ width: `${c.data.plan.maxShops ? (c.data.plan.usedShops / c.data.plan.maxShops) * 100 : 10}%` }} /></div>
          </div>
          <div className="grid gap-3.5 lg:grid-cols-2">
            <Panel title="TikTok Shop">
              {!c.data.sellerAuthorizations.length && <p className="text-sm text-gray-500">Chưa kết nối. Bấm "Kết nối TikTok Shop" để uỷ quyền.</p>}
              {c.data.sellerAuthorizations.map((a) => (
                <div key={a.id} className="grid gap-2.5">
                  <div className="flex flex-wrap items-center gap-2.5"><b>{a.sellerName}</b><Badge tone={AUTH[a.status][1]}>{AUTH[a.status][0]}</Badge></div>
                  <dl className="grid grid-cols-[1fr_auto] gap-y-1 text-[13px]">
                    <dt className="text-gray-500">Access token hết hạn</dt><dd className="text-right">{formatDateTime(a.accessExpiresAt)} · tự làm mới</dd>
                    <dt className="text-gray-500">Uỷ quyền hết hạn</dt><dd className={daysLeft(a.refreshExpiresAt) < 30 ? "text-right text-amber-700" : "text-right"}>{formatDateTime(a.refreshExpiresAt)} · còn {daysLeft(a.refreshExpiresAt)} ngày</dd>
                    <dt className="text-gray-500">Quyền đã cấp</dt><dd className="text-right text-xs">{a.grantedScopes.length} scope</dd>
                  </dl>
                  <TableWrap>
                    <thead><tr><Th>Shop</Th><Th>Mã</Th><Th>Đơn đồng bộ cuối</Th><Th>Đồng bộ</Th></tr></thead>
                    <tbody>{a.shops.map((s) => (
                      <tr key={s.id}><Td>{s.name}</Td><Td className="tabular-nums">{s.code}</Td><Td>{formatDateTime(s.lastOrderSyncAt)}</Td>
                        <Td><Toggle label={`Đồng bộ ${s.name}`} on={s.isActive} onChange={async (v) => { await f(`/connections/shops/${s.id}`, { method: "PATCH", body: JSON.stringify({ isActive: v }) }); refresh(); }} /></Td></tr>
                    ))}</tbody>
                  </TableWrap>
                </div>
              ))}
            </Panel>
            <Panel title="TikTok Ads">
              {!c.data.adsAuthorizations.length && <p className="text-sm text-gray-500">Chưa kết nối. Bấm "Kết nối TikTok Ads" để uỷ quyền qua TikTok for Business.</p>}
              {c.data.adsAuthorizations.flatMap((a) => a.advertisers).length > 0 && (
                <TableWrap>
                  <thead><tr><Th>Tài khoản QC</Th><Th>Tiền tệ</Th><Th>Store TikTok</Th><Th>Shop</Th></tr></thead>
                  <tbody>{c.data.adsAuthorizations.flatMap((a) => a.advertisers).flatMap((v) => (v.storeLinks.length ? v.storeLinks : [null]).map((l, i) => (
                    <tr key={`${v.id}-${l?.id ?? i}`}>
                      <Td>{v.name}</Td><Td>{v.currency} · {v.timezone.replace("Asia/Ho_Chi_Minh", "GMT+7")}</Td><Td>{l?.storeName ?? "—"}</Td>
                      <Td>{l && (
                        <div className="flex items-center gap-2">
                          <select aria-label={`Shop cho store ${l.storeName}`} className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs" value={l.shopId ?? ""}
                            onChange={async (e) => { await f(`/connections/store-links/${l.id}`, { method: "PATCH", body: JSON.stringify({ shopId: e.target.value || null }) }); refresh(); }}>
                            <option value="">— Chưa gắn shop —</option>{shops.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                          {l.matchedBy && <Badge tone={l.matchedBy === "MANUAL" ? "blue" : "green"}>{MATCH[l.matchedBy]}</Badge>}
                        </div>
                      )}</Td>
                    </tr>
                  )))}</tbody>
                </TableWrap>
              )}
              <p className="mt-2 text-xs text-gray-500">Token quảng cáo không hết hạn theo thời gian. Store chưa khớp tự động thì chọn shop bằng tay — chi phí quảng cáo của store đó sẽ được tính vào lãi lỗ của shop đã chọn.</p>
            </Panel>
          </div>
          <Panel title="Tình trạng đồng bộ">
            <TableWrap>
              <thead><tr><Th>Phạm vi</Th><Th>Dữ liệu</Th><Th>Thành công cuối</Th><Th>Trạng thái</Th><Th right>Bản ghi lần cuối</Th><Th>Chi tiết</Th><Th /></tr></thead>
              <tbody>{(sync.data ?? []).map((s) => (
                <tr key={s.id}><Td>{s.scopeName}</Td><Td>{RES[s.resource] ?? s.resource}</Td><Td>{formatDateTime(s.lastSuccessAt)}</Td><Td><Badge tone={SYNC[s.status][1]}>{SYNC[s.status][0]}</Badge></Td>
                  <Td right>{s.itemsLastRun}</Td><Td className="max-w-[320px] whitespace-normal text-xs text-gray-500">{s.lastError ?? s.lastWarning ?? ""}</Td>
                  <Td><Button size="sm" onClick={async () => { await f("/sync/run", { method: "POST", body: JSON.stringify({ scopeType: s.scopeType, scopeId: s.scopeId, resource: s.resource }) }); refresh(); }}>Đồng bộ ngay</Button></Td></tr>
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
