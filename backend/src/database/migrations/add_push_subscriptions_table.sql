-- Migration: Web Push subscriptions (genuine push notifications)
-- Created: 2026-09-17
-- Description: One row per subscribed device. endpoint is globally unique
-- (a browser endpoint belongs to whoever holds it — re-subscribing on a
-- shared device reassigns it) and users cascade on account deletion.
--
-- Safe to re-run (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions (user_id);
