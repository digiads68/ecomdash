import { prisma } from "@ecomdash/database";
import type { Access } from "./access";

export async function loadAccess(userId: string): Promise<Access> {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    include: { memberships: { where: { status: "ACTIVE" } }, shopAccess: { include: { shop: { select: { organizationId: true } } } } },
  });
  return {
    userId,
    platformRole: user.platformRole,
    orgRoles: Object.fromEntries(user.memberships.map((m) => [m.organizationId, m.role])),
    shopGrants: Object.fromEntries(user.shopAccess.map((g) => [g.shopId, g.shop.organizationId])),
  };
}
