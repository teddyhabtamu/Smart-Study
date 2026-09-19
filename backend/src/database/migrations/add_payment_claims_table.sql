-- Migration: Pro payment claims (identity-linked receipt queue)
-- Created: 2026-09-19
-- Description: Paying currently means Telebirr outside the app + a Telegram
-- DM, with the in-app "waiting" state kept in local component state only.
-- Nobody server-side knows who paid: the admin must match a Telegram
-- receipt to an account by a typed email, and the student who closes the
-- modal loses all trace of waiting. A claim row links the payer identity
-- at click time (plus an optional Telebirr transaction ref), gives the
-- student a persistent pending state, and gives admins a work queue.
-- Approval still happens through PUT /admin/users/:id/premium, which now
-- auto-approves the user's pending claims.
--
-- Safe to re-run (IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS payment_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  transaction_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  decided_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_payment_claims_user ON payment_claims (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_claims_status ON payment_claims (status, created_at DESC);
