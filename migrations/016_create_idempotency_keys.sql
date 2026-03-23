-- Migration: create idempotency_keys table
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key varchar(255) PRIMARY KEY,
  resourceId uuid NOT NULL,
  userId uuid NOT NULL,
  createdAt bigint NOT NULL,
  expiresAt bigint,
  method varchar(16) NOT NULL,
  route varchar(255) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_idempotency_expires_at ON idempotency_keys (expiresAt);
