"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { AlertInstanceDto, ShopDto, SyncWatermarkDto } from "@ecomdash/shared";
import { logout, useApi, useCurrentOrgId, useMe, useShops } from "@/lib/api";
import { PeriodPreset, useAppStore, usePeriod } from "@/lib/store";
import { formatDateTime, formatFullDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: "today", label: "Hôm nay" }, { value: "7d", label: "7 ngày" }, { value: "30d", label: "30 ngày" },
  { value: "this_month", label: "Tháng này" }, { value: "last_month", label: "Tháng trước" },
];
const ROLE: Record<string, string> = { SUPER_ADMIN: "Super admin DigiAds", ADMIN: "Admin DigiAds", MOD: "Mod DigiAds", OWNER: "Chủ shop", MEMBER: "Thành viên" };

/** Shops grouped by client organisation — DigiAds staff see every client, clients see their own shops. */
function ShopPicker({ shops, value, onChange }: { shops: ShopDto[]; value: string | null; onChange: (id: string) => void }) {
  const groups = useMemo(() => {
    const m = new Map<string, ShopDto[]>();
    for (const s of shops) m.set(s.organizationName, [...(m.get(s.organizationName) ?? []), s]);
    return Array.from(m.entries());
  }, [shops]);
  return (
    <label className="flex items-center gap-2 rounded-lg border border-gray-200 px-2.5 py-1.5">
      <span className="text-xs text-gray-500">Shop</span>
      <select id="shop-switcher" className="max-w-[220px] bg-transparent text-sm outline-none" value={value ?? ""} onChange={(e) => onChange(e.target.value)}>
        {!shops.length && <option value="">Chưa có shop</option>}
        {groups.length > 1
          ? groups.map(([org, list]) => <optgroup key={org} label={org}>{list.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>)
          : shops.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </label>
  );
}

/** One line for both sources (12 §4): shop orders and ad spend are cut at the same sync round. */
function Watermark() {
  const orgId = useCurrentOrgId();
  const wm = useApi<SyncWatermarkDto>("/sync/watermark", {}, { shop: false, org: true, refetchInterval: 60_000 });
  if (!orgId || !wm.data) return null;
  const w = wm.data;
  // The common cut-off is the earlier of the two sources.
  const at = w.adsMode === "TIKTOK" && w.shopSyncedTo && w.adsSyncedTo ? (w.adsSyncedTo < w.shopSyncedTo ? w.adsSyncedTo : w.shopSyncedTo) : w.shopSyncedTo;
  const late = w.adsMode === "TIKTOK" && w.adsLagMinutes != null && w.adsLagMinutes > 20;
  return (
    <span className="hidden items-center gap-1.5 whitespace-nowrap text-xs text-gray-500 md:flex" title={`Shop: ${formatDateTime(w.shopSyncedTo)} · Quảng cáo: ${formatDateTime(w.adsSyncedTo)}`}>
      <span className={cn("h-2 w-2 rounded-full", !at ? "bg-gray-300" : late ? "bg-amber-500" : "bg-green-500")} />
      {!at ? "Đang đồng bộ lần đầu…" : late ? <span className="text-amber-700">Quảng cáo trễ {w.adsLagMinutes} phút</span> : `Số liệu đến ${formatDateTime(at)}${w.adsMode === "TIKTOK" ? " (shop + QC)" : ""}`}
    </span>
  );
}

function UserMenu() {
  const me = useMe();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);
  const u = me.data?.user;
  const role = me.data?.platformRole ?? me.data?.organizations[0]?.role ?? null;
  return (
    <div className="relative" ref={ref}>
      <button type="button" id="user-menu" onClick={() => setOpen((v) => !v)} className="flex items-center gap-2 text-sm">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-primary-500 text-xs font-semibold text-white">{(u?.name ?? u?.email ?? "?").slice(0, 1).toUpperCase()}</span>
        <span className="hidden text-left leading-tight 2xl:block">
          <span className="block max-w-[160px] truncate text-gray-800">{u?.name ?? u?.email}</span>
          {role && <span className="block text-[11px] text-gray-500">{ROLE[role] ?? role}</span>}
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-30 w-56 rounded-lg border border-gray-200 bg-white py-1 text-sm shadow-lg">
          <div className="border-b border-gray-100 px-3 py-2 text-xs text-gray-500">{u?.email ?? "Đăng nhập bằng TikTok Shop"}</div>
          <Link href="/settings/account" className="block px-3 py-2 hover:bg-gray-50" onClick={() => setOpen(false)}>Tài khoản & mật khẩu</Link>
          <button type="button" id="logout" className="block w-full px-3 py-2 text-left text-red-600 hover:bg-gray-50" onClick={logout}>Đăng xuất</button>
        </div>
      )}
    </div>
  );
}

export function Topbar({ onMenu }: { onMenu: () => void }) {
  const { shopId, setShopId, preset, setPreset, setCustom } = useAppStore();
  const period = usePeriod();
  const shops = useShops();
  const alerts = useApi<AlertInstanceDto[]>("/alerts/instances", { state: "FIRING" }, { shop: false, org: true, refetchInterval: 60_000 });
  const [custom, setCustomOpen] = useState(false);

  useEffect(() => {
    if (shops.data?.length && !shops.data.some((s) => s.id === shopId)) setShopId(shops.data[0].id);
  }, [shops.data, shopId, setShopId]);

  const firing = alerts.data?.filter((a) => !a.acknowledgedAt).length ?? 0;

  return (
    <header className="sticky top-0 z-10 flex flex-wrap items-center gap-2.5 border-b border-gray-200 bg-white px-4 py-3 lg:px-6">
      <button type="button" onClick={onMenu} className="rounded-lg border border-gray-200 px-2.5 py-1.5 lg:hidden" aria-label="Mở menu">☰</button>
      <ShopPicker shops={shops.data ?? []} value={shopId} onChange={setShopId} />
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
      <Watermark />
      <Link href="/alerts" className="relative rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm" aria-label="Cảnh báo">
        🔔{firing > 0 && <span className="absolute -right-1.5 -top-1.5 rounded-full bg-red-500 px-1.5 text-[10px] font-semibold text-white">{firing}</span>}
      </Link>
      <UserMenu />
    </header>
  );
}
