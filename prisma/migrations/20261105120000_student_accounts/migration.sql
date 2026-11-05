-- CreateEnum
CREATE TYPE "StudentLinkVia" AS ENUM ('PHONE', 'CODE', 'STAFF');
-- CreateTable
CREATE TABLE "StudentAccount" (
    "id" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "phone" TEXT,
    "name" TEXT NOT NULL,
    "username" TEXT,
    "photoUrl" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'uz',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),
    CONSTRAINT "StudentAccount_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "StudentAccountLink" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "studentId" TEXT,
    "parentId" TEXT,
    "organizationId" TEXT NOT NULL,
    "via" "StudentLinkVia" NOT NULL,
    "linkedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudentAccountLink_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "StudentSession" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudentSession_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "StudentLoginTicket" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudentLoginTicket_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "StudentAccount_telegramUserId_key" ON "StudentAccount"("telegramUserId");
-- CreateIndex
CREATE UNIQUE INDEX "StudentAccountLink_studentId_key" ON "StudentAccountLink"("studentId");
-- CreateIndex
CREATE UNIQUE INDEX "StudentAccountLink_parentId_key" ON "StudentAccountLink"("parentId");
-- CreateIndex
CREATE INDEX "StudentAccountLink_accountId_idx" ON "StudentAccountLink"("accountId");
-- CreateIndex
CREATE INDEX "StudentAccountLink_organizationId_idx" ON "StudentAccountLink"("organizationId");
-- CreateIndex
CREATE UNIQUE INDEX "StudentSession_tokenHash_key" ON "StudentSession"("tokenHash");
-- CreateIndex
CREATE INDEX "StudentSession_accountId_idx" ON "StudentSession"("accountId");
-- CreateIndex
CREATE INDEX "StudentSession_expiresAt_idx" ON "StudentSession"("expiresAt");
-- CreateIndex
CREATE UNIQUE INDEX "StudentLoginTicket_tokenHash_key" ON "StudentLoginTicket"("tokenHash");
-- CreateIndex
CREATE INDEX "StudentLoginTicket_accountId_idx" ON "StudentLoginTicket"("accountId");
-- AddForeignKey
ALTER TABLE "StudentAccountLink" ADD CONSTRAINT "StudentAccountLink_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "StudentAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "StudentAccountLink" ADD CONSTRAINT "StudentAccountLink_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "StudentAccountLink" ADD CONSTRAINT "StudentAccountLink_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Parent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "StudentSession" ADD CONSTRAINT "StudentSession_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "StudentAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "StudentLoginTicket" ADD CONSTRAINT "StudentLoginTicket_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "StudentAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
