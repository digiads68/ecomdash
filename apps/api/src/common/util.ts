import { BadRequestException, NotFoundException } from "@nestjs/common";
import { prisma, Prisma } from "@ecomdash/database";
import { addDays, daysBetweenInclusive, toBusinessDate } from "@ecomdash/shared";

/** Prisma Decimal | number | null → number. */
export const n = (v: Prisma.Decimal | number | bigint | null | undefined): number => (v == null ? 0 : Number(v));
export const nOrNull = (v: Prisma.Decimal | number | null | undefined): number | null => (v == null ? null : Number(v));
export const div = (a: number, b: number): number | null => (b > 0 ? a / b : null);

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export interface Period {
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
  days: number;
}

/** Inclusive business-date range (05 §"Tham số chung"), default last 30 days, max 366. */
export function parsePeriod(from?: string, to?: string, timeZone?: string): Period {
  const today = toBusinessDate(new Date(), timeZone);
  const t = to && YMD.test(to) ? to : today;
  const f = from && YMD.test(from) ? from : addDays(t, -29);
  if (f > t) throw new BadRequestException("from must be on or before to");
  const days = daysBetweenInclusive(f, t);
  if (days > 366) throw new BadRequestException("Range cannot exceed 366 days");
  return { from: f, to: t, days, prevTo: addDays(f, -1), prevFrom: addDays(f, -days) };
}

export async function getShopForOrg(orgId: string, shopId: string | undefined) {
  if (!shopId) throw new BadRequestException("shopId is required");
  const shop = await prisma.shop.findFirst({ where: { id: shopId, organizationId: orgId } });
  if (!shop) throw new NotFoundException("Shop not found");
  return shop;
}

export function kpi(value: number | null, previous: number | null) {
  return { value, previous, changePct: value == null || previous == null || previous === 0 ? null : (value - previous) / Math.abs(previous) };
}

export function pageParams(page?: string | number, pageSize?: string | number, max = 200) {
  const p = Math.max(1, Number(page) || 1);
  const s = Math.min(max, Math.max(1, Number(pageSize) || 25));
  return { page: p, pageSize: s, skip: (p - 1) * s, take: s };
}
