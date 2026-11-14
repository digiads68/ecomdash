import { CanActivate, ExecutionContext, ForbiddenException, Injectable, ServiceUnavailableException, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import * as jwt from "jsonwebtoken";
import jwksRsa from "jwks-rsa";
import { prisma } from "@ecomdash/database";
import { config } from "../config";
import { IS_PUBLIC_KEY } from "../common/decorators";

let demoIdentity: { orgId: string; userId: string } | null = null;
let jwks: jwksRsa.JwksClient | null = null;

/** AUTH_MODE=demo → fixed demo organisation; AUTH_MODE=clerk → RS256 JWT with org_id mapped to Organization.clerkOrgId (05 §1). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest();
    if (config().AUTH_MODE === "demo") {
      if (!demoIdentity) {
        const org = await prisma.organization.findUnique({ where: { slug: "demo" }, include: { members: { take: 1 } } });
        if (!org) throw new ServiceUnavailableException("Demo organisation missing — run `pnpm db:seed`");
        demoIdentity = { orgId: org.id, userId: org.members[0]?.userId ?? "" };
      }
      req.orgId = demoIdentity.orgId;
      req.userId = demoIdentity.userId;
      return true;
    }
    return this.verifyClerk(req);
  }

  private async verifyClerk(req: any): Promise<boolean> {
    const [type, token] = (req.headers.authorization ?? "").split(" ");
    if (type !== "Bearer" || !token) throw new UnauthorizedException("Missing bearer token");
    jwks ??= jwksRsa({
      jwksUri: config().CLERK_JWKS_URL,
      cache: true,
      cacheMaxAge: 3_600_000,
      requestHeaders: config().CLERK_SECRET_KEY ? { Authorization: `Bearer ${config().CLERK_SECRET_KEY}` } : {},
    });
    let payload: jwt.JwtPayload;
    try {
      const decoded = jwt.decode(token, { complete: true });
      if (!decoded?.header?.kid) throw new Error("no kid");
      const key = await jwks.getSigningKey(decoded.header.kid);
      payload = jwt.verify(token, key.getPublicKey(), { algorithms: ["RS256"] }) as jwt.JwtPayload;
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }
    const clerkOrgId = payload.org_id as string | undefined;
    if (!clerkOrgId) throw new ForbiddenException("Select an organisation first");
    const org = await prisma.organization.findUnique({ where: { clerkOrgId } });
    if (!org) throw new ForbiddenException("Organisation is not provisioned yet");
    const user = payload.sub ? await prisma.user.findUnique({ where: { clerkUserId: payload.sub } }) : null;
    req.orgId = org.id;
    req.userId = user?.id ?? "";
    return true;
  }
}
