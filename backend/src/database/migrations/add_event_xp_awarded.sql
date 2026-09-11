-- Migration: one XP payout per study event
-- Created: 2026-09-11
-- Description: Task-completion XP is guarded to false→true transitions, but
-- uncompleting and re-completing the same task pays again on every cycle.
-- This flag records that a task has paid out, so each event awards XP at
-- most once in its lifetime. Pre-existing completed rows are safe: the
-- backend only awards when the stored row is currently incomplete.
--
-- Safe to re-run (IF NOT EXISTS).

ALTER TABLE study_events ADD COLUMN IF NOT EXISTS xp_awarded BOOLEAN DEFAULT false;
