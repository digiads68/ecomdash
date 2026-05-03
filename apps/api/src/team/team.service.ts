import { Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { prisma } from "@ecomdash/database";
import * as jwt from "jsonwebtoken";
import axios from "axios";

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

  async inviteMember(orgId: string, email: string, role: string): Promise<{ inviteId: string }> {
    const member = await prisma.organizationMember.create({
      data: {
        organizationId: orgId,
        inviteEmail: email,
        role,
        status: "INVITED",
      },
    });

    const secret = process.env.INVITE_JWT_SECRET || "secret";
    const token = jwt.sign(
      { memberId: member.id, orgId, email, role },
      secret,
      { expiresIn: "24h" }
    );

    const inviteLink = `${process.env.NEXT_PUBLIC_APP_URL}/invite?token=${token}`;

    await axios.post(
      "https://api.sendgrid.com/v3/mail/send",
      {
        personalizations: [{ to: [{ email }] }],
        from: { email: process.env.SENDGRID_FROM_EMAIL || "noreply@ecomdash.app" },
        subject: "Bạn được mời tham gia EcomDash",
        content: [
          {
            type: "text/html",
            value: `
              <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
                <h2 style="color:#111827">Bạn được mời tham gia EcomDash</h2>
                <p style="color:#6B7280">Nhấn vào nút bên dưới để chấp nhận lời mời và bắt đầu sử dụng EcomDash.</p>
                <a href="${inviteLink}"
                   style="display:inline-block;margin-top:16px;padding:10px 20px;background:#3B82F6;color:#fff;border-radius:8px;text-decoration:none;font-weight:600">
                  Chấp nhận lời mời
                </a>
                <p style="margin-top:24px;color:#9CA3AF;font-size:12px">
                  Liên kết này sẽ hết hạn sau 24 giờ.
                </p>
              </div>
            `,
          },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    return { inviteId: member.id };
  }

  async acceptInvite(token: string, clerkUserId: string): Promise<{ success: boolean }> {
    const secret = process.env.INVITE_JWT_SECRET || "secret";

    let payload: any;
    try {
      payload = jwt.verify(token, secret);
    } catch {
      throw new UnauthorizedException("Token không hợp lệ hoặc đã hết hạn");
    }

    const { memberId } = payload;

    const member = await prisma.organizationMember.findFirst({
      where: { id: memberId, status: "INVITED" },
    });
    if (!member) throw new NotFoundException("Lời mời không tồn tại hoặc đã được chấp nhận");

    const user = await prisma.user.upsert({
      where: { clerkUserId },
      update: {},
      create: { clerkUserId, email: payload.email ?? "" },
    });

    await prisma.organizationMember.update({
      where: { id: memberId },
      data: {
        userId: user.id,
        status: "ACTIVE",
        inviteEmail: null,
      },
    });

    return { success: true };
  }
}
