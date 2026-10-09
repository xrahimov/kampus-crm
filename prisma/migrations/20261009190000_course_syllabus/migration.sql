-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "courseTopicId" TEXT;

-- CreateTable
CREATE TABLE "CourseTopic" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseTopic_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CourseTopic_courseId_sortOrder_idx" ON "CourseTopic"("courseId", "sortOrder");

-- CreateIndex
CREATE INDEX "Lesson_courseTopicId_idx" ON "Lesson"("courseTopicId");

-- AddForeignKey
ALTER TABLE "CourseTopic" ADD CONSTRAINT "CourseTopic_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_courseTopicId_fkey" FOREIGN KEY ("courseTopicId") REFERENCES "CourseTopic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

