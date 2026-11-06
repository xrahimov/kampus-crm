-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN "studentNote" TEXT;

-- CreateTable
CREATE TABLE "LessonRating" (
    "id" TEXT NOT NULL,
    "lessonId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LessonRating_lessonId_membershipId_key" ON "LessonRating"("lessonId", "membershipId");

-- CreateIndex
CREATE INDEX "LessonRating_lessonId_idx" ON "LessonRating"("lessonId");

-- AddForeignKey
ALTER TABLE "LessonRating" ADD CONSTRAINT "LessonRating_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonRating" ADD CONSTRAINT "LessonRating_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "GroupMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
