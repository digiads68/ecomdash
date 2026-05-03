"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Bell, BellOff, AlertTriangle, CheckCircle } from "lucide-react";
import { useApiClient } from "@/lib/api-client";
import { useShopStore } from "@/lib/stores/shop-store";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { vi } from "date-fns/locale";
import type { AlertInstanceDto, AlertRuleConfig } from "@ecomdash/shared";

// ── Types ────────────────────────────────────────────────────────────────────

interface AlertRule {
  id: string;
  name: string;
  isActive: boolean;
  conditions: AlertRuleConfig;
  actions: { actions: AlertRuleConfig["actions"] };
  createdAt: string;
}

// ── Create Rule Modal ─────────────────────────────────────────────────────────

const METRICS = [
  { value: "roas", label: "ROAS" },
  { value: "gmv", label: "Doanh thu (GMV)" },
  { value: "ad_spend", label: "Chi phí quảng cáo" },
  { value: "order_count", label: "Số đơn hàng" },
  { value: "ctr", label: "CTR" },
];

const OPERATORS = [
  { value: "lt", label: "nhỏ hơn (<)" },
  { value: "lte", label: "nhỏ hơn hoặc bằng (≤)" },
  { value: "gt", label: "lớn hơn (>)" },
  { value: "gte", label: "lớn hơn hoặc bằng (≥)" },
];

const WINDOWS = ["1h", "2h", "6h", "24h"];

interface CreateRuleFormData {
  name: string;
  metric: string;
  operator: string;
  threshold: string;
  window: string;
  emailTo: string;
  telegramChatId: string;
}

