-- Migration: track when premium membership started
-- Created: 2026-09-09
-- Description: users.is_premium tells IF someone is Pro, but nothing records
-- SINCE WHEN. The Pro Member Hub shows "Member since <date>", which needs a
-- real timestamp. NULL = never activated (or activated before tracking).
--
-- Safe to re-run (IF NOT EXISTS).

ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_since TIMESTAMPTZ;
