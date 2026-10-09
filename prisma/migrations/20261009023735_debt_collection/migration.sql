-- CreateEnum
CREATE TYPE "DebtCaseStatus" AS ENUM ('OPEN', 'PROMISED', 'CLOSED');

-- CreateEnum
CREATE TYPE "DebtCloseReason" AS ENUM ('PAID', 'PROMISE_KEPT', 'LEFT');

-- CreateEnum
CREATE TYPE "DebtContactChannel" AS ENUM ('CALL', 'TELEGRAM', 'SMS', 'VISIT', 'NOTE');

-- CreateEnum
CREATE TYPE "DebtContactOutcome" AS ENUM ('NO_ANSWER', 'PROMISED', 'REFUSED', 'WRONG_NUMBER', 'OTHER', 'PROMISE_KEPT', 'PROMISE_BROKEN');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "NotificationKind" ADD VALUE 'DEBT_TASK';
ALTER TYPE "NotificationKind" ADD VALUE 'DEBT_PROMISE_BROKEN';

-- AlterTable
ALTER TABLE "OrgSettings" ADD COLUMN     "debtSmsDays" INTEGER DEFAULT 3,
ADD COLUMN     "debtTaskDays" INTEGER DEFAULT 7,
ADD COLUMN     "debtTelegramDays" INTEGER DEFAULT 1;

-- CreateTable
CREATE TABLE "DebtCase" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "status" "DebtCaseStatus" NOT NULL DEFAULT 'OPEN',
    "openedAt" DATE NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "promisedAt" DATE,
    "promisedAmount" DECIMAL(15,2),
    "amountAtPromise" DECIMAL(15,2),
    "brokenPromises" INTEGER NOT NULL DEFAULT 0,
    "lastContactAt" TIMESTAMP(3),
    "lastChannel" "DebtContactChannel",
    "lastOutcome" "DebtContactOutcome",
    "telegramAt" TIMESTAMP(3),
    "smsAt" TIMESTAMP(3),
    "taskAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closedReason" "DebtCloseReason",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DebtCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DebtContact" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "channel" "DebtContactChannel" NOT NULL,
    "outcome" "DebtContactOutcome",
    "promisedAt" DATE,
    "promisedAmount" DECIMAL(15,2),
    "note" TEXT,
    "auto" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DebtContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DebtCase_branchId_status_openedAt_idx" ON "DebtCase"("branchId", "status", "openedAt");

-- CreateIndex
CREATE INDEX "DebtCase_studentId_status_idx" ON "DebtCase"("studentId", "status");

-- CreateIndex
CREATE INDEX "DebtContact_caseId_createdAt_idx" ON "DebtContact"("caseId", "createdAt");

-- AddForeignKey
ALTER TABLE "DebtCase" ADD CONSTRAINT "DebtCase_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtCase" ADD CONSTRAINT "DebtCase_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtContact" ADD CONSTRAINT "DebtContact_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "DebtCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtContact" ADD CONSTRAINT "DebtContact_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
