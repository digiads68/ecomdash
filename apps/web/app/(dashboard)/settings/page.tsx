"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Store, Megaphone, Users, CreditCard, Plus, Trash2, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { useApiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type Tab = "integrations" | "team" | "billing";

// ── Tab Navigation ────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "integrations", label: "Tích hợp", icon: Store },
  { id: "team", label: "Nhóm", icon: Users },
  { id: "billing", label: "Thanh toán", icon: CreditCard },
];

// ── Status Badge ──────────────────────────────────────────────────────────────

function SyncBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    SYNCED:   { label: "Đã đồng bộ", className: "bg-green-100 text-green-700" },
    SYNCING:  { label: "Đang đồng bộ", className: "bg-blue-100 text-blue-700" },
    PENDING:  { label: "Chờ xử lý", className: "bg-yellow-100 text-yellow-700" },
    ERROR:    { label: "Lỗi", className: "bg-red-100 text-red-700" },
  };
  const cfg = map[status] ?? { label: status, className: "bg-gray-100 text-gray-600" };
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide", cfg.className)}>
      {cfg.label}
    </span>
  );
}

// ── Integrations Tab ──────────────────────────────────────────────────────────

interface ShopDto { id: string; name: string; region: string; syncStatus: string; lastSyncedAt: string | null }
interface AdAccountDto { id: string; name: string; syncStatus: string; shopId: string | null; lastSyncedAt: string | null }

