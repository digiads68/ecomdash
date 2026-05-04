"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, AlertTriangle, Target } from "lucide-react";
import { useShopStore } from "@/lib/stores/shop-store";
import { useApiClient } from "@/lib/api-client";
import { formatVNDCompact } from "@/lib/format";
import { cn } from "@/lib/utils";

interface ForecastData {
  currentSpend: number;
  projectedSpend: number;
  daysElapsed: number;
  daysInMonth: number;
  dailyAverage: number;
}

interface Props {
  adAccountId: string;
}

export function BudgetForecastWidget({ adAccountId }: Props) {
  const fetchWithAuth = useApiClient();
  const now = new Date();
  const [month] = useState(() => `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [budget, setBudget] = useState<number | "">("");

  const { data, isLoading } = useQuery({
    queryKey: ["budget-forecast", adAccountId, month],
    queryFn: () =>
      fetchWithAuth<ForecastData>(`/ads/budget-forecast?adAccountId=${adAccountId}&month=${month}`),
    enabled: !!adAccountId,
    staleTime: 300_000,
  });

  if (!adAccountId) return null;

  const progressPct = data && data.daysInMonth > 0
    ? (data.daysElapsed / data.daysInMonth) * 100
    : 0;
  const spendPct = budget && data ? (data.currentSpend / Number(budget)) * 100 : 0;
  const projectedPct = budget && data ? (data.projectedSpend / Number(budget)) * 100 : 0;
  const overBudget = budget && data && data.projectedSpend > Number(budget);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
      <div className="flex items-center gap-2 mb-5">
        <TrendingUp className="w-5 h-5 text-primary-500" />
        <h2 className="text-base font-semibold text-gray-800">Dự báo ngân sách tháng này</h2>
        <span className="text-xs text-gray-400 ml-auto">{month.split("-").reverse().join("/")}</span>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-6 animate-pulse bg-gray-100 rounded" />)}
        </div>
      ) : (
        <div className="space-y-5">
          {/* Progress */}
          <div>
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
              <span>Tiến độ tháng</span>
              <span>{data?.daysElapsed}/{data?.daysInMonth} ngày ({progressPct.toFixed(0)}%)</span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-primary-400 rounded-full" style={{ width: `${progressPct}%` }} />
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-xs text-gray-400 mb-1">Đã chi (MTD)</p>
              <p className="text-sm font-bold text-gray-800 tabular-nums">{formatVNDCompact(data?.currentSpend ?? 0)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">TB/ngày</p>
              <p className="text-sm font-bold text-gray-800 tabular-nums">{formatVNDCompact(data?.dailyAverage ?? 0)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Dự báo cuối tháng</p>
              <p className={cn("text-sm font-bold tabular-nums", overBudget ? "text-red-600" : "text-green-600")}>
                {formatVNDCompact(data?.projectedSpend ?? 0)}
              </p>
            </div>
          </div>

          {/* Budget input */}
          <div>
            <label className="text-xs font-medium text-gray-500 mb-1.5 flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5" />
              Ngân sách mục tiêu tháng (VND)
            </label>
            <input
              type="number"
              placeholder="Nhập ngân sách..."
              value={budget}
              onChange={(e) => setBudget(e.target.value ? Number(e.target.value) : "")}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 outline-none"
            />
          </div>

          {budget && data && (
            <div className="space-y-2">
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Đã chi</span>
                  <span>{spendPct.toFixed(1)}% ngân sách</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary-500"
                    style={{ width: `${Math.min(spendPct, 100)}%` }}
                  />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Dự báo</span>
                  <span className={overBudget ? "text-red-600 font-semibold" : ""}>{projectedPct.toFixed(1)}% ngân sách</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full", overBudget ? "bg-red-500" : "bg-green-500")}
                    style={{ width: `${Math.min(projectedPct, 100)}%` }}
                  />
                </div>
              </div>

              {overBudget && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 mt-1">
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-red-800">Cảnh báo vượt ngân sách</p>
                    <p className="text-xs text-red-600 mt-0.5">
                      Dự kiến chi {formatVNDCompact(data.projectedSpend - Number(budget))} vượt mức. Cân nhắc giảm ngân sách chiến dịch.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
