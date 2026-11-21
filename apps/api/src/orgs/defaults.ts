import { prisma } from "@ecomdash/database";

/** Trial subscription and starter alert rules for a new client organisation. */
export async function initOrganization(orgId: string, notifyEmail?: string | null) {
  await prisma.subscription.upsert({
    where: { organizationId: orgId },
    update: {},
    create: { organizationId: orgId, plan: "PRO", status: "TRIALING", currentPeriodEnd: new Date(Date.now() + 14 * 86_400_000) },
  });
  if (await prisma.alertRule.count({ where: { organizationId: orgId } })) return;
  const actions = { actions: notifyEmail ? [{ type: "email", to: notifyEmail }] : [] };
  await prisma.alertRule.createMany({
    data: [
      { organizationId: orgId, name: "Quảng cáo đang lỗ", conditions: { conditions: [{ metric: "real_roas_below_breakeven", operator: "gte", threshold: 1, window: "7d" }], logic: "AND" }, actions },
      { organizationId: orgId, name: "Tỉ lệ huỷ tăng", conditions: { conditions: [{ metric: "cancel_rate", operator: "gt", threshold: 0.08, window: "7d" }], logic: "AND" }, actions },
      { organizationId: orgId, name: "Biên lãi ròng thấp", conditions: { conditions: [{ metric: "net_margin", operator: "lt", threshold: 0.08, window: "7d" }], logic: "AND" }, actions },
    ],
  });
}
