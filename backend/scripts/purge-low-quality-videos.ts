/**
 * Purge low-quality + dead videos from the library.
 *
 * Re-scores EVERYTHING live with the same gate the importer uses (never a
 * stale list), then:
 *   - default (no flags): DRY RUN. Report only, zero writes.
 *   - --confirm=<N>: execute ONLY when the recomputed target count equals N.
 *     Writes a full backup first (videos + views/likes/completions/bookmarks
 *     for those ids), then deletes inside one transaction.
 *   - --restore=<file>: reinsert a previous backup (videos first, then
 *     children). Skips ids that already exist.
 *
 * What counts as a target:
 *   - missing on YouTube (deleted/private = dead links), or
 *   - rejected by scoreCandidateVideo (spam, trivia, answer keys, ...).
 * Dangling bookmarks pointing at purged ids are removed too (backed up).
 *
 * Usage:
 *   npx tsx scripts/purge-low-quality-videos.ts
 *   npx tsx scripts/purge-low-quality-videos.ts --confirm=221
 *   npx tsx scripts/purge-low-quality-videos.ts --restore=backups/video-purge-<ts>.json
 */
import fs from 'fs';
import path from 'path';
import { pool } from '../src/database/config';
import { scoreCandidateVideo, parseDurationSecs } from '../src/services/youtubeService';

const YT = 'https://www.googleapis.com/youtube/v3';
const BACKUP_DIR = path.resolve(__dirname, '../backups');

interface Target {
  id: string;
  title: string;
  kind: 'missing' | 'rejected';
  reasons: string[];
}

const toInt = (v: any): number | null => {
  const n = parseInt(String(v ?? ''), 10);
  return Number.isFinite(n) ? n : null;
};

async function computeTargets(apiKey: string): Promise<{ targets: Target[]; total: number }> {
  const { rows } = await pool.query(
    'SELECT id, title, description, instructor, subject, grade, chapter, video_url FROM videos'
  );
  const withId = rows
    .map((r: any) => ({
      row: r,
      videoId: String(r.video_url || '').match(/[?&]v=([\w-]{6,})/)?.[1] ?? null,
    }))
    .filter((x) => x.videoId);

  const statsById: Record<string, any> = {};
  for (let i = 0; i < withId.length; i += 50) {
    const batch = withId.slice(i, i + 50);
    const res = await fetch(
      `${YT}/videos?part=snippet,statistics,contentDetails,status` +
        `&id=${batch.map((b) => b.videoId).join(',')}&key=${apiKey}`
    );
    if (!res.ok) throw new Error(`YouTube statistics lookup failed: HTTP ${res.status}`);
    const data = (await res.json()) as any;
    for (const v of data?.items || []) {
      if (v?.id) statsById[v.id] = v;
    }
  }

  const targets: Target[] = [];
  for (const { row, videoId } of withId) {
    const d = (videoId && statsById[videoId]) || undefined;
    if (videoId && !d) {
      targets.push({ id: row.id, title: String(row.title || '').slice(0, 80), kind: 'missing', reasons: ['deleted-or-private'] });
      continue;
    }
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
    if (!verdict.accept) {
      targets.push({ id: row.id, title: String(row.title || '').slice(0, 80), kind: 'rejected', reasons: verdict.reasons });
    }
  }
  return { targets, total: rows.length };
}

