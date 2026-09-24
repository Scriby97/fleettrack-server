-- Migration: letzter Bearbeiter und Zeitpunkt der letzten Aenderung einer Nutzung
-- Ergaenzt creatorId/creationDate (Erfassung) um die Nachvollziehbarkeit von
-- Korrekturen. Bestehende Nutzungen bleiben NULL (= nie geaendert).

ALTER TABLE public.usages
  ADD COLUMN IF NOT EXISTS "lastUpdaterId" UUID,
  ADD COLUMN IF NOT EXISTS "lastUpdateDate" BIGINT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_usages_last_updater') THEN
    ALTER TABLE public.usages
      ADD CONSTRAINT fk_usages_last_updater
      FOREIGN KEY ("lastUpdaterId")
      REFERENCES public.user_profiles(id)
      ON DELETE SET NULL;
  END IF;
END $$;
