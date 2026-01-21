-- Migration 010: Add isRetired field to vehicles table
-- Allows marking vehicles as retired/decommissioned instead of deleting them
-- when they have associated usages

-- Add isRetired column with default value false
ALTER TABLE public.vehicles 
ADD COLUMN IF NOT EXISTS "isRetired" BOOLEAN NOT NULL DEFAULT false;

-- Create index for better query performance when filtering retired vehicles
CREATE INDEX IF NOT EXISTS idx_vehicles_isretired ON public.vehicles("isRetired");

-- Optional: Add comment to document the column
COMMENT ON COLUMN public.vehicles."isRetired" IS 'Indicates if the vehicle has been decommissioned/retired. Vehicles with usages cannot be deleted and are marked as retired instead.';
