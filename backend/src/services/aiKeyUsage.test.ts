import { describe, it, expect, beforeEach, vi } from 'vitest';
import { logKeyUsage, getKeyUsageTotals } from './aiKeyUsage';

// Durable key metering contract: best-effort, never throws, bounded —
// same guarantees as aiUsage.ts. If key logging could break or stall an
// AI request, it would be worse than no metering.
const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock('../database/config', () => ({
  query: mockQuery,
}));

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
});

describe('logKeyUsage (metering contract)', () => {
  it('inserts one row with fingerprint/index/outcome/model', async () => {
    await logKeyUsage({
      fingerprint: '••••aaaa',
      keyIndex: 0,
      outcome: 'served',
      model: 'gemini-2.5-flash',
      latencyMs: 1200,
    });
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [text, params] = mockQuery.mock.calls[0];
    expect(text).toContain('INSERT INTO ai_key_usage');
    expect(params).toEqual(['••••aaaa', 0, 'served', 'gemini-2.5-flash', 1200]);
  });

  it('records quota and invalid outcomes', async () => {
    await logKeyUsage({ fingerprint: '••••bbbb', keyIndex: 1, outcome: 'quota', model: 'm' });
    expect(mockQuery.mock.calls[0][1][2]).toBe('quota');
  });

  it('never throws when the database is down', async () => {
    mockQuery.mockRejectedValue(new Error('db down'));
    await expect(
      logKeyUsage({ fingerprint: '••••aaaa', keyIndex: 0, outcome: 'other' })
    ).resolves.toBeUndefined();
  });

  it('gives up after the bound instead of hanging the request', async () => {
    mockQuery.mockImplementation(() => new Promise(() => {}));
    const t0 = Date.now();
    await logKeyUsage({ fingerprint: '••••aaaa', keyIndex: 0, outcome: 'served' });
    expect(Date.now() - t0).toBeLessThan(5000);
  });

  it('ignores events with no fingerprint instead of writing junk rows', async () => {
    await logKeyUsage({ fingerprint: '', keyIndex: 0, outcome: 'served' });
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('getKeyUsageTotals (durable aggregates)', () => {
  it('maps aggregate rows to per-fingerprint totals', async () => {
    mockQuery.mockResolvedValue({
      rows: [{
        fingerprint: '••••aaaa',
        served: '5',
        quota_hits: '2',
        invalid_hits: '0',
        other_errors: '1',
        last_ok_at: new Date('2026-09-18T10:00:00Z'),
        last_error_at: new Date('2026-09-17T10:00:00Z'),
        last_error_kind: 'quota',
      }],
      rowCount: 1,
    });
    const totals = await getKeyUsageTotals();
    const t = totals.get('••••aaaa');
    expect(t?.served).toBe(5);
    expect(t?.quotaHits).toBe(2);
    expect(t?.lastErrorKind).toBe('quota');
    expect(t?.lastOkAt).toContain('2026-09-18');
  });

  it('returns an empty map (not a throw) when the table predates the migration', async () => {
    mockQuery.mockRejectedValue(new Error('relation "ai_key_usage" does not exist'));
    await expect(getKeyUsageTotals()).resolves.toEqual(new Map());
  });
});
