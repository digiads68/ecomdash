"use client";

import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPctChange } from "@/lib/format";

interface MetricCardProps {
  label: string;
  value: string;
  change?: number;
  icon?: React.ReactNode;
  loading?: boolean;
}

function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn("animate-pulse bg-gray-200 rounded", className)} />;
}

export function MetricCard({ label, value, change, icon, loading }: MetricCardProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
        <SkeletonBlock className="h-4 w-24" />
        <SkeletonBlock className="h-7 w-32" />
        <SkeletonBlock className="h-4 w-16" />
      </div>
    );
  }

  const isPositive = change !== undefined && change > 0;
  const isNegative = change !== undefined && change < 0;
  const isNeutral = change !== undefined && change === 0;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-500">{label}</span>
        {icon && <div className="text-primary-500">{icon}</div>}
      </div>

      <p className="text-2xl font-bold text-gray-900 tabular-nums">{value}</p>

      {change !== undefined && (
        <div className="flex items-center gap-1 mt-2">
          {isPositive && <TrendingUp className="w-3.5 h-3.5 text-green-600" />}
          {isNegative && <TrendingDown className="w-3.5 h-3.5 text-red-600" />}
          {isNeutral && <Minus className="w-3.5 h-3.5 text-gray-400" />}
          <span
            className={cn(
              "text-xs font-semibold",
              isPositive && "text-green-600",
              isNegative && "text-red-600",
              isNeutral && "text-gray-400"
            )}
          >
            {formatPctChange(change)}
          </span>
          <span className="text-xs text-gray-400">so với kỳ trước</span>
        </div>
      )}
    </div>
  );
}
