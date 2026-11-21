import { Body, Controller, Get, Headers, Post, Query, RawBodyRequest, Req } from "@nestjs/common";
import { BillingService } from "./billing.service";
import { Acc, Public } from "../common/decorators";
import type { Access } from "../access/access";
import { resolveOrgId } from "../common/util";

@Controller("billing")
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post("checkout")
  createCheckout(@Acc() access: Access, @Query("orgId") orgId: string | undefined, @Body("plan") plan: string, @Body("successUrl") successUrl?: string, @Body("cancelUrl") cancelUrl?: string) {
    return this.billingService.createCheckoutSession(resolveOrgId(access, orgId, "edit"), plan, successUrl, cancelUrl);
  }

  @Post("portal")
  createPortal(@Acc() access: Access, @Query("orgId") orgId: string | undefined) {
    return this.billingService.createPortalSession(resolveOrgId(access, orgId, "edit"));
  }

  @Get("subscription")
  getSubscription(@Acc() access: Access, @Query("orgId") orgId: string | undefined) {
    return this.billingService.getSubscription(resolveOrgId(access, orgId, "view"));
  }

  @Public()
  @Post("webhook")
  async handleWebhook(@Headers("stripe-signature") sig: string, @Req() req: RawBodyRequest<any>) {
    return this.billingService.handleWebhook(sig, req.rawBody?.toString() || "");
  }
}
