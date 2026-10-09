-- AlterTable
ALTER TABLE "DayOff" ADD COLUMN     "notifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "GroupDayOff" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "movedToLessonId" TEXT,
ADD COLUMN     "notifiedAt" TIMESTAMP(3),
ADD COLUMN     "startTime" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "GroupDayOff_movedToLessonId_key" ON "GroupDayOff"("movedToLessonId");

-- AddForeignKey
ALTER TABLE "GroupDayOff" ADD CONSTRAINT "GroupDayOff_movedToLessonId_fkey" FOREIGN KEY ("movedToLessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

