-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('STARTER', 'PRO', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "OrgStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('ACTIVE', 'INVITED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "AuthStatus" AS ENUM ('ACTIVE', 'NEEDS_REAUTH', 'REVOKED');

-- CreateEnum
CREATE TYPE "SyncRunStatus" AS ENUM ('IDLE', 'RUNNING', 'OK', 'ERROR', 'BLOCKED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('UNPAID', 'ON_HOLD', 'AWAITING_SHIPMENT', 'PARTIALLY_SHIPPING', 'AWAITING_COLLECTION', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReturnKind" AS ENUM ('REFUND', 'RETURN_AND_REFUND', 'REPLACEMENT', 'CANCEL', 'BUYER_CANCEL');

-- CreateEnum
CREATE TYPE "CampaignKind" AS ENUM ('MANUAL', 'GMV_MAX');

-- CreateEnum
CREATE TYPE "AdStatSource" AS ENUM ('INTEGRATED', 'GMV_MAX');

-- CreateEnum
CREATE TYPE "OrderOutcome" AS ENUM ('SUCCESS', 'PARTIAL_RETURN', 'RETURNED', 'CANCELLED', 'PENDING');

-- CreateEnum
CREATE TYPE "CostMethod" AS ENUM ('PER_ORDER', 'PERCENT_REVENUE', 'MONTHLY_FIXED');

-- CreateEnum
CREATE TYPE "CostAppliesTo" AS ENUM ('PAID', 'SHIPPED', 'SUCCESS');

-- CreateEnum
CREATE TYPE "AlertState" AS ENUM ('FIRING', 'RESOLVED');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'PAST_DUE', 'CANCELED', 'TRIALING');

-- CreateTable
CREATE TABLE "Organization" (
    "id" TEXT NOT NULL,
    "clerkOrgId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" "Plan" NOT NULL DEFAULT 'STARTER',
    "status" "OrgStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "clerkUserId" TEXT,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganizationMember" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT,
    "inviteEmail" TEXT,
    "role" "MemberRole" NOT NULL,
    "status" "MemberStatus" NOT NULL DEFAULT 'ACTIVE',
    "permissions" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganizationMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellerAuthorization" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "openId" TEXT NOT NULL,
    "sellerName" TEXT NOT NULL,
    "sellerBaseRegion" TEXT NOT NULL,
    "accessTokenEncrypted" TEXT NOT NULL,
    "refreshTokenEncrypted" TEXT NOT NULL,
    "accessExpiresAt" TIMESTAMP(3) NOT NULL,
    "refreshExpiresAt" TIMESTAMP(3) NOT NULL,
    "grantedScopes" TEXT[],
    "status" "AuthStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastRefreshedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellerAuthorization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shop" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "sellerAuthorizationId" TEXT NOT NULL,
    "tiktokShopId" TEXT NOT NULL,
    "cipher" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL DEFAULT 'VN',
    "sellerType" TEXT NOT NULL DEFAULT 'LOCAL',
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopConfig" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "defaultCogsPercent" DECIMAL(5,2) NOT NULL DEFAULT 40,
    "restockReturns" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ShopConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "tiktokProductId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "thumbnailUrl" TEXT,
    "categoryName" TEXT,
    "tiktokCreatedAt" TIMESTAMP(3) NOT NULL,
    "tiktokUpdatedAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sku" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "tiktokSkuId" TEXT NOT NULL,
    "sellerSku" TEXT,
    "name" TEXT,
    "salePrice" DECIMAL(18,2) NOT NULL,
    "listPrice" DECIMAL(18,2),
    "inventory" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Sku_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "tiktokOrderId" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "buyerHash" TEXT NOT NULL,
    "province" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "subTotal" DECIMAL(18,2) NOT NULL,
    "shippingFee" DECIMAL(18,2) NOT NULL,
    "sellerDiscount" DECIMAL(18,2) NOT NULL,
    "platformDiscount" DECIMAL(18,2) NOT NULL,
    "totalAmount" DECIMAL(18,2) NOT NULL,
    "originalProductPrice" DECIMAL(18,2) NOT NULL,
    "isCod" BOOLEAN NOT NULL DEFAULT false,
    "isSampleOrder" BOOLEAN NOT NULL DEFAULT false,
    "paymentMethod" TEXT,
    "shippingProvider" TEXT,
    "shippingType" TEXT,
    "trackingNumber" TEXT,
    "cancelReason" TEXT,
    "cancellationInitiator" TEXT,
    "createTime" TIMESTAMP(3) NOT NULL,
    "updateTime" TIMESTAMP(3) NOT NULL,
    "paidTime" TIMESTAMP(3),
    "rtsTime" TIMESTAMP(3),
    "deliveryTime" TIMESTAMP(3),
    "cancelTime" TIMESTAMP(3),
    "businessDate" DATE NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLineItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "tiktokLineItemId" TEXT NOT NULL,
    "tiktokProductId" TEXT NOT NULL,
    "tiktokSkuId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "skuName" TEXT,
    "sellerSku" TEXT,
    "skuImage" TEXT,
    "originalPrice" DECIMAL(18,2) NOT NULL,
    "salePrice" DECIMAL(18,2) NOT NULL,
    "sellerDiscount" DECIMAL(18,2) NOT NULL,
    "platformDiscount" DECIMAL(18,2) NOT NULL,
    "displayStatus" TEXT,
    "isGift" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "OrderLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Statement" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "tiktokStatementId" TEXT NOT NULL,
    "statementTime" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL,
    "revenueAmount" DECIMAL(18,2) NOT NULL,
    "feeAmount" DECIMAL(18,2) NOT NULL,
    "adjustmentAmount" DECIMAL(18,2) NOT NULL,
    "shippingCostAmount" DECIMAL(18,2) NOT NULL,
    "settlementAmount" DECIMAL(18,2) NOT NULL,
    "paymentStatus" TEXT NOT NULL,
    "paymentId" TEXT,

    CONSTRAINT "Statement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderSettlement" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "tiktokStatementId" TEXT,
    "currency" TEXT NOT NULL,
    "revenueAmount" DECIMAL(18,2) NOT NULL,
    "shippingCostAmount" DECIMAL(18,2) NOT NULL,
    "feeTaxAmount" DECIMAL(18,2) NOT NULL,
    "platformCommission" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "transactionFee" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "affiliateCommission" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "infrastructureFee" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "otherFees" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "settlementAmount" DECIMAL(18,2) NOT NULL,
    "raw" JSONB NOT NULL,
    "settledAt" TIMESTAMP(3),
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderSettlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnRequest" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "orderId" TEXT,
    "tiktokReturnId" TEXT NOT NULL,
    "tiktokOrderId" TEXT NOT NULL,
    "kind" "ReturnKind" NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "refundTotal" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "returnedUnits" INTEGER NOT NULL DEFAULT 0,
    "createTime" TIMESTAMP(3) NOT NULL,
    "updateTime" TIMESTAMP(3) NOT NULL,
    "businessDate" DATE NOT NULL,

    CONSTRAINT "ReturnRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdsAuthorization" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "accessTokenEncrypted" TEXT NOT NULL,
    "scopes" TEXT[],
    "status" "AuthStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdsAuthorization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Advertiser" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "adsAuthorizationId" TEXT NOT NULL,
    "tiktokAdvertiserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
    "ownerBcId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Advertiser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdvertiserStoreLink" (
    "id" TEXT NOT NULL,
    "advertiserId" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "storeCode" TEXT,
    "storeName" TEXT NOT NULL,
    "storeAuthorizedBcId" TEXT,
    "shopId" TEXT,
    "matchedBy" TEXT,
    "isGmvMaxAvailable" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AdvertiserStoreLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "advertiserId" TEXT NOT NULL,
    "tiktokCampaignId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "CampaignKind" NOT NULL,
    "objectiveType" TEXT,
    "operationStatus" TEXT NOT NULL,
    "budgetMode" TEXT,
    "budget" DECIMAL(18,2),
    "roasBid" DECIMAL(10,2),
    "storeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdDailyStat" (
    "id" TEXT NOT NULL,
    "advertiserId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "source" "AdStatSource" NOT NULL,
    "storeId" TEXT,
    "spend" DECIMAL(18,2) NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "orders" INTEGER NOT NULL DEFAULT 0,
    "grossRevenue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdDailyStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopDailyStat" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "gmv" DECIMAL(18,2) NOT NULL,
    "orders" INTEGER NOT NULL,
    "unitsSold" INTEGER NOT NULL,
    "buyers" INTEGER NOT NULL,
    "newBuyers" INTEGER NOT NULL,
    "cancelledOrders" INTEGER NOT NULL,
    "cancelledAmount" DECIMAL(18,2) NOT NULL,
    "returnRequests" INTEGER NOT NULL,
    "refundAmount" DECIMAL(18,2) NOT NULL,
    "codOrders" INTEGER NOT NULL,
    "sellerDiscount" DECIMAL(18,2) NOT NULL,
    "pageViews" INTEGER,
    "visitors" INTEGER,
    "analyticsGmv" DECIMAL(18,2),
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopDailyStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductDailyStat" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "gmv" DECIMAL(18,2) NOT NULL,
    "orders" INTEGER NOT NULL,
    "unitsSold" INTEGER NOT NULL,
    "pageViews" INTEGER,
    "impressions" INTEGER,
    "grossItemValue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "cancelledAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "refundAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "realizedRevenue" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "platformFees" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "otherPlatformFees" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "cogs" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "cogsEstimated" BOOLEAN NOT NULL DEFAULT false,
    "customCosts" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "adSpendAllocated" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "contribution" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "netProfit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "returnedUnits" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ProductDailyStat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkuCost" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "skuId" TEXT NOT NULL,
    "unitCost" DECIMAL(18,2) NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkuCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostItem" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "method" "CostMethod" NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "appliesTo" "CostAppliesTo" NOT NULL DEFAULT 'SHIPPED',
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CostItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderEconomics" (
    "orderId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "outcome" "OrderOutcome" NOT NULL,
    "itemNet" DECIMAL(18,2) NOT NULL,
    "buyerPaid" DECIMAL(18,2) NOT NULL,
    "cancelledAmount" DECIMAL(18,2) NOT NULL,
    "refundAmount" DECIMAL(18,2) NOT NULL,
    "pendingAmount" DECIMAL(18,2) NOT NULL,
    "realizedRevenue" DECIMAL(18,2) NOT NULL,
    "platformFees" DECIMAL(18,2) NOT NULL,
    "otherPlatformFees" DECIMAL(18,2) NOT NULL,
    "settlementAmount" DECIMAL(18,2) NOT NULL,
    "feesEstimated" BOOLEAN NOT NULL,
    "units" INTEGER NOT NULL,
    "costedUnits" INTEGER NOT NULL,
    "cogs" DECIMAL(18,2) NOT NULL,
    "cogsEstimated" BOOLEAN NOT NULL,
    "customCosts" DECIMAL(18,2) NOT NULL,
    "contribution" DECIMAL(18,2) NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderEconomics_pkey" PRIMARY KEY ("orderId")
);

-- CreateTable
CREATE TABLE "ShopDailyPnl" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "ordersPaid" INTEGER NOT NULL,
    "ordersSuccess" INTEGER NOT NULL,
    "ordersPartial" INTEGER NOT NULL,
    "ordersReturned" INTEGER NOT NULL,
    "ordersCancelled" INTEGER NOT NULL,
    "ordersPending" INTEGER NOT NULL,
    "grossItemValue" DECIMAL(18,2) NOT NULL,
    "buyerPaid" DECIMAL(18,2) NOT NULL,
    "cancelledAmount" DECIMAL(18,2) NOT NULL,
    "refundAmount" DECIMAL(18,2) NOT NULL,
    "pendingAmount" DECIMAL(18,2) NOT NULL,
    "pendingExpected" DECIMAL(18,2) NOT NULL,
    "realizedRevenue" DECIMAL(18,2) NOT NULL,
    "platformFees" DECIMAL(18,2) NOT NULL,
    "otherPlatformFees" DECIMAL(18,2) NOT NULL,
    "settlementAmount" DECIMAL(18,2) NOT NULL,
    "feesEstimated" DECIMAL(18,2) NOT NULL,
    "cogs" DECIMAL(18,2) NOT NULL,
    "cogsEstimated" DECIMAL(18,2) NOT NULL,
    "customCostsOrder" DECIMAL(18,2) NOT NULL,
    "customCostsFixed" DECIMAL(18,2) NOT NULL,
    "customBreakdown" JSONB NOT NULL DEFAULT '{}',
    "contribution" DECIMAL(18,2) NOT NULL,
    "adSpend" DECIMAL(18,2) NOT NULL,
    "adSpendManual" DECIMAL(18,2) NOT NULL,
    "adSpendGmvMax" DECIMAL(18,2) NOT NULL,
    "tiktokAdRevenue" DECIMAL(18,2) NOT NULL,
    "tiktokAdOrders" INTEGER NOT NULL,
    "netProfit" DECIMAL(18,2) NOT NULL,
    "estimatedShare" DECIMAL(5,4) NOT NULL,
    "feeBreakdown" JSONB NOT NULL DEFAULT '{}',
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopDailyPnl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncState" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "cursor" TIMESTAMP(3),
    "status" "SyncRunStatus" NOT NULL DEFAULT 'IDLE',
    "lastStartedAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" TEXT,
    "lastWarning" TEXT,
    "itemsLastRun" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SyncState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "ttsNotificationId" TEXT NOT NULL,
    "type" INTEGER NOT NULL,
    "tiktokShopId" TEXT,
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertRule" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "shopId" TEXT,
    "name" TEXT NOT NULL,
    "conditions" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AlertRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AlertInstance" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT,
    "organizationId" TEXT NOT NULL,
    "shopId" TEXT,
    "kind" TEXT NOT NULL DEFAULT 'RULE',
    "title" TEXT NOT NULL,
    "state" "AlertState" NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "firedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),

    CONSTRAINT "AlertInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportConfig" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "frequency" TEXT NOT NULL,
    "dayOfWeek" INTEGER,
    "dayOfMonth" INTEGER,
    "recipientEmail" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "plan" "Plan" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "stripeSubscriptionId" TEXT,
    "stripeCustomerId" TEXT,
    "currentPeriodEnd" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Organization_clerkOrgId_key" ON "Organization"("clerkOrgId");

-- CreateIndex
CREATE UNIQUE INDEX "Organization_slug_key" ON "Organization"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_clerkUserId_key" ON "User"("clerkUserId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationMember_organizationId_userId_key" ON "OrganizationMember"("organizationId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "SellerAuthorization_organizationId_openId_key" ON "SellerAuthorization"("organizationId", "openId");

-- CreateIndex
CREATE INDEX "Shop_organizationId_idx" ON "Shop"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "Shop_organizationId_tiktokShopId_key" ON "Shop"("organizationId", "tiktokShopId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopConfig_shopId_key" ON "ShopConfig"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_shopId_tiktokProductId_key" ON "Product"("shopId", "tiktokProductId");

-- CreateIndex
CREATE INDEX "Sku_tiktokSkuId_idx" ON "Sku"("tiktokSkuId");

-- CreateIndex
CREATE UNIQUE INDEX "Sku_productId_tiktokSkuId_key" ON "Sku"("productId", "tiktokSkuId");

-- CreateIndex
CREATE INDEX "Order_shopId_businessDate_idx" ON "Order"("shopId", "businessDate");

-- CreateIndex
CREATE INDEX "Order_shopId_status_idx" ON "Order"("shopId", "status");

-- CreateIndex
CREATE INDEX "Order_shopId_buyerHash_idx" ON "Order"("shopId", "buyerHash");

-- CreateIndex
CREATE UNIQUE INDEX "Order_shopId_tiktokOrderId_key" ON "Order"("shopId", "tiktokOrderId");

-- CreateIndex
CREATE INDEX "OrderLineItem_tiktokProductId_idx" ON "OrderLineItem"("tiktokProductId");

-- CreateIndex
CREATE INDEX "OrderLineItem_tiktokSkuId_idx" ON "OrderLineItem"("tiktokSkuId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderLineItem_orderId_tiktokLineItemId_key" ON "OrderLineItem"("orderId", "tiktokLineItemId");

-- CreateIndex
CREATE INDEX "Statement_shopId_statementTime_idx" ON "Statement"("shopId", "statementTime");

-- CreateIndex
CREATE UNIQUE INDEX "Statement_shopId_tiktokStatementId_key" ON "Statement"("shopId", "tiktokStatementId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderSettlement_orderId_key" ON "OrderSettlement"("orderId");

-- CreateIndex
CREATE INDEX "ReturnRequest_shopId_businessDate_idx" ON "ReturnRequest"("shopId", "businessDate");

-- CreateIndex
CREATE INDEX "ReturnRequest_shopId_tiktokOrderId_idx" ON "ReturnRequest"("shopId", "tiktokOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "ReturnRequest_shopId_tiktokReturnId_key" ON "ReturnRequest"("shopId", "tiktokReturnId");

-- CreateIndex
CREATE UNIQUE INDEX "Advertiser_organizationId_tiktokAdvertiserId_key" ON "Advertiser"("organizationId", "tiktokAdvertiserId");

-- CreateIndex
CREATE UNIQUE INDEX "AdvertiserStoreLink_advertiserId_storeId_key" ON "AdvertiserStoreLink"("advertiserId", "storeId");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_advertiserId_tiktokCampaignId_key" ON "Campaign"("advertiserId", "tiktokCampaignId");

-- CreateIndex
CREATE INDEX "AdDailyStat_advertiserId_date_idx" ON "AdDailyStat"("advertiserId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AdDailyStat_campaignId_date_source_key" ON "AdDailyStat"("campaignId", "date", "source");

-- CreateIndex
CREATE UNIQUE INDEX "ShopDailyStat_shopId_date_key" ON "ShopDailyStat"("shopId", "date");

-- CreateIndex
CREATE INDEX "ProductDailyStat_shopId_date_idx" ON "ProductDailyStat"("shopId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "ProductDailyStat_productId_date_key" ON "ProductDailyStat"("productId", "date");

-- CreateIndex
CREATE INDEX "SkuCost_shopId_idx" ON "SkuCost"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "SkuCost_skuId_effectiveFrom_key" ON "SkuCost"("skuId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "CostItem_shopId_idx" ON "CostItem"("shopId");

-- CreateIndex
CREATE INDEX "OrderEconomics_shopId_businessDate_idx" ON "OrderEconomics"("shopId", "businessDate");

-- CreateIndex
CREATE INDEX "OrderEconomics_shopId_outcome_idx" ON "OrderEconomics"("shopId", "outcome");

-- CreateIndex
CREATE UNIQUE INDEX "ShopDailyPnl_shopId_date_key" ON "ShopDailyPnl"("shopId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "SyncState_scopeType_scopeId_resource_key" ON "SyncState"("scopeType", "scopeId", "resource");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEvent_ttsNotificationId_key" ON "WebhookEvent"("ttsNotificationId");

-- CreateIndex
CREATE INDEX "AlertInstance_organizationId_state_idx" ON "AlertInstance"("organizationId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_organizationId_key" ON "Subscription"("organizationId");

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganizationMember" ADD CONSTRAINT "OrganizationMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerAuthorization" ADD CONSTRAINT "SellerAuthorization_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_sellerAuthorizationId_fkey" FOREIGN KEY ("sellerAuthorizationId") REFERENCES "SellerAuthorization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopConfig" ADD CONSTRAINT "ShopConfig_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sku" ADD CONSTRAINT "Sku_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLineItem" ADD CONSTRAINT "OrderLineItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Statement" ADD CONSTRAINT "Statement_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderSettlement" ADD CONSTRAINT "OrderSettlement_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReturnRequest" ADD CONSTRAINT "ReturnRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdsAuthorization" ADD CONSTRAINT "AdsAuthorization_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Advertiser" ADD CONSTRAINT "Advertiser_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Advertiser" ADD CONSTRAINT "Advertiser_adsAuthorizationId_fkey" FOREIGN KEY ("adsAuthorizationId") REFERENCES "AdsAuthorization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvertiserStoreLink" ADD CONSTRAINT "AdvertiserStoreLink_advertiserId_fkey" FOREIGN KEY ("advertiserId") REFERENCES "Advertiser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvertiserStoreLink" ADD CONSTRAINT "AdvertiserStoreLink_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_advertiserId_fkey" FOREIGN KEY ("advertiserId") REFERENCES "Advertiser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdDailyStat" ADD CONSTRAINT "AdDailyStat_advertiserId_fkey" FOREIGN KEY ("advertiserId") REFERENCES "Advertiser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdDailyStat" ADD CONSTRAINT "AdDailyStat_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopDailyStat" ADD CONSTRAINT "ShopDailyStat_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductDailyStat" ADD CONSTRAINT "ProductDailyStat_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductDailyStat" ADD CONSTRAINT "ProductDailyStat_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkuCost" ADD CONSTRAINT "SkuCost_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkuCost" ADD CONSTRAINT "SkuCost_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "Sku"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostItem" ADD CONSTRAINT "CostItem_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEconomics" ADD CONSTRAINT "OrderEconomics_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopDailyPnl" ADD CONSTRAINT "ShopDailyPnl_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncState" ADD CONSTRAINT "SyncState_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertRule" ADD CONSTRAINT "AlertRule_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertRule" ADD CONSTRAINT "AlertRule_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertInstance" ADD CONSTRAINT "AlertInstance_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AlertRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AlertInstance" ADD CONSTRAINT "AlertInstance_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportConfig" ADD CONSTRAINT "ReportConfig_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportConfig" ADD CONSTRAINT "ReportConfig_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

