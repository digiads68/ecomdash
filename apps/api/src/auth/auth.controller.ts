import { Controller, Get, Headers, NotFoundException, Post, RawBodyRequest, Req } from "@nestjs/common";
import { Webhook } from "svix";
import { prisma } from "@ecomdash/database";
import type { MeDto } from "@ecomdash/shared";
import { config } from "../config";
import { OrgId, Public, UserId } from "../common/decorators";

@Controller()
export class AuthController {
  @Public()
  @Get("health")
  health() {
    return { ok: true, authMode: config().AUTH_MODE, time: new Date().toISOString() };
  }

  @Get("me")
  async me(@OrgId() orgId: string, @UserId() userId: string): Promise<MeDto> {
    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw new NotFoundException();
    const user = userId ? await prisma.user.findUnique({ where: { id: userId } }) : null;
    return {
      user: { id: user?.id ?? "", name: user?.name ?? null, email: user?.email ?? "" },
      organization: { id: org.id, name: org.name, plan: org.plan },
      authMode: config().AUTH_MODE,
    };
  }

  /** Clerk → Svix webhook: provisions users and organisations (production mode). */
  @Public()
  @Post("auth/webhook")
  async clerkWebhook(
    @Headers("svix-id") id: string,
    @Headers("svix-timestamp") ts: string,
    @Headers("svix-signature") sig: string,
    @Req() req: RawBodyRequest<any>,
  ) {
    const secret = process.env.CLERK_WEBHOOK_SECRET;
    if (!secret) return { received: false };
    let event: any;
    try {
      event = new Webhook(secret).verify(req.rawBody?.toString() ?? "", { "svix-id": id, "svix-timestamp": ts, "svix-signature": sig });
    } catch {
      return { received: false };
    }
    const { type, data } = event;
    if (type === "user.created" || type === "user.updated") {
      const email = data.email_addresses?.[0]?.email_address;
      const name = `${data.first_name ?? ""} ${data.last_name ?? ""}`.trim() || null;
      await prisma.user.upsert({ where: { clerkUserId: data.id }, update: { email, name, avatarUrl: data.image_url }, create: { clerkUserId: data.id, email, name, avatarUrl: data.image_url } });
    }
    if (type === "organization.created" || type === "organization.updated") {
      await prisma.organization.upsert({ where: { clerkOrgId: data.id }, update: { name: data.name }, create: { clerkOrgId: data.id, name: data.name, slug: data.slug } });
    }
    if (type === "organizationMembership.created") {
      const org = await prisma.organization.findUnique({ where: { clerkOrgId: data.organization.id } });
      const user = await prisma.user.findUnique({ where: { clerkUserId: data.public_user_data.user_id } });
      if (org && user) {
        await prisma.organizationMember.upsert({
          where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
          update: {},
          create: { organizationId: org.id, userId: user.id, role: data.role === "org:admin" ? "ADMIN" : "MEMBER" },
        });
      }
    }
    return { received: true };
  }
}
