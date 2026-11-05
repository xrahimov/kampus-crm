-- Hand queue order, spotlight and focus mode in video lessons (A-152).
ALTER TABLE "VideoRoom" ADD COLUMN "spotlightId" TEXT;
ALTER TABLE "VideoRoom" ADD COLUMN "focusMode" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "VideoParticipant" ADD COLUMN "handRaisedAt" TIMESTAMP(3);
