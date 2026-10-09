-- AlterEnum
ALTER TYPE "CoinEvent" ADD VALUE 'REFERRAL';

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "referralCode" TEXT,
ADD COLUMN     "referredById" TEXT,
ADD COLUMN     "referralCreditedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "referrerId" TEXT;

-- AlterTable
ALTER TABLE "OrgSettings" ADD COLUMN     "referralBonus" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "referralOfId" TEXT;

-- CreateIndex
CREATE INDEX "Payment_referralOfId_idx" ON "Payment"("referralOfId");

-- CreateIndex
CREATE UNIQUE INDEX "Student_referralCode_key" ON "Student"("referralCode");

-- CreateIndex
CREATE INDEX "Student_referredById_idx" ON "Student"("referredById");

-- CreateIndex
CREATE INDEX "Lead_referrerId_idx" ON "Lead"("referrerId");

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;
