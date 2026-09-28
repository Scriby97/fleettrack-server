-- Migration: Endstand darf 0 sein (bisher > 0, jetzt >= 0 wie beim Startstand)
-- Noetig fuer die Referenz-Nutzung, die beim Erfassen eines Fahrzeugs angelegt
-- wird (siehe VehiclesService.create()): ein brandneues Fahrzeug mit 0
-- Betriebsstunden/Kilometern legt Start=Ende=0 an, was bisher an
-- check_end_operating_hours_positive gescheitert waere. Die
-- Anwendungsvalidierung (CreateUsageDto.endOperatingHours: @Min(0)) erlaubte
-- 0 ohnehin schon immer - die DB-Constraint war strenger als die App.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_end_operating_hours_positive') THEN
    ALTER TABLE public.usages
      DROP CONSTRAINT check_end_operating_hours_positive;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'check_end_operating_hours_non_negative') THEN
    ALTER TABLE public.usages
      ADD CONSTRAINT check_end_operating_hours_non_negative
      CHECK ("endOperatingHours" >= 0);
  END IF;
END $$;
