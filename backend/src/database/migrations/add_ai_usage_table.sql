-- Migration: AI usage metering (shared-key visibility)
-- Created: 2026-09-16
-- Description: Every AI generation (chat, study plan, quiz) logs one row
-- here: route, user, success, error code, latency. Powers the admin AI-usage
-- widget and the quota-error alert. Logging is best-effort by contract
-- (services/aiUsage.ts never throws), so this table must never gate a
-- request — and it carries no PII beyond user_id.
--
-- Safe to re-run (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS ai_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID,
  route TEXT NOT NULL,
  ok BOOLEAN NOT NULL DEFAULT TRUE,
  error_code TEXT,
  latency_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_usage_route_created ON ai_usage (route, created_at DESC);