function IntegrationsTab() {
  const fetchWithAuth = useApiClient();
  const queryClient = useQueryClient();

  const { data: shops = [], isLoading: loadingShops } = useQuery<ShopDto[]>({
    queryKey: ["tiktok-shops"],
    queryFn: () => fetchWithAuth<ShopDto[]>("/tiktok/shops"),
  });

  const { data: adAccounts = [], isLoading: loadingAds } = useQuery<AdAccountDto[]>({
    queryKey: ["tiktok-ad-accounts"],
    queryFn: () => fetchWithAuth<AdAccountDto[]>("/tiktok/ad-accounts"),
  });

  const removeShop = useMutation({
    mutationFn: (id: string) => fetchWithAuth(`/tiktok/shops/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tiktok-shops"] }),
  });

  const removeAccount = useMutation({
    mutationFn: (id: string) => fetchWithAuth(`/tiktok/ad-accounts/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tiktok-ad-accounts"] }),
  });

  async function connectShop() {
    const res = await fetchWithAuth<{ url: string | null; demo: boolean }>("/tiktok/shop/auth-url");
    if (res.demo) {
      await fetchWithAuth("/tiktok/shop/demo-connect", { method: "POST" });
      queryClient.invalidateQueries({ queryKey: ["tiktok-shops"] });
    } else if (res.url) {
      window.location.href = res.url;
    }
  }

  async function connectAds() {
    const res = await fetchWithAuth<{ url: string | null; demo: boolean }>("/tiktok/ads/auth-url");
    if (res.demo) {
      await fetchWithAuth("/tiktok/ads/demo-connect", { method: "POST" });
      queryClient.invalidateQueries({ queryKey: ["tiktok-ad-accounts"] });
    } else if (res.url) {
      window.location.href = res.url;
    }
  }

  return (
    <div className="space-y-8">
      {/* TikTok Shops */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Store className="w-5 h-5 text-primary-600" />
            <h3 className="text-sm font-semibold text-gray-900">TikTok Shop</h3>
            <span className="text-xs text-gray-400">({shops.length} kết nối)</span>
          </div>
          <button
            onClick={connectShop}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-600 text-white text-xs font-medium hover:bg-primary-700 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Kết nối shop
          </button>
        </div>

        {loadingShops ? (
          <div className="space-y-2">
            {[1, 2].map(i => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : shops.length === 0 ? (
          <div className="flex flex-col items-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-200 text-center">
            <Store className="w-6 h-6 text-gray-300 mb-2" />
            <p className="text-sm text-gray-500">Chưa kết nối TikTok Shop nào</p>
            <button onClick={connectShop} className="mt-3 text-xs text-primary-600 hover:text-primary-700 font-medium">
              + Kết nối ngay
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {shops.map(shop => (
              <div key={shop.id} className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center text-xs font-bold text-primary-700">
                    {shop.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{shop.name}</p>
                    <p className="text-xs text-gray-400">{shop.region} · {shop.lastSyncedAt ? new Date(shop.lastSyncedAt).toLocaleDateString("vi-VN") : "Chưa đồng bộ"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <SyncBadge status={shop.syncStatus} />
                  <button
                    onClick={() => removeShop.mutate(shop.id)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* TikTok Ads */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Megaphone className="w-5 h-5 text-primary-600" />
            <h3 className="text-sm font-semibold text-gray-900">TikTok Ads</h3>
            <span className="text-xs text-gray-400">({adAccounts.length} kết nối)</span>
          </div>
          <button
            onClick={connectAds}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-600 text-white text-xs font-medium hover:bg-primary-700 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Kết nối tài khoản ads
          </button>
        </div>

        {loadingAds ? (
          <div className="space-y-2">
            {[1].map(i => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : adAccounts.length === 0 ? (
          <div className="flex flex-col items-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-200 text-center">
            <Megaphone className="w-6 h-6 text-gray-300 mb-2" />
            <p className="text-sm text-gray-500">Chưa kết nối tài khoản TikTok Ads</p>
            <button onClick={connectAds} className="mt-3 text-xs text-primary-600 hover:text-primary-700 font-medium">
              + Kết nối ngay
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {adAccounts.map(acc => (
              <div key={acc.id} className="flex items-center justify-between bg-white rounded-xl border border-gray-200 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center text-xs font-bold text-purple-700">
                    {acc.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{acc.name}</p>
                    <p className="text-xs text-gray-400">{acc.lastSyncedAt ? new Date(acc.lastSyncedAt).toLocaleDateString("vi-VN") : "Chưa đồng bộ"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <SyncBadge status={acc.syncStatus} />
                  <button
                    onClick={() => removeAccount.mutate(acc.id)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ── Team Tab ──────────────────────────────────────────────────────────────────

interface MemberDto {
  id: string;
  role: string;
  status: string;
  inviteEmail: string | null;
  user: { email: string; name: string | null; avatarUrl: string | null } | null;
}

const ROLE_LABELS: Record<string, string> = {
  OWNER: "Chủ sở hữu",
  ADMIN: "Quản trị viên",
  MEMBER: "Thành viên",
  VIEWER: "Xem",
};

function TeamTab() {
  const fetchWithAuth = useApiClient();
  const queryClient = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("MEMBER");
  const [inviting, setInviting] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState(false);

  const { data: members = [], isLoading } = useQuery<MemberDto[]>({
    queryKey: ["team-members"],
    queryFn: () => fetchWithAuth<MemberDto[]>("/team"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => fetchWithAuth(`/team/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["team-members"] }),
  });

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    try {
      await fetchWithAuth("/team/invite", {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      setInviteEmail("");
      setInviteSuccess(true);
      setTimeout(() => setInviteSuccess(false), 3000);
      queryClient.invalidateQueries({ queryKey: ["team-members"] });
    } finally {
      setInviting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Invite form */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Mời thành viên</h3>
        <form onSubmit={handleInvite} className="flex gap-2">
          <input
            type="email"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
            placeholder="email@example.com"
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
          />
          <select
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
            value={inviteRole}
            onChange={e => setInviteRole(e.target.value)}
          >
            {["ADMIN", "MEMBER", "VIEWER"].map(r => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
          <button
            type="submit"
            disabled={inviting}
            className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-60 transition-colors flex items-center gap-2"
          >
            {inviting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
            Mời
          </button>
        </form>
        {inviteSuccess && (
          <p className="flex items-center gap-1.5 text-sm text-green-600 mt-2">
            <CheckCircle2 className="w-4 h-4" /> Đã gửi email mời!
          </p>
        )}
      </div>

      {/* Members list */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[1, 2].map(i => <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />)}
          </div>
        ) : (
          members.map(m => {
            const email = m.user?.email ?? m.inviteEmail ?? "";
            const name = m.user?.name ?? email.split("@")[0];
            const isOwner = m.role === "OWNER";
            return (
              <div key={m.id} className="flex items-center justify-between px-5 py-3.5 border-b border-gray-50 last:border-0 hover:bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center text-xs font-bold text-primary-700">
                    {name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{name}</p>
                    <p className="text-xs text-gray-400">{email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={cn(
                    "text-xs font-medium px-2 py-0.5 rounded-full",
                    isOwner ? "bg-primary-100 text-primary-700" : "bg-gray-100 text-gray-600"
                  )}>
                    {ROLE_LABELS[m.role] ?? m.role}
                  </span>
                  {m.status === "INVITED" && (
                    <span className="text-[10px] font-semibold text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded-full">
                      Chờ xác nhận
                    </span>
                  )}
                  {!isOwner && (
                    <button
                      onClick={() => remove.mutate(m.id)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <XCircle className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── Billing Tab ───────────────────────────────────────────────────────────────

const PLANS = [
  { id: "starter", name: "Starter", price: "499K", shops: 1, alerts: 10, features: ["1 TikTok Shop", "1 Tài khoản Ads", "10 cảnh báo", "90 ngày dữ liệu"] },
  { id: "pro", name: "Professional", price: "1,499K", shops: 5, alerts: 999, features: ["5 TikTok Shop", "5 Tài khoản Ads", "Cảnh báo không giới hạn", "12 tháng dữ liệu", "3 thành viên nhóm"] },
  { id: "enterprise", name: "Business", price: "3,999K", shops: 10, alerts: 999, features: ["10 TikTok Shop", "10 Tài khoản Ads", "AI insights", "Phân tích nâng cao", "10 thành viên nhóm", "API access"] },
];

function BillingTab() {
  const fetchWithAuth = useApiClient();

  const { data: sub } = useQuery({
    queryKey: ["subscription"],
    queryFn: () => fetchWithAuth<{ plan: string; status: string; currentPeriodEnd: string } | null>("/billing/subscription"),
  });

  async function upgrade(plan: string) {
    const { url } = await fetchWithAuth<{ url: string }>("/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ plan }),
    });
    window.location.href = url;
  }

  async function managePortal() {
    const { url } = await fetchWithAuth<{ url: string }>("/billing/portal", { method: "POST" });
    window.location.href = url;
  }

  const currentPlan = sub?.plan?.toLowerCase() ?? "free";

  return (
    <div className="space-y-6">
      {sub && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">
                Gói hiện tại: <span className="text-primary-600">{sub.plan}</span>
              </p>
              {sub.currentPeriodEnd && (
                <p className="text-xs text-gray-400 mt-0.5">
                  Gia hạn: {new Date(sub.currentPeriodEnd).toLocaleDateString("vi-VN")}
                </p>
              )}
            </div>
            <button
              onClick={managePortal}
              className="px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Quản lý thanh toán
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {PLANS.map(plan => {
          const isCurrent = currentPlan === plan.id;
          return (
            <div
              key={plan.id}
              className={cn(
                "bg-white rounded-xl border-2 p-5 flex flex-col",
                isCurrent ? "border-primary-500" : "border-gray-200"
              )}
            >
              {isCurrent && (
                <span className="self-start mb-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary-100 text-primary-700 uppercase tracking-wide">
                  Gói hiện tại
                </span>
              )}
              <p className="text-base font-bold text-gray-900">{plan.name}</p>
              <p className="text-xl font-bold text-primary-600 mt-1">{plan.price}<span className="text-sm font-normal text-gray-500">đ/tháng</span></p>
              <ul className="mt-4 space-y-1.5 flex-1">
                {plan.features.map(f => (
                  <li key={f} className="flex items-center gap-2 text-xs text-gray-600">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => !isCurrent && upgrade(plan.id)}
                disabled={isCurrent}
                className={cn(
                  "mt-5 w-full py-2 rounded-lg text-sm font-medium transition-colors",
                  isCurrent
                    ? "bg-gray-100 text-gray-400 cursor-default"
                    : "bg-primary-600 text-white hover:bg-primary-700"
                )}
              >
                {isCurrent ? "Đang sử dụng" : "Nâng cấp"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>("integrations");

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Cài đặt</h1>
        <p className="text-sm text-gray-500 mt-0.5">Quản lý tích hợp, nhóm và thanh toán</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              tab === id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
            )}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "integrations" && <IntegrationsTab />}
      {tab === "team" && <TeamTab />}
      {tab === "billing" && <BillingTab />}
    </div>
  );
}
