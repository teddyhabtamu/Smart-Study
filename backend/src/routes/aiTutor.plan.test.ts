import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// Folded persist for POST /ai-tutor/generate-study-plan: the route generates
// the plan AND inserts it on the pool that just served auth (already warm),
// instead of making the client POST it back to /planner/events/batch — a
// second cold invocation whose silent death stranded every plan. Only the pg
// pool and the AI call are faked; route, auth, premium gate, validation,
// SQL mapping and fallback semantics all run for real.
const mockQuery = vi.fn();
const mockGenerateSmartPlan = vi.fn();

vi.mock('../database/config', () => ({
  query: mockQuery,
  getClient: async () => ({
    query: async () => ({ rows: [{ id: 'user-1', xp: 0, level: 1 }], rowCount: 1 }),
    release: vi.fn(),
  }),
  dbAdmin: {},
}));

vi.mock('../services/aiTutor', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/aiTutor')>()),
  generateSmartPlan: mockGenerateSmartPlan,
}));

const savedEnv = { ...process.env };

const setTestEnv = () => {
  process.env.DATABASE_URL = 'postgresql://testuser:testpass@localhost:5432/testdb';
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'test-anon-key';
  process.env.JWT_SECRET = 'test-secret';
  process.env.GOOGLE_CLIENT_ID = 'test-google-id';
  process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret';
  process.env.FRONTEND_URL = 'http://localhost:5173';
  process.env.BACKEND_URL = 'http://localhost:5000';
  // Presence only: generateSmartPlan itself is mocked, but the route
  // 503-fast-fails without a configured key before reaching it.
  process.env.GEMINI_API_KEY = 'test-key';
};

// Auth middleware's user lookup + INSERT echo. Everything else (XP internals)
// gets a benign generic row — award failures are non-fatal by design.
const baseQueryMock = async (text: string, params: any[] = []) => {
  if (text.includes('FROM users')) {
    return {
      rows: [{
        id: 'user-1',
        name: 'Test Student',
        email: 'student@example.com',
        role: 'STUDENT',
        status: 'Active',
        is_premium: true,
        bookmarks: [],
      }],
      rowCount: 1,
    };
  }
  if (text.startsWith('INSERT INTO study_events')) {
    const rows = [];
    for (let i = 0; i < params.length; i += 7) {
      rows.push({
        id: `evt-${i / 7}`,
        user_id: params[i],
        title: params[i + 1],
        subject: params[i + 2],
        event_date: params[i + 3],
        event_type: params[i + 4],
        is_completed: params[i + 5],
        notes: params[i + 6],
      });
    }
    return { rows, rowCount: rows.length };
  }
  return { rows: [{ ok: 1 }], rowCount: 1 };
};

beforeEach(() => {
  setTestEnv();
  mockQuery.mockReset();
  mockGenerateSmartPlan.mockReset();
  mockQuery.mockImplementation(baseQueryMock);
});

afterEach(() => {
  process.env = { ...savedEnv };
});

const loadApp = async () => {
  const { default: aiTutorRouter } = await import('./ai-tutor');
  const app = express();
  app.use(express.json());
  // Same mount prefix as server.ts so route paths match production.
  app.use('/api/ai-tutor', aiTutorRouter);
  return app;
};

const tokenFor = (userId = 'user-1') =>
  jwt.sign({ userId, email: 'student@example.com', role: 'STUDENT' }, 'test-secret');

const aiPlan = () => ([
  {
    title: 'Quadratic equation Exam',
    subject: 'Mathematics',
    date: '2026-09-24',
    type: 'Exam',
    notes: 'Exam day.',
  },
  {
    title: 'Newton revision',
    subject: 'Physics',
    date: '2026-09-25',
    type: 'Revision',
    notes: 'Revise.',
  },
]);

const postPlan = (app: any, body: any = { prompt: 'math exam next Friday' }) =>
  request(app)
    .post('/api/ai-tutor/generate-study-plan')
    .set('Authorization', `Bearer ${tokenFor()}`)
    .send(body);

