-- Migration: per-student AI usage lookups (admin Top consumers + My usage)
-- Created: 2026-09-19
-- Description: ai_usage already carries user_id per generation, but only had
-- (created_at) and (route, created_at) indexes. Per-user aggregates
-- (WHERE user_id = $1 AND created_at >= ...) over the 90-day window need
-- this composite index or they degrade to a full-table scan as the table
-- grows one row per AI call.
--
-- Safe to re-run (IF NOT EXISTS).

CREATE INDEX IF NOT EXISTS idx_ai_usage_user_created
  ON ai_usage (user_id, created_at DESC);
