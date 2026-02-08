-- Migration 014: Add creationDate (epoch ms) to usages table

ALTER TABLE public.usages
ADD COLUMN IF NOT EXISTS "creationDate" BIGINT
  DEFAULT (EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) * 1000)::bigint;

CREATE INDEX IF NOT EXISTS idx_usages_creation_date ON usages("creationDate");
