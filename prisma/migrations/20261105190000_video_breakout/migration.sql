-- Breakout rooms in video lessons (A-156).
ALTER TABLE "VideoRoom" ADD COLUMN "breakoutRooms" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "VideoRoom" ADD COLUMN "breakoutEndsAt" TIMESTAMP(3);
ALTER TABLE "VideoParticipant" ADD COLUMN "breakoutRoom" INTEGER;
