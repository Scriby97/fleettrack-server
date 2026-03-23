-- Migration: add versioning and tombstone fields to usages
ALTER TABLE usages
  ADD COLUMN IF NOT EXISTS updatedAt bigint DEFAULT (EXTRACT(EPOCH FROM CURRENT_TIMESTAMP) * 1000)::bigint,
  ADD COLUMN IF NOT EXISTS version integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS deleted boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS deletedAt bigint;

-- Update existing rows' updatedAt to creationDate if present
-- Note: unquoted identifiers are folded to lower case by Postgres.
-- The table likely has a quoted "creationDate" column; the newly added column is lowercased to updatedat.
-- Set the lowercase column from the quoted mixed‑case column.
UPDATE usages SET updatedat = "creationDate" WHERE updatedat IS NULL;
