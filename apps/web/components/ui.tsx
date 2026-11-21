"use client";

import Link from "next/link";
import type { Kpi as KpiDto } from "@ecomdash/shared";
import { cn } from "@/lib/utils";
import { formatChange } from "@/lib/format";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold tracking-tight text-gray-900">{title}</h1>
        {subtitle && <p className="mt-0.5 text-[13px] text-gray-500">{subtitle}</p>}
      </div>
      <div className="flex-1" />
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, hint, actions, children, className }: { title?: React.ReactNode; hint?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("min-w-0 rounded-[10px] border border-gray-200 bg-white p-4", className)}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {title && <h2 className="text-sm font-semibold text-gray-900">{title}</h2>}
          {hint && <span className="text-xs text-gray-400">{hint}</span>}
          <div className="flex-1" />
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

/** Green = good. For costs and rates where a rise is bad pass inverse. */
export function ChangePill({ value, inverse = false }: { value: number | null | undefined; inverse?: boolean }) {
  if (value == null || !isFinite(value)) return <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">—</span>;
  const flat = Math.abs(value) < 0.005;
  const good = inverse ? value < 0 : value > 0;
  return (
    <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold", flat ? "bg-gray-100 text-gray-500" : good ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600")} title="So với kỳ trước cùng độ dài">
      {formatChange(value)}
    </span>
  );
}

export function Sparkline({ values, tone = "blue" }: { values: number[]; tone?: "blue" | "green" | "red" }) {
  if (values.length < 2) return null;
  const w = 84, h = 26, mx = Math.max(...values), mn = Math.min(...values), rg = mx - mn || 1;
  const pts = values.map((v, i) => [2 + (i * (w - 4)) / (values.length - 1), h - 3 - ((v - mn) / rg) * (h - 6)]);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const c = tone === "green" ? "#059669" : tone === "red" ? "#dc2626" : "#3b82f6";
  const last = pts[pts.length - 1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>
      <path d={`${d} L${last[0]} ${h} L2 ${h} Z`} fill={c} opacity={0.12} />
      <path d={d} fill="none" stroke={c} strokeWidth={1.6} />
      <circle cx={last[0]} cy={last[1]} r={2.2} fill={c} />
    </svg>
  );
}

export function KpiCard({ label, value, kpi, inverse, tag, spark, hint }: { label: string; value: string; kpi?: KpiDto; inverse?: boolean; tag?: string; spark?: number[]; hint?: string }) {
  const ch = kpi?.changePct;
  const tone = ch == null || Math.abs(ch) < 0.005 ? "blue" : (inverse ? ch < 0 : ch > 0) ? "green" : "red";
  return (
    <div className="min-w-0 rounded-[10px] border border-gray-200 bg-white px-3.5 pb-2.5 pt-3.5" title={hint}>
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        {label}
        {tag && <span className="rounded-full bg-gray-100 px-1.5 text-[11px] font-medium text-gray-500">{tag}</span>}
      </div>
      <div className="mt-1 whitespace-nowrap text-[21px] font-bold tracking-tight tabular-nums text-gray-900">{value}</div>
      <div className="mt-1 flex items-center justify-between gap-2">
        {kpi ? <ChangePill value={ch} inverse={inverse} /> : <span />}
        {spark && <Sparkline values={spark} tone={tone} />}
      </div>
    </div>
  );
}

const BADGE: Record<string, string> = {
  blue: "bg-blue-50 text-blue-700", green: "bg-green-50 text-green-700", red: "bg-red-50 text-red-700",
  amber: "bg-amber-50 text-amber-700", gray: "bg-gray-100 text-gray-600", violet: "bg-violet-50 text-violet-700",
};

