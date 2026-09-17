/**
 * One-off library audit: score every stored video with the SAME scorer the
 * importer uses, then report the distribution. READ-ONLY against our DB
 * (plus ~N/50 YouTube units for statistics batches) — never writes.
 *
 * Usage: npx tsx scripts/audit-video-quality.ts
 * Needs: DATABASE_URL (or PG_POOLER_URL) + YOUTUBE_API_KEY in backend/.env.
 */
import { pool } from '../src/database/config';
import {
  scoreCandidateVideo,
  parseDurationSecs,
  MIN_ACCEPT_SCORE,
} from '../src/services/youtubeService';

const YT = 'https://www.googleapis.com/youtube/v3';

async function main(): Promise<void> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.error('YOUTUBE_API_KEY is not configured — cannot fetch statistics.');
    process.exit(1);
  }

  const { rows } = await pool.query(
    'SELECT id, title, description, instructor, subject, grade, chapter, video_url FROM videos ORDER BY created_at DESC'
  );
  console.log(`Scoring ${rows.length} stored videos...\n`);

  // videoId from watch URL for the statistics batch.
  const withId = rows
    .map((r: any) => ({
      row: r,
      videoId: String(r.video_url || '').match(/[?&]v=([\w-]{6,})/)?.[1] ?? null,
    }))
    .filter((x) => x.videoId);
  console.log(`Resolvable to YouTube IDs: ${withId.length}/${rows.length}`);

  const statsById: Record<string, any> = {};
  for (let i = 0; i < withId.length; i += 50) {
    const batch = withId.slice(i, i + 50);
    const url =
      `${YT}/videos?part=snippet,statistics,contentDetails,status` +
      `&id=${batch.map((b) => b.videoId).join(',')}&key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`statistics batch failed: HTTP ${res.status} — continuing without stats`);
      break;
    }
    const data = (await res.json()) as any;
    for (const v of data?.items || []) {
      if (v?.id) statsById[v.id] = v;
    }
  }

  let accept = 0;
  let reject = 0;
  let missing = 0;
  const bands: Record<string, number> = {};
  const rejects: Array<{ score: number; title: string; reasons: string[] }> = [];
  const borderline: Array<{ score: number; title: string; reasons: string[] }> = [];
  for (const { row, videoId } of withId) {
    const d = (videoId && statsById[videoId]) || undefined;
    if (videoId && !d) {
      // Present in our DB but absent from YouTube: deleted or private.
      // Different problem (dead links, not quality) — counted separately.
      missing++;
      continue;
    }
    const toInt = (v: any): number | null => {
      const n = parseInt(String(v ?? ''), 10);
      return Number.isFinite(n) ? n : null;
    };
    const verdict = scoreCandidateVideo({
      title: String(row.title || ''),
      description: String(row.description || ''),
      channelTitle: String(row.instructor || ''),
      subject: String(row.subject || ''),
      topic: row.chapter ? String(row.chapter) : null,
      grade: Number(row.grade) || 10,
      durationSecs: d ? parseDurationSecs(d?.contentDetails?.duration) : null,
      categoryId: d?.snippet?.categoryId ?? null,
      embeddable: typeof d?.status?.embeddable === 'boolean' ? d.status.embeddable : null,
      viewCount: d ? toInt(d?.statistics?.viewCount) : null,
      likeCount: d ? toInt(d?.statistics?.likeCount) : null,
    });
    if (verdict.accept) {
      accept++;
      const band = verdict.score <= 4 ? '2-4' : verdict.score <= 7 ? '5-7' : '8+';
      bands[band] = (bands[band] || 0) + 1;
      if (verdict.score <= 4) {
        borderline.push({ score: verdict.score, title: String(row.title || '').slice(0, 80), reasons: verdict.reasons });
      }
    } else {
      reject++;
      rejects.push({ score: verdict.score, title: String(row.title || '').slice(0, 80), reasons: verdict.reasons });
    }
  }

  console.log(`\nWould ACCEPT today: ${accept} ${JSON.stringify(bands)} | would REJECT: ${reject} | missing on YouTube (deleted/private): ${missing}`);
  console.log('\nWorst 15 (lowest score first):');
  rejects
    .sort((a, b) => a.score - b.score)
    .slice(0, 15)
    .forEach((r) => console.log(`  [${r.score}] ${r.title} :: ${r.reasons.join(', ')}`));
  console.log('\nBorderline accepts (score 2-4, spot-check these):');
  borderline
    .slice(0, 10)
    .forEach((r) => console.log(`  [${r.score}] ${r.title} :: ${r.reasons.join(', ')}`));

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
