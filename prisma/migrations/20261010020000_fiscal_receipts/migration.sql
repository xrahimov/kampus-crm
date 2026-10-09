-- CreateEnum
CREATE TYPE "FiscalReceiptKind" AS ENUM ('SALE', 'REFUND');

-- CreateEnum
CREATE TYPE "FiscalReceiptStatus" AS ENUM ('PENDING', 'ISSUED', 'FAILED');

-- AlterEnum
ALTER TYPE "IntegrationProvider" ADD VALUE 'FISCAL';

-- CreateTable
CREATE TABLE "FiscalReceipt" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "refundId" TEXT,
    "kind" "FiscalReceiptKind" NOT NULL,
    "status" "FiscalReceiptStatus" NOT NULL DEFAULT 'PENDING',
    "provider" TEXT NOT NULL,
    "externalId" TEXT,
    "fiscalSign" TEXT,
    "receiptUrl" TEXT,
    "qrUrl" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "issuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FiscalReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FiscalReceipt_refundId_key" ON "FiscalReceipt"("refundId");

-- CreateIndex
CREATE INDEX "FiscalReceipt_paymentId_idx" ON "FiscalReceipt"("paymentId");

-- CreateIndex
CREATE INDEX "FiscalReceipt_organizationId_status_idx" ON "FiscalReceipt"("organizationId", "status");

-- AddForeignKey
ALTER TABLE "FiscalReceipt" ADD CONSTRAINT "FiscalReceipt_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalReceipt" ADD CONSTRAINT "FiscalReceipt_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FiscalReceipt" ADD CONSTRAINT "FiscalReceipt_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "Refund"("id") ON DELETE CASCADE ON UPDATE CASCADE;

