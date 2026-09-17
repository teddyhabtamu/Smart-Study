-- Migration: repair counters clobbered by platform stats (one-shot repair)
-- Created: 2026-09-17
-- Description: Rows imported by the gated importer (the ONLY writer of
-- channel_id) carry YouTube's global counts in views/likes — or had them
-- destroyed by the first watch/like recount. Repair per row:
--   in-app truth  = exact COUNT(*) from video_views / video_likes
--   YouTube residue = whatever EXCEEDS the in-app count. Recounts can only
--     ever write the exact local count, so any excess is by construction
--     the imported platform stat (± rare fallback +1s — immaterial).
-- Rows whose stats were already destroyed keep correct in-app counts with
-- youtube_* NULL (unknown, honestly marked — not guessed).
-- Idempotent: re-running changes nothing once counters agree.

UPDATE videos v
SET
  youtube_views = CASE
    WHEN v.views > COALESCE((SELECT COUNT(*) FROM video_views vv WHERE vv.video_id = v.id), 0)
    THEN v.views
  END,
  youtube_likes = CASE
    WHEN v.likes > COALESCE((SELECT COUNT(*) FROM video_likes vl WHERE vl.video_id = v.id), 0)
    THEN v.likes
  END,
  views = COALESCE((SELECT COUNT(*) FROM video_views vv WHERE vv.video_id = v.id), 0),
  likes = COALESCE((SELECT COUNT(*) FROM video_likes vl WHERE vl.video_id = v.id), 0)
WHERE v.channel_id IS NOT NULL;
