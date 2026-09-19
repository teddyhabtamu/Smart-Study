import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// Lightweight notifications list: auth gating, payload shape (same item
// shape as the profile carries + exact unread count), empty state.
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
    if (text.includes('LEFT JOIN bookmarks')) {
      return {
        rows: [{ id: 'u-1', name: 'S', email: 's@e.com', role: 'STUDENT', status: 'Active', is_premium: false, bookmarks: [] }],
        rowCount: 1,
      };
    }
    if (text.includes('FROM notifications')) {
      return {
        rows: [{
          notifications: [{ id: 'n-1', title: 'Hi', message: 'm', type: 'INFO', isRead: false, date: new Date() }],
          unread_count: 1,
        }],
        rowCount: 1,
      };
    }
    throw new Error(`unexpected query in test: ${String(text).slice(0, 100)}`);
  });
});

afterEach(() => {
  process.env = { ...savedEnv };
});

const loadApp = async () => {
  const { default: usersRouter } = await import('./users');
  const app = express();
  app.use(express.json());
  app.use('/api/users', usersRouter);
  return app;
};

const tokenFor = () =>
  jwt.sign({ userId: 'u-1', email: 's@e.com' }, 'test-secret');

describe('GET /api/users/notifications', () => {
  it('serves the list + exact unread count without the profile payload', async () => {
    const app = await loadApp();
    const res = await request(app)
      .get('/api/users/notifications')
      .set('Authorization', `Bearer ${tokenFor()}`);
    expect(res.status).toBe(200);
    expect(res.body.data.notifications).toHaveLength(1);
    expect(res.body.data.unreadCount).toBe(1);
    expect(res.body.data).not.toHaveProperty('bookmarks');
    expect(res.body.data).not.toHaveProperty('xp');
  });

  it('requires authentication', async () => {
    const app = await loadApp();
    expect((await request(app).get('/api/users/notifications')).status).toBe(401);
  });
});
