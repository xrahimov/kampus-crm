-- Public page per centre (A-121): additive columns on OrgSettings.
ALTER TABLE "OrgSettings"
  ADD COLUMN "publicPage" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "publicSlug" TEXT,
  ADD COLUMN "publicIntro" TEXT,
  ADD COLUMN "publicPhone" TEXT,
  ADD COLUMN "publicAddress" TEXT,
  ADD COLUMN "publicInstagram" TEXT,
  ADD COLUMN "publicTelegram" TEXT,
  ADD COLUMN "publicFormId" TEXT;

CREATE UNIQUE INDEX "OrgSettings_publicSlug_key" ON "OrgSettings"("publicSlug");

ALTER TABLE "OrgSettings" ADD CONSTRAINT "OrgSettings_publicFormId_fkey" FOREIGN KEY ("publicFormId") REFERENCES "LeadForm"("id") ON DELETE SET NULL ON UPDATE CASCADE;
