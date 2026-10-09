-- Setup checklist on the home page (A-128)
ALTER TABLE "OrgSettings" ADD COLUMN "showSetupChecklist" BOOLEAN NOT NULL DEFAULT true;
