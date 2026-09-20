-- Migration: Index auf usages(vehicleId, usageDate)
-- Fehlte bisher komplett - die Fahrzeug-Statistik (ARRAY_AGG-Join),
-- Fahrzeug-Nutzungsverlauf und die Nutzungs-Listen-Endpoints filtern/sortieren
-- alle nach genau diesen beiden Spalten und mussten dafuer die gesamte
-- usages-Tabelle sequenziell scannen, statt einen Index nutzen zu koennen -
-- wird mit wachsender Nutzungshistorie zunehmend langsamer.

CREATE INDEX IF NOT EXISTS idx_usages_vehicle_usage_date
  ON public.usages ("vehicleId", "usageDate");
