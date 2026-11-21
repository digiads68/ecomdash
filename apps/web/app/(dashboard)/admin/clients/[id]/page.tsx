"use client";

import Link from "next/link";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { AdminOrgDetailDto, PoolDto } from "@ecomdash/shared";
import { Badge, Button, ErrorBox, Loading, Notice, PageHeader, Panel, TableWrap, Td, Th } from "@/components/ui";
import { LinkBadges, SOURCE_LABEL } from "@/components/admin";
import { apiFetch, useApi } from "@/lib/api";
import { formatDateTime, formatVNDCompact } from "@/lib/format";

const ACTION: Record<string, string> = {
  "org.created": "Tạo khách hàng", "shop.connected": "Gắn TikTok Shop", "shop.reauthorized": "Uỷ quyền lại TikTok Shop", "shop.assigned": "DigiAds gắn shop",
  "shop.unassigned": "Gỡ shop về kho", "ads.connected": "Gắn TikTok Ads", "ads.assigned": "DigiAds gắn tài khoản QC", "ads.unassigned": "Gỡ tài khoản QC về kho",
  "member.invited": "Mời thành viên", "member.updated": "Đổi quyền thành viên", "member.removed": "Xoá thành viên",
};
const ROLE: Record<string, string> = { OWNER: "Chủ", ADMIN: "Quản trị", MEMBER: "Thành viên" };

