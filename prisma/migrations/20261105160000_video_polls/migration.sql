-- Polls in video lessons (A-153).
CREATE TABLE "VideoPoll" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "VideoPoll_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VideoPollVote" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "voterKey" TEXT NOT NULL,
    "studentId" TEXT,
    "displayName" TEXT NOT NULL,
    "option" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VideoPollVote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VideoPoll_roomId_createdAt_idx" ON "VideoPoll"("roomId", "createdAt");
CREATE UNIQUE INDEX "VideoPollVote_pollId_voterKey_key" ON "VideoPollVote"("pollId", "voterKey");

ALTER TABLE "VideoPoll" ADD CONSTRAINT "VideoPoll_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "VideoRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VideoPollVote" ADD CONSTRAINT "VideoPollVote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "VideoPoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
