-- Migration: grouped error log (built-in error tracking)
-- Created: 2026-09-19
-- Description: Every distinct failure (client crash, pool failure, 500)
-- aggregates into ONE row keyed by fingerprint, so 1,000 identical quota
-- errors read as one row with occurrences=1000 instead of 1,000 rows.
-- A repeat occurrence reopens a resolved fingerprint (resolved=false) —
-- silence must be earned by actually fixing the cause.
--
-- Safe to re-run (IF NOT EXISTS / ON CONFLICT call sites).

CREATE TABLE IF NOT EXISTS error_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL CHECK (source IN ('client', 'server')),
  route TEXT,
  message TEXT NOT NULL,
  occurrences INTEGER NOT NULL DEFAULT 1,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_error_log_last_seen ON error_log (last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_log_open ON error_log (resolved, last_seen_at DESC);
