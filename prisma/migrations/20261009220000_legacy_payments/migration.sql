-- CreateTable
CREATE TABLE "LegacyPayment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "groupName" TEXT,
    "amount" DECIMAL(15,2) NOT NULL,
    "paidAt" DATE NOT NULL,
    "method" TEXT,
    "comment" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LegacyPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LegacyPayment_studentId_paidAt_idx" ON "LegacyPayment"("studentId", "paidAt");

-- CreateIndex
CREATE INDEX "LegacyPayment_branchId_paidAt_idx" ON "LegacyPayment"("branchId", "paidAt");

-- AddForeignKey
ALTER TABLE "LegacyPayment" ADD CONSTRAINT "LegacyPayment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegacyPayment" ADD CONSTRAINT "LegacyPayment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LegacyPayment" ADD CONSTRAINT "LegacyPayment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

