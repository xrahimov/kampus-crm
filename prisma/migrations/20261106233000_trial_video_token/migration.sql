-- A trial visitor's own link into the online lesson (A-172).
ALTER TABLE "TrialBooking" ADD COLUMN "videoToken" TEXT;
CREATE UNIQUE INDEX "TrialBooking_videoToken_key" ON "TrialBooking"("videoToken");
