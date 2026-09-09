-- Migration: Organization Logo / Profilbild
-- Optionales Firmenlogo pro Organisation. Gespeichert wird nur die oeffentliche
-- URL des Bildes (Supabase Storage Bucket "organization-logos") - die Datei selbst
-- liegt nicht in der DB. NULL = kein Logo gewaehlt, das Frontend zeigt dann einen
-- generierten Initialen-Avatar.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS "logoUrl" TEXT;

COMMENT ON COLUMN public.organizations."logoUrl" IS
  'Oeffentliche URL des Organisations-Logos im Supabase Storage Bucket "organization-logos". NULL = kein Logo (Frontend zeigt Initialen-Avatar).';
