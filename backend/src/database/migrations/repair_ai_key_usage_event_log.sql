-- Repair: ai_key_usage name collision (event log vs counter snapshot)
-- Created: 2026-09-19
-- Description: add_ai_key_usage_table.sql used CREATE TABLE IF NOT EXISTS,
-- but some databases already had an ai_key_usage table with a DIFFERENT
-- shape (counter snapshot: fingerprint, served, quota_hits, invalid_hits,
-- other_errors, last_ok_at, last_error_at, last_error_kind, updated_at —
-- no id, no created_at, no key_fingerprint/outcome/model). The CREATE
-- silently no-op'd, and every event-log query (which needs created_at,
-- key_fingerprint, outcome) failed with "column created_at does not exist".
--
-- This repair renames the legacy snapshot aside (data preserved, nothing
-- dropped) and creates the event-log table the code reads/writes.
--
-- Safe to re-run / safe on fresh databases: the rename only fires when the
-- table has the legacy shape, and the CREATE is IF NOT EXISTS.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_key_usage' AND column_name = 'fingerprint'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_key_usage' AND column_name = 'key_fingerprint'
  ) THEN
    ALTER TABLE ai_key_usage RENAME TO ai_key_usage_legacy;
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS ai_key_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  key_fingerprint TEXT NOT NULL,
  key_index INTEGER,
  outcome TEXT NOT NULL CHECK (outcome IN ('served', 'quota', 'invalid', 'other')),
  model TEXT,
  latency_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_ai_key_usage_fp_created
  ON ai_key_usage (key_fingerprint, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_key_usage_created
  ON ai_key_usage (created_at DESC);
