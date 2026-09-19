import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// Dashboard payload: todays events, bookmarks, progress, and the upcoming
// exam for the countdown chip. DB faked at the query boundary.
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

const profileRow = {
  id: 'u-1', name: 'Student', xp: 120, level: 1, streak: 3,
  is_premium: false, bookmarks: [],
};

let examRows: any[] = [];

beforeEach(() => {
  setTestEnv();
  examRows = [{ title: 'Physics final', event_date: '2026-10-20' }];
  mockQuery.mockReset();
  mockQuery.mockImplementation(async (text: string) => {
    // Auth middleware + profile query both join bookmarks.
    if (text.includes('LEFT JOIN bookmarks')) {
      return { rows: [{ ...profileRow, role: 'STUDENT', status: 'Active', email: 's@e.com' }], rowCount: 1 };
    }
    // Upcoming-exam lookup (LIMIT 1) before the generic events branch.
    if (text.includes('FROM study_events') && text.includes('LIMIT 1')) {
      return { rows: examRows, rowCount: examRows.length };
    }
    if (text.includes('FROM study_events')) return { rows: [], rowCount: 0 };
    if (text.includes('FROM bookmarks')) return { rows: [], rowCount: 0 };
    throw new Error(`unexpected query in test: ${String(text).slice(0, 100)}`);
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
  jwt.sign({ userId: 'u-1', email: 's@e.com' }, 'test-secret');

describe('GET /api/dashboard', () => {
  it('includes the next upcoming exam for the countdown chip', async () => {
    const app = await loadApp();
    const res = await request(app)
      .get('/api/dashboard')
      .set('Authorization', `Bearer ${tokenFor()}`);
    expect(res.status).toBe(200);
    expect(res.body.data.upcomingExam).toEqual({ title: 'Physics final', date: '2026-10-20' });
  });

  it('returns null (not a failure) with no exams scheduled', async () => {
    examRows = [];
    const app = await loadApp();
    const res = await request(app)
      .get('/api/dashboard')
      .set('Authorization', `Bearer ${tokenFor()}`);
    expect(res.status).toBe(200);
    expect(res.body.data.upcomingExam).toBeNull();
  });

  it('requires authentication', async () => {
    const app = await loadApp();
    expect((await request(app).get('/api/dashboard')).status).toBe(401);
  });
});
