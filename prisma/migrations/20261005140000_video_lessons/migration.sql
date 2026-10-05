-- CreateEnum
CREATE TYPE "VideoRoomStatus" AS ENUM ('LIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "VideoPeerRole" AS ENUM ('HOST', 'STAFF', 'STUDENT');

-- AlterEnum
ALTER TYPE "IntegrationProvider" ADD VALUE 'VIDEO';

-- AlterTable
ALTER TABLE "GroupMembership" ADD COLUMN     "videoToken" TEXT;

-- CreateTable
CREATE TABLE "VideoRoom" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "lessonId" TEXT,
    "status" "VideoRoomStatus" NOT NULL DEFAULT 'LIVE',
    "startedById" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "VideoRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoParticipant" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "role" "VideoPeerRole" NOT NULL,
    "userId" TEXT,
    "studentId" TEXT,
    "displayName" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "media" JSONB,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "VideoParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VideoSignal" (
    "id" SERIAL NOT NULL,
    "roomId" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VideoSignal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VideoRoom_groupId_status_idx" ON "VideoRoom"("groupId", "status");

-- CreateIndex
CREATE INDEX "VideoRoom_lessonId_idx" ON "VideoRoom"("lessonId");

-- CreateIndex
CREATE INDEX "VideoParticipant_roomId_lastSeenAt_idx" ON "VideoParticipant"("roomId", "lastSeenAt");

-- CreateIndex
CREATE INDEX "VideoParticipant_userId_idx" ON "VideoParticipant"("userId");

-- CreateIndex
CREATE INDEX "VideoParticipant_studentId_idx" ON "VideoParticipant"("studentId");

-- CreateIndex
CREATE INDEX "VideoSignal_roomId_toId_id_idx" ON "VideoSignal"("roomId", "toId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "GroupMembership_videoToken_key" ON "GroupMembership"("videoToken");

-- AddForeignKey
ALTER TABLE "VideoRoom" ADD CONSTRAINT "VideoRoom_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoRoom" ADD CONSTRAINT "VideoRoom_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoRoom" ADD CONSTRAINT "VideoRoom_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoParticipant" ADD CONSTRAINT "VideoParticipant_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "VideoRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoParticipant" ADD CONSTRAINT "VideoParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoParticipant" ADD CONSTRAINT "VideoParticipant_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VideoSignal" ADD CONSTRAINT "VideoSignal_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "VideoRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

