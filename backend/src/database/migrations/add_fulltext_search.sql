-- Migration: full-text search (tsvector + GIN) for documents, videos, forum
-- Created: 2026-09-09 (Tier 2 performance track)
-- Description: Replaces leading-wildcard ILIKE scans (full sequential scans,
-- no ranking) with weighted tsvector + ts_rank relevance ordering.
--
-- Generated STORED columns maintain themselves on every INSERT/UPDATE —
-- no application code needed. Weights: title (A) > description (B) >
-- subject/author/instructor (C).
-- Also adds btree title indexes for the /suggest prefix endpoint.
--
-- Safe to re-run (IF NOT EXISTS throughout).

-- Documents
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(subject, '') || ' ' || coalesce(author, '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_documents_search ON documents USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_documents_title ON documents (title);

-- Videos
ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(subject, '') || ' ' || coalesce(instructor, '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_videos_search ON videos USING GIN (search_vector);
CREATE INDEX IF NOT EXISTS idx_videos_title ON videos (title);

-- Forum posts
ALTER TABLE forum_posts
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(content, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(subject, '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_forum_posts_search ON forum_posts USING GIN (search_vector);

-- Backfill check (generated columns populate on ALTER for existing rows;
-- verify nothing is null)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM documents WHERE search_vector IS NULL LIMIT 1) THEN
    RAISE EXCEPTION 'documents.search_vector backfill incomplete';
  END IF;
  IF EXISTS (SELECT 1 FROM videos WHERE search_vector IS NULL LIMIT 1) THEN
    RAISE EXCEPTION 'videos.search_vector backfill incomplete';
  END IF;
  IF EXISTS (SELECT 1 FROM forum_posts WHERE search_vector IS NULL LIMIT 1) THEN
    RAISE EXCEPTION 'forum_posts.search_vector backfill incomplete';
  END IF;
END $$;
