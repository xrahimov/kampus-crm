-- Sign-in with a code from the Telegram bot, a password of one's own after the
-- first Telegram sign-in, and a list of people waiting to be added (A-196).
-- Additive: no existing column or row is removed.

-- CreateEnum
CREATE TYPE "SignInDoor" AS ENUM ('STAFF', 'STUDENT');

-- CreateEnum
CREATE TYPE "JoinRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'DECLINED');

-- AlterEnum
ALTER TYPE "NotificationKind" ADD VALUE 'JOIN_REQUEST';

-- AlterTable
ALTER TABLE "StudentAccount" ADD COLUMN     "passwordHash" TEXT,
ADD COLUMN     "passwordOfferedAt" TIMESTAMP(3),
ADD COLUMN     "passwordSetAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "StudentSession" ADD COLUMN     "signedInWith" "SignInMethod" NOT NULL DEFAULT 'TELEGRAM';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "passwordOfferedAt" TIMESTAMP(3),
ADD COLUMN     "telegramVerifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TelegramContact" (
    "id" TEXT NOT NULL,
    "botOrganizationId" TEXT NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'uz',
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhoneSignInCode" (
    "id" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "door" "SignInDoor" NOT NULL,
    "botOrganizationId" TEXT NOT NULL,
    "codeHash" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "ip" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhoneSignInCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JoinRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "branchId" TEXT,
    "door" "SignInDoor" NOT NULL,
    "phone" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "note" TEXT,
    "telegramUserId" TEXT,
    "chatId" TEXT,
    "botOrganizationId" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'uz',
    "status" "JoinRequestStatus" NOT NULL DEFAULT 'PENDING',
    "tokenHash" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JoinRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TelegramContact_phone_idx" ON "TelegramContact"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramContact_botOrganizationId_telegramUserId_key" ON "TelegramContact"("botOrganizationId", "telegramUserId");

-- CreateIndex
CREATE INDEX "PhoneSignInCode_phone_createdAt_idx" ON "PhoneSignInCode"("phone", "createdAt");

-- CreateIndex
CREATE INDEX "PhoneSignInCode_ip_createdAt_idx" ON "PhoneSignInCode"("ip", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "JoinRequest_tokenHash_key" ON "JoinRequest"("tokenHash");

-- CreateIndex
CREATE INDEX "JoinRequest_organizationId_status_idx" ON "JoinRequest"("organizationId", "status");

-- CreateIndex
CREATE INDEX "JoinRequest_phone_idx" ON "JoinRequest"("phone");

-- AddForeignKey
ALTER TABLE "JoinRequest" ADD CONSTRAINT "JoinRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JoinRequest" ADD CONSTRAINT "JoinRequest_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JoinRequest" ADD CONSTRAINT "JoinRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- CreateIndex
CREATE INDEX "StudentAccount_phone_idx" ON "StudentAccount"("phone");

-- Staff who already signed in with Telegram have proven their phone: their
-- password works again from now on, without a new first sign-in.
UPDATE "User" u
SET "telegramVerifiedAt" = l.first_at
FROM (
  SELECT "userId", MIN("createdAt") AS first_at
  FROM "LoginLog"
  WHERE "success" = true AND "method" = 'TELEGRAM' AND "userId" IS NOT NULL
  GROUP BY "userId"
) l
WHERE u."id" = l."userId";
