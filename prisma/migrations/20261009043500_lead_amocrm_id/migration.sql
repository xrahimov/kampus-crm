-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "amoCrmLeadId" TEXT;

-- CreateIndex
CREATE INDEX "Lead_amoCrmLeadId_idx" ON "Lead"("amoCrmLeadId");
