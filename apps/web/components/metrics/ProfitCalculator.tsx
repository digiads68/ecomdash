"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Calculator, Save } from "lucide-react";
import { useShopStore } from "@/lib/stores/shop-store";
import { useApiClient } from "@/lib/api-client";
import { formatVNDCompact } from "@/lib/format";
import { cn } from "@/lib/utils";

interface ShopConfig {
  cogsPercent: number;
  shippingPercent: number;
  platformFeePercent: number;
}

function PctInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm text-gray-600 min-w-0 flex-1">{label}</span>
      <div className="flex items-center gap-1 shrink-0">
        <input
          type="number"
          min={0}
          max={100}
          step={0.5}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="w-16 border border-gray-300 rounded-lg px-2 py-1 text-sm font-mono text-right focus:ring-2 focus:ring-primary-500 outline-none"
        />
        <span className="text-xs text-gray-400">%</span>
      </div>
    </div>
  );
}

export function ProfitCalculator() {
  const { selectedShopId, getDateRangeValues } = useShopStore();
  const { from, to } = getDateRangeValues();
  const fetchWithAuth = useApiClient();
  const queryClient = useQueryClient();

  const { data: overview } = useQuery({
    queryKey: ["overview", selectedShopId, from, to],
    queryFn: () =>
      fetchWithAuth<{ revenue: number; adSpend: number }>(`/metrics/overview?shopId=${selectedShopId}&from=${from}&to=${to}`),
    enabled: !!selectedShopId,
    staleTime: 60_000,
  });

  const { data: savedConfig } = useQuery({
    queryKey: ["shop-config", selectedShopId],
    queryFn: () => fetchWithAuth<ShopConfig>(`/shops/${selectedShopId}/config`),
    enabled: !!selectedShopId,
    staleTime: 300_000,
  });

  const [cogs, setCogs] = useState(40);
  const [shipping, setShipping] = useState(5);
  const [platform, setPlatform] = useState(2);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (savedConfig) {
      setCogs(savedConfig.cogsPercent);
      setShipping(savedConfig.shippingPercent);
      setPlatform(savedConfig.platformFeePercent);
      setDirty(false);
    }
  }, [savedConfig]);

  const saveMutation = useMutation({
    mutationFn: () =>
      fetchWithAuth(`/shops/${selectedShopId}/config`, {
        method: "PUT",
        body: JSON.stringify({ cogsPercent: cogs, shippingPercent: shipping, platformFeePercent: platform }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shop-config", selectedShopId] });
      setDirty(false);
    },
  });

  const gmv = overview?.revenue ?? 0;
  const adSpend = overview?.adSpend ?? 0;
  const cogsCost = gmv * cogs / 100;
  const shippingCost = gmv * shipping / 100;
  const platformFee = gmv * platform / 100;
  const totalCost = adSpend + cogsCost + shippingCost + platformFee;
  const netProfit = gmv - totalCost;
  const margin = gmv > 0 ? (netProfit / gmv) * 100 : 0;
  const fixedCost = cogsCost + shippingCost + platformFee;
  const breakEvenROAS = fixedCost > 0 ? gmv / fixedCost : 0;
  const currentROAS = adSpend > 0 ? gmv / adSpend : 0;

  if (!selectedShopId) return null;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Calculator className="w-5 h-5 text-primary-500" />
          <h2 className="text-base font-semibold text-gray-800">Lợi nhuận ước tính</h2>
        </div>
        {dirty && (
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-60 transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            {saveMutation.isPending ? "Đang lưu..." : "Lưu cấu hình"}
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Inputs */}
        <div className="space-y-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Cấu hình chi phí (% doanh thu)</p>
          <PctInput label="Giá vốn hàng (COGS)" value={cogs} onChange={(v) => { setCogs(v); setDirty(true); }} />
          <PctInput label="Phí vận chuyển" value={shipping} onChange={(v) => { setShipping(v); setDirty(true); }} />
          <PctInput label="Phí nền tảng TikTok" value={platform} onChange={(v) => { setPlatform(v); setDirty(true); }} />
        </div>

        {/* Results */}
        <div className="space-y-2.5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Kết quả kỳ này</p>
          <Row label="Doanh thu (GMV)" value={formatVNDCompact(gmv)} />
          <Row label="— Chi phí quảng cáo" value={`-${formatVNDCompact(adSpend)}`} muted />
          <Row label={`— Giá vốn (${cogs}%)`} value={`-${formatVNDCompact(cogsCost)}`} muted />
          <Row label={`— Vận chuyển (${shipping}%)`} value={`-${formatVNDCompact(shippingCost)}`} muted />
          <Row label={`— Phí platform (${platform}%)`} value={`-${formatVNDCompact(platformFee)}`} muted />
          <div className="border-t border-gray-100 pt-2.5 mt-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-gray-800">Lợi nhuận ròng</span>
              <span className={cn("text-base font-bold tabular-nums", netProfit >= 0 ? "text-green-600" : "text-red-600")}>
                {formatVNDCompact(netProfit)}{" "}
                <span className="text-sm">({margin.toFixed(1)}%)</span>
              </span>
            </div>
          </div>
          <div className="bg-gray-50 rounded-xl p-3 mt-1 flex items-center justify-between">
            <span className="text-xs text-gray-500">ROAS hòa vốn</span>
            <span className={cn("text-sm font-bold", currentROAS >= breakEvenROAS && breakEvenROAS > 0 ? "text-green-600" : "text-amber-600")}>
              {breakEvenROAS.toFixed(2)}×
              <span className="text-xs font-normal text-gray-400 ml-1">(hiện tại: {currentROAS.toFixed(2)}×)</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={cn("text-sm", muted ? "text-gray-400" : "text-gray-600")}>{label}</span>
      <span className={cn("text-sm font-mono font-medium tabular-nums", muted ? "text-gray-400" : "text-gray-800")}>{value}</span>
    </div>
  );
}
