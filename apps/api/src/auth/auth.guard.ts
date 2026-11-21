import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY } from "../common/decorators";
import { loadAccess } from "../access/access.loader";
import { readToken, userForToken } from "./session";

/** Session cookie (browser) or Bearer session token (scripts) → req.user + req.access (docs/architecture/12 §6). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()]);
    const token = readToken(req);
    const found = token ? await userForToken(token) : null;
    if (found) {
      req.user = found.user;
      req.sessionId = found.session.id;
      req.access = await loadAccess(found.user.id);
    }
    if (isPublic) return true;
    if (!found) throw new UnauthorizedException("Vui lòng đăng nhập");
    return true;
  }
}
