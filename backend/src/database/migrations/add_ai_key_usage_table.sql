-- Migration: durable per-key AI usage (admin AI-keys tab)
-- Created: 2026-09-19
-- Description: Every Gemini key attempt (served / quota / invalid / other)
-- logs one row here so the AI-keys tab survives restarts and serverless
-- cold starts. Previously counters lived in module memory only
-- (services/aiTutor.ts keyStats) and reset to zero on every deploy or
-- cold instance — the tab always showed zeros after a reload.
--
-- ai_usage stays as the per-REQUEST log (route, ok, latency). This table is
-- the per-KEY-ATTEMPT log: one user request can touch several keys
-- (key #1 quota -> key #2 serves), which a single ai_usage row cannot
-- represent. GET /api/admin/ai-keys aggregates this table and merges it
-- with the live in-memory ring state (next / cooling / retired).
--
-- Safe to re-run (IF NOT EXISTS).

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
