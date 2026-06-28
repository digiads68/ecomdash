import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import * as jwt from "jsonwebtoken";
import * as jwksRsa from "jwks-rsa";

const jwksClient = jwksRsa({
  jwksUri: "https://api.clerk.com/v1/jwks",
  cache: true,
  cacheMaxAge: 3600000, // 1 hour
});

export const IS_PUBLIC_KEY = "isPublic";

@Injectable()
export class ClerkGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedException("Missing auth token");

    try {
      const decoded = jwt.decode(token, { complete: true });
      if (!decoded?.header?.kid) throw new UnauthorizedException("Invalid token");

      const key = await jwksClient.getSigningKey(decoded.header.kid);
      const publicKey = key.getPublicKey();

      const payload = jwt.verify(token, publicKey, {
        algorithms: ["RS256"],
      }) as jwt.JwtPayload;

      request.user = payload;
      request.userId = payload.sub;
      // Clerk puts org_id in token claims under `org_id`
      const orgId = payload.org_id || payload["org_id"];
      if (!orgId) throw new UnauthorizedException("Token missing org_id — select an organization");
      request.orgId = orgId;
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }

    return true;
  }

  private extractToken(request: any): string | undefined {
    const [type, token] = request.headers.authorization?.split(" ") ?? [];
    return type === "Bearer" ? token : undefined;
  }
}
