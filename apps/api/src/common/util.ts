import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Access, canEditOrg, canEditShop, canViewOrg, canViewShop, seesAllShops } from "../access/access";
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

/** Shop the user may view (or edit): out-of-scope shops are reported as not found, read-only users get 403 on edits. */
export async function getShopForUser(access: Access, shopId: string | undefined, mode: "view" | "edit" = "view") {
  if (!shopId) throw new BadRequestException("shopId is required");
  const shop = await prisma.shop.findUnique({ where: { id: shopId } });
  if (!shop || !canViewShop(access, shop)) throw new NotFoundException("Shop not found");
  if (mode === "edit" && !canEditShop(access, shop)) throw new ForbiddenException("Bạn chỉ có quyền xem shop này");
  return shop;
}

/**
 * Organisation for org-level pages. Explicit orgId is checked; otherwise the user's only organisation
 * (or the organisation of their first granted shop) is used.
 */
export function resolveOrgId(access: Access, orgId: string | undefined, mode: "view" | "edit" = "view"): string {
  const id = orgId || (Object.keys(access.orgRoles).length === 1 ? Object.keys(access.orgRoles)[0] : undefined) ||
    (seesAllShops(access) ? undefined : (Object.values(access.shopGrants).find(Boolean) ?? undefined));
  if (!id) throw new BadRequestException("orgId is required");
  if (!canViewOrg(access, id)) throw new NotFoundException("Organisation not found");
  if (mode === "edit" && !canEditOrg(access, id)) throw new ForbiddenException("Bạn chỉ có quyền xem tổ chức này");
  return id;
}

export function kpi(value: number | null, previous: number | null) {
  return { value, previous, changePct: value == null || previous == null || previous === 0 ? null : (value - previous) / Math.abs(previous) };
}

export function pageParams(page?: string | number, pageSize?: string | number, max = 200) {
  const p = Math.max(1, Number(page) || 1);
  const s = Math.min(max, Math.max(1, Number(pageSize) || 25));
  return { page: p, pageSize: s, skip: (p - 1) * s, take: s };
}
