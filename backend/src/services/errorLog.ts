import crypto from 'crypto';

// Grouped error log: distinct failures aggregate into one row per
// fingerprint (occurrences + last_seen), so error storms read as signal,
// not 1,000 rows. A repeat occurrence reopens a resolved fingerprint —
// silence must be earned by fixing the cause.
//
// Contract mirrors aiUsage.ts: best-effort, NEVER throws, bounded at 3s.
// Telemetry must never break the request it measures.
//
// NOTE: no top-level import of ../database/config. database/config.ts
// itself reports pool failures through this module — a static import here
// would close a module cycle. The DB client is dynamically imported inside
// each function instead.

export type ErrorSource = 'client' | 'server';

export interface ErrorReport {
  source: ErrorSource;
  /** Request path (server) or page path (client). */
  route?: string | null;
  /** Raw message; truncated server-side, never full stacks. */
  message: string;
}

export interface ErrorSummary {
  fingerprint: string;
  source: ErrorSource;
  route: string | null;
  message: string;
  occurrences: number;
  firstSeenAt: string;
  lastSeenAt: string;
  resolved: boolean;
}

const LOG_TIMEOUT_MS = 3000;
const MAX_MESSAGE = 500;

// Normalization: strip volatile tokens (numbers, UUIDs, paths, quoted
// values) so the same failure shape always fingerprints identically while
// distinct failures stay distinct. Runs on the message only — route is
// stored separately, not folded in, so one fingerprint can span routes.
export const fingerprintError = (message: string, source: ErrorSource): string => {
  const norm = String(message || 'unknown error')
    .toLowerCase()
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<id>')
    .replace(/\b\d+(\.\d+)+\b/g, '<n>')
    .replace(/\b\d+\b/g, '<n>')
    .replace(/(['"`])[^'"`]{1,80}\1/g, '<s>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
  return `${source}:${crypto.createHash('sha256').update(norm).digest('hex').slice(0, 16)}`;
};

const withTimeout = <T>(p: Promise<T>): Promise<T> =>
  Promise.race([
    p,
    new Promise<never>((_, reject) => {
      const t = setTimeout(() => reject(new Error('error-log timeout')), LOG_TIMEOUT_MS);
      (t as any)?.unref?.();
    }),
  ]) as Promise<T>;

export const reportError = async (e: ErrorReport): Promise<void> => {
  try {
    const message = String(e?.message || 'unknown error').slice(0, MAX_MESSAGE);
    if (!message.trim()) return;
    const source: ErrorSource = e.source === 'server' ? 'server' : 'client';
    const fingerprint = fingerprintError(message, source);
    const route = (e.route || '').toString().slice(0, 200) || null;
    const { query } = await import('../database/config');
    await withTimeout(
      query(
        `INSERT INTO error_log (fingerprint, source, route, message)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (fingerprint) DO UPDATE SET
           occurrences = error_log.occurrences + 1,
           last_seen_at = NOW(),
           resolved = FALSE,
           resolved_at = NULL`,
        [fingerprint, source, route, message]
      )
    );
  } catch {
    // Telemetry must never break — or even slow — the request it measures.
  }
};

export const getErrorSummary = async (days = 7, limit = 20): Promise<ErrorSummary[]> => {
  try {
    const { query } = await import('../database/config');
    const res = await withTimeout(
      query(
        `SELECT fingerprint, source, route, message, occurrences,
                first_seen_at, last_seen_at, resolved
         FROM error_log
         WHERE last_seen_at >= NOW() - make_interval(days => $1::int)
         ORDER BY resolved ASC, occurrences DESC
         LIMIT $2`,
        [Math.min(Math.max(days, 1), 90), Math.min(Math.max(limit, 1), 50)]
      )
    );
    return (res.rows || []).map((r: any) => ({
      fingerprint: String(r.fingerprint),
      source: r.source === 'server' ? 'server' : 'client',
      route: r.route ?? null,
      message: String(r.message || ''),
      occurrences: Number(r.occurrences || 0),
      firstSeenAt: new Date(r.first_seen_at).toISOString(),
      lastSeenAt: new Date(r.last_seen_at).toISOString(),
      resolved: r.resolved === true,
    }));
  } catch {
    return [];
  }
};

export const resolveError = async (fingerprint: string): Promise<boolean> => {
  try {
    if (!fingerprint || typeof fingerprint !== 'string') return false;
    const { query } = await import('../database/config');
    const res = await withTimeout(
      query(
        `UPDATE error_log SET resolved = TRUE, resolved_at = NOW()
         WHERE fingerprint = $1`,
        [fingerprint.slice(0, 64)]
      )
    );
    return (res.rowCount ?? 0) > 0;
  } catch {
    return false;
  }
};
