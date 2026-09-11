import { PrismaClient } from "@prisma/client";
import { faker } from "@faker-js/faker";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database with 30 days of synthetic data...");

  // Create demo organization
  const org = await prisma.organization.upsert({
    where: { slug: "demo-shop" },
    update: {},
    create: {
      name: "Demo Shop VN",
      slug: "demo-shop",
      plan: "PRO",
      status: "ACTIVE",
    },
  });

  // Create demo user
  const user = await prisma.user.upsert({
    where: { clerkUserId: "user_demo123" },
    update: {},
    create: {
      clerkUserId: "user_demo123",
      email: "demo@ecomdash.vn",
      name: "Demo Owner",
    },
  });

  // Create org member
  await prisma.organizationMember.upsert({
    where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
    update: {},
    create: {
      organizationId: org.id,
      userId: user.id,
      role: "OWNER",
      status: "ACTIVE",
    },
  });

  // Create demo shop
  const shop = await prisma.shop.upsert({
    where: { tiktokShopId: "shop_demo_vn_001" },
    update: {},
    create: {
      organizationId: org.id,
      tiktokShopId: "shop_demo_vn_001",
      name: "Demo TikTok Shop VN",
      region: "VN",
      accessTokenEncrypted: "encrypted_access_token",
      refreshTokenEncrypted: "encrypted_refresh_token",
      syncStatus: "SYNCED",
      lastSyncedAt: new Date(),
    },
  });

  // Create demo ad account
  const adAccount = await prisma.adAccount.upsert({
    where: { tiktokAdvertiserId: "ads_demo_vn_001" },
    update: {},
    create: {
      organizationId: org.id,
      shopId: shop.id,
      tiktokAdvertiserId: "ads_demo_vn_001",
      name: "Demo TikTok Ads VN",
      accessTokenEncrypted: "encrypted_access_token",
      refreshTokenEncrypted: "encrypted_refresh_token",
      syncStatus: "SYNCED",
      lastSyncedAt: new Date(),
    },
  });

  // Create default ShopConfig for profit calculator
  await prisma.shopConfig.upsert({
    where: { shopId: shop.id },
    update: {},
    create: {
      shopId: shop.id,
      cogsPercent: 40,
      shippingPercent: 5,
      platformFeePercent: 2,
    },
  });

  // Create demo products
  const productNames = [
    "Kem Dưỡng Da SPF 50+",
    "Serum Vitamin C 20%",
    "Mặt Nạ Collagen Tươi",
    "Nước Tẩy Trang Bifesta",
    "Kem Chống Nắng Anessa",
    "Toner Hada Labo",
    "Sữa Rửa Mặt CeraVe",
    "Retinol Cream Paula's Choice",
  ];

  const products = [];
  for (let i = 0; i < productNames.length; i++) {
    const product = await prisma.product.upsert({
      where: { tiktokProductId: `prod_demo_${i + 1}` },
      update: {},
      create: {
        shopId: shop.id,
        tiktokProductId: `prod_demo_${i + 1}`,
        name: productNames[i],
        thumbnailUrl: `https://picsum.photos/seed/prod${i + 1}/80/80`,
        status: "ACTIVE",
      },
    });
    products.push(product);
  }

  // Create demo campaigns
  const campaignNames = [
    "Brand Awareness Q2 2026",
    "Flash Sale 12/12",
    "Retargeting - Cart Abandoners",
    "New Product Launch - Serum",
    "Influencer Traffic Campaign",
  ];

  for (let i = 0; i < campaignNames.length; i++) {
    await prisma.campaign.upsert({
      where: { tiktokCampaignId: `camp_demo_${i + 1}` },
      update: {},
      create: {
        adAccountId: adAccount.id,
        tiktokCampaignId: `camp_demo_${i + 1}`,
        name: campaignNames[i],
        status: i < 3 ? "ACTIVE" : "PAUSED",
        objective: ["AWARENESS", "CONVERSION", "RETARGETING", "CONVERSION", "TRAFFIC"][i],
      },
    });
  }

  // Create sample alert rules
  await prisma.alertRule.upsert({
    where: { id: "alert_rule_demo_1" },
    update: {},
    create: {
      id: "alert_rule_demo_1",
      organizationId: org.id,
      shopId: shop.id,
      name: "ROAS dưới 2.0",
      conditions: {
        conditions: [{ metric: "roas", operator: "lt", threshold: 2.0, window: "1h" }],
        logic: "AND",
      },
      actions: {
        actions: [
          { type: "email", to: "demo@ecomdash.vn" },
        ],
      },
      isActive: true,
    },
  });

  await prisma.alertRule.upsert({
    where: { id: "alert_rule_demo_2" },
    update: {},
    create: {
      id: "alert_rule_demo_2",
      organizationId: org.id,
      shopId: shop.id,
      name: "Doanh thu 0 trong 2 giờ",
      conditions: {
        conditions: [{ metric: "gmv", operator: "eq", threshold: 0, window: "2h" }],
        logic: "AND",
      },
      actions: {
        actions: [
          { type: "email", to: "demo@ecomdash.vn" },
          { type: "telegram", chatId: "-100000000" },
        ],
      },
      isActive: true,
    },
  });

  // Create a firing alert instance for demo notification panel
  await prisma.alertInstance.create({
    data: {
      ruleId: "alert_rule_demo_1",
      shopId: shop.id,
      state: "FIRING",
      metadata: { currentValue: 1.8, threshold: 2.0, metric: "roas" },
      firedAt: new Date(Date.now() - 2 * 60 * 1000),
    },
  });

  console.log("✅ Seed complete!");
  console.log(`   Org: ${org.name} (${org.id})`);
  console.log(`   Shop: ${shop.name}`);
  console.log(`   Products: ${products.length}`);
  console.log(`   NOTE: ClickHouse time-series data must be seeded separately via the workers seed script.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
