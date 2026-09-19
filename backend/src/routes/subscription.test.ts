import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// Pro payment claims: identity-linked receipt queue. Unauthenticated users
// get 401 everywhere; repeat claims return the existing pending row;
// approval through the premium toggle auto-settles pending claims.
const mockQuery = vi.fn();
const mockDbAdmin = {
  findOne: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
};

vi.mock('../database/config', () => ({
  query: mockQuery,
  dbAdmin: mockDbAdmin,
  supabaseAdmin: {},
}));

const savedEnv = { ...process.env };
let currentRole = 'STUDENT';

const setTestEnv = () => {
  process.env.DATABASE_URL = 'postgresql://testuser:testpass@localhost:5432/testdb';
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'test-anon-key';
  process.env.JWT_SECRET = 'test-secret';
};

const userRow = (overrides: any = {}) => ({
  id: 'u-1', name: 'Student', email: 's@e.com', role: currentRole,
  status: 'Active', is_premium: false, bookmarks: [], ...overrides,
});

beforeEach(() => {
  setTestEnv();
  currentRole = 'STUDENT';
  mockQuery.mockReset();
  mockDbAdmin.findOne.mockReset();
  mockDbAdmin.update.mockReset();
  mockDbAdmin.insert.mockReset();
  mockDbAdmin.findOne.mockResolvedValue(userRow());
  mockDbAdmin.update.mockResolvedValue({});
  mockDbAdmin.insert.mockResolvedValue({ id: 'n-1' });
  mockQuery.mockImplementation(async (text: string) => {
    if (text.includes('LEFT JOIN bookmarks')) return { rows: [userRow()], rowCount: 1 };
    if (text.includes('FROM payment_claims') && text.includes("status = 'pending'") && text.includes('user_id')) {
      return { rows: [], rowCount: 0 };
    }
    if (text.includes('FROM payment_claims') && text.includes('ORDER BY')) {
      return { rows: [], rowCount: 0 };
    }
    if (text.includes('INSERT INTO payment_claims')) {
      return { rows: [{ id: 'c-1', status: 'pending', transaction_ref: null, created_at: new Date() }], rowCount: 1 };
    }
    if (text.includes('FROM users WHERE role')) return { rows: [], rowCount: 0 };
    if (text.includes('UPDATE payment_claims')) return { rows: [], rowCount: 1 };
    throw new Error(`unexpected query in test: ${String(text).slice(0, 100)}`);
  });
});

afterEach(() => {
  process.env = { ...savedEnv };
});

const loadApps = async () => {
  const { default: subscriptionRouter } = await import('./subscription');
  const { default: adminRouter } = await import('./admin');
  const subApp = express();
  subApp.use(express.json());
  subApp.use('/api/subscription', subscriptionRouter);
  const adminApp = express();
  adminApp.use(express.json());
  adminApp.use('/api/admin', adminRouter);
  return { subApp, adminApp };
};

const tokenFor = (userId = 'u-1') =>
  jwt.sign({ userId, email: 's@e.com' }, 'test-secret');

