"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { MembersDto } from "@ecomdash/shared";
import { Badge, Button, ErrorBox, Loading, Notice, PageHeader, Panel, TableWrap, Td, Th } from "@/components/ui";
import { apiFetch, useApi, useCurrentOrgId, useMe } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

const ROLE: Record<string, string> = { OWNER: "Chủ", ADMIN: "Quản trị", MEMBER: "Thành viên" };

/** Members of the current client organisation and the shops each one may see (12 §2). */
export default function MembersPage() {
  const orgId = useCurrentOrgId();
  const me = useMe();
  const qc = useQueryClient();
  const m = useApi<MembersDto>(`/orgs/${orgId}/members`, {}, { shop: false, enabled: !!orgId });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"MEMBER" | "ADMIN">("MEMBER");
  const [shopIds, setShopIds] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ tone: "red" | "blue"; text: React.ReactNode } | null>(null);
  const refresh = () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).startsWith("/orgs/") });
  const orgName = me.data?.organizations.find((o) => o.id === orgId)?.name;

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      const inv = await apiFetch<{ inviteUrl?: string }>(`/orgs/${orgId}/members/invitations`, { method: "POST", body: JSON.stringify({ email, role, shopIds }) });
      setMsg({ tone: "blue", text: <>Đã gửi lời mời tới <b>{email}</b>. Link (hiệu lực 7 ngày): <code className="break-all text-xs">{inv.inviteUrl}</code></> });
      setEmail("");
      setShopIds([]);
      refresh();
    } catch (err) {
      setMsg({ tone: "red", text: (err as Error).message });
    }
  }
  const act = async (fn: () => Promise<unknown>) => { try { await fn(); refresh(); } catch (err) { setMsg({ tone: "red", text: (err as Error).message }); } };
  const toggleShop = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  return (
    <>
      <PageHeader title="Cài đặt · Thành viên" subtitle={`Mời nhân viên của ${orgName ?? "tổ chức"} và chọn shop mỗi người được xem`} />
      {m.error && <ErrorBox error={m.error} />}
      {!m.data && !m.error && <Loading />}
      {msg && <Notice tone={msg.tone} title={msg.tone === "red" ? "Không thực hiện được" : "Đã mời"}>{msg.text}</Notice>}
      {m.data && (
        <>
          <Panel title="Thành viên">
            <TableWrap>
              <thead><tr><Th>Người dùng</Th><Th>Vai trò</Th><Th>Shop được xem</Th><Th>Đăng nhập cuối</Th><Th /></tr></thead>
              <tbody>{m.data.members.map((u) => (
                <tr key={u.userId}>
                  <Td>{u.name ?? "—"}<div className="text-xs text-gray-500">{u.email ?? "Đăng nhập bằng TikTok"}</div></Td>
                  <Td>
                    {u.role === "OWNER" ? <Badge tone="blue">Chủ</Badge> : (
                      <select aria-label={`Vai trò ${u.email}`} value={u.role} className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs"
                        onChange={(e) => act(() => apiFetch(`/orgs/${orgId}/members/${u.userId}`, { method: "PATCH", body: JSON.stringify({ role: e.target.value }) }))}>
                        <option value="ADMIN">Quản trị (mọi shop, sửa được)</option><option value="MEMBER">Thành viên (chỉ xem shop được giao)</option>
                      </select>
                    )}
                  </Td>
                  <Td className="whitespace-normal">
                    {u.role === "MEMBER" ? (
                      <div className="flex flex-wrap gap-1.5">
                        {m.data!.shops.map((s) => (
                          <label key={s.id} className="flex items-center gap-1 rounded-full border border-gray-200 px-2 py-0.5 text-xs">
                            <input type="checkbox" checked={u.shopIds.includes(s.id)} onChange={() => act(() => apiFetch(`/orgs/${orgId}/members/${u.userId}`, { method: "PATCH", body: JSON.stringify({ shopIds: toggleShop(u.shopIds, s.id) }) }))} />
                            {s.name}
                          </label>
                        ))}
                      </div>
                    ) : <span className="text-xs text-gray-500">Tất cả shop</span>}
                  </Td>
                  <Td>{formatDateTime(u.lastLoginAt)}</Td>
                  <Td>{u.role !== "OWNER" && u.userId !== me.data?.user.id && <Button size="sm" onClick={() => confirm(`Xoá ${u.email ?? u.name} khỏi tổ chức?`) && act(() => apiFetch(`/orgs/${orgId}/members/${u.userId}`, { method: "DELETE" }))}>Xoá</Button>}</Td>
                </tr>
              ))}</tbody>
            </TableWrap>
          </Panel>
          <div className="grid gap-3.5 lg:grid-cols-2">
            <Panel title="Mời thành viên">
              <form onSubmit={invite} className="grid gap-3 text-sm">
                <input id="invite-email" type="email" required placeholder="email@congty.vn" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2" />
                <select value={role} onChange={(e) => setRole(e.target.value as "MEMBER" | "ADMIN")} className="rounded-lg border border-gray-200 bg-white px-3 py-2">
                  <option value="MEMBER">Thành viên — chỉ xem các shop được chọn</option>
                  <option value="ADMIN">Quản trị — xem và sửa mọi shop, mời người khác</option>
                </select>
                {role === "MEMBER" && (
                  <div className="flex flex-wrap gap-1.5">
                    {m.data.shops.map((s) => (
                      <label key={s.id} className="flex items-center gap-1 rounded-full border border-gray-200 px-2 py-1 text-xs">
                        <input type="checkbox" checked={shopIds.includes(s.id)} onChange={() => setShopIds(toggleShop(shopIds, s.id))} />{s.name}
                      </label>
                    ))}
                  </div>
                )}
                <Button variant="primary" className="justify-self-start">Gửi lời mời</Button>
              </form>
            </Panel>
            <Panel title="Lời mời đang chờ">
              {!m.data.invitations.length && <p className="text-sm text-gray-500">Không có.</p>}
              <ul className="grid gap-1.5 text-sm">{m.data.invitations.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2">
                  <span>{i.email} · {ROLE[i.role ?? ""] ?? i.role}<span className="block text-xs text-gray-500">hết hạn {formatDateTime(i.expiresAt)}</span></span>
                  <Button size="sm" onClick={() => act(() => apiFetch(`/orgs/${orgId}/members/invitations/${i.id}`, { method: "DELETE" }))}>Huỷ</Button>
                </li>
              ))}</ul>
            </Panel>
          </div>
        </>
      )}
    </>
  );
}
