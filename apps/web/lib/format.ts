const nf = new Intl.NumberFormat("vi-VN");

export const formatNumber = (v: number | null | undefined) => (v == null ? "—" : nf.format(Math.round(v)));
export const formatVND = (v: number | null | undefined) => (v == null ? "—" : `${nf.format(Math.round(v))} ₫`);

/** 1,95 tỷ · 309,2 tr · 63k — the way Vietnamese sellers read money. */
export function formatVNDCompact(v: number | null | undefined): string {
  if (v == null || !isFinite(v)) return "—";
  const a = Math.abs(v);
  const s = v < 0 ? "−" : "";
  const dec = (x: number, d: number) => x.toFixed(d).replace(".", ",");
  if (a >= 1e9) return `${s}${dec(a / 1e9, 2)} tỷ`;
  if (a >= 1e6) return `${s}${dec(a / 1e6, 1)} tr`;
  if (a >= 1e3) return `${s}${Math.round(a / 1e3)}k`;
  return `${s}${Math.round(a)} ₫`;
}

export const formatPct = (v: number | null | undefined, digits = 1) => (v == null || !isFinite(v) ? "—" : `${(v * 100).toFixed(digits).replace(".", ",")}%`);
export const formatChange = (v: number | null | undefined) => (v == null || !isFinite(v) ? "—" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(1).replace(".", ",")}%`);
export const formatRoas = (v: number | null | undefined) => (v == null || !isFinite(v) ? "—" : `${v.toFixed(2).replace(".", ",")}×`);

const dt = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit" });
const dtt = new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
export const formatDay = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;
export const formatDate = (iso: string) => dt.format(new Date(iso));
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const parts = Object.fromEntries(dtt.formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return `${parts.day}/${parts.month} ${parts.hour}:${parts.minute}`;
}
export const formatFullDate = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}`;
