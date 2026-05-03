import { Controller, Get, Post, Body, Query, Req, Delete, Param } from "@nestjs/common";
import { TiktokService } from "./tiktok.service";

@Controller("tiktok")
export class TiktokController {
  constructor(private readonly tiktokService: TiktokService) {}

  // ── Shops ──────────────────────────────────────────────────────────────────

  @Get("shop/auth-url")
  getShopAuthUrl(@Req() req: any) {
    return this.tiktokService.getShopAuthUrl(req.orgId);
  }

  @Post("shop/callback")
  connectShop(
    @Req() req: any,
    @Body("code") code: string,
    @Body("shopId") shopId: string
  ) {
    return this.tiktokService.connectShop(req.orgId, code, shopId);
  }

  @Get("shops")
  listShops(@Req() req: any) {
    return this.tiktokService.listShops(req.orgId);
  }

  @Delete("shops/:id")
  removeShop(@Req() req: any, @Param("id") id: string) {
    return this.tiktokService.removeShop(req.orgId, id);
  }

  // ── Ad Accounts ────────────────────────────────────────────────────────────

  @Get("ads/auth-url")
  getAdsAuthUrl(@Req() req: any) {
    return this.tiktokService.getAdsAuthUrl(req.orgId);
  }

  @Post("ads/callback")
  connectAdAccount(
    @Req() req: any,
    @Body("code") code: string,
    @Body("advertiserId") advertiserId: string,
    @Body("shopId") shopId?: string
  ) {
    return this.tiktokService.connectAdAccount(req.orgId, code, advertiserId, shopId);
  }

  @Get("ad-accounts")
  listAdAccounts(@Req() req: any) {
    return this.tiktokService.listAdAccounts(req.orgId);
  }

  @Delete("ad-accounts/:id")
  removeAdAccount(@Req() req: any, @Param("id") id: string) {
    return this.tiktokService.removeAdAccount(req.orgId, id);
  }
}
