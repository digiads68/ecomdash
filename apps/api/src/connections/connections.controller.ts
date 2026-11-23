import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { config } from "../config";
import { Acc, Public } from "../common/decorators";
import type { Access } from "../access/access";
import { createSession, setSessionCookie } from "../auth/session";
import { CallbackResult, ConnectionsService } from "./connections.service";

@Controller("connections")
export class ConnectionsController {
  constructor(private readonly svc: ConnectionsService) {}

  @Get()
  list(@Acc() access: Access, @Query("orgId") orgId?: string) {
    return this.svc.list(access, orgId);
  }

  @Get("shop/authorize-url")
  shopUrl(@Acc() access: Access, @Query("orgId") orgId?: string, @Query("returnTo") returnTo?: string) {
    return this.svc.shopAuthorizeUrl(access, orgId, returnTo);
  }

  @Get("ads/authorize-url")
  adsUrl(@Acc() access: Access, @Query("orgId") orgId?: string, @Query("returnTo") returnTo?: string) {
    return this.svc.adsAuthorizeUrl(access, orgId, returnTo);
  }

  private async finish(res: Response, req: Request, run: () => Promise<CallbackResult>, errorPath: string) {
    try {
      const r = await run();
      if (r.sessionUserId) setSessionCookie(res, await createSession(r.sessionUserId, req.headers["user-agent"]));
      return res.redirect(r.redirect);
    } catch (e) {
      return res.redirect(`${config().APP_URL}${errorPath}?error=${encodeURIComponent((e as Error).message)}`);
    }
  }

  /** TikTok Shop redirect: sign-up/sign-in, connect, or App Store authorization (no state). */
  @Public()
  @Get("shop/callback")
  shopCallback(@Query("code") code: string, @Query("state") state: string | undefined, @Query("error") error: string | undefined, @Req() req: Request, @Res() res: Response) {
    if (error || !code || code === "null") return res.redirect(`${config().APP_URL}/login?error=${encodeURIComponent(error ?? "auth_denied")}`);
    return this.finish(res, req, () => this.svc.completeShop(code, state), state ? "/settings/connections" : "/login");
  }

  @Public()
  @Get("ads/callback")
  adsCallback(@Query("auth_code") authCode: string, @Query("code") code: string, @Query("state") state: string | undefined, @Query("error") error: string | undefined, @Req() req: Request, @Res() res: Response) {
    const c = authCode || code;
    if (error || !c) return res.redirect(`${config().APP_URL}/settings/connections?error=${encodeURIComponent(error ?? "auth_denied")}`);
    return this.finish(res, req, () => this.svc.completeAds(c, state), "/settings/connections");
  }

  @Patch("shops/:id")
  setActive(@Acc() access: Access, @Param("id") id: string, @Body() body: { isActive: boolean }) {
    return this.svc.setShopActive(access, id, !!body.isActive);
  }

  @Patch("store-links/:id")
  setLink(@Acc() access: Access, @Param("id") id: string, @Body() body: { shopId: string | null }) {
    return this.svc.setStoreLink(access, id, body.shopId ?? null);
  }

  @Post("orgs/:orgId/ads-mode")
  adsMode(@Acc() access: Access, @Param("orgId") orgId: string, @Body() body: { mode: "TIKTOK" | "NONE" }) {
    return this.svc.setAdsMode(access, orgId, body.mode === "NONE" ? "NONE" : "TIKTOK");
  }

  @Post("orgs/:orgId/onboarded")
  onboarded(@Acc() access: Access, @Param("orgId") orgId: string) {
    return this.svc.markOnboarded(access, orgId);
  }

  @Delete("seller-authorizations/:id")
  remove(@Acc() access: Access, @Param("id") id: string) {
    return this.svc.removeSellerAuthorization(access, id);
  }
}
