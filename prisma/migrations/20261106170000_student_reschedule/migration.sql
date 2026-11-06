-- AlterTable
ALTER TABLE "OrgSettings" ADD COLUMN "studentReschedule" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "studentRescheduleHours" INTEGER NOT NULL DEFAULT 12;
