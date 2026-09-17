-- Migration: Archivierung statt Loeschen bei Nichtzahlung
-- Wird eine Organisation wegen Nichtzahlung endgueltig gekuendigt und liegt
-- sie ueber dem Gratis-Limit, werden Mitglieder (ausser dem Owner) und
-- Fahrzeuge nun archiviert statt geloescht/getrennt - zahlt dieselbe
-- Organisation spaeter wieder, kommt automatisch alles zurueck (siehe
-- OrganizationSubscriptionsService.downgradeToFree/activatePaidTier).
-- NULL = aktiv, gesetzt = archiviert seit diesem Zeitpunkt.

ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP;

COMMENT ON COLUMN public.organization_members."archivedAt" IS
  'Gesetzt, wenn die Mitgliedschaft wegen Nichtzahlung der Organisation archiviert wurde (NULL = aktiv). Wird bei erneuter Zahlung automatisch wieder auf NULL gesetzt.';

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP;

COMMENT ON COLUMN public.vehicles."archivedAt" IS
  'Gesetzt, wenn das Fahrzeug wegen Nichtzahlung der Organisation archiviert wurde (NULL = aktiv). Unabhaengig von "isRetired" (manuelles Ausmustern). Wird bei erneuter Zahlung automatisch wieder auf NULL gesetzt.';
