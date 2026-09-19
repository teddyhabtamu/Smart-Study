import { describe, it, expect, beforeEach, vi } from 'vitest';
import { fingerprintError, reportError, getErrorSummary, resolveError } from './errorLog';

// Grouped telemetry contract: distinct failures share a fingerprint,
// volatile tokens (ids, counts) don't split groups, and everything is
// best-effort — reporting must never throw or stall.
const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock('../database/config', () => ({
  query: mockQuery,
}));

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
});

describe('fingerprintError', () => {
  it('is stable for the same failure with different ids and counts', () => {
    const a = fingerprintError('column "created_at" does not exist', 'server');
    const b = fingerprintError('column "updated_at" does not exist', 'server');
    expect(a).toBe(b);
    expect(a).toMatch(/^server:[0-9a-f]{16}$/);
  });

  it('keeps distinct failures and sources apart', () => {
    expect(fingerprintError('pool timeout', 'server')).not.toBe(
      fingerprintError('pool exhausted', 'server')
    );
    expect(fingerprintError('pool timeout', 'server')).not.toBe(
      fingerprintError('pool timeout', 'client')
    );
  });
});

describe('reportError (telemetry contract)', () => {
  it('upserts one grouped row and reopens on repeat', async () => {
    await reportError({ source: 'server', route: '/api/chat', message: 'boom 123' });
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [text, params] = mockQuery.mock.calls[0];
    expect(text).toContain('INSERT INTO error_log');
    expect(text).toContain('ON CONFLICT (fingerprint)');
    expect(text).toContain('resolved = FALSE');
    expect(params[0]).toMatch(/^server:[0-9a-f]{16}$/);
    expect(params[1]).toBe('server');
  });

  it('truncates long messages and ignores empty ones', async () => {
    await reportError({ source: 'client', message: 'x'.repeat(900) });
    expect(mockQuery.mock.calls[0][1][3]).toHaveLength(500);
    mockQuery.mockClear();
    await reportError({ source: 'client', message: '   ' });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('never throws when the database is down', async () => {
    mockQuery.mockRejectedValue(new Error('db down'));
    await expect(
      reportError({ source: 'server', message: 'pool dead' })
    ).resolves.toBeUndefined();
  });

  it('gives up after the bound instead of hanging the request', async () => {
    mockQuery.mockImplementation(() => new Promise(() => {}));
    const t0 = Date.now();
    await reportError({ source: 'server', message: 'slow db' });
    expect(Date.now() - t0).toBeLessThan(5000);
  });
});

describe('getErrorSummary / resolveError', () => {
  it('maps rows and returns [] (not a throw) without the table', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        fingerprint: 'server:abc', source: 'server', route: '/x', message: 'm',
        occurrences: '7', first_seen_at: new Date('2026-09-18T10:00:00Z'),
        last_seen_at: new Date('2026-09-18T11:00:00Z'), resolved: false,
      }],
      rowCount: 1,
    });
    const rows = await getErrorSummary();
    expect(rows[0]).toMatchObject({ fingerprint: 'server:abc', occurrences: 7, resolved: false });
    mockQuery.mockRejectedValue(new Error('relation "error_log" does not exist'));
    await expect(getErrorSummary()).resolves.toEqual([]);
  });

  it('resolve returns affected status and rejects bad input', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
    await expect(resolveError('server:abc')).resolves.toBe(true);
    await expect(resolveError('')).resolves.toBe(false);
  });
});
