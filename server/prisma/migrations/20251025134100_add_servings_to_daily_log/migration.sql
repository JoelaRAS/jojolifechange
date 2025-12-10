-- Add servings column to DailyLog to track portion counts per entry
ALTER TABLE "DailyLog"
ADD COLUMN "servings" DOUBLE PRECISION NOT NULL DEFAULT 1;
