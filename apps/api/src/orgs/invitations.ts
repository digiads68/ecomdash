import { randomBytes } from "node:crypto";
import { BadRequestException } from "@nestjs/common";
import { prisma, type MemberRole, type PlatformRole } from "@ecomdash/database";
import type { InvitationDto, MemberDto } from "@ecomdash/shared";
import { config } from "../config";
import { sha256 } from "../auth/session";
import { notify } from "../notify/notify";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITE_DAYS = 7;

export function normalizeEmail(email: string | undefined) {
  const e = (email ?? "").trim().toLowerCase();
  if (!EMAIL.test(e)) throw new BadRequestException("Email không hợp lệ");
  return e;
}

/** Creates an invitation and e-mails its link; the raw token only lives in the returned URL (12 §2). */
export async function createInvitation(input: { email: string; organizationId?: string | null; orgRole?: MemberRole | null; platformRole?: PlatformRole | null; shopIds?: string[]; invitedById: string; inviterName?: string | null; orgName?: string | null }): Promise<InvitationDto> {
  const token = randomBytes(24).toString("base64url");
  const inv = await prisma.invitation.create({
    data: {
      email: input.email, organizationId: input.organizationId ?? null, orgRole: input.orgRole ?? null, platformRole: input.platformRole ?? null,
      shopIds: input.shopIds ?? [], tokenHash: sha256(token), invitedById: input.invitedById, expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
    },
  });
  const inviteUrl = `${config().APP_URL}/invite/${token}`;
  const where = input.orgName ?? "DigiAds";
  await notify([{ type: "email", to: input.email }], `Lời mời tham gia EcomDash — ${where}`, `${input.inviterName ?? "Quản trị viên"} mời bạn vào EcomDash (${where}).\nMở liên kết để đặt mật khẩu và đăng nhập (hiệu lực ${INVITE_DAYS} ngày):\n${inviteUrl}`);
  return invitationDto(inv, inviteUrl);
}

export function invitationDto(i: { id: string; email: string; orgRole: MemberRole | null; platformRole: PlatformRole | null; shopIds: string[]; expiresAt: Date }, inviteUrl?: string): InvitationDto {
  return { id: i.id, email: i.email, role: i.platformRole ?? i.orgRole, shopIds: i.shopIds, expiresAt: i.expiresAt.toISOString(), ...(inviteUrl ? { inviteUrl } : {}) };
}

/** Members of an organisation with the shops each one was granted. */
export async function orgMembers(orgId: string): Promise<MemberDto[]> {
  const rows = await prisma.organizationMember.findMany({
    where: { organizationId: orgId, status: "ACTIVE", userId: { not: null } },
    include: { user: { include: { shopAccess: { where: { shop: { organizationId: orgId } }, select: { shopId: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((m) => ({
    userId: m.userId!, name: m.user!.name, email: m.user!.email, role: m.role,
    shopIds: m.user!.shopAccess.map((s) => s.shopId), lastLoginAt: m.user!.lastLoginAt?.toISOString() ?? null,
  }));
}

/** Replaces the shop grants a user holds inside one organisation. */
export async function setShopGrants(userId: string, orgId: string, shopIds: string[], grantedById: string) {
  const valid = await prisma.shop.findMany({ where: { id: { in: shopIds }, organizationId: orgId }, select: { id: true } });
  if (valid.length !== new Set(shopIds).size) throw new BadRequestException("Có shop không thuộc tổ chức này");
  await prisma.$transaction([
    prisma.shopAccess.deleteMany({ where: { userId, shop: { organizationId: orgId }, shopId: { notIn: shopIds } } }),
    ...shopIds.map((shopId) => prisma.shopAccess.upsert({ where: { userId_shopId: { userId, shopId } }, create: { userId, shopId, grantedById }, update: {} })),
  ]);
}
