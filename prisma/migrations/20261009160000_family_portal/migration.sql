-- Parents' page link per family (A-130)
ALTER TABLE "Family" ADD COLUMN "portalToken" TEXT;
CREATE UNIQUE INDEX "Family_portalToken_key" ON "Family"("portalToken");