export function Badge({ tone = "gray", children, dot = true }: { tone?: keyof typeof BADGE; children: React.ReactNode; dot?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", BADGE[tone])}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function Tag({ children, tone = "gray" }: { children: React.ReactNode; tone?: "gray" | "violet" | "amber" }) {
  const c = tone === "violet" ? "bg-violet-50 text-violet-700" : tone === "amber" ? "bg-amber-50 text-amber-700" : "bg-gray-100 text-gray-600";
  return <span className={cn("whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium", c)}>{children}</span>;
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange?: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange?.(!on)} disabled={!onChange}
      className={cn("relative h-5 w-9 flex-none rounded-full transition-colors", on ? "bg-primary-500" : "bg-gray-300", !onChange && "cursor-default")}>
      <span className={cn("absolute top-[3px] h-3.5 w-3.5 rounded-full bg-white transition-all", on ? "right-[3px]" : "left-[3px]")} />
    </button>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: React.ReactNode }[] }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-gray-200">
      {items.map((t) => (
        <button key={t.value} type="button" onClick={() => onChange(t.value)}
          className={cn("whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium", value === t.value ? "border-primary-500 text-primary-700" : "border-transparent text-gray-500 hover:text-gray-800")}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function LinkTabs({ active, items }: { active: string; items: { href: string; label: string }[] }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-gray-200">
      {items.map((t) => (
        <Link key={t.href} href={t.href} className={cn("whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium", active === t.href ? "border-primary-500 text-primary-700" : "border-transparent text-gray-500 hover:text-gray-800")}>
          {t.label}
        </Link>
      ))}
    </div>
  );
}

export function TableWrap({ children }: { children: React.ReactNode }) {
  return <div className="overflow-x-auto rounded-[10px] border border-gray-200 bg-white"><table className="w-full border-collapse text-[13px]">{children}</table></div>;
}
export const Th = ({ children, right, className }: { children?: React.ReactNode; right?: boolean; className?: string }) => (
  <th className={cn("whitespace-nowrap border-b border-gray-200 bg-gray-50 px-3 py-2 text-left text-xs font-semibold text-gray-500", right && "text-right", className)}>{children}</th>
);
export const Td = ({ children, right, className, colSpan }: { children?: React.ReactNode; right?: boolean; className?: string; colSpan?: number }) => (
  <td colSpan={colSpan} className={cn("whitespace-nowrap border-b border-gray-100 px-3 py-2 align-middle", right && "text-right tabular-nums", className)}>{children}</td>
);

export function ProductCell({ title, sub, image }: { title: string; sub?: React.ReactNode; image?: string | null }) {
  return (
    <div className="flex min-w-[220px] items-center gap-2.5">
      {image ? <img src={image} alt="" className="h-9 w-9 flex-none rounded-md object-cover" /> : <div className="h-9 w-9 flex-none rounded-md bg-gray-100" />}
      <div className="min-w-0">
        <div className="max-w-[280px] whitespace-normal font-medium leading-snug text-gray-900">{title}</div>
        {sub && <div className="text-xs text-gray-400">{sub}</div>}
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-gray-100", className)} />;
}

export function Empty({ title = "Chưa có dữ liệu", children }: { title?: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-[10px] border border-dashed border-gray-300 bg-white px-6 py-10 text-center">
      <p className="font-medium text-gray-800">{title}</p>
      <div className="mt-1 text-sm text-gray-500">{children ?? <>Đồng bộ lần đầu có thể mất vài phút. Kiểm tra trạng thái tại <Link className="text-primary-600 underline" href="/settings/connections">Cài đặt → Kết nối</Link>.</>}</div>
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      <span>Không tải được dữ liệu: {(error as Error)?.message ?? "lỗi không xác định"}</span>
      {onRetry && <button type="button" onClick={onRetry} className="rounded-md border border-red-300 bg-white px-2.5 py-1 text-xs font-medium">Thử lại</button>}
    </div>
  );
}

export function Loading({ rows = 3 }: { rows?: number }) {
  return <div className="grid gap-3">{Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>;
}

export function Button({ children, variant = "default", size = "md", className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "primary"; size?: "sm" | "md" }) {
  return (
    <button {...props} className={cn("rounded-lg border font-medium disabled:opacity-50", size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
      variant === "primary" ? "border-primary-500 bg-primary-500 text-white hover:bg-primary-600" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50", className)}>
      {children}
    </button>
  );
}

export function Notice({ tone = "amber", title, children, href }: { tone?: "amber" | "red" | "blue"; title: React.ReactNode; children?: React.ReactNode; href?: string }) {
  const bar = tone === "red" ? "border-l-red-500" : tone === "blue" ? "border-l-primary-500" : "border-l-amber-500";
  const body = (
    <div className={cn("rounded-lg border-l-[3px] bg-gray-50 px-3 py-2.5", bar, href && "hover:bg-gray-100")}>
      <div className="text-[13px] font-semibold text-gray-900">{title}</div>
      {children && <div className="text-xs text-gray-500">{children}</div>}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
