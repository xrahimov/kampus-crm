-- CreateEnum
CREATE TYPE "LeadContactOutcome" AS ENUM ('NO_ANSWER', 'WILL_COME', 'THINKING', 'NOT_INTERESTED', 'WRONG_NUMBER', 'OTHER');

-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'LEAD_FOLLOW_UP';

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "lastContactAt" TIMESTAMP(3),
ADD COLUMN     "lastOutcome" "LeadContactOutcome",
ADD COLUMN     "nextContactAt" DATE,
ADD COLUMN     "ownerId" TEXT;

-- CreateTable
CREATE TABLE "LeadContact" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "channel" "DebtContactChannel" NOT NULL,
    "outcome" "LeadContactOutcome",
    "note" TEXT,
    "nextContactAt" DATE,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadContact_leadId_createdAt_idx" ON "LeadContact"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "Lead_ownerId_nextContactAt_idx" ON "Lead"("ownerId", "nextContactAt");

-- CreateIndex
CREATE INDEX "Lead_branchId_nextContactAt_idx" ON "Lead"("branchId", "nextContactAt");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadContact" ADD CONSTRAINT "LeadContact_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadContact" ADD CONSTRAINT "LeadContact_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

