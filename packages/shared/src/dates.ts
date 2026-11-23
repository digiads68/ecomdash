export const DEFAULT_TZ = "Asia/Ho_Chi_Minh";

/** Calendar date (YYYY-MM-DD) of an instant in the given IANA timezone. */
export function toBusinessDate(at: Date, timeZone = DEFAULT_TZ): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** UTC-midnight Date for a YYYY-MM-DD string (how Prisma stores @db.Date). */
export function dateOnly(ymd: string): Date {
  return new Date(`${ymd}T00:00:00.000Z`);
}

export function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(ymdStr: string, days: number): string {
  const d = dateOnly(ymdStr);
  d.setUTCDate(d.getUTCDate() + days);
  return ymd(d);
}

export function daysBetweenInclusive(from: string, to: string): number {
  return Math.round((dateOnly(to).getTime() - dateOnly(from).getTime()) / 86_400_000) + 1;
}

export function eachDate(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function daysInMonth(ymdStr: string): number {
  const [y, m] = ymdStr.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Start of a business day in the shop timezone, as a UTC instant. Only fixed-offset zones (VN = +07:00) are exact. */
export function businessDayStart(ymdStr: string, utcOffsetMinutes = 420): Date {
  return new Date(dateOnly(ymdStr).getTime() - utcOffsetMinutes * 60_000);
}
