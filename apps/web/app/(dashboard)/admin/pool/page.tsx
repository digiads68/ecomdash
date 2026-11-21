"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { AdminOrgRowDto, PoolDto } from "@ecomdash/shared";
import { Badge, Button, ErrorBox, Loading, Notice, PageHeader, Panel, TableWrap, Td, Th } from "@/components/ui";
import { SOURCE_LABEL } from "@/components/admin";
import { apiFetch, useApi } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

/** Authorizations DigiAds holds that no client organisation owns yet (12 §3.2). */
export default function PoolPage() {
  const qc = useQueryClient();
  const pool = useApi<PoolDto>("/admin/pool", {}, { shop: false, refetchInterval: 30_000 });
  const orgs = useApi<AdminOrgRowDto[]>("/admin/orgs", {}, { shop: false });
  const [target, setTarget] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: "red" | "blue"; text: string } | null>(null);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    try { await fn(); setMsg({ tone: "blue", text: ok }); qc.invalidateQueries(); } catch (e) { setMsg({ tone: "red", text: (e as Error).message }); }
  };
  const orgName = (id: string | null) => orgs.data?.find((o) => o.id === id)?.name;
  const picker = (key: string, suggested?: string | null) => (
    <select aria-label="Chọn khách" value={target[key] ?? suggested ?? ""} onChange={(e) => setTarget({ ...target, [key]: e.target.value })} className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs">
      <option value="">— Chọn khách —</option>{orgs.data?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  );

  return (
    <>
      <PageHeader title="Quản trị · Uỷ quyền chưa gán" subtitle="Shop đã uỷ quyền app DigiAds (kể cả từ App Store) và tài khoản QC thấy qua Business Center DigiAds, chưa thuộc khách nào" />
      {msg && <Notice tone={msg.tone} title={msg.tone === "red" ? "Không thực hiện được" : "Đã gắn"}>{msg.text}</Notice>}
      {pool.error && <ErrorBox error={pool.error} />}
      {!pool.data && !pool.error && <Loading />}
      {pool.data && (
        <>
          <Panel title={`TikTok Shop · ${pool.data.sellerAuthorizations.length} uỷ quyền`}>
            {!pool.data.sellerAuthorizations.length && <p className="text-sm text-gray-500">Không có uỷ quyền nào đang chờ.</p>}
            {pool.data.sellerAuthorizations.length > 0 && (
              <TableWrap>
                <thead><tr><Th>Seller</Th><Th>Shop</Th><Th>Nguồn</Th><Th>Nhận lúc</Th><Th>Gắn vào khách</Th></tr></thead>
                <tbody>{pool.data.sellerAuthorizations.map((a) => (
                  <tr key={a.id}><Td>{a.sellerName}</Td><Td className="whitespace-normal">{a.shops.map((s) => `${s.name} (${s.code})`).join(", ")}</Td><Td><Badge tone={a.source === "APP_STORE" ? "amber" : "gray"}>{SOURCE_LABEL[a.source]}</Badge></Td>
                    <Td>{formatDateTime(a.createdAt)}</Td>
                    <Td><div className="flex items-center gap-2">{picker(a.id)}<Button size="sm" variant="primary" disabled={!target[a.id]} onClick={() => run(() => apiFetch(`/admin/orgs/${target[a.id]}/assign-seller`, { method: "POST", body: JSON.stringify({ sellerAuthorizationId: a.id }) }), `${a.sellerName} → ${orgName(target[a.id])}`)}>Gắn</Button></div></Td></tr>
                ))}</tbody>
              </TableWrap>
            )}
          </Panel>
          <Panel title={`TikTok Ads · ${pool.data.advertisers.length} tài khoản`}>
            {!pool.data.advertisers.length && <p className="text-sm text-gray-500">Không có tài khoản QC nào đang chờ.</p>}
            {pool.data.advertisers.length > 0 && (
              <TableWrap>
                <thead><tr><Th>Tài khoản QC</Th><Th>Nguồn token</Th><Th>Store TikTok</Th><Th>Gắn vào khách</Th></tr></thead>
                <tbody>{pool.data.advertisers.map((a) => {
                  const suggested = a.stores.find((s) => s.matchedOrgId)?.matchedOrgId ?? null;
                  const key = `adv-${a.id}`;
                  const chosen = target[key] ?? suggested ?? "";
                  return (
                    <tr key={a.id}><Td>{a.name}<div className="text-xs text-gray-500">{a.tiktokAdvertiserId} · {a.currency}</div></Td><Td className="text-xs">{a.via.map((v) => SOURCE_LABEL[v]).join(" + ")}</Td>
                      <Td className="whitespace-normal text-xs">{a.stores.map((s) => <div key={s.storeId}>{s.storeName}{s.matchedOrgId && <span className="text-green-700"> → {orgName(s.matchedOrgId)}</span>}</div>)}</Td>
                      <Td><div className="flex items-center gap-2">{picker(key, suggested)}<Button size="sm" variant="primary" disabled={!chosen} onClick={() => run(() => apiFetch(`/admin/orgs/${chosen}/assign-advertiser`, { method: "POST", body: JSON.stringify({ advertiserId: a.id }) }), `${a.name} → ${orgName(chosen)}`)}>Gắn</Button></div></Td></tr>
                  );
                })}</tbody>
              </TableWrap>
            )}
          </Panel>
        </>
      )}
    </>
  );
}
