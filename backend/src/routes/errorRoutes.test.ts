import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// Error pipeline endpoints: unauthenticated client intake (validated +
// always-200) and ADMIN-only summary/resolve. DB faked at the boundary.
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
    if (text.includes('FROM users')) {
      return {
        rows: [{ id: 'admin-1', name: 'Admin', email: 'a@e.com', role: currentRole, status: 'Active', is_premium: false, bookmarks: [] }],
        rowCount: 1,
      };
    }
    if (text.includes('FROM error_log')) {
      return {
        rows: [{
          fingerprint: 'client:abc123', source: 'client', route: '/library',
          message: 'boom', occurrences: '12',
          first_seen_at: new Date('2026-09-18T10:00:00Z'),
          last_seen_at: new Date('2026-09-18T12:00:00Z'), resolved: false,
        }],
        rowCount: 1,
      };
    }
    if (text.includes('INSERT INTO error_log')) {
      return { rows: [], rowCount: 1 };
    }
    if (text.includes('UPDATE error_log')) {
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`unexpected query in test: ${String(text).slice(0, 80)}`);
  });
});

afterEach(() => {
  process.env = { ...savedEnv };
});

const loadApps = async () => {
  const { default: clientErrorsRouter } = await import('./clientErrors');
  const { default: adminRouter } = await import('./admin');
  const intakeApp = express();
  intakeApp.use(express.json());
  intakeApp.use('/api/client-errors', clientErrorsRouter);
  const adminApp = express();
  adminApp.use(express.json());
  adminApp.use('/api/admin', adminRouter);
  return { intakeApp, adminApp };
};

const tokenFor = () =>
  jwt.sign({ userId: 'admin-1', email: 'a@e.com' }, 'test-secret');

describe('POST /api/client-errors', () => {
  it('accepts a report without auth and always 200s', async () => {
    const { intakeApp } = await loadApps();
    const res = await request(intakeApp)
      .post('/api/client-errors')
      .send({ message: 'TypeError: x is null', route: '/library' });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ received: true });
    const insert = mockQuery.mock.calls.find(([sql]: any[]) => String(sql).includes('INSERT INTO error_log'));
    expect(insert).toBeDefined();
  });

  it('400s empty/oversized messages but still 200s when the DB is down', async () => {
    const { intakeApp } = await loadApps();
    const bad = await request(intakeApp).post('/api/client-errors').send({ message: '' });
    expect(bad.status).toBe(400);
    mockQuery.mockImplementation(async (text: string) => {
      if (text.includes('INSERT INTO error_log')) throw new Error('db down');
      throw new Error(`unexpected query in test: ${String(text).slice(0, 80)}`);
    });
    const degraded = await request(intakeApp)
      .post('/api/client-errors')
      .send({ message: 'still fine' });
    expect(degraded.status).toBe(200);
    expect(degraded.body.data).toEqual({ received: true });
  });
});

describe('GET /api/admin/errors + POST /api/admin/errors/resolve', () => {
  it('serves grouped errors to admins, 403/401 to others', async () => {
    const { adminApp } = await loadApps();
    const res = await request(adminApp)
      .get('/api/admin/errors')
      .set('Authorization', `Bearer ${tokenFor()}`);
    expect(res.status).toBe(200);
    expect(res.body.data[0]).toMatchObject({ fingerprint: 'client:abc123', occurrences: 12 });
    currentRole = 'STUDENT';
    expect((await request(adminApp).get('/api/admin/errors').set('Authorization', `Bearer ${tokenFor()}`)).status).toBe(403);
    expect((await request(adminApp).get('/api/admin/errors')).status).toBe(401);
  });

  it('resolves a fingerprint and 400s a missing one', async () => {
    const { adminApp } = await loadApps();
    const ok = await request(adminApp)
      .post('/api/admin/errors/resolve')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({ fingerprint: 'client:abc123' });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toEqual({ resolved: true });
    const bad = await request(adminApp)
      .post('/api/admin/errors/resolve')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({});
    expect(bad.status).toBe(400);
  });
});
