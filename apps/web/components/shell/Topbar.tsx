"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { AlertInstanceDto, MeDto, ShopDto, SyncStateDto } from "@ecomdash/shared";
import { useApi } from "@/lib/api";
import { PeriodPreset, useAppStore, usePeriod } from "@/lib/store";
import { formatDateTime, formatFullDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: "today", label: "Hôm nay" }, { value: "7d", label: "7 ngày" }, { value: "30d", label: "30 ngày" },
  { value: "this_month", label: "Tháng này" }, { value: "last_month", label: "Tháng trước" },
];

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { shopId, setShopId, preset, setPreset, setCustom } = useAppStore();
  const period = usePeriod();
  const shops = useApi<ShopDto[]>("/shops", {}, { shop: false });
  const me = useApi<MeDto>("/me", {}, { shop: false });
  const alerts = useApi<AlertInstanceDto[]>("/alerts/instances", { state: "FIRING" }, { shop: false, refetchInterval: 60_000 });
  const sync = useApi<SyncStateDto[]>("/sync/status", {}, { shop: false, refetchInterval: 60_000 });
  const [custom, setCustomOpen] = useState(false);

  useEffect(() => {
    if (shops.data?.length && !shops.data.some((s) => s.id === shopId)) setShopId(shops.data[0].id);
  }, [shops.data, shopId, setShopId]);

  const lastSync = sync.data?.filter((s) => s.scopeId === shopId && s.resource === "orders").map((s) => s.lastSuccessAt).find(Boolean);
  const firing = alerts.data?.filter((a) => !a.acknowledgedAt).length ?? 0;

  return (
    <header className="sticky top-0 z-10 flex flex-wrap items-center gap-2.5 border-b border-gray-200 bg-white px-4 py-3 lg:px-6">
      <button type="button" onClick={onMenu} className="rounded-lg border border-gray-200 px-2.5 py-1.5 lg:hidden" aria-label="Mở menu">☰</button>
      <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-2.5 py-1.5">
        <span className="text-xs text-gray-500">Shop</span>
        <select id="shop-switcher" className="max-w-[200px] bg-transparent text-sm outline-none" value={shopId ?? ""} onChange={(e) => setShopId(e.target.value)}>
          {!shops.data?.length && <option value="">Chưa kết nối shop</option>}
          {shops.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      <div className="inline-flex max-w-full overflow-x-auto rounded-lg border border-gray-200" role="group" aria-label="Khoảng thời gian">
        {PRESETS.map((p) => (
          <button key={p.value} type="button" onClick={() => { setPreset(p.value); setCustomOpen(false); }}
            className={cn("whitespace-nowrap border-l border-gray-200 px-2.5 py-1.5 text-sm first:border-l-0", preset === p.value ? "bg-primary-50 font-semibold text-primary-700" : "text-gray-500 hover:bg-gray-50")}>
            {p.label}
          </button>
        ))}
        <button type="button" onClick={() => setCustomOpen((v) => !v)} className={cn("whitespace-nowrap border-l border-gray-200 px-2.5 py-1.5 text-sm", preset === "custom" ? "bg-primary-50 font-semibold text-primary-700" : "text-gray-500 hover:bg-gray-50")}>
          Tuỳ chọn
        </button>
      </div>
      {custom && (
        <form className="flex items-center gap-1.5 text-sm" onSubmit={(e) => { e.preventDefault(); const f = e.currentTarget; setCustom((f.elements.namedItem("from") as HTMLInputElement).value, (f.elements.namedItem("to") as HTMLInputElement).value); setCustomOpen(false); }}>
          <input id="period-from" name="from" type="date" defaultValue={period.from} className="rounded-md border border-gray-200 px-2 py-1" required />
          <span>–</span>
          <input id="period-to" name="to" type="date" defaultValue={period.to} className="rounded-md border border-gray-200 px-2 py-1" required />
          <button className="rounded-md bg-primary-500 px-2.5 py-1 text-white">Áp dụng</button>
        </form>
      )}
      <span className="hidden text-xs text-gray-400 2xl:inline">{formatFullDate(period.from)} – {formatFullDate(period.to)}</span>
      <div className="flex-1" />
      <span className="hidden items-center gap-1.5 whitespace-nowrap text-xs text-gray-500 md:flex">
        <span className={cn("h-2 w-2 rounded-full", lastSync ? "bg-green-500" : "bg-gray-300")} />
        {lastSync ? `Cập nhật ${formatDateTime(lastSync)}` : "Chưa đồng bộ"}
      </span>
      <Link href="/alerts" className="relative rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm" aria-label="Cảnh báo">
        🔔{firing > 0 && <span className="absolute -right-1.5 -top-1.5 rounded-full bg-red-500 px-1.5 text-[10px] font-semibold text-white">{firing}</span>}
      </Link>
      <div className="flex items-center gap-2 text-sm">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-primary-500 text-xs font-semibold text-white">{(me.data?.user.name ?? "D").slice(0, 1)}</span>
        <span className="hidden text-gray-700 2xl:inline">{me.data?.authMode === "demo" ? "Tài khoản demo" : me.data?.user.name}</span>
      </div>
    </header>
  );
}
