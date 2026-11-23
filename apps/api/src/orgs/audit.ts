import { prisma, Prisma } from "@ecomdash/database";

/** Who linked or unlinked what, for whom (12 §3.2). */
export async function audit(e: { actorId: string | null; action: string; organizationId: string | null; targetType: string; targetId: string; meta?: Record<string, unknown> }) {
  await prisma.auditLog.create({ data: { ...e, meta: (e.meta ?? {}) as Prisma.InputJsonValue } });
}
