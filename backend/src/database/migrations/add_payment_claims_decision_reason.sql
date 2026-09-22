-- Migration: payment claim decision reason (rejection transparency)
-- Created: 2026-09-22
-- Description: When an admin rejects a Pro payment claim, they can attach a
-- short reason ("receipt unreadable", "amount mismatch"). The student sees
-- it on the Subscription page next to the Telegram contact, so a rejection
-- is a next step instead of a dead end. Optional — old rows stay NULL and
-- the UI falls back to the generic contact line.
--
-- Safe to re-run (IF NOT EXISTS).

ALTER TABLE payment_claims ADD COLUMN IF NOT EXISTS decision_reason TEXT;
