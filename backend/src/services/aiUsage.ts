import { query } from '../database/config';

// AI usage metering: one row per generation (chat, study plan, quiz) so the
// shared Gemini key stops being a black box. Powers the admin widget and
// the quota-error alert.
//
// Contract: best-effort, NEVER throws, bounded at 3s. Metering is
// observability, not load-bearing — during a pool collapse the insert is
// dropped after 3s instead of adding 10s+ to an already-failing request
// (the collapse itself stays visible via pool gauges and SLOW lines).
export interface AiUsageEvent {
  /** Route key, e.g. 'generate-study-plan'. */
  route: string;
  userId?: string | null;
  ok: boolean;
  /** 'AI_QUOTA_EXCEEDED' | 'AI_FALLBACK' | 'AI_NOT_CONFIGURED' | 'AI_ERROR'. */
  errorCode?: string | null;
  latencyMs?: number | null;
}

const LOG_TIMEOUT_MS = 3000;

export const logAiUsage = async (e: AiUsageEvent): Promise<void> => {
  try {
    const insert = query(
      'INSERT INTO ai_usage (user_id, route, ok, error_code, latency_ms) VALUES ($1, $2, $3, $4, $5)',
      [e.userId ?? null, e.route, e.ok, e.errorCode ?? null, e.latencyMs ?? null]
    );
    await Promise.race([
      insert,
      new Promise<never>((_, reject) => {
        const t = setTimeout(() => reject(new Error('ai-usage log timeout')), LOG_TIMEOUT_MS);
        (t as any)?.unref?.();
      }),
    ]);
  } catch {
    // Metering must never break — or even slow — the request it measures.
  }
};
