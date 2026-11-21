"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { AuthShell } from "@/components/AuthShell";

type Invite = { email: string; organizationName: string; role: string | null; shopCount: number; hasAccount: boolean };
const ROLE: Record<string, string> = { SUPER_ADMIN: "Super admin", ADMIN: "Quản trị", MOD: "Mod", OWNER: "Chủ tổ chức", MEMBER: "Thành viên" };

export default function InvitePage({ params }: { params: { token: string } }) {
  const router = useRouter();
  const [inv, setInv] = useState<Invite | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch<Invite>(`/auth/invitations/${params.token}`).then(setInv).catch((e) => setError((e as Error).message));
  }, [params.token]);

  async function accept(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiFetch("/auth/invitations/accept", { method: "POST", body: JSON.stringify({ token: params.token, name, password }) });
      router.replace(inv?.role === "SUPER_ADMIN" || inv?.role === "ADMIN" ? "/admin/clients" : "/dashboard");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      {!inv && !error && <p className="text-sm text-gray-500">Đang kiểm tra lời mời…</p>}
      {!inv && error && <><h1 className="text-lg font-semibold">Lời mời không dùng được</h1><p className="mt-2 text-sm text-gray-500">{error}. Hãy nhờ người mời gửi lại.</p></>}
      {inv && (
        <form onSubmit={accept} className="grid gap-3">
          <h1 className="text-lg font-semibold text-gray-900">Tham gia {inv.organizationName}</h1>
          <p className="text-sm text-gray-500">
            Bạn được mời với vai trò <b>{ROLE[inv.role ?? ""] ?? inv.role}</b>{inv.shopCount ? `, xem ${inv.shopCount} shop` : ""}. Email đăng nhập: <b>{inv.email}</b>
          </p>
          {!inv.hasAccount && (
            <label className="grid gap-1 text-sm"><span className="text-gray-600">Họ tên</span>
              <input id="invite-name" value={name} onChange={(e) => setName(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2" />
            </label>
          )}
          <label className="grid gap-1 text-sm"><span className="text-gray-600">{inv.hasAccount ? "Mật khẩu hiện tại của bạn" : "Đặt mật khẩu (ít nhất 8 ký tự)"}</span>
            <input id="invite-password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2" />
          </label>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</p>}
          <button disabled={busy} className="rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-60">Nhận lời mời</button>
        </form>
      )}
    </AuthShell>
  );
}
