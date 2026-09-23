-- Migration: fuelLitersRefilled von INTEGER auf NUMERIC(10,2)
-- Der Treibstoff einer Nutzung soll mit zwei Nachkommastellen erfasst werden
-- koennen (bisher nur ganze Liter moeglich) - analog zu startOperatingHours/
-- endOperatingHours, die bereits NUMERIC sind.

ALTER TABLE public.usages
  ALTER COLUMN "fuelLitersRefilled" TYPE NUMERIC(10,2)
  USING "fuelLitersRefilled"::numeric(10,2);
