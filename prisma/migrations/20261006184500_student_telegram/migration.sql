-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "telegramCode" TEXT;

-- CreateTable
CREATE TABLE "StudentTelegramChat" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "name" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'uz',
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentTelegramChat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudentTelegramChat_chatId_key" ON "StudentTelegramChat"("chatId");

-- CreateIndex
CREATE INDEX "StudentTelegramChat_studentId_idx" ON "StudentTelegramChat"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "Student_telegramCode_key" ON "Student"("telegramCode");

-- AddForeignKey
ALTER TABLE "StudentTelegramChat" ADD CONSTRAINT "StudentTelegramChat_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

