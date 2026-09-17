-- Migration: Owner-Self-Delete fuer Organisationen
-- Ein Owner kann seine Organisation ueber die Einstellungen selbst zur
-- Loeschung freigeben (Soft-Delete: Mitglieder inkl. Owner und Fahrzeuge
-- werden archiviert, die Organisation selbst bleibt bestehen und ist fuer
-- globale Administratoren weiterhin sichtbar). Ein Administrator kann die
-- Organisation danach ueber den Hard-Delete-Endpoint endgueltig loeschen.
-- NULL = aktiv, gesetzt = vom Owner zur Loeschung freigegeben seit diesem
-- Zeitpunkt.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS "deletionRequestedAt" TIMESTAMP;

COMMENT ON COLUMN public.organizations."deletionRequestedAt" IS
  'Gesetzt, wenn der Owner die Organisation selbst zur Loeschung freigegeben hat (Soft-Delete, NULL = aktiv). Ein globaler Administrator kann die Organisation danach ueber den Hard-Delete-Endpoint endgueltig loeschen.';
