-- CreateEnum
CREATE TYPE "RoundingType" AS ENUM ('STANDARD', 'IELTS');

-- CreateTable
CREATE TABLE "OrgSettings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "spreadOverpayment" BOOLEAN NOT NULL DEFAULT false,
    "adminActionsNeedApproval" BOOLEAN NOT NULL DEFAULT false,
    "printReceiptAfterPayment" BOOLEAN NOT NULL DEFAULT false,
    "refundsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "attendanceComments" BOOLEAN NOT NULL DEFAULT false,
    "teachersSeeExamSchedule" BOOLEAN NOT NULL DEFAULT false,
    "attendanceOnlyDuringLesson" BOOLEAN NOT NULL DEFAULT false,
    "teacherSeesSalary" BOOLEAN NOT NULL DEFAULT false,
    "payTeacherOnGroupDayOff" BOOLEAN NOT NULL DEFAULT false,
    "payOnlyAttendedLessons" BOOLEAN NOT NULL DEFAULT false,
    "teacherCanAddStudents" BOOLEAN NOT NULL DEFAULT false,
    "bookAnySupportTeacher" BOOLEAN NOT NULL DEFAULT false,
    "groupSupportSessions" BOOLEAN NOT NULL DEFAULT false,
    "workStart" TEXT NOT NULL DEFAULT '08:00',
    "workEnd" TEXT NOT NULL DEFAULT '20:00',
    "scheduleStepMinutes" INTEGER NOT NULL DEFAULT 30,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentMethod" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradingSystem" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rounding" "RoundingType" NOT NULL DEFAULT 'STANDARD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GradingSystem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GradingLevel" (
    "id" TEXT NOT NULL,
    "gradingSystemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minScore" DECIMAL(6,2) NOT NULL,
    "maxScore" DECIMAL(6,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "GradingLevel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DECIMAL(15,2) NOT NULL,
    "durationMonths" INTEGER NOT NULL,
    "gradingSystemId" TEXT,
    "color" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DayOff" (
    "id" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DayOff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "School" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "School_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrgSettings_organizationId_key" ON "OrgSettings"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMethod_organizationId_name_key" ON "PaymentMethod"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "GradingSystem_organizationId_name_key" ON "GradingSystem"("organizationId", "name");

-- CreateIndex
CREATE INDEX "GradingLevel_gradingSystemId_sortOrder_idx" ON "GradingLevel"("gradingSystemId", "sortOrder");

-- CreateIndex
CREATE INDEX "Course_branchId_isArchived_idx" ON "Course"("branchId", "isArchived");

-- CreateIndex
CREATE INDEX "Course_gradingSystemId_idx" ON "Course"("gradingSystemId");

-- CreateIndex
CREATE UNIQUE INDEX "Room_branchId_name_key" ON "Room"("branchId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "DayOff_branchId_date_key" ON "DayOff"("branchId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "School_organizationId_name_key" ON "School"("organizationId", "name");

-- AddForeignKey
ALTER TABLE "OrgSettings" ADD CONSTRAINT "OrgSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentMethod" ADD CONSTRAINT "PaymentMethod_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradingSystem" ADD CONSTRAINT "GradingSystem_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GradingLevel" ADD CONSTRAINT "GradingLevel_gradingSystemId_fkey" FOREIGN KEY ("gradingSystemId") REFERENCES "GradingSystem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_gradingSystemId_fkey" FOREIGN KEY ("gradingSystemId") REFERENCES "GradingSystem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayOff" ADD CONSTRAINT "DayOff_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "School" ADD CONSTRAINT "School_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
