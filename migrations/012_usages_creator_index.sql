-- Migration: Index auf usages(creatorId, usageDate)
-- Jede Anfrage eines normalen Mitarbeiters (nicht Admin/Owner) filtert die
-- Nutzungsliste zusaetzlich nach creatorId (siehe UsagesService.findAll/
-- findAllWithVehicles) - dafuer gab es bisher keinen Index, nur den
-- bestehenden auf (vehicleId, usageDate) aus Migration 008. Faellt bei der
-- aktuellen Datenmenge noch nicht auf, wird aber mit wachsender
-- Nutzungshistorie zum sequenziellen Scan.

CREATE INDEX IF NOT EXISTS idx_usages_creator_usage_date
  ON public.usages ("creatorId", "usageDate");
