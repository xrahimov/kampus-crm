-- CreateEnum
CREATE TYPE "AbsenceReason" AS ENUM ('STREAK', 'SILENT');

-- CreateEnum
CREATE TYPE "AbsenceCaseStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "AbsenceCloseReason" AS ENUM ('RETURNED', 'LEFT', 'CLEARED');

-- CreateEnum
CREATE TYPE "AbsenceContactOutcome" AS ENUM ('NO_ANSWER', 'WILL_RETURN', 'ILL', 'LEAVING', 'OTHER');

-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'ABSENCES';

-- AlterTable
ALTER TABLE "OrgSettings" ADD COLUMN     "absenceSilentDays" INTEGER DEFAULT 14,
ADD COLUMN     "absenceStreak" INTEGER DEFAULT 2;

-- CreateTable
CREATE TABLE "AbsenceCase" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "status" "AbsenceCaseStatus" NOT NULL DEFAULT 'OPEN',
    "reason" "AbsenceReason" NOT NULL,
    "missed" INTEGER NOT NULL DEFAULT 0,
    "sinceAt" DATE NOT NULL,
    "lastPresentAt" DATE,
    "openedAt" DATE NOT NULL,
    "lastContactAt" TIMESTAMP(3),
    "lastChannel" "DebtContactChannel",
    "lastOutcome" "AbsenceContactOutcome",
    "closedAt" TIMESTAMP(3),
    "closedReason" "AbsenceCloseReason",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AbsenceCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AbsenceContact" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "channel" "DebtContactChannel" NOT NULL,
    "outcome" "AbsenceContactOutcome",
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AbsenceContact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AbsenceCase_branchId_status_sinceAt_idx" ON "AbsenceCase"("branchId", "status", "sinceAt");

-- CreateIndex
CREATE INDEX "AbsenceCase_membershipId_status_idx" ON "AbsenceCase"("membershipId", "status");

-- CreateIndex
CREATE INDEX "AbsenceCase_studentId_idx" ON "AbsenceCase"("studentId");

-- CreateIndex
CREATE INDEX "AbsenceContact_caseId_createdAt_idx" ON "AbsenceContact"("caseId", "createdAt");

-- AddForeignKey
ALTER TABLE "AbsenceCase" ADD CONSTRAINT "AbsenceCase_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "GroupMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbsenceCase" ADD CONSTRAINT "AbsenceCase_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbsenceCase" ADD CONSTRAINT "AbsenceCase_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbsenceCase" ADD CONSTRAINT "AbsenceCase_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbsenceContact" ADD CONSTRAINT "AbsenceContact_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "AbsenceCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbsenceContact" ADD CONSTRAINT "AbsenceContact_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

