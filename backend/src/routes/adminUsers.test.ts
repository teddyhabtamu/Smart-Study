import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// Admin user management: Inactive status on the list filter, soft-delete
// (status → Inactive) with self-guard + idempotency, and referral counting
// that ignores deactivated referees.
const mockQuery = vi.fn();
const mockDbAdmin = {
  findOne: vi.fn(),
  update: vi.fn(),
  insert: vi.fn(),
  delete: vi.fn(),
  get: vi.fn(),
};

vi.mock('../database/config', () => ({
  query: (...args: any[]) => mockQuery(...args),
  dbAdmin: mockDbAdmin,
  supabaseAdmin: {},
}));

const savedEnv = { ...process.env };
const setTestEnv = () => {
  process.env.DATABASE_URL = 'postgresql://testuser:testpass@localhost:5432/testdb';
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'test-anon-key';
  process.env.JWT_SECRET = 'test-secret';
};

const adminRow = (overrides: any = {}) => ({
  id: 'admin-1', name: 'Admin', email: 'a@e.com', role: 'ADMIN',
  status: 'Active', is_premium: false, bookmarks: [], ...overrides,
});
const targetRow = (overrides: any = {}) => ({
  id: 'u-9', name: 'Test Account', email: 't@e.com', role: 'STUDENT',
  status: 'Active', is_premium: false, ...overrides,
});

beforeEach(() => {
  setTestEnv();
  mockQuery.mockReset();
  mockDbAdmin.findOne.mockReset();
  mockDbAdmin.update.mockReset();
  mockDbAdmin.insert.mockReset();
  mockDbAdmin.delete.mockReset();
  mockDbAdmin.get.mockReset();
  mockDbAdmin.findOne.mockResolvedValue(targetRow());
  mockDbAdmin.update.mockResolvedValue({});
  mockDbAdmin.insert.mockResolvedValue({ id: 'n-1' });
  mockQuery.mockImplementation(async (text: string) => {
    if (text.includes('LEFT JOIN bookmarks')) return { rows: [adminRow()], rowCount: 1 };
    if (text.includes('SELECT COUNT(*) as total FROM users')) {
      return { rows: [{ total: '1' }], rowCount: 1 };
    }
    if (text.includes('FROM users') && text.includes('ORDER BY created_at DESC')) {
      return { rows: [targetRow()], rowCount: 1 };
    }
    throw new Error(`unexpected query in test: ${String(text).slice(0, 120)}`);
  });
});

afterEach(() => {
  process.env = { ...savedEnv };
});

const loadAdminApp = async () => {
  const { default: adminRouter } = await import('./admin');
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRouter);
  return app;
};

const tokenFor = (userId = 'admin-1') =>
  jwt.sign({ userId, email: 'a@e.com' }, 'test-secret');

describe('admin users list status filter', () => {
  it('accepts status=Inactive and scopes SQL to it', async () => {
    const app = await loadAdminApp();
    const res = await request(app)
      .get('/api/admin/users')
      .query({ status: 'Inactive', role: 'STUDENT' })
      .set('Authorization', `Bearer ${tokenFor()}`);
    expect(res.status).toBe(200);
    const listCall = mockQuery.mock.calls.find(([sql]: any[]) =>
      String(sql).includes('ORDER BY created_at DESC'));
    expect(listCall).toBeDefined();
    expect(String(listCall[0])).toContain(`status = 'Inactive'`);
  });

  it('rejects unknown statuses', async () => {
    const app = await loadAdminApp();
    const res = await request(app)
      .get('/api/admin/users')
      .query({ status: 'Ghosted' })
      .set('Authorization', `Bearer ${tokenFor()}`);
    expect(res.status).toBe(400);
  });
});

