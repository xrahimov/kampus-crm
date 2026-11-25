-- A staff member may ask for their own account to be deleted (A-267): the
-- request is a date on the account and a notice to those who manage staff.
ALTER TYPE "NotificationKind" ADD VALUE 'ACCOUNT_DELETION';

ALTER TABLE "User" ADD COLUMN "deletionRequestedAt" TIMESTAMP(3);
