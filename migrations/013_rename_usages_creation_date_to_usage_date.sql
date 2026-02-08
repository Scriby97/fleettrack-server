-- Migration 013: Rename creationDate to usageDate in usages table

ALTER TABLE public.usages
RENAME COLUMN "creationDate" TO "usageDate";

ALTER INDEX IF EXISTS idx_usages_creation_date
RENAME TO idx_usages_usage_date;
