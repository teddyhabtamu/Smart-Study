-- Migration: video quality signals (YouTube import gate)
-- Created: 2026-09-17
-- Description: The importer scored nothing, so keyword-stuffed trivia and
-- exam dumps landed in the student library. The scorer needs per-video
-- duration + channel for gating/ranking; views/likes columns already exist
-- but were never populated. All nullable: old rows simply score without
-- them until re-synced.
--
-- Safe to re-run (IF NOT EXISTS).

ALTER TABLE videos ADD COLUMN IF NOT EXISTS channel_id TEXT;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS duration_secs INTEGER;
CREATE INDEX IF NOT EXISTS idx_videos_channel ON videos (channel_id);
