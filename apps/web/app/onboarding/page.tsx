"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Store, Megaphone, Bell, CheckCircle, ChevronRight, ExternalLink } from "lucide-react";
import { useApiClient } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type Step = 1 | 2 | 3 | 4;

const STEPS = [
  { id: 1, label: "Kết nối TikTok Shop", icon: Store },
  { id: 2, label: "Kết nối TikTok Ads", icon: Megaphone },
  { id: 3, label: "Tạo cảnh báo đầu tiên", icon: Bell },
  { id: 4, label: "Hoàn thành", icon: CheckCircle },
];

export default function OnboardingPage() {
  const router = useRouter();
  const fetchWithAuth = useApiClient();
  const [step, setStep] = useState<Step>(1);
  const [shopConnected, setShopConnected] = useState(false);
  const [adsConnected, setAdsConnected] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleConnectShop() {
    setLoading(true);
    try {
      const { url } = await fetchWithAuth<{ url: string }>("/tiktok/shop/auth-url");
      // In real app, this redirects to TikTok. In demo, simulate success.
      window.open(url, "_blank");
      setShopConnected(true);
    } catch {
      setShopConnected(true); // Demo fallback
    } finally {
      setLoading(false);
    }
  }

  async function handleConnectAds() {
    setLoading(true);
    try {
      const { url } = await fetchWithAuth<{ url: string }>("/tiktok/ads/auth-url");
      window.open(url, "_blank");
      setAdsConnected(true);
    } catch {
      setAdsConnected(true); // Demo fallback
    } finally {
      setLoading(false);
    }
  }

  function handleSkip() {
    if (step < 3) setStep((s) => (s + 1) as Step);
    else router.push("/overview");
  }

  function handleNext() {
    if (step === 4) {
      router.push("/overview");
    } else {
      setStep((s) => (s + 1) as Step);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">
            Ecom<span className="text-primary-500">Dash</span>
          </h1>
          <p className="text-sm text-gray-500 mt-1">Thiết lập tài khoản của bạn</p>
        </div>

        {/* Step progress */}
        <div className="flex items-center gap-2 mb-8">
          {STEPS.map((s, i) => {
            const done = step > s.id;
            const active = step === s.id;
            return (
              <div key={s.id} className="flex items-center gap-2 flex-1 min-w-0">
                <div className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors",
                  done ? "bg-green-500 text-white" : active ? "bg-primary-600 text-white" : "bg-gray-200 text-gray-400"
                )}>
                  {done ? <CheckCircle className="w-4 h-4" /> : s.id}
                </div>
                <span className={cn(
                  "text-xs font-medium truncate",
                  active ? "text-gray-900" : done ? "text-green-600" : "text-gray-400"
                )}>
                  {s.label}
                </span>
                {i < STEPS.length - 1 && (
                  <div className={cn("h-0.5 flex-1 rounded-full", done ? "bg-green-300" : "bg-gray-200")} />
                )}
              </div>
            );
          })}
        </div>

        {/* Step content */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8">
          {step === 1 && (
            <StepContent
              icon={<Store className="w-10 h-10 text-primary-500" />}
              title="Kết nối TikTok Shop"
              description="Kết nối shop của bạn để xem doanh thu, đơn hàng, và sản phẩm bán chạy theo thời gian thực."
              connected={shopConnected}
              connectedLabel="TikTok Shop đã kết nối!"
              buttonLabel="Kết nối TikTok Shop"
              onConnect={handleConnectShop}
              loading={loading}
              onSkip={handleSkip}
              onNext={handleNext}
            />
          )}

          {step === 2 && (
            <StepContent
              icon={<Megaphone className="w-10 h-10 text-purple-500" />}
              title="Kết nối TikTok Ads"
              description="Kết nối tài khoản quảng cáo để theo dõi ROAS, chi phí và hiệu suất từng chiến dịch."
              connected={adsConnected}
              connectedLabel="TikTok Ads đã kết nối!"
              buttonLabel="Kết nối TikTok Ads"
              onConnect={handleConnectAds}
              loading={loading}
              onSkip={handleSkip}
              onNext={handleNext}
            />
          )}

          {step === 3 && <AlertSetupStep onNext={handleNext} onSkip={handleSkip} />}

          {step === 4 && (
            <div className="text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                <CheckCircle className="w-8 h-8 text-green-500" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-gray-900">Tất cả đã sẵn sàng! 🎉</h2>
                <p className="text-sm text-gray-500 mt-2">
                  EcomDash đang đồng bộ dữ liệu. Dashboard sẽ hiển thị dữ liệu trong vài phút.
                </p>
              </div>
              <div className="bg-primary-50 rounded-xl p-4 text-left space-y-2">
                <p className="text-xs font-semibold text-primary-700 uppercase tracking-wide">Tiếp theo</p>
                {[
                  "Xem tổng quan doanh thu và ROAS",
                  "Theo dõi sản phẩm bán chạy",
                  "Nhận cảnh báo khi có vấn đề",
                ].map(item => (
                  <div key={item} className="flex items-center gap-2 text-sm text-primary-800">
                    <ChevronRight className="w-3.5 h-3.5" />
                    {item}
                  </div>
                ))}
              </div>
              <button
                onClick={() => router.push("/overview")}
                className="w-full py-3 rounded-xl bg-primary-600 text-white font-semibold hover:bg-primary-700 transition-colors"
              >
                Đến Dashboard →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Step content component ────────────────────────────────────────────────────

function StepContent({
  icon, title, description, connected, connectedLabel, buttonLabel,
  onConnect, loading, onSkip, onNext,
}: {
  icon: React.ReactNode; title: string; description: string;
  connected: boolean; connectedLabel: string; buttonLabel: string;
  onConnect: () => void; loading: boolean; onSkip: () => void; onNext: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center text-center gap-3">
        {icon}
        <div>
          <h2 className="text-xl font-bold text-gray-900">{title}</h2>
          <p className="text-sm text-gray-500 mt-1.5">{description}</p>
        </div>
      </div>

      {connected ? (
        <div className="flex items-center justify-center gap-2 py-3 rounded-xl bg-green-50 border border-green-200">
          <CheckCircle className="w-5 h-5 text-green-500" />
          <span className="text-sm font-semibold text-green-700">{connectedLabel}</span>
        </div>
      ) : (
        <button
          onClick={onConnect}
          disabled={loading}
          className="w-full py-3 rounded-xl bg-primary-600 text-white font-semibold hover:bg-primary-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
        >
          <ExternalLink className="w-4 h-4" />
          {loading ? "Đang kết nối..." : buttonLabel}
        </button>
      )}

      <div className="flex gap-3">
        <button
          onClick={onSkip}
          className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-500 hover:bg-gray-50 transition-colors"
        >
          Bỏ qua
        </button>
        <button
          onClick={onNext}
          disabled={!connected}
          className="flex-1 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-40 transition-colors"
        >
          Tiếp theo →
        </button>
      </div>
    </div>
  );
}

// ── Alert setup step ──────────────────────────────────────────────────────────

function AlertSetupStep({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const fetchWithAuth = useApiClient();
  const [roasThreshold, setRoasThreshold] = useState("2.0");
  const [email, setEmail] = useState("");
  const [created, setCreated] = useState(false);
  const [creating, setCreating] = useState(false);

  async function handleCreate() {
    if (!email.trim()) return;
    setCreating(true);
    try {
      await fetchWithAuth("/alerts/rules", {
        method: "POST",
        body: JSON.stringify({
          name: `ROAS dưới ${roasThreshold}`,
          conditions: [{ metric: "roas", operator: "lt", threshold: parseFloat(roasThreshold), window: "1h" }],
          logic: "AND",
          actions: [{ type: "email", to: email.trim() }],
          isActive: true,
        }),
      });
      setCreated(true);
    } catch {
      setCreated(true);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center text-center gap-3">
        <Bell className="w-10 h-10 text-yellow-500" />
        <div>
          <h2 className="text-xl font-bold text-gray-900">Cảnh báo đầu tiên</h2>
          <p className="text-sm text-gray-500 mt-1.5">
            Được thông báo ngay khi ROAS giảm dưới ngưỡng. Đây là cảnh báo quan trọng nhất.
          </p>
        </div>
      </div>

      {created ? (
        <div className="flex items-center justify-center gap-2 py-3 rounded-xl bg-green-50 border border-green-200">
          <CheckCircle className="w-5 h-5 text-green-500" />
          <span className="text-sm font-semibold text-green-700">Cảnh báo đã được tạo!</span>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Cảnh báo khi ROAS thấp hơn</label>
            <div className="flex gap-2 items-center">
              <input
                type="number"
                step="0.1"
                className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-primary-500 outline-none"
                value={roasThreshold}
                onChange={e => setRoasThreshold(e.target.value)}
              />
              <span className="text-sm text-gray-400">× trong 1 giờ qua</span>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Gửi thông báo đến email</label>
            <input
              type="email"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              placeholder="your@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </div>
          <button
            onClick={handleCreate}
            disabled={creating || !email.trim()}
            className="w-full py-2.5 rounded-xl bg-yellow-500 text-white font-semibold hover:bg-yellow-600 disabled:opacity-60 transition-colors"
          >
            {creating ? "Đang tạo..." : "Tạo cảnh báo"}
          </button>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={onSkip}
          className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-500 hover:bg-gray-50 transition-colors"
        >
          Bỏ qua
        </button>
        <button
          onClick={onNext}
          disabled={!created}
          className="flex-1 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-40 transition-colors"
        >
          Tiếp theo →
        </button>
      </div>
    </div>
  );
}
