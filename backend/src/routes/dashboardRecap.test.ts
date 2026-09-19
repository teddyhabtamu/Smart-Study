import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// Weekly recap: 7-day aggregates from already-logged tables. DB faked at
// the query boundary; routing, auth and aggregation run for real.
const mockQuery = vi.fn();

vi.mock('../database/config', () => ({
  query: mockQuery,
  dbAdmin: {},
  supabaseAdmin: {},
}));

const savedEnv = { ...process.env };

const setTestEnv = () => {
  process.env.DATABASE_URL = 'postgresql://testuser:testpass@localhost:5432/testdb';
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'test-anon-key';
  process.env.JWT_SECRET = 'test-secret';
};

beforeEach(() => {
  setTestEnv();
  mockQuery.mockReset();
  mockQuery.mockImplementation(async (text: string) => {
    // Auth middleware: user row + bookmarks aggregate.
    if (text.includes('LEFT JOIN bookmarks')) {
      return { rows: [{ id: 'u-1', name: 'Student', email: 'student@example.com', role: 'STUDENT', status: 'Active', is_premium: false, bookmarks: [], streak: 4 }], rowCount: 1 };
    }
    if (text.includes('SELECT streak')) {
      return { rows: [{ streak: 4 }], rowCount: 1 };
    }
    // study_events completions per EAT day.
    if (text.includes('FROM study_events')) {
      return { rows: [{ day: '2026-09-18', done: '3' }], rowCount: 1 };
    }
    // xp_history per EAT day.
    if (text.includes('FROM xp_history')) {
      return { rows: [{ day: '2026-09-18', xp: '120' }], rowCount: 1 };
    }
    if (text.includes('FROM practice_sessions')) {
      return { rows: [{ quizzes: '2' }], rowCount: 1 };
    }
    if (text.includes('FROM ai_usage')) {
      return { rows: [{ calls: '9' }], rowCount: 1 };
    }
    if (text.includes('FROM video_completions')) {
      return { rows: [{ videos: '1' }], rowCount: 1 };
    }
    throw new Error(`unexpected query in test: ${String(text).slice(0, 80)}`);
  });
});

afterEach(() => {
  process.env = { ...savedEnv };
});

const loadApp = async () => {
  const { default: dashboardRouter } = await import('./dashboard');
  const app = express();
  app.use(express.json());
  app.use('/api/dashboard', dashboardRouter);
  return app;
};

const tokenFor = () =>
  jwt.sign({ userId: 'u-1', email: 'student@example.com' }, 'test-secret');

describe('GET /api/dashboard/recap', () => {
  it('serves week totals plus a zero-filled 7-day series', async () => {
    const app = await loadApp();
    const res = await request(app)
      .get('/api/dashboard/recap')
      .set('Authorization', `Bearer ${tokenFor()}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const d = res.body.data;
    expect(d.tasksCompleted).toBe(3);
    expect(d.xpGained).toBe(120);
    expect(d.quizzesTaken).toBe(2);
    expect(d.aiCalls).toBe(9);
    expect(d.videosCompleted).toBe(1);
    expect(d.streak).toBe(4);
    expect(d.perDay).toHaveLength(7);
    // Quiet days still render slots (axis never shifts).
    expect(d.perDay.every((p: any) => typeof p.date === 'string' && typeof p.xp === 'number')).toBe(true);
    expect(d.activeDays).toBeGreaterThanOrEqual(1);
  });

  it('requires authentication', async () => {
    const app = await loadApp();
    const anon = await request(app).get('/api/dashboard/recap');
    expect(anon.status).toBe(401);
  });

  it('degrades slices to zero instead of 500ing when tables are missing', async () => {
    mockQuery.mockImplementation(async (text: string) => {
      if (text.includes('LEFT JOIN bookmarks')) {
        return { rows: [{ id: 'u-1', role: 'STUDENT', status: 'Active', bookmarks: [] }], rowCount: 1 };
      }
      throw new Error('relation "xp_history" does not exist');
    });
    const app = await loadApp();
    const res = await request(app)
      .get('/api/dashboard/recap')
      .set('Authorization', `Bearer ${tokenFor()}`);
    expect(res.status).toBe(200);
    expect(res.body.data.tasksCompleted).toBe(0);
    expect(res.body.data.perDay).toHaveLength(7);
  });
});
