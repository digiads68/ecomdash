"use client";

import { Fragment, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Notice, PageHeader, Panel } from "@/components/ui";
import { API_URL, apiFetch, logout, useMe } from "@/lib/api";

const ROLE: Record<string, string> = { SUPER_ADMIN: "Super admin DigiAds", ADMIN: "Admin DigiAds", MOD: "Mod DigiAds", OWNER: "Chủ", MEMBER: "Thành viên" };

/** Email + password (optional for clients who sign in with TikTok), sessions (12 §6). */
export default function AccountPage() {
  const me = useMe();
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState<{ tone: "red" | "blue"; text: string } | null>(null);
  const u = me.data?.user;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      await apiFetch("/auth/password", { method: "POST", body: JSON.stringify({ email: email || undefined, currentPassword: current || undefined, newPassword: next }) });
      setMsg({ tone: "blue", text: "Đã lưu. Lần sau có thể đăng nhập bằng email và mật khẩu." });
      setCurrent(""); setNext(""); setEmail("");
      qc.invalidateQueries({ queryKey: ["/me"] });
    } catch (err) {
      setMsg({ tone: "red", text: (err as Error).message });
    }
  }

  return (
    <>
      <PageHeader title="Cài đặt · Tài khoản" subtitle="Thông tin đăng nhập của bạn" />
      <div className="grid gap-3.5 lg:grid-cols-2">
        <Panel title="Đăng nhập">
          <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
            <dt className="text-gray-500">Họ tên</dt><dd>{u?.name ?? "—"}</dd>
            <dt className="text-gray-500">Email</dt><dd>{u?.email ?? <span className="text-gray-400">chưa đặt</span>}</dd>
            <dt className="text-gray-500">TikTok Shop</dt><dd>{u?.tiktokLinked ? "Đã liên kết — có thể dùng “Đăng nhập bằng TikTok Shop”" : "Chưa liên kết"}</dd>
            {me.data?.platformRole && <><dt className="text-gray-500">Vai trò DigiAds</dt><dd>{ROLE[me.data.platformRole]}</dd></>}
            {me.data?.organizations.map((o) => <Fragment key={o.id}><dt className="text-gray-500">{o.name}</dt><dd>{o.role === "ADMIN" ? "Quản trị" : ROLE[o.role ?? ""] ?? "Được giao shop"}</dd></Fragment>)}
          </dl>
          <div className="mt-4 flex gap-2">
            <Button onClick={async () => { const r = await apiFetch<{ revoked: number }>("/auth/sessions/revoke-others", { method: "POST" }); setMsg({ tone: "blue", text: `Đã đăng xuất ${r.revoked} phiên khác.` }); }}>Đăng xuất các thiết bị khác</Button>
            <Button onClick={logout}>Đăng xuất</Button>
          </div>
        </Panel>
        <Panel title={u?.hasPassword ? "Đổi mật khẩu" : "Đặt email + mật khẩu"}>
          <form onSubmit={save} className="grid gap-3 text-sm">
            {!u?.hasPassword && <p className="text-gray-500">Bạn đang đăng nhập bằng TikTok Shop. Đặt email và mật khẩu để đăng nhập ở nơi không có TikTok.</p>}
            {(!u?.email || !u?.hasPassword) && <input type="email" required={!u?.email} placeholder={u?.email ?? "Email"} value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2" />}
            {u?.hasPassword && <input type="password" required placeholder="Mật khẩu hiện tại" value={current} onChange={(e) => setCurrent(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2" />}
            <input type="password" required minLength={8} placeholder="Mật khẩu mới (ít nhất 8 ký tự)" value={next} onChange={(e) => setNext(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2" />
            <Button variant="primary" className="justify-self-start">Lưu</Button>
          </form>
          {msg && <div className="mt-3"><Notice tone={msg.tone} title={msg.tone === "red" ? "Không lưu được" : "Xong"}>{msg.text}</Notice></div>}
          {!u?.tiktokLinked && !me.data?.platformRole && <p className="mt-3 text-xs text-gray-500">Chủ shop có thể <a className="text-primary-600 underline" href={`${API_URL}/api/auth/tiktok/start`}>đăng nhập bằng TikTok Shop</a> để liên kết.</p>}
        </Panel>
      </div>
    </>
  );
}
