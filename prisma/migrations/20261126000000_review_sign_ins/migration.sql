-- Sign-ins for app store reviewers (A-272): the site owner marks one staff
-- member and one student whose password works without a Telegram code.
-- Additive only: two nullable columns, no row is changed.
ALTER TABLE "User" ADD COLUMN "reviewSignInAt" TIMESTAMP(3);
ALTER TABLE "StudentAccount" ADD COLUMN "reviewSignInAt" TIMESTAMP(3);
