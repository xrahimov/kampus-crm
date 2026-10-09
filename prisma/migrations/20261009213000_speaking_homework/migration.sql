-- AlterTable
ALTER TABLE "Homework" ADD COLUMN     "speaking" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "HomeworkSubmission" ADD COLUMN     "teacherAudioUrl" TEXT;

