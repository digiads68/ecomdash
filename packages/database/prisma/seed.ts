import { PrismaClient } from "@prisma/client";

/** Demo organisation only — shops, orders and ads arrive from TikTok (or the mock) through sync. */
const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.upsert({
    where: { slug: "demo" },
    update: {},
    create: { slug: "demo", name: "Hoa Sen Cosmetics (Demo)", plan: "PRO" },
  });
  const user = await prisma.user.upsert({
    where: { email: "demo@ecomdash.vn" },
    update: {},
    create: { email: "demo@ecomdash.vn", name: "Chủ shop Demo" },
  });
  await prisma.organizationMember.upsert({
    where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
    update: {},
    create: { organizationId: org.id, userId: user.id, role: "OWNER" },
  });
  await prisma.subscription.upsert({
    where: { organizationId: org.id },
    update: {},
    create: { organizationId: org.id, plan: "PRO", status: "TRIALING", currentPeriodEnd: new Date(Date.now() + 14 * 86_400_000) },
  });
  if (!(await prisma.alertRule.count({ where: { organizationId: org.id } }))) {
    const email = { type: "email", to: "demo@ecomdash.vn" };
    await prisma.alertRule.createMany({
      data: [
        { organizationId: org.id, name: "Quảng cáo đang lỗ", conditions: { conditions: [{ metric: "real_roas_below_breakeven", operator: "gte", threshold: 1, window: "7d" }], logic: "AND" }, actions: { actions: [email] } },
        { organizationId: org.id, name: "Tỉ lệ huỷ tăng", conditions: { conditions: [{ metric: "cancel_rate", operator: "gt", threshold: 0.08, window: "7d" }], logic: "AND" }, actions: { actions: [email] } },
        { organizationId: org.id, name: "Biên lãi ròng thấp", conditions: { conditions: [{ metric: "net_margin", operator: "lt", threshold: 0.08, window: "7d" }], logic: "AND" }, actions: { actions: [email, { type: "telegram", chatId: "-1001234567890" }] } },
      ],
    });
  }
  console.log(`Seeded demo organisation ${org.id}`);
}

main().finally(() => prisma.$disconnect());
