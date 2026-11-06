-- Gradebook weights per course (A-162): JSON of category percents summing to 100; null = defaults.
ALTER TABLE "Course" ADD COLUMN "gradeWeights" JSONB;
