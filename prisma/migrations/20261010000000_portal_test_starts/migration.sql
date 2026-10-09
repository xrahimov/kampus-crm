-- CreateTable
CREATE TABLE "PortalTestStart" (
    "id" TEXT NOT NULL,
    "testId" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalTestStart_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PortalTestStart_testId_membershipId_key" ON "PortalTestStart"("testId", "membershipId");

-- AddForeignKey
ALTER TABLE "PortalTestStart" ADD CONSTRAINT "PortalTestStart_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Test"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortalTestStart" ADD CONSTRAINT "PortalTestStart_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "GroupMembership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

