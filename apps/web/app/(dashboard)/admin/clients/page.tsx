"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { AdminOrgRowDto } from "@ecomdash/shared";
import { Button, ErrorBox, Loading, Notice, PageHeader, Panel, TableWrap, Td, Th } from "@/components/ui";
import { apiFetch, useApi } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import { LinkBadges } from "@/components/admin";
import { formatDateTime, formatVNDCompact } from "@/lib/format";

/** Every client organisation for DigiAds managers (12 §7). */
export default function ClientsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const setShopId = useAppStore((s) => s.setShopId);
  const orgs = useApi<AdminOrgRowDto[]>("/admin/orgs", {}, { shop: false });
  const [q, setQ] = useState("");
  const [name, setName] = useState("");
  const [owner, setOwner] = useState("");
  const [err, setErr] = useState("");
  const rows = (orgs.data ?? []).filter((o) => !q || `${o.name} ${o.owner ?? ""} ${o.shops.map((s) => `${s.name} ${s.code}`).join(" ")}`.toLowerCase().includes(q.toLowerCase()));

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      const r = await apiFetch<{ id: string }>("/admin/orgs", { method: "POST", body: JSON.stringify({ name, ownerEmail: owner || undefined }) });
      qc.invalidateQueries({ predicate: (x) => String(x.queryKey[0]).startsWith("/admin") });
      router.push(`/admin/clients/${r.id}`);
    } catch (e2) {
      setErr((e2 as Error).message);
    }
  }

  return (
    <>
      <PageHeader title="Quản trị · Khách hàng" subtitle="Mọi tổ chức khách, trạng thái gắn TikTok Shop + TikTok Ads và vòng đồng bộ gần nhất" />
      {orgs.error && <ErrorBox error={orgs.error} />}
      {!orgs.data && !orgs.error && <Loading />}
      {orgs.data && (
        <Panel title={`${orgs.data.length} khách hàng`} actions={<input aria-label="Tìm khách" placeholder="Tìm tên khách, shop, mã shop…" value={q} onChange={(e) => setQ(e.target.value)} className="w-56 rounded-lg border border-gray-200 px-2.5 py-1 text-sm" />}>
          <TableWrap>
            <thead><tr><Th>Khách hàng</Th><Th>Gắn kết</Th><Th>Shop</Th><Th>Uỷ quyền hết hạn</Th><Th>Đồng bộ chung</Th><Th right>Doanh thu thực 30 ngày</Th><Th /></tr></thead>
            <tbody>{rows.map((o) => (
              <tr key={o.id} className="hover:bg-gray-50">
                <Td><Link href={`/admin/clients/${o.id}`} className="font-medium text-primary-700 hover:underline">{o.name}</Link><div className="text-xs text-gray-500">{o.owner ?? "chưa có chủ"}</div></Td>
                <Td><LinkBadges s={o.status} /></Td>
                <Td className="whitespace-normal text-xs">{o.shops.map((s) => s.name).join(", ") || "—"}</Td>
                <Td>{formatDateTime(o.authExpiresAt)}</Td>
                <Td>{formatDateTime(o.lastRoundAt)}</Td>
                <Td right>{formatVNDCompact(o.realizedRevenue30d)}</Td>
                <Td>{o.shops[0] && <Button size="sm" onClick={() => { setShopId(o.shops[0].id); router.push("/dashboard"); }}>Xem như khách</Button>}</Td>
              </tr>
            ))}</tbody>
          </TableWrap>
        </Panel>
      )}
      <Panel title="Tạo khách hàng mới" hint="khi khách chưa tự đăng nhập — sau đó gắn thay shop + tài khoản QC">
        <form onSubmit={create} className="flex flex-wrap items-center gap-2 text-sm">
          <input id="new-org-name" required placeholder="Tên khách / thương hiệu" value={name} onChange={(e) => setName(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-1.5" />
          <input id="new-org-owner" type="email" placeholder="Email chủ shop (gửi lời mời)" value={owner} onChange={(e) => setOwner(e.target.value)} className="w-64 rounded-lg border border-gray-200 px-3 py-1.5" />
          <Button variant="primary">Tạo khách hàng</Button>
        </form>
        {err && <div className="mt-2"><Notice tone="red" title="Không tạo được">{err}</Notice></div>}
      </Panel>
    </>
  );
}
