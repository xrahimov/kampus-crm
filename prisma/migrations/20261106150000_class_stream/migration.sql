-- CreateTable
CREATE TABLE "StreamPost" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "attachmentUrl" TEXT,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StreamPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StreamComment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT,
    "membershipId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StreamComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StreamPost_groupId_pinned_createdAt_idx" ON "StreamPost"("groupId", "pinned", "createdAt");

-- CreateIndex
CREATE INDEX "StreamComment_postId_createdAt_idx" ON "StreamComment"("postId", "createdAt");

-- AddForeignKey
ALTER TABLE "StreamPost" ADD CONSTRAINT "StreamPost_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreamPost" ADD CONSTRAINT "StreamPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreamComment" ADD CONSTRAINT "StreamComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "StreamPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreamComment" ADD CONSTRAINT "StreamComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StreamComment" ADD CONSTRAINT "StreamComment_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "GroupMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;
