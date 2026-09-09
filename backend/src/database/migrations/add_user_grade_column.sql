-- Migration: add school grade to users
-- Created: 2026-09-09
-- Description: The AI tutor (and practice/planner features) previously guessed
-- the student's school grade from their gamification XP level, which measures
-- platform activity — not actual school grade. This adds a real, user-chosen
-- grade (Ethiopian secondary: 9-12). NULL = not set yet (app defaults to 10).
--
-- Safe to re-run (IF NOT EXISTS + DROP IF EXISTS).

ALTER TABLE users ADD COLUMN IF NOT EXISTS grade INTEGER;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_grade_check;
ALTER TABLE users ADD CONSTRAINT users_grade_check
  CHECK (grade IS NULL OR (grade >= 9 AND grade <= 12));
