import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  use(req: Request & { orgId?: string }, _res: Response, next: NextFunction) {
    // orgId is injected by ClerkGuard after JWT verification
    // This middleware makes it available on req for services
    next();
  }
}
