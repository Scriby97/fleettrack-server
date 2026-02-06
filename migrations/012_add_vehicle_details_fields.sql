-- Migration 012: Add additional vehicle details fields
-- Adds location, vehicleType, fuelType, and notes columns to vehicles table

ALTER TABLE public.vehicles
ADD COLUMN IF NOT EXISTS "location" TEXT,
ADD COLUMN IF NOT EXISTS "vehicleType" TEXT,
ADD COLUMN IF NOT EXISTS "fuelType" TEXT,
ADD COLUMN IF NOT EXISTS "notes" TEXT;

-- Optional comments to document the columns
COMMENT ON COLUMN public.vehicles."location" IS 'Ort des Fahrzeugs';
COMMENT ON COLUMN public.vehicles."vehicleType" IS 'Typ des Fahrzeugs';
COMMENT ON COLUMN public.vehicles."fuelType" IS 'Treibstoff des Fahrzeugs';
COMMENT ON COLUMN public.vehicles."notes" IS 'Bemerkung zum Fahrzeug';
