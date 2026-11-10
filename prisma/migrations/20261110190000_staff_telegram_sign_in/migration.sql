-- Staff sign-in with Telegram (A-180): how a session was opened, and the
-- per-centre switch that refuses passwords.
CREATE TYPE "SignInMethod" AS ENUM ('PASSWORD', 'TELEGRAM');

ALTER TABLE "Session" ADD COLUMN "signedInWith" "SignInMethod" NOT NULL DEFAULT 'PASSWORD';
ALTER TABLE "LoginLog" ADD COLUMN "method" "SignInMethod" NOT NULL DEFAULT 'PASSWORD';
ALTER TABLE "OrgSettings" ADD COLUMN "staffTelegramOnly" BOOLEAN NOT NULL DEFAULT false;
