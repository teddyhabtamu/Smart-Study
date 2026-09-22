-- Migration: community post pre-moderation with earned trust
-- Created: 2026-09-22
-- Description: forum_posts gains a moderation status. New posts from
-- untrusted authors (no previously approved post) land in 'pending' for
-- admin/mod review; trusted authors and staff go live instantly. Authors
-- always see their own non-approved posts (with the rejection reason);
-- everyone else only sees 'approved'. All existing posts are history the
-- community already lived with — backfilled as approved, never re-queued.
--
-- Safe to re-run (IF NOT EXISTS / guarded backfill).

ALTER TABLE forum_posts ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
  CHECK (status IN ('pending', 'approved', 'rejected'));
ALTER TABLE forum_posts ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE forum_posts ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE forum_posts ADD COLUMN IF NOT EXISTS decision_reason TEXT;

-- History stays live: only posts created from here on earn a review.
-- Guarded so re-runs never touch a live moderation queue: it fires only
-- when NO post has ever been reviewed or left pending deliberately — i.e.
-- the column just landed on a legacy table (or an empty one, a no-op).
-- Pre-migration posts written by the legacy fallback were live under the
-- old behavior, so approving them preserves exactly that.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM forum_posts WHERE reviewed_at IS NOT NULL OR status <> 'pending'
  ) THEN
    UPDATE forum_posts SET status = 'approved' WHERE status = 'pending';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_forum_posts_status_created
  ON forum_posts (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_forum_posts_author_status
  ON forum_posts (author_id, status);
