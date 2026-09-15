-- Migration: account deletion verification codes (OAuth re-auth)
-- Short-lived 6-digit codes proving inbox control before an irreversible
-- account delete. Hashes only (6 digits = 1M space, never store raw),
-- attempt-capped, single-use, auto-cleaned with the user (CASCADE).
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS account_deletion_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  used_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deletion_codes_user_live
  ON account_deletion_codes (user_id, expires_at)
  WHERE used_at IS NULL;
