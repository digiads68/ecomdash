"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ConnectionsDto, SyncStateDto } from "@ecomdash/shared";
import { apiFetch, useMe } from "@/lib/api";
import { cn } from "@/lib/utils";

const RES: Record<string, string> = { orders: "Đơn hàng", products: "Sản phẩm", returns: "Hoàn / huỷ", finance: "Đối soát", analytics: "Lượt xem", ads_entities: "Chiến dịch", ads_reports: "Chi phí quảng cáo" };

/**
 * Client onboarding (12 §3.1): 1) TikTok Shop  2) TikTok Ads — both required (or "I don't run TikTok ads")
 * 3) optional email + password. The first sync runs in the background meanwhile.
 */
function OnboardingInner() {
  const params = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const me = useMe();
  const org = me.data?.organizations.find((o) => o.role === "OWNER" || o.role === "ADMIN") ?? me.data?.organizations[0];
  const [conn, setConn] = useState<ConnectionsDto | null>(null);
  const [sync, setSync] = useState<SyncStateDto[]>([]);
  const [step, setStep] = useState(0);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<{ tone: "red" | "green"; text: string } | null>(params.get("error") ? { tone: "red", text: params.get("error")! } : null);

  const load = async () => {
    if (!org) return;
    const [c, s] = await Promise.all([apiFetch<ConnectionsDto>(`/connections?orgId=${org.id}`), apiFetch<SyncStateDto[]>(`/sync/status?orgId=${org.id}`)]);
    setConn(c);
    setSync(s);
    return c;
  };
  useEffect(() => {
    load().then((c) => {
      if (!c) return;
      const adsDone = c.status.adsLinked || c.status.adsMode === "NONE";
      setStep(!c.status.shopLinked ? 0 : !adsDone ? 1 : 2);
    });
    const t = setInterval(() => { load(); }, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org?.id]);

  if (me.data && !org) {
    return <Shell><p className="text-sm text-gray-500">Tài khoản này không thuộc tổ chức khách hàng nào. <Link className="text-primary-600 underline" href="/dashboard">Về Dashboard</Link></p></Shell>;
  }
  if (!conn || !org) return <Shell><p className="text-sm text-gray-500">Đang tải…</p></Shell>;

  const shopDone = conn.status.shopLinked;
  const adsDone = conn.status.adsLinked || conn.status.adsMode === "NONE";
  const go = async (kind: "shop" | "ads") => {
    const { url } = await apiFetch<{ url: string }>(`/connections/${kind}/authorize-url?orgId=${org.id}&returnTo=/onboarding`);
    window.location.href = url;
  };
  const noAds = async () => {
    await apiFetch(`/connections/orgs/${org.id}/ads-mode`, { method: "POST", body: JSON.stringify({ mode: "NONE" }) });
    await load();
    qc.invalidateQueries();
    setStep(2);
  };
  const finish = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setMsg(null);
    try {
      if (password) await apiFetch("/auth/password", { method: "POST", body: JSON.stringify({ email: email || undefined, newPassword: password }) });
      await apiFetch(`/connections/orgs/${org.id}/onboarded`, { method: "POST" });
      await qc.invalidateQueries();
      router.replace("/dashboard");
    } catch (err) {
      setMsg({ tone: "red", text: (err as Error).message });
    }
  };
  const allShops = conn.sellerAuthorizations.flatMap((a) => a.shops);
  const advertisers = conn.adsAuthorizations.flatMap((a) => a.advertisers).filter((v, i, arr) => arr.findIndex((x) => x.id === v.id) === i);
  const steps = ["TikTok Shop", "TikTok Ads", "Tài khoản"];

  return (
    <Shell wide>
      <h1 className="text-lg font-semibold text-gray-900">Chào mừng {org.name}</h1>
      <p className="text-sm text-gray-500">Gắn hai nền tảng để doanh thu shop và chi phí quảng cáo về cùng một khung số liệu.</p>
      <ol className="mt-4 grid grid-cols-3 gap-2" aria-label="Tiến độ">
        {steps.map((label, i) => {
          const done = i === 0 ? shopDone : i === 1 ? adsDone : false;
          return (
            <li key={label}>
              <button type="button" onClick={() => setStep(i)} className={cn("w-full rounded-lg border px-2 py-2 text-left text-xs", step === i ? "border-primary-400 bg-primary-50" : "border-gray-200")}>
                <span className={cn("mr-1 font-semibold", done ? "text-green-600" : "text-gray-400")}>{done ? "✓" : `${i + 1}.`}</span>{label}
                {i < 2 && <span className="block text-[10px] text-gray-400">bắt buộc</span>}
              </button>
            </li>
          );
        })}
      </ol>
      {params.get("connected") && <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-[13px] text-green-700">Đã gắn {params.get("connected") === "shop" ? `${params.get("count")} shop` : `${params.get("count")} tài khoản quảng cáo`}.</p>}
      {msg && <p className={cn("mt-3 rounded-lg px-3 py-2 text-[13px]", msg.tone === "red" ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700")}>{msg.text}</p>}

      <section className="mt-4 min-h-[180px]">
        {step === 0 && (
          <div className="grid gap-3">
            <h2 className="font-semibold">Bước 1 · TikTok Shop <span className="text-xs font-normal text-gray-500">(TikTok Shop Partner API)</span></h2>
            {shopDone ? (
              <ul className="grid gap-1 text-sm">{allShops.map((s) => <li key={s.id} className="flex justify-between rounded-lg bg-gray-50 px-3 py-2"><span>{s.name}</span><span className="text-xs text-gray-500">{s.code}</span></li>)}</ul>
            ) : <p className="text-sm text-gray-500">Uỷ quyền cho EcomDash đọc đơn hàng, sản phẩm, đối soát và hoàn/huỷ của shop.</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => go("shop")} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">{shopDone ? "Gắn thêm shop" : "Kết nối TikTok Shop"}</button>
              {shopDone && <button type="button" onClick={() => setStep(1)} className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-semibold text-white">Tiếp tục</button>}
            </div>
          </div>
        )}
        {step === 1 && (
          <div className="grid gap-3">
            <h2 className="font-semibold">Bước 2 · TikTok Ads <span className="text-xs font-normal text-gray-500">(TikTok for Business)</span></h2>
            <p className="text-sm text-gray-500">Chi phí quảng cáo chỉ lấy được từ TikTok for Business — Shop API không có số chi tiêu. Chọn tài khoản quảng cáo đang chạy cho shop; hệ thống tự khớp store với shop.</p>
            {advertisers.length > 0 && (
              <ul className="grid gap-1 text-sm">{advertisers.map((v) => (
                <li key={v.id} className="rounded-lg bg-gray-50 px-3 py-2">
                  <div className="flex justify-between"><b>{v.name}</b><span className="text-xs text-gray-500">{v.currency}</span></div>
                  {v.storeLinks.map((l) => <div key={l.id} className="text-xs text-gray-500">Store {l.storeName} → {l.shopName ?? <span className="text-amber-700">chưa khớp shop (chọn ở Cài đặt → Kết nối)</span>}</div>)}
                  {v.timezoneMismatch && <div className="text-xs text-amber-700">Múi giờ tài khoản khác múi giờ shop — số theo ngày có thể lệch.</div>}
                </li>
              ))}</ul>
            )}
            {conn.status.adsMode === "NONE" && <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600">Bạn đã chọn không chạy quảng cáo TikTok. ROAS sẽ hiển thị "Không chạy QC".</p>}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => go("ads")} className={cn("rounded-lg px-3 py-2 text-sm", adsDone ? "border border-gray-200" : "bg-primary-500 font-semibold text-white")}>{conn.status.adsLinked ? "Gắn thêm tài khoản" : "Kết nối TikTok for Business"}</button>
              {!conn.status.adsLinked && conn.status.adsMode !== "NONE" && <button type="button" id="no-ads" onClick={noAds} className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600">Tôi không chạy quảng cáo TikTok</button>}
              {adsDone && <button type="button" onClick={() => setStep(2)} className="rounded-lg bg-primary-500 px-4 py-2 text-sm font-semibold text-white">Tiếp tục</button>}
            </div>
          </div>
        )}
        {step === 2 && (
          <form onSubmit={finish} className="grid gap-3">
            <h2 className="font-semibold">Bước 3 · Tài khoản <span className="text-xs font-normal text-gray-500">(tuỳ chọn)</span></h2>
            {me.data?.user.hasPassword ? <p className="text-sm text-gray-500">Bạn đã có mật khẩu đăng nhập ({me.data.user.email}).</p> : (
              <>
                <p className="text-sm text-gray-500">Đặt email + mật khẩu để đăng nhập không cần TikTok (ví dụ trên máy tính khác). Có thể bỏ qua.</p>
                <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
                <input type="password" placeholder="Mật khẩu (ít nhất 8 ký tự)" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} className="rounded-lg border border-gray-200 px-3 py-2 text-sm" />
              </>
            )}
            <p className="text-sm text-gray-500">Giá vốn từng SKU nhập ở <b>Cài đặt → Chi phí</b> sau khi đồng bộ xong sản phẩm.</p>
            <button disabled={!shopDone || !adsDone} className="justify-self-start rounded-lg bg-primary-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Vào Dashboard</button>
            {(!shopDone || !adsDone) && <p className="text-xs text-amber-700">Cần hoàn tất bước 1 và 2 trước.</p>}
          </form>
        )}
      </section>

      {sync.length > 0 && (
        <div className="mt-5 border-t border-gray-100 pt-3">
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-400">Đồng bộ lần đầu</div>
          <div className="flex flex-wrap gap-1.5">
            {sync.map((s) => (
              <span key={s.id} className={cn("rounded-full px-2 py-0.5 text-[11px]", s.status === "OK" ? "bg-green-50 text-green-700" : s.status === "ERROR" ? "bg-red-50 text-red-700" : "bg-gray-100 text-gray-500")}>
                {s.status === "OK" ? "✓" : "…"} {RES[s.resource] ?? s.resource} · {s.scopeName}
              </span>
            ))}
          </div>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="grid min-h-screen place-items-center bg-gray-50 px-4 py-10">
      <div className={cn("w-full", wide ? "max-w-[620px]" : "max-w-[400px]")}>
        <div className="mb-4 text-center text-2xl font-bold tracking-tight text-gray-900">Ecom<span className="text-primary-500">Dash</span></div>
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">{children}</div>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return <Suspense><OnboardingInner /></Suspense>;
}
