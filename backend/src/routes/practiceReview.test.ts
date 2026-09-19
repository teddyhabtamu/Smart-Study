import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// Practice review queue + session recording: weakest-subject ranking,
// recent-subject fallback, and the quiz-complete insert that feeds both
// (practice_sessions was write-only-dead). DB faked at the boundary.
const mockQuery = vi.fn();
const mockDbAdminUpdate = vi.fn();

vi.mock('../database/config', () => ({
  query: mockQuery,
  getClient: async () => ({
    query: (...args: any[]) => mockQuery(...args),
    release: vi.fn(),
  }),
  dbAdmin: {
    update: (...args: any[]) => mockDbAdminUpdate(...args),
    insert: async () => ({ id: 'n-1' }),
  },
  supabaseAdmin: {},
}));

const savedEnv = { ...process.env };

const setTestEnv = () => {
  process.env.DATABASE_URL = 'postgresql://testuser:testpass@localhost:5432/testdb';
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'test-anon-key';
  process.env.JWT_SECRET = 'test-secret';
};

const authRow = {
  id: 'u-1', name: 'Student', email: 's@e.com', role: 'STUDENT',
  status: 'Active', is_premium: false, bookmarks: [],
};

beforeEach(() => {
  setTestEnv();
  mockQuery.mockReset();
  mockDbAdminUpdate.mockReset();
  mockDbAdminUpdate.mockResolvedValue({});
  mockQuery.mockImplementation(async (text: string) => {
    if (text.includes('LEFT JOIN bookmarks')) return { rows: [authRow], rowCount: 1 };
    if (text.includes('FOR UPDATE')) {
      return { rows: [{ xp: 0, unlocked_badges: [], email: 's@e.com', name: 'Student' }], rowCount: 1 };
    }
    if (text.includes('SELECT xp, level FROM users')) return { rows: [{ xp: 0, level: 1 }], rowCount: 1 };
    if (text.includes('SUM(amount)')) return { rows: [{ used: 0 }], rowCount: 1 };
    if (text.includes('SELECT id, name, email, xp, level, practice_attempts FROM users')) {
      return { rows: [{ ...authRow, xp: 0, level: 1, practice_attempts: 0 }], rowCount: 1 };
    }
    if (text.includes('FROM badge_unlocks')) return { rows: [], rowCount: 0 };
    if (text.includes('INSERT INTO badge_unlocks')) return { rows: [], rowCount: 1 };
    if (text.includes('INSERT INTO xp_history')) return { rows: [], rowCount: 1 };
    if (text.includes('UPDATE users SET xp')) return { rows: [], rowCount: 1 };
    if (text.includes('INSERT INTO practice_sessions')) return { rows: [], rowCount: 1 };
    if (/^(BEGIN|COMMIT|ROLLBACK)/.test(text.trim())) return { rows: [], rowCount: 0 };
    throw new Error(`unexpected query in test: ${String(text).slice(0, 100)}`);
  });
});

afterEach(() => {
  process.env = { ...savedEnv };
});

const loadApp = async () => {
  const { default: plannerRouter } = await import('./planner');
  const app = express();
  app.use(express.json());
  app.use('/api/planner', plannerRouter);
  return app;
};

const tokenFor = () =>
  jwt.sign({ userId: 'u-1', email: 's@e.com' }, 'test-secret');

describe('POST /api/planner/practice/quiz-complete', () => {
  it('records the session row that feeds history and review', async () => {
    const app = await loadApp();
    const res = await request(app)
      .post('/api/planner/practice/quiz-complete')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({ subject: 'Mathematics', score: 4, totalQuestions: 5, timeSpent: '60s' });
    expect(res.status).toBe(200);
    const insert = mockQuery.mock.calls.find(([sql]: any[]) =>
      String(sql).includes('INSERT INTO practice_sessions'));
    expect(insert).toBeDefined();
    expect(insert[1]).toEqual(['u-1', 'Mathematics', 4, 5]);
  });
});

describe('GET /api/planner/practice/review-queue', () => {
  const weakestRows = [
    { subject: 'Physics', attempts: '4', avg_pct: '45', last_at: new Date() },
    { subject: 'Mathematics', attempts: '6', avg_pct: '80', last_at: new Date() },
  ];

  it('ranks weakest subjects first', async () => {
    mockQuery.mockImplementation(async (text: string) => {
      if (text.includes('LEFT JOIN bookmarks')) return { rows: [authRow], rowCount: 1 };
      if (text.includes('FROM practice_sessions')) return { rows: weakestRows, rowCount: 2 };
      throw new Error(`unexpected query in test: ${String(text).slice(0, 100)}`);
    });
    const app = await loadApp();
    const res = await request(app)
      .get('/api/planner/practice/review-queue')
      .set('Authorization', `Bearer ${tokenFor()}`);
    expect(res.status).toBe(200);
    expect(res.body.data.due.map((d: any) => d.subject)).toEqual(['Physics', 'Mathematics']);
    expect(res.body.data.due[0]).toMatchObject({ avgScorePct: 45, attempts: 4, reason: 'weakest' });
  });

  it('falls back to recent planner subjects with no quiz history', async () => {
    mockQuery.mockImplementation(async (text: string) => {
      if (text.includes('LEFT JOIN bookmarks')) return { rows: [authRow], rowCount: 1 };
      if (text.includes('FROM practice_sessions')) return { rows: [], rowCount: 0 };
      if (text.includes('FROM study_events')) {
        return { rows: [{ subject: 'Biology', n: '5' }], rowCount: 1 };
      }
      throw new Error(`unexpected query in test: ${String(text).slice(0, 100)}`);
    });
    const app = await loadApp();
    const res = await request(app)
      .get('/api/planner/practice/review-queue')
      .set('Authorization', `Bearer ${tokenFor()}`);
    expect(res.status).toBe(200);
    expect(res.body.data.due).toEqual([
      { subject: 'Biology', avgScorePct: null, attempts: 0, reason: 'recent' },
    ]);
  });

  it('requires authentication', async () => {
    const app = await loadApp();
    expect((await request(app).get('/api/planner/practice/review-queue')).status).toBe(401);
  });
});