function CreateRuleModal({
  shopId,
  onClose,
  onCreated,
}: {
  shopId: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const fetchWithAuth = useApiClient();
  const [form, setForm] = useState<CreateRuleFormData>({
    name: "",
    metric: "roas",
    operator: "lt",
    threshold: "2",
    window: "1h",
    emailTo: "",
    telegramChatId: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const set = (k: keyof CreateRuleFormData, v: string) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError("Tên cảnh báo không được để trống"); return; }
    if (!form.emailTo.trim() && !form.telegramChatId.trim()) {
      setError("Cần ít nhất một kênh thông báo (Email hoặc Telegram)");
      return;
    }
    setError("");
    setSaving(true);

    const actions: AlertRuleConfig["actions"] = [];
    if (form.emailTo.trim()) actions.push({ type: "email", to: form.emailTo.trim() });
    if (form.telegramChatId.trim()) actions.push({ type: "telegram", chatId: form.telegramChatId.trim() });

    try {
      await fetchWithAuth("/alerts/rules", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          shopId: shopId || undefined,
          conditions: [{ metric: form.metric, operator: form.operator, threshold: parseFloat(form.threshold), window: form.window }],
          logic: "AND",
          actions,
          isActive: true,
        }),
      });
      onCreated();
      onClose();
    } catch (err: any) {
      setError(err.message || "Không thể tạo cảnh báo");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className="px-6 py-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Tạo cảnh báo mới</h2>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Tên cảnh báo</label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none"
              placeholder="VD: ROAS thấp nguy hiểm"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </div>

          {/* Condition */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Điều kiện kích hoạt</label>
            <div className="grid grid-cols-3 gap-2">
              <select
                className="col-span-1 border border-gray-300 rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                value={form.metric}
                onChange={(e) => set("metric", e.target.value)}
              >
                {METRICS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
              <select
                className="col-span-1 border border-gray-300 rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                value={form.operator}
                onChange={(e) => set("operator", e.target.value)}
              >
                {OPERATORS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <input
                type="number"
                step="0.1"
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                value={form.threshold}
                onChange={(e) => set("threshold", e.target.value)}
              />
            </div>
          </div>

          {/* Window */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Khoảng thời gian</label>
            <div className="flex gap-2">
              {WINDOWS.map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => set("window", w)}
                  className={cn(
                    "flex-1 py-1.5 rounded-lg text-sm font-medium border transition-colors",
                    form.window === w
                      ? "bg-primary-600 text-white border-primary-600"
                      : "border-gray-300 text-gray-600 hover:bg-gray-50"
                  )}
                >
                  {w}
                </button>
              ))}
            </div>
          </div>

          {/* Notifications */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Thông báo qua</label>
            <div className="space-y-2">
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                placeholder="Email (VD: shop@gmail.com)"
                value={form.emailTo}
                onChange={(e) => set("emailTo", e.target.value)}
              />
              <input
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                placeholder="Telegram Chat ID (VD: -1001234567)"
                value={form.telegramChatId}
                onChange={(e) => set("telegramChatId", e.target.value)}
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-60 transition-colors"
            >
              {saving ? "Đang tạo..." : "Tạo cảnh báo"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Alert Rule Card ───────────────────────────────────────────────────────────

function AlertRuleCard({ rule, onDelete }: { rule: AlertRule; onDelete: (id: string) => void }) {
  const cond = rule.conditions?.conditions?.[0];
  const actions = rule.actions?.actions ?? [];

  return (
    <div className={cn(
      "bg-white rounded-xl border p-4 hover:shadow-sm transition-shadow",
      rule.isActive ? "border-gray-200" : "border-gray-100 opacity-60"
    )}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={cn(
            "mt-0.5 p-1.5 rounded-lg",
            rule.isActive ? "bg-primary-50" : "bg-gray-100"
          )}>
            {rule.isActive ? (
              <Bell className="w-4 h-4 text-primary-600" />
            ) : (
              <BellOff className="w-4 h-4 text-gray-400" />
            )}
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">{rule.name}</p>
            {cond && (
              <p className="text-xs text-gray-500 mt-0.5">
                {METRICS.find(m => m.value === cond.metric)?.label ?? cond.metric}{" "}
                {OPERATORS.find(o => o.value === cond.operator)?.label ?? cond.operator}{" "}
                <span className="font-medium text-gray-700">{cond.threshold}</span>
                {" "}trong{" "}<span className="font-medium text-gray-700">{cond.window}</span>
              </p>
            )}
            <div className="flex gap-2 mt-2 flex-wrap">
              {actions.map((a, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-600">
                  {a.type === "email" ? "📧 " + (a.to ?? "") : "✈️ Telegram"}
                </span>
              ))}
            </div>
          </div>
        </div>

        <button
          onClick={() => onDelete(rule.id)}
          className="shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
          title="Xóa cảnh báo"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ── Alert Instance Row ────────────────────────────────────────────────────────

function AlertInstanceRow({ alert }: { alert: AlertInstanceDto }) {
  const isFiring = alert.state === "FIRING";
  return (
    <div className={cn(
      "flex items-start gap-3 px-4 py-3 border-b border-gray-50 last:border-0",
      isFiring && !alert.acknowledgedAt && "bg-red-50/30"
    )}>
      <div className="mt-0.5">
        {isFiring
          ? <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
          : <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900">{alert.ruleName}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {formatDistanceToNow(new Date(alert.firedAt), { addSuffix: true, locale: vi })}
          {alert.resolvedAt && ` · Đã giải quyết ${formatDistanceToNow(new Date(alert.resolvedAt), { addSuffix: true, locale: vi })}`}
        </p>
      </div>
      <span className={cn(
        "shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide",
        isFiring
          ? alert.acknowledgedAt ? "bg-yellow-100 text-yellow-700" : "bg-red-100 text-red-700"
          : "bg-green-100 text-green-700"
      )}>
        {isFiring ? (alert.acknowledgedAt ? "Đã nhận" : "Đang kích hoạt") : "Đã giải quyết"}
      </span>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AlertsPage() {
  const fetchWithAuth = useApiClient();
  const queryClient = useQueryClient();
  const { selectedShopId } = useShopStore();
  const [showCreate, setShowCreate] = useState(false);

  const { data: rules = [], isLoading: loadingRules } = useQuery<AlertRule[]>({
    queryKey: ["alert-rules"],
    queryFn: () => fetchWithAuth<AlertRule[]>("/alerts/rules"),
  });

  const { data: instances = [], isLoading: loadingInstances } = useQuery<AlertInstanceDto[]>({
    queryKey: ["alerts", "instances"],
    queryFn: () => fetchWithAuth<AlertInstanceDto[]>("/alerts/instances?limit=20"),
    refetchInterval: 30_000,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => fetchWithAuth(`/alerts/rules/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["alert-rules"] }),
  });

  const firingCount = instances.filter(a => a.state === "FIRING" && !a.acknowledgedAt).length;

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cảnh báo</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {firingCount > 0
              ? <span className="text-red-600 font-medium">{firingCount} cảnh báo đang kích hoạt</span>
              : "Tất cả hoạt động bình thường"}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Tạo cảnh báo
        </button>
      </div>

      {/* Rules grid */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">
          Quy tắc cảnh báo ({rules.length})
        </h2>
        {loadingRules ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[1, 2].map(i => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
                <div className="h-4 bg-gray-100 rounded w-40 mb-2" />
                <div className="h-3 bg-gray-100 rounded w-64" />
              </div>
            ))}
          </div>
        ) : rules.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 bg-white rounded-xl border border-dashed border-gray-300 text-center">
            <Bell className="w-8 h-8 text-gray-300 mb-3" />
            <p className="text-sm font-medium text-gray-500">Chưa có cảnh báo nào</p>
            <p className="text-xs text-gray-400 mt-1">Tạo cảnh báo để được thông báo khi ROAS giảm, hết hàng, v.v.</p>
            <button
              onClick={() => setShowCreate(true)}
              className="mt-4 px-4 py-1.5 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors"
            >
              + Tạo cảnh báo đầu tiên
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {rules.map(rule => (
              <AlertRuleCard
                key={rule.id}
                rule={rule}
                onDelete={(id) => deleteMutation.mutate(id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Recent instances */}
      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Lịch sử cảnh báo</h2>
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loadingInstances ? (
            <div className="p-4 space-y-3">
              {[1, 2, 3].map(i => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}
            </div>
          ) : instances.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-sm text-gray-400">
              Chưa có lịch sử cảnh báo
            </div>
          ) : (
            instances.map(alert => <AlertInstanceRow key={alert.id} alert={alert} />)
          )}
        </div>
      </section>

      {showCreate && (
        <CreateRuleModal
          shopId={selectedShopId}
          onClose={() => setShowCreate(false)}
          onCreated={() => queryClient.invalidateQueries({ queryKey: ["alert-rules"] })}
        />
      )}
    </div>
  );
}
