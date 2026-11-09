-- Lesson packages: a group sells N lessons at a price; attended lessons use credits (A-178).
CREATE TYPE "BillingMode" AS ENUM ('MONTHLY', 'PACKAGES');

ALTER TABLE "Group" ADD COLUMN "billingMode" "BillingMode" NOT NULL DEFAULT 'MONTHLY';

CREATE TABLE "LessonPackage" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "lessons" INTEGER NOT NULL,
  "price" DECIMAL(15,2) NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LessonPackage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LessonPackage_groupId_idx" ON "LessonPackage"("groupId");

ALTER TABLE "LessonPackage" ADD CONSTRAINT "LessonPackage_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PackagePurchase" (
  "id" TEXT NOT NULL,
  "membershipId" TEXT NOT NULL,
  "packageId" TEXT,
  "paymentId" TEXT,
  "name" TEXT NOT NULL,
  "lessons" INTEGER NOT NULL,
  "price" DECIMAL(15,2) NOT NULL,
  "purchasedAt" DATE NOT NULL,
  "note" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PackagePurchase_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PackagePurchase_paymentId_key" ON "PackagePurchase"("paymentId");
CREATE INDEX "PackagePurchase_membershipId_purchasedAt_idx" ON "PackagePurchase"("membershipId", "purchasedAt");

ALTER TABLE "PackagePurchase" ADD CONSTRAINT "PackagePurchase_membershipId_fkey"
  FOREIGN KEY ("membershipId") REFERENCES "GroupMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PackagePurchase" ADD CONSTRAINT "PackagePurchase_packageId_fkey"
  FOREIGN KEY ("packageId") REFERENCES "LessonPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PackagePurchase" ADD CONSTRAINT "PackagePurchase_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PackagePurchase" ADD CONSTRAINT "PackagePurchase_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "PackageUse" (
  "lessonId" TEXT NOT NULL,
  "membershipId" TEXT NOT NULL,
  "purchaseId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PackageUse_pkey" PRIMARY KEY ("lessonId", "membershipId")
);

CREATE INDEX "PackageUse_membershipId_idx" ON "PackageUse"("membershipId");
CREATE INDEX "PackageUse_purchaseId_idx" ON "PackageUse"("purchaseId");

ALTER TABLE "PackageUse" ADD CONSTRAINT "PackageUse_lessonId_fkey"
  FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PackageUse" ADD CONSTRAINT "PackageUse_membershipId_fkey"
  FOREIGN KEY ("membershipId") REFERENCES "GroupMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PackageUse" ADD CONSTRAINT "PackageUse_purchaseId_fkey"
  FOREIGN KEY ("purchaseId") REFERENCES "PackagePurchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
