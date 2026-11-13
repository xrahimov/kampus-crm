-- Which record of the centre's previous system became which Kampus record (A-189),
-- so a second copy updates it instead of adding it again.
CREATE TABLE "ImportRef" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportRef_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ImportRef_organizationId_source_kind_externalId_key" ON "ImportRef"("organizationId", "source", "kind", "externalId");

CREATE INDEX "ImportRef_organizationId_source_kind_entityId_idx" ON "ImportRef"("organizationId", "source", "kind", "entityId");

ALTER TABLE "ImportRef" ADD CONSTRAINT "ImportRef_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
