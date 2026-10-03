-- CreateEnum
CREATE TYPE "SalaryMethod" AS ENUM ('PERCENT', 'MONTHLY', 'PER_LESSON', 'PER_STUDENT');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "perLessonFee" DECIMAL(15,2),
ADD COLUMN     "perStudentFee" DECIMAL(15,2),
ADD COLUMN     "salaryMethod" "SalaryMethod";
