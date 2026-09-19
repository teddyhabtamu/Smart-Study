import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// Per-student AI usage endpoints: admin Top consumers aggregation and the
// authenticated "my usage" summary. DB faked at the query boundary;
// routing, auth, validation and wiring run for real.
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
  process.env.GEMINI_API_KEYS = 'adminkey-one-aaaa,adminkey-two-bbbb';
};

beforeEach(() => {
  setTestEnv();
  currentRole = 'ADMIN';
  mockQuery.mockReset();
  mockQuery.mockImplementation(async (text: string) => {
    // Auth middleware: user lookup.
    if (text.includes('FROM users')) {
      return {
        rows: [{
          id: 'admin-1',
          name: 'Admin',
          email: 'admin@example.com',
          role: currentRole,
          status: 'Active',
          is_premium: false,
          bookmarks: [],
        }],
        rowCount: 1,
      };
    }
    // Admin Top consumers aggregate (joins users for names).
    if (text.includes('JOIN users')) {
      return {
        rows: [
          { user_id: 'u-heavy', name: 'Heavy User', email: 'heavy@example.com', calls: '42', failures: '2', quota_errors: '0', last_used_at: new Date('2026-09-18T10:00:00Z') },
          { user_id: 'u-light', name: 'Light User', email: 'light@example.com', calls: '3', failures: '0', quota_errors: '0', last_used_at: new Date('2026-09-17T10:00:00Z') },
        ],
        rowCount: 2,
      };
    }
    // Own-usage per-route breakdown.
    if (text.includes('GROUP BY route')) {
      return { rows: [{ route: 'chat', calls: '4' }], rowCount: 1 };
    }
    // Own-usage totals.
    if (text.includes('FROM ai_usage')) {
      return {
        rows: [{ calls: '5', failures: '1', last_used_at: new Date('2026-09-18T10:00:00Z') }],
        rowCount: 1,
      };
    }
    throw new Error(`unexpected query in test: ${String(text).slice(0, 80)}`);
  });
});

afterEach(() => {
  process.env = { ...savedEnv };
});

const loadApps = async () => {
  const { default: adminRouter } = await import('./admin');
  const { default: usersRouter } = await import('./users');
  const adminApp = express();
  adminApp.use(express.json());
  adminApp.use('/api/admin', adminRouter);
  const usersApp = express();
  usersApp.use(express.json());
  usersApp.use('/api/users', usersRouter);
  return { adminApp, usersApp };
};

const tokenFor = () =>
  jwt.sign({ userId: 'admin-1', email: 'admin@example.com' }, 'test-secret');

describe('GET /api/admin/ai-usage/top-users', () => {
  it('serves ranked consumers with names to admins', async () => {
    const { adminApp } = await loadApps();
    const res = await request(adminApp)
      .get('/api/admin/ai-usage/top-users')
      .set('Authorization', `Bearer ${tokenFor()}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0]).toMatchObject({ name: 'Heavy User', calls: '42' });
    // Join query must attribute rows to users (guests excluded):
    const joinCall = mockQuery.mock.calls.find(([sql]: any[]) => String(sql).includes('JOIN users'));
    expect(joinCall).toBeDefined();
    expect(String(joinCall[0])).toContain('user_id IS NOT NULL');
  });

  it('rejects students with 403 and strangers with 401', async () => {
    const { adminApp } = await loadApps();
    currentRole = 'STUDENT';
    const denied = await request(adminApp)
      .get('/api/admin/ai-usage/top-users')
      .set('Authorization', `Bearer ${tokenFor()}`);
    expect(denied.status).toBe(403);
    const anon = await request(adminApp).get('/api/admin/ai-usage/top-users');
    expect(anon.status).toBe(401);
  });

  it('400s out-of-range windows, and degrades to [] without the table', async () => {
    const { adminApp } = await loadApps();
    const bad = await request(adminApp)
      .get('/api/admin/ai-usage/top-users?days=999')
      .set('Authorization', `Bearer ${tokenFor()}`);
    expect(bad.status).toBe(400);
    mockQuery.mockImplementation(async (text: string) => {
      if (text.includes('FROM users')) {
        return { rows: [{ id: 'admin-1', role: 'ADMIN', status: 'Active', bookmarks: [] }], rowCount: 1 };
      }
      throw new Error('relation "ai_usage" does not exist');
    });
    const degraded = await request(adminApp)
      .get('/api/admin/ai-usage/top-users')
      .set('Authorization', `Bearer ${tokenFor()}`);
    expect(degraded.status).toBe(200);
    expect(degraded.body.data).toEqual([]);
  });
});

describe('GET /api/users/ai-usage', () => {
  it('serves the caller their own totals + per-route breakdown', async () => {
    const { usersApp } = await loadApps();
    const res = await request(usersApp)
      .get('/api/users/ai-usage')
      .set('Authorization', `Bearer ${tokenFor()}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toMatchObject({ days: 7, totalCalls: 5, failures: 1 });
    expect(res.body.data.byRoute).toEqual([{ route: 'chat', calls: 4 }]);
    expect(res.body.data.lastUsedAt).toContain('2026-09-18');
  });

  it('requires authentication and clamps the window', async () => {
    const { usersApp } = await loadApps();
    const anon = await request(usersApp).get('/api/users/ai-usage');
    expect(anon.status).toBe(401);
    const res = await request(usersApp)
      .get('/api/users/ai-usage?days=9999')
      .set('Authorization', `Bearer ${tokenFor()}`);
    expect(res.status).toBe(200);
    expect(res.body.data.days).toBe(90);
  });
});
