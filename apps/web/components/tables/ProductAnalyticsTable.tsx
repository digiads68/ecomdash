"use client";

import { useState } from "react";
import Image from "next/image";
import { ArrowUpDown } from "lucide-react";
import { formatVNDCompact, formatROAS } from "@/lib/format";
import { cn } from "@/lib/utils";

type HealthScore = "good" | "normal" | "warning" | "poor";

const HEALTH_CONFIG: Record<HealthScore, { label: string; className: string }> = {
  good: { label: "Tốt", className: "bg-green-100 text-green-700" },
  normal: { label: "Bình thường", className: "bg-gray-100 text-gray-600" },
  warning: { label: "Cần chú ý", className: "bg-yellow-100 text-yellow-700" },
  poor: { label: "Kém", className: "bg-red-100 text-red-700" },
};

export interface ProductRow {
  id: string;
  name: string;
  imageUrl: string | null;
  gmv: number;
  orders: number;
  adSpend: number;
  roas: number;
  healthScore: HealthScore;
}

type SortKey = "gmv" | "orders" | "roas";

interface Props {
  products: ProductRow[];
  onSortChange?: (sort: SortKey) => void;
  currentSort?: SortKey;
}

export function ProductAnalyticsTable({ products, onSortChange, currentSort = "gmv" }: Props) {
  const [sort, setSort] = useState<SortKey>(currentSort);

  function handleSort(key: SortKey) {
    setSort(key);
    onSortChange?.(key);
  }

  const headers: { key: SortKey; label: string }[] = [
    { key: "gmv", label: "Doanh thu" },
    { key: "orders", label: "Đơn hàng" },
    { key: "roas", label: "ROAS" },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left py-3 px-4 font-medium text-gray-500">Sản phẩm</th>
            <th className="py-3 px-3 font-medium text-gray-500 text-center">Sức khỏe</th>
            {headers.map((h) => (
              <th key={h.key} className="text-right py-3 px-4">
                <button
                  onClick={() => handleSort(h.key)}
                  className="flex items-center gap-1 ml-auto font-medium text-gray-500 hover:text-gray-800 transition-colors"
                >
                  {h.label}
                  <ArrowUpDown className={cn("w-3.5 h-3.5", sort === h.key ? "text-primary-500" : "text-gray-300")} />
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {products.map((p) => {
            const health = HEALTH_CONFIG[p.healthScore];
            return (
              <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                <td className="py-3 px-4">
                  <div className="flex items-center gap-3 min-w-0">
                    {p.imageUrl ? (
                      <Image
                        src={p.imageUrl}
                        alt={p.name}
                        width={36}
                        height={36}
                        className="rounded-lg object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-lg bg-gray-100 shrink-0" />
                    )}
                    <span className="font-medium text-gray-800 truncate">{p.name}</span>
                  </div>
                </td>
                <td className="py-3 px-3 text-center">
                  <span className={cn("inline-block text-xs font-semibold px-2 py-0.5 rounded-full", health.className)}>
                    {health.label}
                  </span>
                </td>
                <td className="py-3 px-4 text-right font-mono text-gray-800">
                  {formatVNDCompact(p.gmv)}
                </td>
                <td className="py-3 px-4 text-right text-gray-600">
                  {p.orders.toLocaleString("vi-VN")}
                </td>
                <td className="py-3 px-4 text-right">
                  <span className={cn(
                    "font-semibold",
                    p.roas >= 3 ? "text-green-600" : p.roas >= 1.5 ? "text-blue-600" : p.roas >= 1 ? "text-amber-600" : "text-red-600"
                  )}>
                    {formatROAS(p.roas)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {products.length === 0 && (
        <div className="py-12 text-center text-sm text-gray-400">Chưa có dữ liệu sản phẩm trong kỳ này</div>
      )}
    </div>
  );
}
