-- Migration: separate YouTube platform stats from in-app counters
-- Created: 2026-09-17
-- Description: The gated importer wrote YouTube's global view/like counts
-- into videos.views/likes, whose contract is IN-APP counts (maintained by
-- recounting video_views/video_likes). First watch/like visibly destroyed
-- the stats (11M -> 1). Platform stats get their own nullable columns;
-- NULL = unknown (old rows, or stats lost to a recount before repair).
--
-- Safe to re-run (IF NOT EXISTS). Must apply BEFORE code that inserts
-- these columns deploys (see RUNBOOK migration ordering).

ALTER TABLE videos ADD COLUMN IF NOT EXISTS youtube_views INTEGER;
ALTER TABLE videos ADD COLUMN IF NOT EXISTS youtube_likes INTEGER;
