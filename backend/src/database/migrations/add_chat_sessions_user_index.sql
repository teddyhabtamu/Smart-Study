-- Migration: index chat_sessions by user (session list hot path)
-- Created: 2026-09-09 (performance pass)
-- Description: GET /ai-tutor/sessions filters by user_id on every load and
-- the table grows unbounded (one row per conversation). Without an index
-- this degrades into a sequential scan. Safe to re-run (IF NOT EXISTS).

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_updated
  ON chat_sessions (user_id, updated_at DESC);
