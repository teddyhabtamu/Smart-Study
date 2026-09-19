import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// Engagement aggregates: DAU/WAU/MAU from last_active_date, 30-day active
// series from event tables, 7-day feature split. Gated + degradation-safe.
const mockQuery = vi.fn();

vi.mock('../database/config', () => ({
  query: mockQuery,
  dbAdmin: {},
  supabaseAdmin: {},
}));

const savedEnv = { ...process.env };
let currentRole = 'ADMIN';

const setTestEnv = () => {
  process.env.DATABASE_URL = 'postgresql://testuser:testpass@localhost:5432/testdb';
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'test-anon-key';
  process.env.JWT_SECRET = 'test-secret';
};

beforeEach(() => {
  setTestEnv();
  currentRole = 'ADMIN';
  mockQuery.mockReset();
  mockQuery.mockImplementation(async (text: string) => {
    // Auth middleware joins bookmarks; profile-shaped selects carry
    // last_active_date too, so this branch must come first.
    if (text.includes('LEFT JOIN bookmarks')) {
      return {
        rows: [{ id: 'admin-1', name: 'A', email: 'a@e.com', role: currentRole, status: 'Active', is_premium: false, bookmarks: [] }],
        rowCount: 1,
      };
    }
    if (text.includes('FROM users')) {
      if (text.includes('last_active_date') && !text.includes('INTERVAL')) {
        return { rows: [{ c: '30' }], rowCount: 1 };
      }
      if (text.includes('last_active_date') && text.includes("'6 days'")) {
        return { rows: [{ c: '12' }], rowCount: 1 };
      }
      if (text.includes('last_active_date')) {
        return { rows: [{ c: '20' }], rowCount: 1 };
      }
      if (text.includes('created_at')) {
        return { rows: [{ c: '4' }], rowCount: 1 };
      }
      return { rows: [{ c: '30' }], rowCount: 1 };
    }
    if (text.includes('COUNT(DISTINCT user_id)')) {
      return { rows: [{ day: '2026-09-18', active: '7' }], rowCount: 1 };
    }
    if (text.includes('FROM ai_usage')) return { rows: [{ c: '45' }], rowCount: 1 };
    if (text.includes("source = 'practice_quiz'")) return { rows: [{ c: '9' }], rowCount: 1 };
    if (text.includes('FROM study_events')) return { rows: [{ c: '20' }], rowCount: 1 };
    if (text.includes('FROM video_completions')) return { rows: [{ c: '4' }], rowCount: 1 };
    if (text.includes('FROM forum_posts')) return { rows: [{ c: '6' }], rowCount: 1 };
    throw new Error(`unexpected query in test: ${String(text).slice(0, 100)}`);
  });
});

afterEach(() => {
  process.env = { ...savedEnv };
});

const loadApp = async () => {
  const { default: adminRouter } = await import('./admin');
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRouter);
  return app;
};

const tokenFor = () =>
  jwt.sign({ userId: 'admin-1', email: 'a@e.com' }, 'test-secret');

describe('GET /api/admin/engagement', () => {
  it('serves DAU/WAU/MAU, 30-day series, and feature split', async () => {
    const app = await loadApp();
    const res = await request(app)
      .get('/api/admin/engagement')
      .set('Authorization', `Bearer ${tokenFor()}`);
    expect(res.status).toBe(200);
    const d = res.body.data;
    expect(d).toMatchObject({ dau: 30, wau: 12, mau: 20, totalUsers: 30, newUsers7d: 4 });
    expect(d.perDay).toHaveLength(30);
    expect(d.features.find((f: any) => f.key === 'ai')).toMatchObject({ count: 45 });
    expect(d.features.find((f: any) => f.key === 'quiz')).toMatchObject({ count: 9 });
  });

  it('rejects students and strangers', async () => {
    const app = await loadApp();
    currentRole = 'STUDENT';
    expect((await request(app).get('/api/admin/engagement').set('Authorization', `Bearer ${tokenFor()}`)).status).toBe(403);
    expect((await request(app).get('/api/admin/engagement')).status).toBe(401);
  });

  it('degrades to zeros (not 500) without the tables', async () => {
    mockQuery.mockImplementation(async (text: string) => {
      if (text.includes('FROM users') && !text.includes('COUNT')) {
        return { rows: [{ id: 'a', role: 'ADMIN', status: 'Active', bookmarks: [] }], rowCount: 1 };
      }
      throw new Error('relation does not exist');
    });
    const app = await loadApp();
    const res = await request(app)
      .get('/api/admin/engagement')
      .set('Authorization', `Bearer ${tokenFor()}`);
    expect(res.status).toBe(200);
    expect(res.body.data.dau).toBe(0);
    expect(res.body.data.perDay).toHaveLength(30);
  });
});
