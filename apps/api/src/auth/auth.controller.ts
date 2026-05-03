import { Controller, Post, Headers, Body, RawBodyRequest, Req } from "@nestjs/common";
import { Webhook } from "svix";
import { prisma } from "@ecomdash/database";

// Mark as public — no Clerk JWT needed for webhooks
import { SetMetadata } from "@nestjs/common";
export const Public = () => SetMetadata("isPublic", true);

@Controller("auth")
export class AuthController {
  @Public()
  @Post("webhook")
  async handleWebhook(
    @Headers("svix-id") svixId: string,
    @Headers("svix-timestamp") svixTimestamp: string,
    @Headers("svix-signature") svixSignature: string,
    @Req() req: RawBodyRequest<any>
  ) {
    const secret = process.env.CLERK_WEBHOOK_SECRET!;
    const wh = new Webhook(secret);

    let event: any;
    try {
      event = wh.verify(req.rawBody?.toString() || "", {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      });
    } catch {
      return { received: false };
    }

    const { type, data } = event;

    if (type === "user.created") {
      await prisma.user.upsert({
        where: { clerkUserId: data.id },
        update: { email: data.email_addresses[0]?.email_address, name: `${data.first_name} ${data.last_name}`.trim() },
        create: {
          clerkUserId: data.id,
          email: data.email_addresses[0]?.email_address,
          name: `${data.first_name} ${data.last_name}`.trim(),
          avatarUrl: data.image_url,
        },
      });
    }

    if (type === "organization.created") {
      await prisma.organization.upsert({
        where: { slug: data.slug },
        update: { name: data.name },
        create: { name: data.name, slug: data.slug },
      });
    }

    return { received: true };
  }
}
