"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { InvitationDto, StaffDto } from "@ecomdash/shared";
import { Badge, Button, ErrorBox, Loading, Notice, PageHeader, Panel, TableWrap, Td, Th } from "@/components/ui";
import { apiFetch, useApi, useMe } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

type StaffResp = { staff: StaffDto[]; invitations: InvitationDto[]; shops: { id: string; name: string; organizationName: string }[] };
const ROLE: Record<string, string> = { SUPER_ADMIN: "Super admin", ADMIN: "Admin", MOD: "Mod" };

/** DigiAds staff: roles, disable, and the shops each Mod may see — across clients (12 §2). */
export default function StaffPage() {
  const qc = useQueryClient();
  const me = useMe();
  const d = useApi<StaffResp>("/admin/staff", {}, { shop: false });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("MOD");
  const [editing, setEditing] = useState<string | null>(null);
  const [pick, setPick] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ tone: "red" | "blue"; text: React.ReactNode } | null>(null);
  const superAdmin = me.data?.platformRole === "SUPER_ADMIN";
  const run = async (fn: () => Promise<unknown>, ok?: React.ReactNode) => {
    setMsg(null);
    try { await fn(); if (ok) setMsg({ tone: "blue", text: ok }); qc.invalidateQueries({ predicate: (x) => String(x.queryKey[0]).startsWith("/admin/staff") }); } catch (e) { setMsg({ tone: "red", text: (e as Error).message }); }
  };
  const groups = (d.data?.shops ?? []).reduce<Record<string, { id: string; name: string }[]>>((m, s) => ({ ...m, [s.organizationName]: [...(m[s.organizationName] ?? []), s] }), {});

  return (
    <>
      <PageHeader title="Quản trị · Nhân viên DigiAds" subtitle="Super admin và Admin xem mọi khách; Mod chỉ xem các shop được giao" />
      {msg && <Notice tone={msg.tone} title={msg.tone === "red" ? "Không thực hiện được" : "Đã xong"}>{msg.text}</Notice>}
      {d.error && <ErrorBox error={d.error} />}
      {!d.data && !d.error && <Loading />}
      {d.data && (
        <>
          <Panel title="Nhân viên">
            <TableWrap>
              <thead><tr><Th>Nhân viên</Th><Th>Vai trò</Th><Th>Shop được xem</Th><Th>Đăng nhập cuối</Th><Th /></tr></thead>
              <tbody>{d.data.staff.map((u) => (
                <tr key={u.id} className={u.status === "DISABLED" ? "opacity-50" : ""}>
                  <Td>{u.name ?? "—"}<div className="text-xs text-gray-500">{u.email}</div></Td>
                  <Td>
                    {superAdmin && u.id !== me.data?.user.id ? (
                      <select aria-label={`Vai trò ${u.email}`} value={u.platformRole} className="rounded-md border border-gray-200 bg-white px-2 py-1 text-xs" onChange={(e) => run(() => apiFetch(`/admin/staff/${u.id}`, { method: "PATCH", body: JSON.stringify({ platformRole: e.target.value }) }))}>
                        <option value="SUPER_ADMIN">Super admin</option><option value="ADMIN">Admin</option><option value="MOD">Mod</option>
                      </select>
                    ) : <Badge tone={u.platformRole === "MOD" ? "gray" : "blue"}>{ROLE[u.platformRole]}</Badge>}
                  </Td>
                  <Td className="whitespace-normal">
                    {u.platformRole !== "MOD" ? <span className="text-xs text-gray-500">Mọi khách, mọi shop</span> : editing === u.id ? (
                      <div className="grid gap-2">
                        {Object.entries(groups).map(([org, shops]) => (
                          <div key={org}><div className="text-[11px] font-semibold text-gray-500">{org}</div>
                            <div className="flex flex-wrap gap-1.5">{shops.map((s) => (
                              <label key={s.id} className="flex items-center gap-1 rounded-full border border-gray-200 px-2 py-0.5 text-xs"><input type="checkbox" checked={pick.includes(s.id)} onChange={() => setPick(pick.includes(s.id) ? pick.filter((x) => x !== s.id) : [...pick, s.id])} />{s.name}</label>
                            ))}</div></div>
                        ))}
                        <div className="flex gap-2"><Button size="sm" variant="primary" onClick={() => run(() => apiFetch(`/admin/staff/${u.id}`, { method: "PATCH", body: JSON.stringify({ shopIds: pick }) }), `Đã giao ${pick.length} shop cho ${u.email}`).then(() => setEditing(null))}>Lưu</Button><Button size="sm" onClick={() => setEditing(null)}>Huỷ</Button></div>
                      </div>
                    ) : (
                      <button type="button" className="text-left text-xs text-primary-700 hover:underline" onClick={() => { setEditing(u.id); setPick(u.shopIds); }}>
                        {u.shopIds.length ? d.data!.shops.filter((s) => u.shopIds.includes(s.id)).map((s) => `${s.name} (${s.organizationName})`).join(", ") : "Chưa giao shop"} · sửa
                      </button>
                    )}
                  </Td>
                  <Td>{formatDateTime(u.lastLoginAt)}</Td>
                  <Td>{u.id !== me.data?.user.id && (u.platformRole === "MOD" || superAdmin) && (
                    <Button size="sm" onClick={() => run(() => apiFetch(`/admin/staff/${u.id}`, { method: "PATCH", body: JSON.stringify({ status: u.status === "DISABLED" ? "ACTIVE" : "DISABLED" }) }))}>{u.status === "DISABLED" ? "Mở khoá" : "Khoá"}</Button>
                  )}</Td>
                </tr>
              ))}</tbody>
            </TableWrap>
          </Panel>
          <div className="grid gap-3.5 lg:grid-cols-2">
            <Panel title="Mời nhân viên">
              <form className="flex flex-wrap items-center gap-2 text-sm" onSubmit={(e) => { e.preventDefault(); run(async () => { const inv = await apiFetch<InvitationDto>("/admin/staff", { method: "POST", body: JSON.stringify({ email, platformRole: role }) }); setEmail(""); setMsg({ tone: "blue", text: <>Đã mời. Link: <code className="break-all text-xs">{inv.inviteUrl}</code></> }); }); }}>
                <input type="email" required placeholder="ten@digiads.vn" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-1.5" />
                <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-2 py-1.5">
                  <option value="MOD">Mod — chỉ xem shop được giao</option>
                  {superAdmin && <option value="ADMIN">Admin — mọi khách, gắn thay khách</option>}
                  {superAdmin && <option value="SUPER_ADMIN">Super admin</option>}
                </select>
                <Button variant="primary">Gửi lời mời</Button>
              </form>
            </Panel>
            <Panel title="Lời mời đang chờ">
              {!d.data.invitations.length && <p className="text-sm text-gray-500">Không có.</p>}
              <ul className="grid gap-1 text-sm">{d.data.invitations.map((i) => <li key={i.id} className="rounded-lg bg-gray-50 px-3 py-2">{i.email} · {ROLE[i.role ?? ""]}<span className="block text-xs text-gray-500">hết hạn {formatDateTime(i.expiresAt)}</span></li>)}</ul>
            </Panel>
          </div>
        </>
      )}
    </>
  );
}
