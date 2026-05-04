-- CreateTable ShopConfig
CREATE TABLE "ShopConfig" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "cogsPercent" DOUBLE PRECISION NOT NULL DEFAULT 40,
    "shippingPercent" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "platformFeePercent" DOUBLE PRECISION NOT NULL DEFAULT 2,

    CONSTRAINT "ShopConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable ReportConfig
CREATE TABLE "ReportConfig" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "dayOfWeek" INTEGER,
    "dayOfMonth" INTEGER,
    "recipientEmail" TEXT NOT NULL,
    "metrics" JSONB NOT NULL DEFAULT '["gmv","roas","ad_spend","order_count"]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShopConfig_shopId_key" ON "ShopConfig"("shopId");

-- AddForeignKey
ALTER TABLE "ShopConfig" ADD CONSTRAINT "ShopConfig_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportConfig" ADD CONSTRAINT "ReportConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportConfig" ADD CONSTRAINT "ReportConfig_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
