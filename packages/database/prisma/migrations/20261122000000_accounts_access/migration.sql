-- Data: VIEWER no longer exists, members become MEMBER (view assigned shops only).
UPDATE "OrganizationMember" SET role = 'MEMBER' WHERE role = 'VIEWER';

-- Data: keep advertiser ↔ token links before the column goes away.
CREATE TEMP TABLE _adv_auth AS SELECT id, "adsAuthorizationId" FROM "Advertiser";

-- CreateEnum
CREATE TYPE "PlatformRole" AS ENUM ('SUPER_ADMIN', 'ADMIN', 'MOD');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INVITED', 'DISABLED');

-- CreateEnum
CREATE TYPE "AdsMode" AS ENUM ('TIKTOK', 'NONE');

-- CreateEnum
CREATE TYPE "AuthSource" AS ENUM ('SELF_SIGNUP', 'APP_STORE', 'ADMIN_LINK');

-- CreateEnum
CREATE TYPE "AdsAuthKind" AS ENUM ('CLIENT', 'AGENCY_BC');

-- AlterEnum
BEGIN;
CREATE TYPE "MemberRole_new" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');
ALTER TABLE "OrganizationMember" ALTER COLUMN "role" TYPE "MemberRole_new" USING ("role"::text::"MemberRole_new");
ALTER TYPE "MemberRole" RENAME TO "MemberRole_old";
ALTER TYPE "MemberRole_new" RENAME TO "MemberRole";
DROP TYPE "public"."MemberRole_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "AdsAuthorization" DROP CONSTRAINT "AdsAuthorization_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "Advertiser" DROP CONSTRAINT "Advertiser_adsAuthorizationId_fkey";

-- DropForeignKey
ALTER TABLE "Advertiser" DROP CONSTRAINT "Advertiser_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "SellerAuthorization" DROP CONSTRAINT "SellerAuthorization_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "Shop" DROP CONSTRAINT "Shop_organizationId_fkey";

-- DropIndex
DROP INDEX "Advertiser_organizationId_tiktokAdvertiserId_key";

-- DropIndex
DROP INDEX "Organization_clerkOrgId_key";

-- DropIndex
DROP INDEX "SellerAuthorization_organizationId_openId_key";

-- DropIndex
DROP INDEX "Shop_organizationId_tiktokShopId_key";

-- DropIndex
DROP INDEX "User_clerkUserId_key";

-- AlterTable
ALTER TABLE "AdsAuthorization" ADD COLUMN     "bcId" TEXT,
ADD COLUMN     "kind" "AdsAuthKind" NOT NULL DEFAULT 'CLIENT',
ADD COLUMN     "label" TEXT,
ALTER COLUMN "organizationId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Advertiser" DROP COLUMN "adsAuthorizationId",
ALTER COLUMN "organizationId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "OrderSettlement" ADD COLUMN     "affiliateAdsCommission" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "gmvMaxAdFee" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Organization" DROP COLUMN "clerkOrgId",
ADD COLUMN     "adsMode" "AdsMode" NOT NULL DEFAULT 'TIKTOK',
ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "onboardedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SellerAuthorization" ADD COLUMN     "source" "AuthSource" NOT NULL DEFAULT 'SELF_SIGNUP',
ALTER COLUMN "organizationId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Shop" ALTER COLUMN "organizationId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ShopDailyStat" ADD COLUMN     "gmvMaxRevenueShare" DECIMAL(5,4);

-- AlterTable
ALTER TABLE "SyncState" ALTER COLUMN "organizationId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "clerkUserId",
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "passwordHash" TEXT,
ADD COLUMN     "platformRole" "PlatformRole",
ADD COLUMN     "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "tiktokOpenId" TEXT,
ALTER COLUMN "email" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ShopAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "grantedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "organizationId" TEXT,
    "platformRole" "PlatformRole",
    "orgRole" "MemberRole",
    "shopIds" TEXT[],
    "tokenHash" TEXT NOT NULL,
    "invitedById" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "organizationId" TEXT,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatementAdjustment" (
    "id" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "reference" TEXT,

    CONSTRAINT "StatementAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdvertiserAuthorization" (
    "advertiserId" TEXT NOT NULL,
    "adsAuthorizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdvertiserAuthorization_pkey" PRIMARY KEY ("advertiserId","adsAuthorizationId")
);

INSERT INTO "AdvertiserAuthorization" ("advertiserId", "adsAuthorizationId") SELECT id, "adsAuthorizationId" FROM _adv_auth;

-- CreateTable
CREATE TABLE "SyncRound" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "shopOk" BOOLEAN NOT NULL DEFAULT false,
    "adsOk" BOOLEAN NOT NULL DEFAULT false,
    "shopSyncedTo" TIMESTAMP(3),
    "adsSyncedTo" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "SyncRound_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShopAccess_shopId_idx" ON "ShopAccess"("shopId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopAccess_userId_shopId_key" ON "ShopAccess"("userId", "shopId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StatementAdjustment_statementId_type_reference_key" ON "StatementAdjustment"("statementId", "type", "reference");

-- CreateIndex
CREATE INDEX "SyncRound_organizationId_startedAt_idx" ON "SyncRound"("organizationId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Advertiser_tiktokAdvertiserId_key" ON "Advertiser"("tiktokAdvertiserId");

-- CreateIndex
CREATE INDEX "Advertiser_organizationId_idx" ON "Advertiser"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "SellerAuthorization_openId_key" ON "SellerAuthorization"("openId");

-- CreateIndex
CREATE UNIQUE INDEX "Shop_tiktokShopId_key" ON "Shop"("tiktokShopId");

-- CreateIndex
CREATE UNIQUE INDEX "User_tiktokOpenId_key" ON "User"("tiktokOpenId");

-- AddForeignKey
ALTER TABLE "ShopAccess" ADD CONSTRAINT "ShopAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopAccess" ADD CONSTRAINT "ShopAccess_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerAuthorization" ADD CONSTRAINT "SellerAuthorization_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shop" ADD CONSTRAINT "Shop_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatementAdjustment" ADD CONSTRAINT "StatementAdjustment_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "Statement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdsAuthorization" ADD CONSTRAINT "AdsAuthorization_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvertiserAuthorization" ADD CONSTRAINT "AdvertiserAuthorization_advertiserId_fkey" FOREIGN KEY ("advertiserId") REFERENCES "Advertiser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdvertiserAuthorization" ADD CONSTRAINT "AdvertiserAuthorization_adsAuthorizationId_fkey" FOREIGN KEY ("adsAuthorizationId") REFERENCES "AdsAuthorization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Advertiser" ADD CONSTRAINT "Advertiser_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncRound" ADD CONSTRAINT "SyncRound_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

