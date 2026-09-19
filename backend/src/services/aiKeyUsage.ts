// Durable per-key AI usage: one row per key attempt (served / quota /
// invalid / other) so the admin AI-keys tab survives restarts and
// serverless cold starts. Previously counters lived in module memory only
// (aiTutor.ts keyStats) and reset to zero on every deploy or cold
// instance.
//
// Contract mirrors services/aiUsage.ts: best-effort, NEVER throws,
// bounded at 3s. Key logging is observability, not load-bearing.
//
// NOTE: no top-level import of ../database/config here. aiTutor.ts imports
// this module statically, and its unit tests (aiTutor.keys.test.ts) run
// with no DB env at all — a static DB import would throw at module load
// (Supabase/DATABASE_URL missing) and break those suites. The DB client is
// therefore dynamically imported inside each function, and every failure
// (missing env, missing table, timeout) resolves to a no-op / empty map.

export type KeyUsageOutcome = 'served' | 'quota' | 'invalid' | 'other';

export interface KeyUsageEvent {
  /** Masked identity (e.g. ••••abcd) — never key material. */
  fingerprint: string;
  keyIndex?: number | null;
  outcome: KeyUsageOutcome;
  model?: string | null;
  latencyMs?: number | null;
}

export interface KeyUsageTotals {
  fingerprint: string;
  served: number;
  quotaHits: number;
  invalidHits: number;
  otherErrors: number;
  lastOkAt: string | null;
  lastErrorAt: string | null;
  lastErrorKind: 'quota' | 'invalid' | 'other' | null;
}

const LOG_TIMEOUT_MS = 3000;

export const logKeyUsage = async (e: KeyUsageEvent): Promise<void> => {
  try {
    if (!e || !e.fingerprint || !e.outcome) return;
    // Dynamic import keeps this module side-effect free for unit tests.
    const { query } = await import('../database/config');
    const insert = query(
      `INSERT INTO ai_key_usage
         (key_fingerprint, key_index, outcome, model, latency_ms)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        e.fingerprint,
        e.keyIndex ?? null,
        e.outcome,
        e.model ?? null,
        e.latencyMs ?? null,
      ]
    );
    await Promise.race([
      insert,
      new Promise<never>((_, reject) => {
        const t = setTimeout(() => reject(new Error('ai-key-usage log timeout')), LOG_TIMEOUT_MS);
        (t as any)?.unref?.();
      }),
    ]);
  } catch {
    // Metering must never break — or even slow — the request it measures.
  }
};

/** Durable aggregates per fingerprint. Empty map when the DB/table is unavailable. */
export const getKeyUsageTotals = async (): Promise<Map<string, KeyUsageTotals>> => {
  const empty = new Map<string, KeyUsageTotals>();
  try {
    const { query } = await import('../database/config');
    const res = await Promise.race([
      query(
        `SELECT key_fingerprint AS fingerprint,
                COUNT(*) FILTER (WHERE outcome = 'served') AS served,
                COUNT(*) FILTER (WHERE outcome = 'quota') AS quota_hits,
                COUNT(*) FILTER (WHERE outcome = 'invalid') AS invalid_hits,
                COUNT(*) FILTER (WHERE outcome = 'other') AS other_errors,
                MAX(created_at) FILTER (WHERE outcome = 'served') AS last_ok_at,
                MAX(created_at) FILTER (WHERE outcome IN ('quota', 'invalid', 'other')) AS last_error_at,
                (
                  SELECT outcome FROM ai_key_usage k2
                  WHERE k2.key_fingerprint = ai_key_usage.key_fingerprint
                    AND k2.outcome IN ('quota', 'invalid', 'other')
                  ORDER BY created_at DESC LIMIT 1
                ) AS last_error_kind
         FROM ai_key_usage
         WHERE created_at >= NOW() - INTERVAL '90 days'
         GROUP BY key_fingerprint`
      ),
      new Promise<never>((_, reject) => {
        const t = setTimeout(() => reject(new Error('ai-key-usage aggregate timeout')), LOG_TIMEOUT_MS);
        (t as any)?.unref?.();
      }),
    ]);
    const rows: any[] = (res as any)?.rows ?? [];
    for (const r of rows) {
      const fp = String(r.fingerprint || '');
      if (!fp) continue;
      const kind =
        r.last_error_kind === 'quota' || r.last_error_kind === 'invalid' || r.last_error_kind === 'other'
          ? r.last_error_kind
          : null;
      empty.set(fp, {
        fingerprint: fp,
        served: Number(r.served || 0),
        quotaHits: Number(r.quota_hits || 0),
        invalidHits: Number(r.invalid_hits || 0),
        otherErrors: Number(r.other_errors || 0),
        lastOkAt: r.last_ok_at ? new Date(r.last_ok_at).toISOString() : null,
        lastErrorAt: r.last_error_at ? new Date(r.last_error_at).toISOString() : null,
        lastErrorKind: kind,
      });
    }
    return empty;
  } catch {
    return empty;
  }
};
