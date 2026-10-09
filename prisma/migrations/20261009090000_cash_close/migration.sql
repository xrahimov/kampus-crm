-- Cashier day close (A-122): which payment methods are cash, and the close rows.
ALTER TABLE "PaymentMethod" ADD COLUMN "isCash" BOOLEAN NOT NULL DEFAULT false;

-- Existing centres: a method named like cash is counted at the day close.
UPDATE "PaymentMethod" SET "isCash" = true WHERE lower("name") ~ '(naqd|cash|нал)';

CREATE TABLE "CashClose" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "cashierId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "totals" JSONB NOT NULL,
    "paymentsCount" INTEGER NOT NULL DEFAULT 0,
    "expectedCash" DECIMAL(15,2) NOT NULL,
    "countedCash" DECIMAL(15,2) NOT NULL,
    "difference" DECIMAL(15,2) NOT NULL,
    "note" TEXT,
    "acceptedById" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashClose_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CashClose_organizationId_date_idx" ON "CashClose"("organizationId", "date");

CREATE UNIQUE INDEX "CashClose_branchId_cashierId_date_key" ON "CashClose"("branchId", "cashierId", "date");

ALTER TABLE "CashClose" ADD CONSTRAINT "CashClose_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CashClose" ADD CONSTRAINT "CashClose_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CashClose" ADD CONSTRAINT "CashClose_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CashClose" ADD CONSTRAINT "CashClose_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
