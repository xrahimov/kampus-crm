-- Standalone assignments (A-161): a homework without a lesson, with a title and a rubric;
-- the review stores points per criterion and their sum.
ALTER TABLE "Homework" ALTER COLUMN "lessonId" DROP NOT NULL;
ALTER TABLE "Homework" ADD COLUMN "title" TEXT;
ALTER TABLE "Homework" ADD COLUMN "rubric" JSONB;
ALTER TABLE "HomeworkSubmission" ADD COLUMN "rubricScores" JSONB;
ALTER TABLE "HomeworkSubmission" ADD COLUMN "score" INTEGER;
