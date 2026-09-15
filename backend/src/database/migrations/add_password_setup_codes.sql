-- Migration: password-setup verification codes (OAuth set-password flow)
-- Mirrors account_deletion_codes: short-lived 6-digit codes proving inbox
-- control before an OAuth-only account sets its first password (without
-- this, a stolen session could set a password and take over the account).
-- Hashes only, attempt-capped, single-use. Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS password_setup_codes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  used_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_setup_codes_user_live
  ON password_setup_codes (user_id, expires_at)
  WHERE used_at IS NULL;
