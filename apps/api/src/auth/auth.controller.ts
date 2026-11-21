import { BadRequestException, Body, Controller, Get, HttpCode, NotFoundException, Param, Post, Query, Req, Res, UnauthorizedException } from "@nestjs/common";
import type { Request, Response } from "express";
import { prisma } from "@ecomdash/database";
import type { MeDto } from "@ecomdash/shared";
import { config } from "../config";
import { Acc, Public } from "../common/decorators";
import type { Access } from "../access/access";
import { loadAccess } from "../access/access.loader";
import { orgLinkStatus } from "../orgs/org-status";
import { QueueService } from "../sync/queue.service";
import { shopAuthClient } from "../tiktok/clients";
import { signState } from "../connections/state";
import { hashPassword, passwordProblem, verifyPassword } from "./password";
import { createSession, expireSessionCookie, setSessionCookie, sha256 } from "./session";

const MAX_FAILS = 5;
const LOCK_SECONDS = 15 * 60;

export async function buildMe(userId: string): Promise<MeDto> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const access = await loadAccess(userId);
  const orgIds = [...new Set([...Object.keys(access.orgRoles), ...(Object.values(access.shopGrants).filter(Boolean) as string[])])];
  const orgs = await prisma.organization.findMany({ where: { id: { in: orgIds } }, orderBy: { createdAt: "asc" } });
  return {
    user: { id: user.id, name: user.name, email: user.email, hasPassword: !!user.passwordHash, tiktokLinked: !!user.tiktokOpenId },
    platformRole: user.platformRole,
    organizations: await Promise.all(orgs.map(async (o) => {
      const role = access.orgRoles[o.id] ?? null;
      return { id: o.id, name: o.name, role, canEdit: role === "OWNER" || role === "ADMIN", status: await orgLinkStatus(o.id) };
    })),
    demo: config().DEMO_MODE === "true",
  };
}

@Controller()
export class AuthController {
  constructor(private readonly queue: QueueService) {}

  @Public()
  @Get("health")
  health() {
    return { ok: true, time: new Date().toISOString() };
  }

  @Get("me")
  me(@Acc() access: Access) {
    return buildMe(access.userId);
  }

