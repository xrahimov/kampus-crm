-- Announcements (A-129): notices to a group, a branch or the whole centre, with read marks.
-- CreateEnum
CREATE TYPE "AnnouncementAudience" AS ENUM ('CENTRE', 'BRANCH', 'GROUP');

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "audience" "AnnouncementAudience" NOT NULL,
    "branchId" TEXT,
    "groupId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sendSms" BOOLEAN NOT NULL DEFAULT false,
    "recipients" INTEGER NOT NULL DEFAULT 0,
    "telegramQueued" INTEGER NOT NULL DEFAULT 0,
    "smsQueued" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnouncementRead" (
    "id" TEXT NOT NULL,
    "announcementId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnouncementRead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Announcement_organizationId_createdAt_idx" ON "Announcement"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "Announcement_branchId_createdAt_idx" ON "Announcement"("branchId", "createdAt");

-- CreateIndex
CREATE INDEX "Announcement_groupId_createdAt_idx" ON "Announcement"("groupId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnnouncementRead_announcementId_studentId_key" ON "AnnouncementRead"("announcementId", "studentId");

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementRead" ADD CONSTRAINT "AnnouncementRead_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementRead" ADD CONSTRAINT "AnnouncementRead_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

