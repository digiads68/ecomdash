import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma } from "@ecomdash/database";

@Injectable()
export class TeamService {
  async listMembers(orgId: string) {
    return prisma.organizationMember.findMany({
      where: { organizationId: orgId, status: { not: "SUSPENDED" } },
      include: { user: { select: { email: true, name: true, avatarUrl: true } } },
      orderBy: { createdAt: "asc" },
    });
  }

  async removeMember(orgId: string, memberId: string) {
    const member = await prisma.organizationMember.findFirst({
      where: { id: memberId, organizationId: orgId },
    });
    if (!member) throw new NotFoundException("Member not found");

    return prisma.organizationMember.update({
      where: { id: memberId },
      data: { status: "SUSPENDED" },
    });
  }
}
