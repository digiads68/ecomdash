"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import type { MeDto } from "@ecomdash/shared";
import { API_URL, apiFetch } from "@/lib/api";
import { DEMO } from "@/lib/auth-mode";
import { AuthShell } from "@/components/AuthShell";

const NOTICE: Record<string, string> = {
  app_store: "Đã nhận uỷ quyền TikTok Shop từ Seller Center. Đăng nhập bằng TikTok Shop để xem số liệu, hoặc chờ DigiAds gắn shop vào tài khoản của bạn.",
};


function LoginInner() {
  const params = useSearchParams();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(params.get("error") ?? "");
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState<{ email: string; role: string; password: string }[]>([]);
  const next = params.get("next") || "/dashboard";

  useEffect(() => {
    if (DEMO) apiFetch<typeof demo>("/auth/demo-accounts").then(setDemo).catch(() => setDemo([]));
  }, []);

  async function submit(e?: React.FormEvent, creds?: { email: string; password: string }) {
    e?.preventDefault();
    setBusy(true);
    setError("");
    try {
      const me = await apiFetch<MeDto>("/auth/login", { method: "POST", body: JSON.stringify(creds ?? { email, password }) });
      router.replace(me.platformRole === "SUPER_ADMIN" || me.platformRole === "ADMIN" ? (params.get("next") || "/admin/clients") : next);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <h1 className="text-lg font-semibold text-gray-900">Đăng nhập</h1>
      {params.get("notice") && <p className="mt-2 rounded-lg bg-blue-50 px-3 py-2 text-[13px] text-blue-800">{NOTICE[params.get("notice")!] ?? params.get("notice")}</p>}
      <a id="login-tiktok" href={`${API_URL}/api/auth/tiktok/start`} className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-black">
        <span aria-hidden>♪</span> Đăng nhập bằng TikTok Shop
      </a>
      <p className="mt-1.5 text-center text-xs text-gray-500">Dành cho chủ shop — lần đầu sẽ tự tạo tài khoản và gắn shop.</p>
      <div className="my-4 flex items-center gap-3 text-xs text-gray-400"><span className="h-px flex-1 bg-gray-200" />hoặc email<span className="h-px flex-1 bg-gray-200" /></div>
      <form onSubmit={submit} className="grid gap-3">
        <label className="grid gap-1 text-sm"><span className="text-gray-600">Email</span>
          <input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 outline-none focus:border-primary-400" />
        </label>
        <label className="grid gap-1 text-sm"><span className="text-gray-600">Mật khẩu</span>
          <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 outline-none focus:border-primary-400" />
        </label>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">{error}</p>}
        <button id="login-submit" disabled={busy} className="rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-600 disabled:opacity-60">{busy ? "Đang đăng nhập…" : "Đăng nhập"}</button>
      </form>
      <p className="mt-3 text-xs text-gray-500">Nhân viên DigiAds và thành viên được mời đăng nhập bằng email. Chủ shop có thể đặt mật khẩu trong Cài đặt → Tài khoản.</p>
      {demo.length > 0 && (
        <div className="mt-5 border-t border-gray-100 pt-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">Tài khoản demo</div>
          <div className="grid gap-1.5">
            {demo.map((a) => (
              <button key={a.email} type="button" disabled={busy} onClick={() => submit(undefined, a)} className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-left text-[13px] hover:bg-gray-50">
                <span><b className="text-gray-800">{a.role}</b><br /><span className="text-gray-500">{a.email}</span></span>
                <span className="text-primary-600">Vào →</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </AuthShell>
  );
}

export default function LoginPage() {
  return <Suspense><LoginInner /></Suspense>;
}
