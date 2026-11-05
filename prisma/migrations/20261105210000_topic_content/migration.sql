-- Lesson content per syllabus topic and per-group release (A-157, online-lessons item C1).
CREATE TYPE "TopicBlockKind" AS ENUM ('TEXT', 'VIDEO', 'FILE', 'LINK');

CREATE TABLE "CourseTopicBlock" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "kind" "TopicBlockKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "url" TEXT,
    "size" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseTopicBlock_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CourseTopicBlock_topicId_sortOrder_idx" ON "CourseTopicBlock"("topicId", "sortOrder");

ALTER TABLE "CourseTopicBlock" ADD CONSTRAINT "CourseTopicBlock_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "CourseTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "GroupTopicRelease" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "openFrom" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GroupTopicRelease_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GroupTopicRelease_groupId_topicId_key" ON "GroupTopicRelease"("groupId", "topicId");

ALTER TABLE "GroupTopicRelease" ADD CONSTRAINT "GroupTopicRelease_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupTopicRelease" ADD CONSTRAINT "GroupTopicRelease_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "CourseTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