describe('POST /generate-study-plan (folded persist)', () => {
  it('persists the generated plan inline and returns the created events', async () => {
    mockGenerateSmartPlan.mockResolvedValue({ plan: aiPlan(), fallback: false });
    const app = await loadApp();
    const res = await postPlan(app);

    expect(res.status).toBe(200);
    expect(res.body.data.plan).toHaveLength(2);
    expect(res.body.data.persisted).toBe(true);
    expect(res.body.data.events).toHaveLength(2);

    // The INSERT ran in THIS invocation with frontend names mapped to
    // columns (event_date/event_type), subjects normalized.
    const insertCall = mockQuery.mock.calls.find(([sql]: any[]) =>
      String(sql).startsWith('INSERT INTO study_events')
    );
    expect(insertCall).toBeDefined();
    expect(insertCall![1].slice(0, 7)).toEqual([
      'user-1',
      'Quadratic equation Exam',
      'Mathematics',
      // Day-precision normalizes to midnight Ethiopia (uniform instants
      // for exact-match dedup after the TIMESTAMPTZ migration).
      '2026-09-24T00:00:00+03:00',
      'Exam',
      false,
      'Exam day.',
    ]);
  });

  it('skips the INSERT for an empty plan without failing', async () => {
    mockGenerateSmartPlan.mockResolvedValue({ plan: [], fallback: true });
    const app = await loadApp();
    const res = await postPlan(app);

    expect(res.status).toBe(200);
    expect(res.body.data.persisted).toBe(false);
    expect(res.body.data.events).toEqual([]);
    expect(
      mockQuery.mock.calls.some(([sql]: any[]) => String(sql).startsWith('INSERT INTO study_events'))
    ).toBe(false);
  });

  it('flags fallback skeletons so the client offers retry instead of saving', async () => {
    mockGenerateSmartPlan.mockResolvedValue({ plan: aiPlan(), fallback: true });
    const app = await loadApp();
    const res = await postPlan(app);

    // A failed generation must not save anything — not even a valid-looking
    // plan. The client shows retry on fallback:true.
    expect(res.status).toBe(200);
    expect(res.body.data.fallback).toBe(true);
    expect(res.body.data.persisted).toBe(false);
    expect(res.body.data.events).toEqual([]);
    expect(
      mockQuery.mock.calls.some(([sql]: any[]) => String(sql).startsWith('INSERT INTO study_events'))
    ).toBe(false);
  });

  it('returns the plan unpersisted (200, not 500) when the INSERT blows up', async () => {
    mockGenerateSmartPlan.mockResolvedValue({ plan: aiPlan(), fallback: false });
    mockQuery.mockImplementation(async (text: string, params: any[] = []) => {
      if (text.includes('FROM users')) return baseQueryMock(text, params);
      if (text.startsWith('INSERT INTO study_events')) throw new Error('db down');
      return { rows: [{ ok: 1 }], rowCount: 1 };
    });
    const app = await loadApp();
    const res = await postPlan(app);

    // Graceful degradation: the plan survives so the client can fall back
    // to the standalone batch endpoint instead of losing everything.
    expect(res.status).toBe(200);
    expect(res.body.data.plan).toHaveLength(2);
    expect(res.body.data.persisted).toBe(false);
    expect(res.body.data.events).toEqual([]);
  });

  it('keeps the 429 quota path intact', async () => {
    const { AIQuotaExceededError } = await import('../services/aiTutor');
    mockGenerateSmartPlan.mockRejectedValue(new AIQuotaExceededError('spent', 60));
    const app = await loadApp();
    const res = await postPlan(app);

    expect(res.status).toBe(429);
    expect(res.body.code).toBe('AI_QUOTA_EXCEEDED');
  });

  it('meters every outcome to ai_usage (success, quota, fallback)', async () => {
    const usageInserts = () =>
      mockQuery.mock.calls.filter(([sql]: any[]) => String(sql).includes('INSERT INTO ai_usage'));

    // Success.
    mockGenerateSmartPlan.mockResolvedValue({ plan: aiPlan(), fallback: false });
    let app = await loadApp();
    await postPlan(app);
    expect(usageInserts()).toHaveLength(1);
    expect(usageInserts()[0][1][1]).toBe('generate-study-plan');
    expect(usageInserts()[0][1][2]).toBe(true);

    // Quota failure.
    const { AIQuotaExceededError } = await import('../services/aiTutor');
    mockGenerateSmartPlan.mockRejectedValue(new AIQuotaExceededError('spent', 60));
    app = await loadApp();
    await postPlan(app);
    const quotaRows = usageInserts().filter(([, params]: any[]) => params[3] === 'AI_QUOTA_EXCEEDED');
    expect(quotaRows).toHaveLength(1);

    // Fallback skeleton.
    mockGenerateSmartPlan.mockResolvedValue({ plan: [], fallback: true });
    app = await loadApp();
    await postPlan(app);
    const fallbackRows = usageInserts().filter(([, params]: any[]) => params[3] === 'AI_FALLBACK');
    expect(fallbackRows).toHaveLength(1);
  });

  it('serves aggregate-only usage status without auth', async () => {
    mockQuery.mockImplementation(async (text: string, params: any[] = []) => {
      if (text.includes('FROM ai_usage')) {
        return { rows: [{ calls: '12', failures: '3', quota_errors: '2' }], rowCount: 1 };
      }
      return baseQueryMock(text, params);
    });
    const app = await loadApp();
    const res = await request(app).get('/api/ai-tutor/usage-status');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ calls24h: 12, failures24h: 3, quotaErrors24h: 2 });
    expect(JSON.stringify(res.body)).not.toContain('user-1');
  });

  it('dedupes a retried plan: inserts only the missing event', async () => {
    // First attempt aborted client-side AFTER inserting event 1 — the retry
    // must not create it twice.
    mockGenerateSmartPlan.mockResolvedValue({ plan: aiPlan(), fallback: false });
    mockQuery.mockImplementation(async (text: string, params: any[] = []) => {
      if (text.includes('FROM users')) return baseQueryMock(text, params);
      if (text.includes('created_at > NOW()')) {
        return {
          rows: [{ id: 'e0', title: 'Quadratic equation Exam', event_date: '2026-09-24' }],
          rowCount: 1,
        };
      }
      if (text.startsWith('INSERT INTO study_events')) return baseQueryMock(text, params);
      return { rows: [{ ok: 1 }], rowCount: 1 };
    });
    const app = await loadApp();
    const res = await postPlan(app);

    expect(res.status).toBe(200);
    expect(res.body.data.persisted).toBe(true);
    // 1 already-present + 1 freshly inserted, no duplicates.
    expect(res.body.data.events).toHaveLength(2);
    const insertCall = mockQuery.mock.calls.find(([sql]: any[]) =>
      String(sql).startsWith('INSERT INTO study_events')
    );
    expect(insertCall).toBeDefined();
    expect(insertCall![1]).toHaveLength(7);
    expect(insertCall![1][1]).toBe('Newton revision');
  });
});