describe('POST /api/subscription/claim', () => {
  it('creates a claim linking payer identity, 401s strangers', async () => {
    const { subApp } = await loadApps();
    const anon = await request(subApp).post('/api/subscription/claim').send({});
    expect(anon.status).toBe(401);
    const res = await request(subApp)
      .post('/api/subscription/claim')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({ transactionRef: 'TX123' });
    expect(res.status).toBe(200);
    const insert = mockQuery.mock.calls.find(([sql]: any[]) =>
      String(sql).includes('INSERT INTO payment_claims'));
    expect(insert).toBeDefined();
    expect(insert[1]).toEqual(['u-1', 'TX123']);
  });

  it('notifies admins inline and reports the count (never fire-and-forget)', async () => {
    mockQuery.mockImplementation(async (text: string) => {
      if (text.includes('LEFT JOIN bookmarks')) return { rows: [userRow()], rowCount: 1 };
      if (text.includes('FROM payment_claims')) return { rows: [], rowCount: 0 };
      if (text.includes('INSERT INTO payment_claims')) {
        return { rows: [{ id: 'c-1', status: 'pending', transaction_ref: null, created_at: new Date() }], rowCount: 1 };
      }
      if (text.includes("FROM users WHERE role")) {
        return { rows: [{ id: 'admin-9' }], rowCount: 1 };
      }
      throw new Error(`unexpected query in test: ${String(text).slice(0, 100)}`);
    });
    const { subApp } = await loadApps();
    const res = await request(subApp)
      .post('/api/subscription/claim')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({});
    expect(res.status).toBe(200);
    // Awaited delivery: the insert (not just the claim row) completed
    // before the response — the production bug was a void async block that
    // died on runtime suspend.
    expect(mockDbAdmin.insert).toHaveBeenCalledWith(
      'notifications',
      expect.objectContaining({ user_id: 'admin-9', title: 'New Pro payment claim' })
    );
    expect(res.body.data.notifiedAdmins).toBe(1);
  });

  it('returns the existing pending row instead of duplicating', async () => {
    mockQuery.mockImplementation(async (text: string) => {
      if (text.includes('LEFT JOIN bookmarks')) return { rows: [userRow()], rowCount: 1 };
      if (text.includes('FROM payment_claims') && text.includes("status = 'pending'")) {
        return { rows: [{ id: 'c-old', status: 'pending', transaction_ref: null, created_at: new Date() }], rowCount: 1 };
      }
      throw new Error(`unexpected query in test: ${String(text).slice(0, 100)}`);
    });
    const { subApp } = await loadApps();
    const res = await request(subApp)
      .post('/api/subscription/claim')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('c-old');
    expect(mockQuery.mock.calls.some(([sql]: any[]) => String(sql).includes('INSERT INTO payment_claims'))).toBe(false);
  });

  it('GET /claim/mine returns the latest claim or null', async () => {
    const { subApp } = await loadApps();
    mockQuery.mockImplementation(async (text: string) => {
      if (text.includes('LEFT JOIN bookmarks')) return { rows: [userRow()], rowCount: 1 };
      if (text.includes('FROM payment_claims')) {
        return { rows: [{ id: 'c-1', status: 'approved', transaction_ref: 'TX', created_at: new Date(), decided_at: new Date() }], rowCount: 1 };
      }
      throw new Error(`unexpected query in test: ${String(text).slice(0, 100)}`);
    });
    const res = await request(subApp)
      .get('/api/subscription/claim/mine')
      .set('Authorization', `Bearer ${tokenFor()}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('approved');
  });
});

describe('admin payment claims', () => {
  it('lists the queue for admins, 403s students', async () => {
    currentRole = 'ADMIN';
    const { adminApp } = await loadApps();
    const res = await request(adminApp)
      .get('/api/admin/payment-claims')
      .set('Authorization', `Bearer ${tokenFor('admin-1')}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    currentRole = 'STUDENT';
    expect((await request(adminApp).get('/api/admin/payment-claims').set('Authorization', `Bearer ${tokenFor()}`)).status).toBe(403);
  });

  it('upgrading via the premium toggle auto-approves pending claims', async () => {
    currentRole = 'ADMIN';
    const { adminApp } = await loadApps();
    const res = await request(adminApp)
      .put('/api/admin/users/u-1/premium')
      .set('Authorization', `Bearer ${tokenFor('admin-1')}`)
      .send({ isPremium: true });
    expect(res.status).toBe(200);
    const approve = mockQuery.mock.calls.find(([sql]: any[]) =>
      String(sql).includes('UPDATE payment_claims') && String(sql).includes("'approved'"));
    expect(approve).toBeDefined();
    expect(approve[1][1]).toBe('u-1');
  });

  it('rejects a pending claim by id', async () => {
    currentRole = 'ADMIN';
    const { adminApp } = await loadApps();
    const res = await request(adminApp)
      .post('/api/admin/payment-claims/c-9/reject')
      .set('Authorization', `Bearer ${tokenFor('admin-1')}`)
      .send({});
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ rejected: true });
  });
});
