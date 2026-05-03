import { Injectable, BadRequestException } from "@nestjs/common";
import { prisma } from "@ecomdash/database";
import Stripe from "stripe";

const PLAN_PRICE_IDS: Record<string, string> = {
  starter: process.env.STRIPE_STARTER_PRICE_ID || "",
  pro: process.env.STRIPE_PRO_PRICE_ID || "",
  enterprise: process.env.STRIPE_ENTERPRISE_PRICE_ID || "",
};

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not set");
  return new Stripe(key, { apiVersion: "2024-04-10" });
}

@Injectable()
export class BillingService {
  async createCheckoutSession(
    orgId: string,
    plan: string,
    successUrl?: string,
    cancelUrl?: string
  ) {
    const priceId = PLAN_PRICE_IDS[plan.toLowerCase()];
    if (!priceId) throw new BadRequestException(`Unknown plan: ${plan}`);

    const stripe = getStripe();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: orgId,
      success_url: successUrl || `${appUrl}/settings/billing?success=1`,
      cancel_url: cancelUrl || `${appUrl}/settings/billing`,
    });

    return { url: session.url };
  }

  async createPortalSession(orgId: string) {
    const subscription = await prisma.subscription.findUnique({
      where: { organizationId: orgId },
    });
    if (!subscription?.stripeCustomerId) {
      throw new BadRequestException("No active subscription found");
    }

    const stripe = getStripe();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const session = await stripe.billingPortal.sessions.create({
      customer: subscription.stripeCustomerId,
      return_url: `${appUrl}/settings/billing`,
    });

    return { url: session.url };
  }

  async getSubscription(orgId: string) {
    return prisma.subscription.findUnique({
      where: { organizationId: orgId },
    });
  }

  async handleWebhook(sig: string, rawBody: string) {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
    if (!webhookSecret) return { received: true };

    const stripe = getStripe();
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch {
      return { received: false };
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const orgId = session.client_reference_id;
      const subscriptionId = session.subscription as string;
      if (!orgId || !subscriptionId) return { received: true };

      const stripeSubscription = await stripe.subscriptions.retrieve(subscriptionId);
      const plan = this.resolvePlan(stripeSubscription.items.data[0]?.price?.id);

      await prisma.subscription.upsert({
        where: { organizationId: orgId },
        update: {
          plan,
          status: "ACTIVE",
          stripeSubscriptionId: subscriptionId,
          stripeCustomerId: stripeSubscription.customer as string,
          currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
        },
        create: {
          organizationId: orgId,
          plan,
          status: "ACTIVE",
          stripeSubscriptionId: subscriptionId,
          stripeCustomerId: stripeSubscription.customer as string,
          currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
        },
      });

      await prisma.organization.update({
        where: { id: orgId },
        data: { plan },
      });
    }

    if (event.type === "customer.subscription.deleted") {
      const sub = event.data.object as Stripe.Subscription;
      await prisma.subscription.updateMany({
        where: { stripeSubscriptionId: sub.id },
        data: { status: "CANCELED" },
      });
    }

    return { received: true };
  }

  private resolvePlan(priceId?: string): "STARTER" | "PRO" | "ENTERPRISE" {
    if (!priceId) return "STARTER";
    if (priceId === PLAN_PRICE_IDS.pro) return "PRO";
    if (priceId === PLAN_PRICE_IDS.enterprise) return "ENTERPRISE";
    return "STARTER";
  }
}
