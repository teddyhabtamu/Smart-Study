-- Migration: daily AI-quiz window for the free practice limit
-- Created: 2026-09-11
-- Description: The free tier promises "1 free quiz per day", but the gate ran
-- on the lifetime practice_attempts counter (completions + manual sessions,
-- never reset, client-side only). These columns back a server-enforced daily
-- window on POST /ai-tutor/generate-practice-quiz: free users get 1 AI quiz
-- per UTC day. practice_attempts keeps its lifetime meaning (stats/milestones).
--
-- Safe to re-run (IF NOT EXISTS).

ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_quiz_count INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_quiz_date DATE;
