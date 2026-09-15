-- Migration: guest view dedup for forum posts (mirrors video_views.viewer_hash)
-- Created: 2026-09-15 (integrity pass)
-- Description: GET /forum/posts/:id counted EVERY guest load (refresh-loop
-- view farming) because forum_views only tracked user_id. viewer_hash stores
-- a SHA-256 of IP + User-Agent — no identity, just dedup key. One counted
-- view per (viewer_hash, post_id), same contract as video views.
-- Safe to re-run (IF NOT EXISTS / conditional index).

ALTER TABLE forum_views ADD COLUMN IF NOT EXISTS viewer_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_forum_views_guest
  ON forum_views (viewer_hash, post_id) WHERE viewer_hash IS NOT NULL;
