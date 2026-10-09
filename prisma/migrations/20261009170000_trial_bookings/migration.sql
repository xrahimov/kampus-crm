-- CreateEnum
CREATE TYPE "TrialStatus" AS ENUM ('BOOKED', 'ATTENDED', 'NO_SHOW', 'CONVERTED', 'CANCELLED');

-- CreateTable
CREATE TABLE "TrialBooking" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "lessonId" TEXT,
    "date" DATE NOT NULL,
    "status" "TrialStatus" NOT NULL DEFAULT 'BOOKED',
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrialBooking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TrialBooking_groupId_date_idx" ON "TrialBooking"("groupId", "date");

-- CreateIndex
CREATE INDEX "TrialBooking_leadId_date_idx" ON "TrialBooking"("leadId", "date");

-- AddForeignKey
ALTER TABLE "TrialBooking" ADD CONSTRAINT "TrialBooking_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrialBooking" ADD CONSTRAINT "TrialBooking_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrialBooking" ADD CONSTRAINT "TrialBooking_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrialBooking" ADD CONSTRAINT "TrialBooking_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

