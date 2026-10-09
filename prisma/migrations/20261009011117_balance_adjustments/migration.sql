-- CreateEnum
CREATE TYPE "BalanceAdjustmentKind" AS ENUM ('OPENING', 'CORRECTION');

-- CreateTable
CREATE TABLE "BalanceAdjustment" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "kind" "BalanceAdjustmentKind" NOT NULL DEFAULT 'OPENING',
    "date" DATE NOT NULL,
    "comment" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BalanceAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BalanceAdjustment_membershipId_idx" ON "BalanceAdjustment"("membershipId");

-- CreateIndex
CREATE INDEX "BalanceAdjustment_studentId_idx" ON "BalanceAdjustment"("studentId");

-- CreateIndex
CREATE INDEX "BalanceAdjustment_branchId_date_idx" ON "BalanceAdjustment"("branchId", "date");

-- AddForeignKey
ALTER TABLE "BalanceAdjustment" ADD CONSTRAINT "BalanceAdjustment_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "GroupMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceAdjustment" ADD CONSTRAINT "BalanceAdjustment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceAdjustment" ADD CONSTRAINT "BalanceAdjustment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BalanceAdjustment" ADD CONSTRAINT "BalanceAdjustment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
