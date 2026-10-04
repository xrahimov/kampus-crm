-- CreateEnum
CREATE TYPE "LeaveReasonKind" AS ENUM ('LEAVE', 'TRANSFER');

-- AlterTable
ALTER TABLE "GroupMembership" ADD COLUMN     "leftById" TEXT;

-- CreateTable
CREATE TABLE "LeaveReason" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "LeaveReasonKind" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveReason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GraduateRecord" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "ieltsScore" DECIMAL(3,1),
    "cefrLevel" TEXT,
    "university" BOOLEAN,
    "employed" BOOLEAN,
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GraduateRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeaveReason_organizationId_kind_name_key" ON "LeaveReason"("organizationId", "kind", "name");

-- CreateIndex
CREATE UNIQUE INDEX "GraduateRecord_membershipId_key" ON "GraduateRecord"("membershipId");

-- AddForeignKey
ALTER TABLE "GroupMembership" ADD CONSTRAINT "GroupMembership_leftById_fkey" FOREIGN KEY ("leftById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveReason" ADD CONSTRAINT "LeaveReason_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GraduateRecord" ADD CONSTRAINT "GraduateRecord_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "GroupMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
