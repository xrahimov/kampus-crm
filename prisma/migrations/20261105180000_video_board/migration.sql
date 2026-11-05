-- Shared whiteboard on the call stage (A-155).
ALTER TABLE "VideoRoom" ADD COLUMN "boardOpen" BOOLEAN NOT NULL DEFAULT false;
