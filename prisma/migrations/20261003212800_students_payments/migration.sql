-- CreateEnum
CREATE TYPE "ReceiptLogoPosition" AS ENUM ('TOP', 'BOTTOM');

-- AlterTable
ALTER TABLE "GroupMembership" ADD COLUMN     "activatedAt" DATE,
ADD COLUMN     "frozenAt" DATE,
ADD COLUMN     "leaveReason" TEXT;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "isBlacklisted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "passwordHash" TEXT,
ADD COLUMN     "schoolId" TEXT,
ADD COLUMN     "sourceId" TEXT;

-- CreateTable
CREATE TABLE "LeadSource" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeadSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Parent" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Parent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentCustomField" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudentCustomField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudentComment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "groupId" TEXT,
    "text" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StudentComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Discount" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "discountedPrice" DECIMAL(15,2) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "months" INTEGER NOT NULL,
    "givenAt" DATE NOT NULL,
    "comment" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Discount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Charge" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "month" DATE NOT NULL,
    "price" DECIMAL(15,2) NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "lessonsTotal" INTEGER NOT NULL,
    "lessonsCounted" INTEGER NOT NULL,
    "discountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Charge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "paymentMethodId" TEXT,
    "amount" DECIMAL(15,2) NOT NULL,
    "bonus" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "effectiveMonth" DATE NOT NULL,
    "paidAt" DATE NOT NULL,
    "comment" TEXT,
    "receivedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "reason" TEXT,
    "refundedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptSettings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "visibleFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "logoPosition" "ReceiptLogoPosition" NOT NULL DEFAULT 'TOP',
    "footerText" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReceiptSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeadSource_organizationId_name_key" ON "LeadSource"("organizationId", "name");

-- CreateIndex
CREATE INDEX "Parent_studentId_idx" ON "Parent"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "StudentCustomField_studentId_name_key" ON "StudentCustomField"("studentId", "name");

-- CreateIndex
CREATE INDEX "StudentComment_studentId_createdAt_idx" ON "StudentComment"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "StudentComment_groupId_createdAt_idx" ON "StudentComment"("groupId", "createdAt");

-- CreateIndex
CREATE INDEX "Discount_membershipId_idx" ON "Discount"("membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "Charge_membershipId_month_key" ON "Charge"("membershipId", "month");

-- CreateIndex
CREATE INDEX "Payment_studentId_paidAt_idx" ON "Payment"("studentId", "paidAt");

-- CreateIndex
CREATE INDEX "Payment_membershipId_idx" ON "Payment"("membershipId");

-- CreateIndex
CREATE INDEX "Payment_branchId_paidAt_idx" ON "Payment"("branchId", "paidAt");

-- CreateIndex
CREATE INDEX "Payment_effectiveMonth_idx" ON "Payment"("effectiveMonth");

-- CreateIndex
CREATE INDEX "Refund_paymentId_idx" ON "Refund"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "ReceiptSettings_organizationId_key" ON "ReceiptSettings"("organizationId");

-- CreateIndex
CREATE INDEX "Student_schoolId_idx" ON "Student"("schoolId");

-- CreateIndex
CREATE INDEX "Student_sourceId_idx" ON "Student"("sourceId");

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Student" ADD CONSTRAINT "Student_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "LeadSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadSource" ADD CONSTRAINT "LeadSource_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Parent" ADD CONSTRAINT "Parent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentCustomField" ADD CONSTRAINT "StudentCustomField_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentComment" ADD CONSTRAINT "StudentComment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentComment" ADD CONSTRAINT "StudentComment_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentComment" ADD CONSTRAINT "StudentComment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Discount" ADD CONSTRAINT "Discount_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "GroupMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Discount" ADD CONSTRAINT "Discount_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "GroupMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "Discount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "GroupMembership"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_paymentMethodId_fkey" FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_refundedById_fkey" FOREIGN KEY ("refundedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptSettings" ADD CONSTRAINT "ReceiptSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
