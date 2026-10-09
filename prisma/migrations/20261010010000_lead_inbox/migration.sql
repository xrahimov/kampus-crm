-- CreateEnum
CREATE TYPE "LeadChannel" AS ENUM ('TELEGRAM', 'INSTAGRAM');

-- CreateEnum
CREATE TYPE "LeadMessageDirection" AS ENUM ('IN', 'OUT');

-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'LEAD_MESSAGE';

-- CreateTable
CREATE TABLE "LeadConversation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT,
    "channel" "LeadChannel" NOT NULL,
    "externalChatId" TEXT NOT NULL,
    "displayName" TEXT,
    "username" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'uz',
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "direction" "LeadMessageDirection" NOT NULL,
    "text" TEXT NOT NULL,
    "sentById" TEXT,
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeadConversation_leadId_key" ON "LeadConversation"("leadId");

-- CreateIndex
CREATE INDEX "LeadConversation_organizationId_isClosed_lastMessageAt_idx" ON "LeadConversation"("organizationId", "isClosed", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "LeadConversation_organizationId_channel_externalChatId_key" ON "LeadConversation"("organizationId", "channel", "externalChatId");

-- CreateIndex
CREATE INDEX "LeadMessage_conversationId_createdAt_idx" ON "LeadMessage"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "LeadConversation" ADD CONSTRAINT "LeadConversation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadConversation" ADD CONSTRAINT "LeadConversation_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadMessage" ADD CONSTRAINT "LeadMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "LeadConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadMessage" ADD CONSTRAINT "LeadMessage_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

