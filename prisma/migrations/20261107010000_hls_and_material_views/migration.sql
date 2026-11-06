-- Streaming copies of recordings and where each student stopped watching (A-175).
ALTER TABLE "LessonMaterial" ADD COLUMN "hlsKey" TEXT,
  ADD COLUMN "hlsKeys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "MaterialView" (
  "materialId" TEXT NOT NULL,
  "membershipId" TEXT NOT NULL,
  "positionSec" INTEGER NOT NULL DEFAULT 0,
  "durationSec" INTEGER,
  "completed" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MaterialView_pkey" PRIMARY KEY ("materialId", "membershipId")
);

CREATE INDEX "MaterialView_membershipId_idx" ON "MaterialView"("membershipId");

ALTER TABLE "MaterialView" ADD CONSTRAINT "MaterialView_materialId_fkey"
  FOREIGN KEY ("materialId") REFERENCES "LessonMaterial"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaterialView" ADD CONSTRAINT "MaterialView_membershipId_fkey"
  FOREIGN KEY ("membershipId") REFERENCES "GroupMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
