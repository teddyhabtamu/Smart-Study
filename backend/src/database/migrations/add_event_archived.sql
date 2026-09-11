-- Migration: archive flag for study events
-- Created: 2026-09-12
-- Description: The planner's archive/unarchive flow (PUT /planner/events/:id
-- with is_archived, GET filtering, dashboard exclusion) already runs against
-- this column in production, but it was never tracked here or in schema.sql
-- (added out-of-band). A fresh database built from the tracked files would
-- 500 on every archive write. This backfills the tracking.
--
-- Safe to re-run (IF NOT EXISTS).

ALTER TABLE study_events ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;