async function writeBackup(targetIds: string[]): Promise<string> {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const file = path.join(BACKUP_DIR, `video-purge-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  const backup: Record<string, any[]> = {};
  backup.videos = (await pool.query('SELECT * FROM videos WHERE id = ANY($1)', [targetIds])).rows;
  for (const t of ['video_views', 'video_likes', 'video_completions'] as const) {
    backup[t] = (await pool.query(`SELECT * FROM ${t} WHERE video_id = ANY($1)`, [targetIds])).rows;
  }
  backup.bookmarks = (
    await pool.query('SELECT * FROM bookmarks WHERE item_id = ANY($1)', [targetIds])
  ).rows;
  fs.writeFileSync(file, JSON.stringify({ createdAt: new Date().toISOString(), ids: targetIds, backup }, null, 1));
  return file;
}

async function executePurge(targetIds: string[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM bookmarks WHERE item_id = ANY($1)', [targetIds]);
    // views/likes/completions cascade via FK; videos last.
    await client.query('DELETE FROM videos WHERE id = ANY($1)', [targetIds]);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

async function restoreBackup(file: string): Promise<void> {
  const abs = path.isAbsolute(file) ? file : path.resolve(process.cwd(), file);
  const data = JSON.parse(fs.readFileSync(abs, 'utf8'));
  const cols = (rows: any[]): string[] => Object.keys(rows[0] || {});
  const insertMany = async (table: string, rows: any[]) => {
    let skipped = 0;
    let inserted = 0;
    for (const row of rows) {
      const keys = cols([row]);
      const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
      const quoted = keys.map((k) => `"${k.replace(/"/g, '')}"`).join(', ');
      try {
        await pool.query(
          `INSERT INTO ${table} (${quoted}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
          keys.map((k) => (row[k] === undefined ? null : row[k]))
        );
        inserted++;
      } catch (err: any) {
        console.error(`restore: ${table} row failed:`, String(err?.message || err).slice(0, 120));
        skipped++;
      }
    }
    // ON CONFLICT DO NOTHING reports success either way; recount below.
    return { inserted, skipped };
  };
  const vids = await insertMany('videos', data.backup?.videos || []);
  console.log(`restore videos: attempted ${vids.inserted}, skipped/failed ${vids.skipped}`);
  for (const t of ['video_views', 'video_likes', 'video_completions', 'bookmarks']) {
    const r = await insertMany(t, data.backup?.[t] || []);
    console.log(`restore ${t}: attempted ${r.inserted}, skipped/failed ${r.skipped}`);
  }
  const left = await pool.query('SELECT COUNT(*) AS n FROM videos WHERE id = ANY($1)', [data.ids || []]);
  console.log(`videos present for backup ids now: ${left.rows[0]?.n}`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const restoreFile = args.find((a) => a.startsWith('--restore='))?.split('=')[1];
  if (restoreFile) {
    await restoreBackup(restoreFile);
    await pool.end();
    return;
  }

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.error('YOUTUBE_API_KEY is not configured.');
    process.exit(1);
  }
  const confirmArg = args.find((a) => a.startsWith('--confirm='))?.split('=')[1];
  const { targets, total } = await computeTargets(apiKey);
  const missing = targets.filter((t) => t.kind === 'missing').length;
  const rejected = targets.length - missing;
  console.log(`\nLibrary: ${total} videos. Targets: ${targets.length} (${rejected} rejected, ${missing} deleted/private).`);
  console.log('Top reject reasons:');
  const reasonCounts: Record<string, number> = {};
  for (const t of targets) for (const r of t.reasons) reasonCounts[r] = (reasonCounts[r] || 0) + 1;
  Object.entries(reasonCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .forEach(([r, n]) => console.log(`  ${n}x ${r}`));

  if (confirmArg === undefined) {
    console.log('\nDRY RUN — nothing written, nothing deleted.');
    console.log(`To execute: re-run with --confirm=${targets.length}`);
    await pool.end();
    return;
  }
  if (String(targets.length) !== String(Number(confirmArg))) {
    console.error(
      `\nREFUSED: recomputed ${targets.length} targets but --confirm=${confirmArg}. ` +
        'The library changed since the dry run — re-run dry first, then confirm the fresh number.'
    );
    await pool.end();
    process.exit(2);
  }
  const ids = targets.map((t) => t.id);
  const backupFile = await writeBackup(ids);
  console.log(`\nBackup written: ${backupFile}`);
  await executePurge(ids);
  const left = await pool.query('SELECT COUNT(*) AS n FROM videos WHERE id = ANY($1)', [ids]);
  console.log(`Purged ${ids.length} videos (${rejected} rejected, ${missing} dead). Remaining of those ids: ${left.rows[0]?.n}.`);
  console.log(`Restore any time with: npx tsx scripts/purge-low-quality-videos.ts --restore=${backupFile}`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
