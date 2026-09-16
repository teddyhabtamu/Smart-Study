import { describe, it, expect, beforeEach, vi } from 'vitest';
import { logAiUsage } from './aiUsage';

// Metering contract: best-effort, never throws, bounded. If logging could
// break or stall a request, it would be worse than no metering.
// vi.hoisted: the mock factory runs when './aiUsage' is statically
// imported (before file top-level), so the fn must exist pre-hoist.
const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock('../database/config', () => ({
  query: mockQuery,
}));

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
});

describe('logAiUsage (metering contract)', () => {
  it('inserts one row with route/user/outcome/latency', async () => {
    await logAiUsage({
      route: 'generate-study-plan',
      userId: 'user-1',
      ok: true,
      latencyMs: 6100,
    });
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [text, params] = mockQuery.mock.calls[0];
    expect(text).toContain('INSERT INTO ai_usage');
    expect(params).toEqual(['user-1', 'generate-study-plan', true, null, 6100]);
  });

  it('records quota failures with their code', async () => {
    await logAiUsage({ route: 'chat', userId: null, ok: false, errorCode: 'AI_QUOTA_EXCEEDED' });
    expect(mockQuery.mock.calls[0][1]).toEqual([null, 'chat', false, 'AI_QUOTA_EXCEEDED', null]);
  });

  it('never throws when the database is down', async () => {
    mockQuery.mockRejectedValue(new Error('db down'));
    await expect(
      logAiUsage({ route: 'quiz', userId: 'u', ok: false, errorCode: 'AI_ERROR' })
    ).resolves.toBeUndefined();
  });

  it('gives up after the bound instead of hanging the request', async () => {
    mockQuery.mockImplementation(() => new Promise(() => {}));
    const t0 = Date.now();
    await logAiUsage({ route: 'quiz', userId: 'u', ok: true });
    expect(Date.now() - t0).toBeLessThan(5000);
  });
});