  /** Email + password for DigiAds staff, invited members and clients who set a password (12 §6). */
  @Public()
  @Post("auth/login")
  @HttpCode(200)
  async login(@Body() b: { email?: string; password?: string }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const email = (b.email ?? "").trim().toLowerCase();
    if (!email || !b.password) throw new BadRequestException("Nhập email và mật khẩu");
    const key = `login-fail:${email}:${req.ip}`;
    const fails = Number(await this.queue.connection.get(key)) || 0;
    if (fails >= MAX_FAILS) throw new UnauthorizedException("Đăng nhập sai quá nhiều lần. Thử lại sau 15 phút.");
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.status !== "ACTIVE" || !(await verifyPassword(b.password, user.passwordHash))) {
      await this.queue.connection.multi().incr(key).expire(key, LOCK_SECONDS).exec();
      throw new UnauthorizedException("Email hoặc mật khẩu không đúng");
    }
    await this.queue.connection.del(key);
    setSessionCookie(res, await createSession(user.id, req.headers["user-agent"]));
    return buildMe(user.id);
  }

  @Public()
  @Post("auth/logout")
  @HttpCode(200)
  async logout(@Req() req: Request & { sessionId?: string }, @Res({ passthrough: true }) res: Response) {
    if (req.sessionId) await prisma.session.deleteMany({ where: { id: req.sessionId } });
    expireSessionCookie(res);
    return { ok: true };
  }

  /** "Đăng nhập bằng TikTok Shop": seller authorization doubles as sign-up / sign-in (12 §3.1). */
  @Public()
  @Get("auth/tiktok/start")
  tiktokStart(@Res() res: Response) {
    res.redirect(shopAuthClient().buildAuthorizeUrl(signState({ intent: "login" })));
  }

  /** Set or change email/password. Clients who signed up with TikTok may set both the first time. */
  @Post("auth/password")
  @HttpCode(200)
  async setPassword(@Acc() access: Access, @Body() b: { email?: string; currentPassword?: string; newPassword?: string }) {
    const problem = passwordProblem(b.newPassword);
    if (problem) throw new BadRequestException(problem);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: access.userId } });
    if (user.passwordHash && !(await verifyPassword(b.currentPassword ?? "", user.passwordHash))) throw new BadRequestException("Mật khẩu hiện tại không đúng");
    const email = b.email?.trim().toLowerCase();
    if (!user.email && !email) throw new BadRequestException("Nhập email để đăng nhập bằng mật khẩu");
    if (email && email !== user.email && (await prisma.user.findUnique({ where: { email } }))) throw new BadRequestException("Email đã được dùng cho tài khoản khác");
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(b.newPassword!), ...(email ? { email } : {}) } });
    return { ok: true };
  }

  @Post("auth/sessions/revoke-others")
  @HttpCode(200)
  async revokeOthers(@Acc() access: Access, @Req() req: Request & { sessionId?: string }) {
    const r = await prisma.session.deleteMany({ where: { userId: access.userId, id: { not: req.sessionId } } });
    return { revoked: r.count };
  }

  @Public()
  @Get("auth/invitations/:token")
  async invitation(@Param("token") token: string) {
    const inv = await prisma.invitation.findUnique({ where: { tokenHash: sha256(token) }, include: { organization: true } });
    if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) throw new NotFoundException("Lời mời không còn hiệu lực");
    const existing = await prisma.user.findUnique({ where: { email: inv.email } });
    return { email: inv.email, organizationName: inv.organization?.name ?? "DigiAds", role: inv.platformRole ?? inv.orgRole, shopCount: inv.shopIds.length, hasAccount: !!existing?.passwordHash };
  }

  @Public()
  @Post("auth/invitations/accept")
  @HttpCode(200)
  async accept(@Body() b: { token?: string; name?: string; password?: string }, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const inv = await prisma.invitation.findUnique({ where: { tokenHash: sha256(b.token ?? "") } });
    if (!inv || inv.acceptedAt || inv.expiresAt < new Date()) throw new NotFoundException("Lời mời không còn hiệu lực");
    let user = await prisma.user.findUnique({ where: { email: inv.email } });
    if (user?.passwordHash) {
      if (!(await verifyPassword(b.password ?? "", user.passwordHash))) throw new BadRequestException("Mật khẩu không đúng với tài khoản đã có");
    } else {
      const problem = passwordProblem(b.password);
      if (problem) throw new BadRequestException(problem);
      const data = { passwordHash: await hashPassword(b.password!), name: b.name?.trim() || user?.name || null, status: "ACTIVE" as const };
      user = user ? await prisma.user.update({ where: { id: user.id }, data }) : await prisma.user.create({ data: { email: inv.email, ...data } });
    }
    await prisma.$transaction(async (tx) => {
      if (inv.platformRole) await tx.user.update({ where: { id: user!.id }, data: { platformRole: inv.platformRole } });
      if (inv.organizationId && inv.orgRole) {
        await tx.organizationMember.upsert({
          where: { organizationId_userId: { organizationId: inv.organizationId, userId: user!.id } },
          create: { organizationId: inv.organizationId, userId: user!.id, role: inv.orgRole },
          update: { role: inv.orgRole, status: "ACTIVE" },
        });
      }
      for (const shopId of inv.shopIds) {
        await tx.shopAccess.upsert({ where: { userId_shopId: { userId: user!.id, shopId } }, create: { userId: user!.id, shopId, grantedById: inv.invitedById }, update: {} });
      }
      await tx.invitation.update({ where: { id: inv.id }, data: { acceptedAt: new Date() } });
    });
    setSessionCookie(res, await createSession(user.id, req.headers["user-agent"]));
    return buildMe(user.id);
  }

  @Get("auth/demo-accounts")
  @Public()
  demoAccounts(@Query() _q: unknown) {
    if (config().DEMO_MODE !== "true") throw new NotFoundException();
    return [
      { email: "admin@digiads.vn", role: "Super admin DigiAds" },
      { email: "mod@digiads.vn", role: "Mod DigiAds (2 shop của 2 khách)" },
      { email: "owner@hoasen.vn", role: "Chủ shop Hoa Sen" },
      { email: "nhanvien@hoasen.vn", role: "Nhân viên Hoa Sen (1 shop)" },
    ].map((a) => ({ ...a, password: "demo12345" }));
  }
}
