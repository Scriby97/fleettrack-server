-- Migration: Update operating hours to decimal with one decimal place
-- Date: 2026-02-01
-- Description: Changes startOperatingHours and endOperatingHours from integer to decimal(10,1)
--              to support numbers with one decimal place precision
--              startOperatingHours can be 0 for new vehicles

-- Step 1: Alter startOperatingHours column to decimal(10,1)
ALTER TABLE usages 
ALTER COLUMN "startOperatingHours" TYPE DECIMAL(10,1);

-- Step 2: Alter endOperatingHours column to decimal(10,1)
ALTER TABLE usages 
ALTER COLUMN "endOperatingHours" TYPE DECIMAL(10,1);

-- Step 3: Add check constraints to ensure values are non-negative for start, positive for end
ALTER TABLE usages 
ADD CONSTRAINT check_start_operating_hours_non_negative 
CHECK ("startOperatingHours" >= 0);

ALTER TABLE usages 
ADD CONSTRAINT check_end_operating_hours_positive 
CHECK ("endOperatingHours" > 0);

-- Step 4: Add check constraint to ensure end hours are greater than or equal to start hours
ALTER TABLE usages 
ADD CONSTRAINT check_end_hours_gte_start_hours 
CHECK ("endOperatingHours" >= "startOperatingHours");

-- Optional: Update existing data to ensure it complies with new constraints
-- Convert negative start values to 0 (for new vehicles)
UPDATE usages 
SET "startOperatingHours" = 0 
WHERE "startOperatingHours" < 0;

-- If there are any zero or negative end values, update them to 0.1 as a default
UPDATE usages 
SET "endOperatingHours" = 0.1 
WHERE "endOperatingHours" <= 0;

-- Ensure end hours are always >= start hours
UPDATE usages 
SET "endOperatingHours" = "startOperatingHours" + 0.1
WHERE "endOperatingHours" < "startOperatingHours";
