-- Migration: Prioritätsfahrzeug pro Mitgliedschaft
-- Jeder User kann in seinen persönlichen Einstellungen ein Fahrzeug der
-- aktuellen Organisation als "Priorität" markieren - wird dann bei "Nutzung
-- erfassen" immer vorausgewählt, statt wie bisher nur das zuletzt verwendete
-- Fahrzeug. NULL (Standard) = bisheriges Verhalten unveraendert.
-- ON DELETE SET NULL, da Fahrzeuge ohne Nutzungen hart geloescht werden
-- koennen (siehe VehiclesService.delete) - die Mitgliedschaft bleibt dabei
-- erhalten, nur die Prioritaet wird zurueckgesetzt.

ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS "priorityVehicleId" UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_organization_members_priority_vehicle') THEN
    ALTER TABLE public.organization_members
      ADD CONSTRAINT fk_organization_members_priority_vehicle
      FOREIGN KEY ("priorityVehicleId")
      REFERENCES public.vehicles(id)
      ON DELETE SET NULL;
  END IF;
END $$;
