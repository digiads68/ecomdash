import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, Module, NotFoundException, Param, Patch, Post } from "@nestjs/common";
import { prisma, type MemberRole } from "@ecomdash/database";
import type { InvitationDto, MembersDto } from "@ecomdash/shared";
import { Acc } from "../common/decorators";
import { Access, canManageMembers, canViewOrg } from "../access/access";
import { audit } from "./audit";
import { createInvitation, invitationDto, normalizeEmail, orgMembers, setShopGrants } from "./invitations";

const ROLES: MemberRole[] = ["ADMIN", "MEMBER"];

/** Members of a client organisation: invite, change role, grant shops, remove (12 §2). OWNER/ADMIN or DigiAds managers. */
@Controller("orgs/:orgId/members")
class MembersController {
  private check(access: Access, orgId: string, manage = true) {
    if (!canViewOrg(access, orgId)) throw new NotFoundException("Organisation not found");
    if (manage && !canManageMembers(access, orgId)) throw new ForbiddenException("Chỉ chủ hoặc quản trị tổ chức được quản lý thành viên");
  }

  @Get()
  async list(@Acc() access: Access, @Param("orgId") orgId: string): Promise<MembersDto> {
    this.check(access, orgId);
    const [shops, members, invitations] = await Promise.all([
      prisma.shop.findMany({ where: { organizationId: orgId }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } }),
      orgMembers(orgId),
      prisma.invitation.findMany({ where: { organizationId: orgId, acceptedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } }),
    ]);
    return { organizationId: orgId, shops, members, invitations: invitations.map((i) => invitationDto(i)) };
  }

  @Post("invitations")
  async invite(@Acc() access: Access, @Param("orgId") orgId: string, @Body() b: { email?: string; role?: MemberRole; shopIds?: string[] }): Promise<InvitationDto> {
    this.check(access, orgId);
    const email = normalizeEmail(b.email);
    const role = b.role ?? "MEMBER";
    if (!ROLES.includes(role)) throw new BadRequestException("Vai trò không hợp lệ");
    const shopIds = role === "MEMBER" ? (b.shopIds ?? []) : [];
    if (role === "MEMBER" && !shopIds.length) throw new BadRequestException("Chọn ít nhất một shop cho thành viên");
    const valid = await prisma.shop.count({ where: { id: { in: shopIds }, organizationId: orgId } });
    if (valid !== shopIds.length) throw new BadRequestException("Có shop không thuộc tổ chức này");
    const member = await prisma.organizationMember.findFirst({ where: { organizationId: orgId, status: "ACTIVE", user: { email } } });
    if (member) throw new BadRequestException("Người này đã là thành viên");
    const [org, me] = await Promise.all([prisma.organization.findUniqueOrThrow({ where: { id: orgId } }), prisma.user.findUnique({ where: { id: access.userId } })]);
    const inv = await createInvitation({ email, organizationId: orgId, orgRole: role, shopIds, invitedById: access.userId, inviterName: me?.name, orgName: org.name });
    await audit({ actorId: access.userId, action: "member.invited", organizationId: orgId, targetType: "Invitation", targetId: inv.id, meta: { email, role, shopIds } });
    return inv;
  }

  @Delete("invitations/:id")
  async revokeInvite(@Acc() access: Access, @Param("orgId") orgId: string, @Param("id") id: string) {
    this.check(access, orgId);
    const r = await prisma.invitation.deleteMany({ where: { id, organizationId: orgId, acceptedAt: null } });
    if (!r.count) throw new NotFoundException();
    return { ok: true };
  }

  @Patch(":userId")
  async update(@Acc() access: Access, @Param("orgId") orgId: string, @Param("userId") userId: string, @Body() b: { role?: MemberRole; shopIds?: string[] }) {
    this.check(access, orgId);
    const m = await prisma.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: orgId, userId } } });
    if (!m || m.status !== "ACTIVE") throw new NotFoundException();
    if (m.role === "OWNER" && b.role && b.role !== "OWNER") throw new BadRequestException("Không thể đổi vai trò của chủ tổ chức");
    if (b.role) {
      if (!ROLES.includes(b.role)) throw new BadRequestException("Vai trò không hợp lệ");
      if (m.role !== "OWNER") await prisma.organizationMember.update({ where: { id: m.id }, data: { role: b.role } });
    }
    if (b.shopIds) await setShopGrants(userId, orgId, b.shopIds, access.userId);
    await audit({ actorId: access.userId, action: "member.updated", organizationId: orgId, targetType: "User", targetId: userId, meta: { role: b.role, shopIds: b.shopIds } });
    return { ok: true };
  }

  @Delete(":userId")
  async remove(@Acc() access: Access, @Param("orgId") orgId: string, @Param("userId") userId: string) {
    this.check(access, orgId);
    const m = await prisma.organizationMember.findUnique({ where: { organizationId_userId: { organizationId: orgId, userId } } });
    if (!m) throw new NotFoundException();
    if (m.role === "OWNER") throw new BadRequestException("Không thể xoá chủ tổ chức");
    if (userId === access.userId) throw new BadRequestException("Không thể tự xoá mình");
    await prisma.$transaction([
      prisma.organizationMember.delete({ where: { id: m.id } }),
      prisma.shopAccess.deleteMany({ where: { userId, shop: { organizationId: orgId } } }),
    ]);
    await audit({ actorId: access.userId, action: "member.removed", organizationId: orgId, targetType: "User", targetId: userId });
    return { ok: true };
  }
}

@Module({ controllers: [MembersController] })
export class MembersModule {}
