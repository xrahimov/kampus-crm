-- Organisations become real tenants (A-108): every user and custom role belongs
-- to one organisation, and audit rows carry theirs. Existing rows are kept and
-- attached to the deployment's first organisation, which is the only one so far.

-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Role" ADD COLUMN     "organizationId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "organizationId" TEXT;

-- Backfill: everything so far belongs to the first (and only) organisation.
UPDATE "User" SET "organizationId" = (SELECT id FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1)
WHERE "organizationId" IS NULL;

UPDATE "Role" SET "organizationId" = (SELECT id FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1)
WHERE "isSystem" = false AND "organizationId" IS NULL;

UPDATE "AuditLog" SET "organizationId" = (SELECT id FROM "Organization" ORDER BY "createdAt" ASC LIMIT 1)
WHERE "organizationId" IS NULL;

ALTER TABLE "User" ALTER COLUMN "organizationId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "User_organizationId_idx" ON "User"("organizationId");

-- CreateIndex
CREATE INDEX "AuditLog_organizationId_createdAt_idx" ON "AuditLog"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "Role_organizationId_idx" ON "Role"("organizationId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
