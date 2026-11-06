-- Self-check exercises on topics and homework (A-158, online-lessons item C2).
CREATE TABLE "Exercise" (
    "id" TEXT NOT NULL,
    "topicId" TEXT,
    "homeworkId" TEXT,
    "title" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exercise_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Exercise_topicId_idx" ON "Exercise"("topicId");
CREATE INDEX "Exercise_homeworkId_idx" ON "Exercise"("homeworkId");

ALTER TABLE "Exercise" ADD CONSTRAINT "Exercise_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "CourseTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Exercise" ADD CONSTRAINT "Exercise_homeworkId_fkey" FOREIGN KEY ("homeworkId") REFERENCES "Homework"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Exercise" ADD CONSTRAINT "Exercise_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ExerciseAttempt" (
    "id" TEXT NOT NULL,
    "exerciseId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "score" INTEGER NOT NULL,
    "maxScore" INTEGER NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExerciseAttempt_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ExerciseAttempt_exerciseId_membershipId_idx" ON "ExerciseAttempt"("exerciseId", "membershipId");
CREATE INDEX "ExerciseAttempt_membershipId_submittedAt_idx" ON "ExerciseAttempt"("membershipId", "submittedAt");

ALTER TABLE "ExerciseAttempt" ADD CONSTRAINT "ExerciseAttempt_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExerciseAttempt" ADD CONSTRAINT "ExerciseAttempt_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "GroupMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