describe('admin soft-delete (deactivate) user', () => {
  it('deactivates an active test account (soft, reversible)', async () => {
    const app = await loadAdminApp();
    const res = await request(app)
      .delete('/api/admin/users/u-9')
      .set('Authorization', `Bearer ${tokenFor()}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/deactivated/i);
    expect(mockDbAdmin.update).toHaveBeenCalledWith(
      'users', 'u-9', expect.objectContaining({ status: 'Inactive' })
    );
  });

  it('is idempotent on an already-inactive account', async () => {
    mockDbAdmin.findOne.mockResolvedValue(targetRow({ status: 'Inactive' }));
    const app = await loadAdminApp();
    const res = await request(app)
      .delete('/api/admin/users/u-9')
      .set('Authorization', `Bearer ${tokenFor()}`);
    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/already deactivated/i);
    expect(mockDbAdmin.update).not.toHaveBeenCalled();
  });

  it('refuses self-deactivation with SELF_ACTION', async () => {
    // Actor and target are the same admin: the auth lookup returns the
    // admin under the target id, the endpoint must still refuse.
    mockQuery.mockImplementation(async (text: string) => {
      if (text.includes('LEFT JOIN bookmarks')) {
        return { rows: [adminRow({ id: 'u-9' })], rowCount: 1 };
      }
      throw new Error(`unexpected query in test: ${String(text).slice(0, 120)}`);
    });
    const app = await loadAdminApp();
    const res = await request(app)
      .delete('/api/admin/users/u-9')
      .set('Authorization', `Bearer ${tokenFor('u-9')}`);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('SELF_ACTION');
    expect(mockDbAdmin.update).not.toHaveBeenCalled();
  });

  it('404s unknown users', async () => {
    mockDbAdmin.findOne.mockResolvedValue(null);
    const app = await loadAdminApp();
    const res = await request(app)
      .delete('/api/admin/users/nope')
      .set('Authorization', `Bearer ${tokenFor()}`);
    expect(res.status).toBe(404);
  });
});

describe('deactivated referees stop counting', () => {
  it('reward trigger excludes Inactive referees', async () => {
    mockQuery.mockImplementation(async (text: string) => {
      if (text.includes('FROM referral_rewards WHERE referrer_id') && text.includes("status = 'pending'")) {
        return { rows: [], rowCount: 0 };
      }
      if (text.includes('FROM referrals r') && text.includes('JOIN users u ON u.id = r.referee_id')) {
        return { rows: [], rowCount: 0 };
      }
      throw new Error(`unexpected query in test: ${String(text).slice(0, 120)}`);
    });
    const { maybeCreateReferralReward } = await import('../services/referralService');
    await maybeCreateReferralReward('referrer-9');
    const earnedCall = mockQuery.mock.calls.find(([sql]: any[]) =>
      String(sql).includes('FROM referrals r') && String(sql).includes('JOIN users u'));
    expect(earnedCall).toBeDefined();
    expect(String(earnedCall[0])).toContain(`IS DISTINCT FROM 'Inactive'`);
  });

  it('referral progress bar excludes Inactive referees', async () => {
    mockQuery.mockImplementation(async (text: string) => {
      if (text.includes('LEFT JOIN bookmarks')) {
        return { rows: [{ ...adminRow(), id: 'u-1', role: 'STUDENT' }], rowCount: 1 };
      }
      if (text.includes('SELECT referral_code FROM users WHERE id = $1')) {
        return { rows: [{ referral_code: 'MINECODE' }], rowCount: 1 };
      }
      if (text.includes('FROM referral_rewards') && text.includes('ORDER BY created_at DESC LIMIT 1')) {
        return { rows: [], rowCount: 0 };
      }
      if (text.includes('FROM referrals r JOIN users u ON u.id = r.referee_id')) {
        return {
          rows: [
            { qualified_at: new Date().toISOString(), created_at: new Date().toISOString(), email: 'gone@e.com', status: 'Inactive' },
            { qualified_at: new Date().toISOString(), created_at: new Date().toISOString(), email: 'here@e.com', status: 'Active' },
          ],
          rowCount: 2,
        };
      }
      throw new Error(`unexpected query in test: ${String(text).slice(0, 120)}`);
    });
    const { default: subscriptionRouter } = await import('./subscription');
    const app = express();
    app.use(express.json());
    app.use('/api/subscription', subscriptionRouter);
    const res = await request(app)
      .get('/api/subscription/referrals/mine')
      .set('Authorization', `Bearer ${tokenFor('u-1')}`);
    expect(res.status).toBe(200);
    expect(res.body.data.qualifiedCount).toBe(1);
  });
});
