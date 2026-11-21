import { Access, canEditOrg, canEditShop, canManageMembers, canRemoveConnections, canViewOrg, canViewShop, viewableOrgIds, viewableShopsWhere } from "./access";

const shopA1 = { id: "a1", organizationId: "orgA" };
const shopA2 = { id: "a2", organizationId: "orgA" };
const shopB1 = { id: "b1", organizationId: "orgB" };
const pool = { id: "p1", organizationId: null };

const user = (over: Partial<Access>): Access => ({ userId: "u", platformRole: null, orgRoles: {}, shopGrants: {}, ...over });
const ROLES: Record<string, Access> = {
  superAdmin: user({ platformRole: "SUPER_ADMIN" }),
  admin: user({ platformRole: "ADMIN" }),
  mod: user({ platformRole: "MOD", shopGrants: { a2: "orgA", b1: "orgB" } }),
  owner: user({ orgRoles: { orgA: "OWNER" } }),
  orgAdmin: user({ orgRoles: { orgA: "ADMIN" } }),
  member: user({ orgRoles: { orgA: "MEMBER" }, shopGrants: { a1: "orgA" } }),
};

// role → [view a1, view a2, view b1, view pool, edit orgA, edit orgB]
const MATRIX: Record<string, boolean[]> = {
  superAdmin: [true, true, true, true, true, true],
  admin: [true, true, true, true, true, true],
  mod: [false, true, true, false, false, false],
  owner: [true, true, false, false, true, false],
  orgAdmin: [true, true, false, false, true, false],
  member: [true, false, false, false, false, false],
};

describe("access matrix", () => {
  for (const [name, a] of Object.entries(ROLES)) {
    it(name, () => {
      expect([canViewShop(a, shopA1), canViewShop(a, shopA2), canViewShop(a, shopB1), canViewShop(a, pool), canEditOrg(a, "orgA"), canEditOrg(a, "orgB")]).toEqual(MATRIX[name]);
      expect(canEditShop(a, shopA1)).toBe(MATRIX[name][4]);
    });
  }

  it("org pages: members and grantees can view, only managers manage members, only owners remove connections", () => {
    expect(canViewOrg(ROLES.mod, "orgA")).toBe(true);
    expect(canViewOrg(ROLES.member, "orgB")).toBe(false);
    expect(canManageMembers(ROLES.member, "orgA")).toBe(false);
    expect(canManageMembers(ROLES.orgAdmin, "orgA")).toBe(true);
    expect(canRemoveConnections(ROLES.orgAdmin, "orgA")).toBe(false);
    expect(canRemoveConnections(ROLES.owner, "orgA")).toBe(true);
    expect(canRemoveConnections(ROLES.admin, "orgB")).toBe(true);
  });

  it("listing filters", () => {
    expect(viewableShopsWhere(ROLES.admin)).toEqual({ organizationId: { not: null } });
    expect(viewableShopsWhere(ROLES.member)).toEqual({ OR: [{ organizationId: { in: [] } }, { id: { in: ["a1"] } }] });
    expect(viewableOrgIds(ROLES.mod)).toEqual(["orgA", "orgB"]);
    expect(viewableOrgIds(ROLES.superAdmin)).toBe("ALL");
  });
});
