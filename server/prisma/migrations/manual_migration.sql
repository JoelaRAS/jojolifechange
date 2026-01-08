-- Migration: Add exercises, improved ingredients, and user-owned templates
-- This migration is safe for existing data

-- 1. Add new columns to Ingredient table
ALTER TABLE "Ingredient" 
  ADD COLUMN IF NOT EXISTS "userId" TEXT,
  ADD COLUMN IF NOT EXISTS "barcode" TEXT,
  ADD COLUMN IF NOT EXISTS "imageUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS "isGlobal" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Drop the old unique constraint on name if it exists
ALTER TABLE "Ingredient" DROP CONSTRAINT IF EXISTS "Ingredient_name_key";

-- Add index on name for faster search
CREATE INDEX IF NOT EXISTS "Ingredient_name_idx" ON "Ingredient"("name");

-- Add foreign key for userId
ALTER TABLE "Ingredient" 
  ADD CONSTRAINT "Ingredient_userId_fkey" 
  FOREIGN KEY ("userId") REFERENCES "User"("id") 
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Create Exercise table
CREATE TABLE IF NOT EXISTS "Exercise" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "muscleGroup" TEXT,
    "equipment" TEXT,
    "description" TEXT,
    "isGlobal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Exercise_pkey" PRIMARY KEY ("id")
);

-- Add foreign key for Exercise.userId
ALTER TABLE "Exercise" 
  ADD CONSTRAINT "Exercise_userId_fkey" 
  FOREIGN KEY ("userId") REFERENCES "User"("id") 
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Add indexes
CREATE INDEX IF NOT EXISTS "Exercise_name_idx" ON "Exercise"("name");
CREATE INDEX IF NOT EXISTS "Exercise_muscleGroup_idx" ON "Exercise"("muscleGroup");

-- 3. Add new columns to WorkoutTemplate
ALTER TABLE "WorkoutTemplate"
  ADD COLUMN IF NOT EXISTS "userId" TEXT,
  ADD COLUMN IF NOT EXISTS "isGlobal" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Drop old unique constraint
ALTER TABLE "WorkoutTemplate" DROP CONSTRAINT IF EXISTS "WorkoutTemplate_name_key";

-- Add foreign key for WorkoutTemplate.userId
ALTER TABLE "WorkoutTemplate" 
  ADD CONSTRAINT "WorkoutTemplate_userId_fkey" 
  FOREIGN KEY ("userId") REFERENCES "User"("id") 
  ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Add exerciseId to WorkoutExerciseTemplate
ALTER TABLE "WorkoutExerciseTemplate"
  ADD COLUMN IF NOT EXISTS "exerciseId" TEXT;

-- Add foreign key for exerciseId
ALTER TABLE "WorkoutExerciseTemplate" 
  ADD CONSTRAINT "WorkoutExerciseTemplate_exerciseId_fkey" 
  FOREIGN KEY ("exerciseId") REFERENCES "Exercise"("id") 
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 5. Mark existing templates as global
UPDATE "WorkoutTemplate" SET "isGlobal" = true WHERE "userId" IS NULL;

-- 6. Mark existing ingredients as global (legacy)
UPDATE "Ingredient" SET "isGlobal" = true WHERE "userId" IS NULL;