/** One client: link shops and ad accounts on their behalf, send connect links, members, audit log (12 §3.2). */
export default function ClientDetailPage({ params }: { params: { id: string } }) {
  const qc = useQueryClient();
  const d = useApi<AdminOrgDetailDto>(`/admin/orgs/${params.id}`, {}, { shop: false });
  const pool = useApi<PoolDto>("/admin/pool", {}, { shop: false });
  const [links, setLinks] = useState<{ shopUrl: string; adsUrl: string } | null>(null);
  const [msg, setMsg] = useState<{ tone: "red" | "blue"; text: string } | null>(null);
  const [q, setQ] = useState("");
  const refresh = () => qc.invalidateQueries({ predicate: (x) => String(x.queryKey[0]).startsWith("/admin") || String(x.queryKey[0]).startsWith("/shops") });
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    try { await fn(); setMsg({ tone: "blue", text: ok }); refresh(); } catch (e) { setMsg({ tone: "red", text: (e as Error).message }); }
  };
  const match = (s: string) => !q || s.toLowerCase().includes(q.toLowerCase());

  if (d.error) return <ErrorBox error={d.error} />;
  if (!d.data) return <Loading rows={4} />;
  const o = d.data;
  const sellers = (pool.data?.sellerAuthorizations ?? []).filter((a) => match(`${a.sellerName} ${a.shops.map((s) => `${s.name} ${s.code}`).join(" ")}`));
  const advs = (pool.data?.advertisers ?? []).filter((a) => match(`${a.name} ${a.tiktokAdvertiserId} ${a.stores.map((s) => s.storeName).join(" ")}`));
  const myShopIds = new Set(o.shops.map((s) => s.id));

  return (
    <>
      <PageHeader title={o.name} subtitle={<><Link href="/admin/clients" className="text-primary-600 hover:underline">Khách hàng</Link> · tạo {formatDateTime(o.createdAt)} · chủ: {o.owner ?? "chưa có"} · doanh thu thực 30 ngày {formatVNDCompact(o.realizedRevenue30d)}</>} />
      <div className="flex flex-wrap items-center gap-3"><LinkBadges s={o.status} /><span className="text-xs text-gray-500">Đồng bộ chung gần nhất: {formatDateTime(o.lastRoundAt)}</span></div>
      {msg && <Notice tone={msg.tone} title={msg.tone === "red" ? "Không thực hiện được" : "Đã xong"}>{msg.text}</Notice>}

      <div className="grid gap-3.5 lg:grid-cols-2">
        <Panel title="TikTok Shop đã gắn">
          {!o.shops.length && <p className="text-sm text-gray-500">Chưa có shop. Chọn từ kho uỷ quyền chưa gán bên dưới hoặc gửi link cho khách.</p>}
          <ul className="grid gap-1 text-sm">{o.shops.map((s) => <li key={s.id} className="flex justify-between rounded-lg bg-gray-50 px-3 py-2"><span>{s.name}</span><span className="text-xs text-gray-500">{s.code}</span></li>)}</ul>
        </Panel>
        <Panel title="TikTok Ads đã gắn">
          {!o.advertisers.length && <p className="text-sm text-gray-500">{o.status.adsMode === "NONE" ? "Khách chọn không chạy quảng cáo TikTok." : "Chưa có tài khoản quảng cáo."}</p>}
          <ul className="grid gap-1 text-sm">{o.advertisers.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2">
              <span>{a.name}<span className="block text-xs text-gray-500">{a.tiktokAdvertiserId} · {a.via.map((v) => SOURCE_LABEL[v]).join(" + ") || "không có token hoạt động"}</span></span>
              <Button size="sm" onClick={() => confirm(`Gỡ ${a.name} về kho?`) && run(() => apiFetch("/admin/unassign", { method: "POST", body: JSON.stringify({ type: "ADVERTISER", id: a.id }) }), `Đã gỡ ${a.name}`)}>Gỡ</Button>
            </li>
          ))}</ul>
        </Panel>
      </div>

      <Panel title="Gắn kết thay khách" hint="từ quyền DigiAds đang có: uỷ quyền app trên TikTok Shop và Business Center DigiAds"
        actions={<input aria-label="Tìm trong kho" placeholder="Tìm shop, mã shop, seller, tài khoản QC…" value={q} onChange={(e) => setQ(e.target.value)} className="w-64 rounded-lg border border-gray-200 px-2.5 py-1 text-sm" />}>
        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">Uỷ quyền TikTok Shop chưa gán</div>
            {!sellers.length && <p className="text-sm text-gray-500">Không có. Seller uỷ quyền app DigiAds trên Seller Center sẽ xuất hiện ở đây.</p>}
            <TableWrap>
              <tbody>{sellers.map((a) => (
                <tr key={a.id}><Td>{a.sellerName}<div className="text-xs text-gray-500">{a.shops.map((s) => s.name).join(", ")} · {SOURCE_LABEL[a.source]}</div></Td>
                  <Td><Button size="sm" variant="primary" onClick={() => run(() => apiFetch(`/admin/orgs/${o.id}/assign-seller`, { method: "POST", body: JSON.stringify({ sellerAuthorizationId: a.id }) }), `Đã gắn ${a.sellerName} (${a.shops.length} shop)`)}>Gắn</Button></Td></tr>
              ))}</tbody>
            </TableWrap>
          </div>
          <div>
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">Tài khoản QC chưa gán</div>
            {!advs.length && <p className="text-sm text-gray-500">Không có. Kết nối Business Center DigiAds ở Quản trị → Business Center để thấy tài khoản khách đã chia sẻ.</p>}
            <TableWrap>
              <tbody>{advs.map((a) => {
                const fits = a.stores.some((s) => s.matchedShopId && myShopIds.has(s.matchedShopId));
                return (
                  <tr key={a.id}><Td>{a.name}{fits && <Badge tone="green">khớp shop của khách</Badge>}<div className="text-xs text-gray-500">{a.tiktokAdvertiserId} · {a.via.map((v) => SOURCE_LABEL[v]).join(" + ")} · store: {a.stores.map((s) => s.storeName).join(", ") || "—"}</div></Td>
                    <Td><Button size="sm" variant={fits ? "primary" : "default"} onClick={() => run(() => apiFetch(`/admin/orgs/${o.id}/assign-advertiser`, { method: "POST", body: JSON.stringify({ advertiserId: a.id }) }), `Đã gắn ${a.name}`)}>Gắn</Button></Td></tr>
                );
              })}</tbody>
            </TableWrap>
          </div>
        </div>
        <div className="mt-4 border-t border-gray-100 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={async () => setLinks(await apiFetch(`/admin/orgs/${o.id}/connect-links`))}>Tạo link mời gắn kết</Button>
            <span className="text-xs text-gray-500">Khi DigiAds chưa có quyền: gửi link cho khách tự uỷ quyền thẳng vào tổ chức này (hiệu lực 7 ngày).</span>
          </div>
          {links && (
            <div className="mt-2 grid gap-1.5 text-xs">
              <label className="grid gap-0.5">TikTok Shop<input readOnly value={links.shopUrl} onFocus={(e) => e.target.select()} className="rounded border border-gray-200 px-2 py-1" /></label>
              <label className="grid gap-0.5">TikTok Ads<input readOnly value={links.adsUrl} onFocus={(e) => e.target.select()} className="rounded border border-gray-200 px-2 py-1" /></label>
            </div>
          )}
        </div>
      </Panel>

      <div className="grid gap-3.5 lg:grid-cols-2">
        <Panel title="Thành viên">
          {!o.members.length && <p className="text-sm text-gray-500">Chưa có — chủ shop sẽ được tạo khi nhận lời mời hoặc đăng nhập bằng TikTok Shop.</p>}
          <ul className="grid gap-1 text-sm">{o.members.map((m) => <li key={m.userId} className="flex justify-between rounded-lg bg-gray-50 px-3 py-2"><span>{m.name ?? m.email}<span className="block text-xs text-gray-500">{m.email ?? "TikTok"}</span></span><span className="text-xs">{ROLE[m.role]}{m.role === "MEMBER" && ` · ${m.shopIds.length} shop`}</span></li>)}</ul>
        </Panel>
        <Panel title="Nhật ký gắn kết">
          <TableWrap>
            <tbody>{o.audit.map((a) => (
              <tr key={a.id}><Td className="text-xs text-gray-500">{formatDateTime(a.createdAt)}</Td><Td>{ACTION[a.action] ?? a.action}<div className="text-xs text-gray-500">{a.actor ?? "khách / hệ thống"}</div></Td>
                <Td className="max-w-[240px] whitespace-normal text-xs text-gray-500">{[a.meta.sellerName, a.meta.name, a.meta.email, Array.isArray(a.meta.shops) ? (a.meta.shops as string[]).join(", ") : null, Array.isArray(a.meta.advertisers) ? (a.meta.advertisers as string[]).join(", ") : null].filter(Boolean).join(" · ")}</Td></tr>
            ))}</tbody>
          </TableWrap>
        </Panel>
      </div>
      {o.shops.length > 0 && (
        <Panel title="Gỡ shop">
          <p className="mb-2 text-xs text-gray-500">Gỡ cả uỷ quyền seller (mọi shop của tài khoản seller đó) về kho chưa gán. Dữ liệu vẫn giữ, khách không còn thấy.</p>
          <div className="flex flex-wrap gap-2">{(pool.data ? o.shops : []).map((s) => (
            <Button key={s.id} size="sm" onClick={async () => {
              const conn = await apiFetch<{ sellerAuthorizations: { id: string; shops: { id: string }[] }[] }>(`/connections?orgId=${o.id}`);
              const auth = conn.sellerAuthorizations.find((a) => a.shops.some((x) => x.id === s.id));
              if (auth && confirm(`Gỡ uỷ quyền chứa "${s.name}" về kho?`)) run(() => apiFetch("/admin/unassign", { method: "POST", body: JSON.stringify({ type: "SELLER", id: auth.id }) }), "Đã gỡ về kho");
            }}>Gỡ {s.name}</Button>
          ))}</div>
        </Panel>
      )}
    </>
  );
}
