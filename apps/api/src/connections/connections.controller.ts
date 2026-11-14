import { Body, Controller, Delete, Get, Param, Patch, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { config } from "../config";
import { OrgId, Public } from "../common/decorators";
import { ConnectionsService } from "./connections.service";

@Controller("connections")
export class ConnectionsController {
  constructor(private readonly svc: ConnectionsService) {}

  @Get()
  list(@OrgId() orgId: string) {
    return this.svc.list(orgId);
  }

  @Get("shop/authorize-url")
  shopUrl(@OrgId() orgId: string) {
    return this.svc.shopAuthorizeUrl(orgId);
  }

  @Get("ads/authorize-url")
  adsUrl(@OrgId() orgId: string) {
    return this.svc.adsAuthorizeUrl(orgId);
  }

  @Public()
  @Get("shop/callback")
  async shopCallback(@Query("code") code: string, @Query("state") state: string, @Query("error") error: string | undefined, @Res() res: Response) {
    const base = `${config().APP_URL}/settings/connections`;
    if (error || !code || code === "null") return res.redirect(`${base}?error=${encodeURIComponent(error ?? "auth_denied")}`);
    try {
      const r = await this.svc.completeShop(code, state);
      return res.redirect(`${base}?connected=shop&count=${r.shops}`);
    } catch (e) {
      return res.redirect(`${base}?error=${encodeURIComponent((e as Error).message)}`);
    }
  }

  @Public()
  @Get("ads/callback")
  async adsCallback(@Query("auth_code") authCode: string, @Query("code") code: string, @Query("state") state: string, @Query("error") error: string | undefined, @Res() res: Response) {
    const base = `${config().APP_URL}/settings/connections`;
    const c = authCode || code;
    if (error || !c) return res.redirect(`${base}?error=${encodeURIComponent(error ?? "auth_denied")}`);
    try {
      const r = await this.svc.completeAds(c, state);
      return res.redirect(`${base}?connected=ads&count=${r.advertisers}`);
    } catch (e) {
      return res.redirect(`${base}?error=${encodeURIComponent((e as Error).message)}`);
    }
  }

  @Patch("shops/:id")
  setActive(@OrgId() orgId: string, @Param("id") id: string, @Body() body: { isActive: boolean }) {
    return this.svc.setShopActive(orgId, id, !!body.isActive);
  }

  @Patch("store-links/:id")
  setLink(@OrgId() orgId: string, @Param("id") id: string, @Body() body: { shopId: string | null }) {
    return this.svc.setStoreLink(orgId, id, body.shopId ?? null);
  }

  @Delete("seller-authorizations/:id")
  remove(@OrgId() orgId: string, @Param("id") id: string) {
    return this.svc.removeSellerAuthorization(orgId, id);
  }
}
