import type { MemberRole, PlatformRole } from "@ecomdash/database";

/** Everything needed to decide what a user may see or change (docs/architecture/12 §2). Pure data — no Prisma calls. */
export interface Access {
  userId: string;
  platformRole: PlatformRole | null;
  orgRoles: Record<string, MemberRole>;
  /** ShopAccess grants: shopId → organisationId of that shop (null while unassigned). */
  shopGrants: Record<string, string | null>;
}

export interface ShopRef {
  id: string;
  organizationId: string | null;
}

const PLATFORM_MANAGERS = new Set<PlatformRole>(["SUPER_ADMIN", "ADMIN"]);
const ORG_MANAGERS = new Set<MemberRole>(["OWNER", "ADMIN"]);

export const isPlatformStaff = (a: Access) => a.platformRole != null;
export const seesAllShops = (a: Access) => a.platformRole != null && PLATFORM_MANAGERS.has(a.platformRole);
export const isSuperAdmin = (a: Access) => a.platformRole === "SUPER_ADMIN";

export function canViewShop(a: Access, shop: ShopRef): boolean {
  if (seesAllShops(a)) return true;
  if (shop.id in a.shopGrants) return true;
  const role = shop.organizationId ? a.orgRoles[shop.organizationId] : undefined;
  return role != null && ORG_MANAGERS.has(role);
}

/** Change costs, alerts, reports and connections of an organisation. MOD and MEMBER are read-only. */
export function canEditOrg(a: Access, orgId: string | null): boolean {
  if (seesAllShops(a)) return true;
  if (!orgId) return false;
  const role = a.orgRoles[orgId];
  return role != null && ORG_MANAGERS.has(role);
}

export const canEditShop = (a: Access, shop: ShopRef) => canEditOrg(a, shop.organizationId);

/** See organisation-level pages (connections, alerts, reports): managers, members of that org, or anyone granted one of its shops. */
export function canViewOrg(a: Access, orgId: string): boolean {
  if (seesAllShops(a)) return true;
  if (a.orgRoles[orgId]) return true;
  return Object.values(a.shopGrants).includes(orgId);
}

/** Manage members and their shop grants: org OWNER/ADMIN or platform managers. */
export const canManageMembers = canEditOrg;

/** Only the owner (or a platform manager) can remove TikTok connections or delete the organisation. */
export function canRemoveConnections(a: Access, orgId: string): boolean {
  return seesAllShops(a) || a.orgRoles[orgId] === "OWNER";
}

/** Prisma `where` for shops this user can view; platform managers see every assigned shop. */
export function viewableShopsWhere(a: Access) {
  if (seesAllShops(a)) return { organizationId: { not: null } };
  const managed = Object.entries(a.orgRoles).filter(([, r]) => ORG_MANAGERS.has(r)).map(([id]) => id);
  return { OR: [{ organizationId: { in: managed } }, { id: { in: Object.keys(a.shopGrants) } }] };
}

/** Organisations whose org-level pages this user can open. "ALL" for platform managers. */
export function viewableOrgIds(a: Access): string[] | "ALL" {
  if (seesAllShops(a)) return "ALL";
  const ids = new Set<string>(Object.keys(a.orgRoles));
  for (const org of Object.values(a.shopGrants)) if (org) ids.add(org);
  return [...ids];
}

/** For background jobs (reports, alerts) that read data on behalf of the system. */
export const SYSTEM_ACCESS: Access = { userId: "system", platformRole: "SUPER_ADMIN", orgRoles: {}, shopGrants: {} };
