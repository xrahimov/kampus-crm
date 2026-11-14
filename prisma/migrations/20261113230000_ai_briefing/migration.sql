-- The conclusion the AI wrote under a person's summary (A-190), kept per person,
-- view, branch choice, period and language so the model is asked once.
CREATE TABLE "AiBriefing" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "view" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "factsHash" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "lines" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiBriefing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AiBriefing_userId_view_scope_period_locale_key" ON "AiBriefing"("userId", "view", "scope", "period", "locale");

CREATE INDEX "AiBriefing_organizationId_idx" ON "AiBriefing"("organizationId");

ALTER TABLE "AiBriefing" ADD CONSTRAINT "AiBriefing_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AiBriefing" ADD CONSTRAINT "AiBriefing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
