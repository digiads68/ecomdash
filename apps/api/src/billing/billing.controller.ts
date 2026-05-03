import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Headers,
  RawBodyRequest,
} from "@nestjs/common";
import { BillingService } from "./billing.service";
import { SetMetadata } from "@nestjs/common";

export const Public = () => SetMetadata("isPublic", true);

@Controller("billing")
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post("checkout")
  createCheckout(
    @Req() req: any,
    @Body("plan") plan: string,
    @Body("successUrl") successUrl?: string,
    @Body("cancelUrl") cancelUrl?: string
  ) {
    return this.billingService.createCheckoutSession(
      req.orgId,
      plan,
      successUrl,
      cancelUrl
    );
  }

  @Post("portal")
  createPortal(@Req() req: any) {
    return this.billingService.createPortalSession(req.orgId);
  }

  @Get("subscription")
  getSubscription(@Req() req: any) {
    return this.billingService.getSubscription(req.orgId);
  }

  @Public()
  @Post("webhook")
  async handleWebhook(
    @Headers("stripe-signature") sig: string,
    @Req() req: RawBodyRequest<any>
  ) {
    return this.billingService.handleWebhook(
      sig,
      req.rawBody?.toString() || ""
    );
  }
}
