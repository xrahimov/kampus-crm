-- Teachers may change the lesson days and times of the groups they teach (A-193).
-- Off for every centre until its director switches it on.
ALTER TABLE "OrgSettings" ADD COLUMN "teacherCanChangeSchedule" BOOLEAN NOT NULL DEFAULT false;
