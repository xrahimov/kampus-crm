-- Telegram only for every centre on the server, set by the site owner (A-181).
ALTER TABLE "OrgSettings" ADD COLUMN "staffTelegramOnlyAll" BOOLEAN NOT NULL DEFAULT false;
