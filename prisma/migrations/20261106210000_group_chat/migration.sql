-- Group chat between teachers and students, with a Telegram mirror (A-170).
CREATE TYPE "ChatSource" AS ENUM ('WEB', 'TELEGRAM');

CREATE TABLE "GroupChatMessage" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT,
    "membershipId" TEXT,
    "text" TEXT NOT NULL,
    "source" "ChatSource" NOT NULL DEFAULT 'WEB',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GroupChatMessage_groupId_createdAt_idx" ON "GroupChatMessage"("groupId", "createdAt");

ALTER TABLE "GroupChatMessage" ADD CONSTRAINT "GroupChatMessage_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupChatMessage" ADD CONSTRAINT "GroupChatMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GroupChatMessage" ADD CONSTRAINT "GroupChatMessage_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "GroupMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "GroupChatRead" (
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupChatRead_pkey" PRIMARY KEY ("groupId", "userId")
);

ALTER TABLE "GroupChatRead" ADD CONSTRAINT "GroupChatRead_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupChatRead" ADD CONSTRAINT "GroupChatRead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GroupMembership" ADD COLUMN "chatReadAt" TIMESTAMP(3);
ALTER TABLE "StudentTelegramChat" ADD COLUMN "chatGroupId" TEXT;
