import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// Referral program: ?ref=CODE captured at register, qualification on email
// verify, pending reward + admin ping at 5, approve stacks +1 Pro month,
// reject releases the referees. One pending reward per referrer max.
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

// Pending-reward + earned-count fixtures, overridable per test.
let pendingRewards: any[] = [];
let earnedCount = 0;

beforeEach(() => {
  setTestEnv();
  currentRole = 'STUDENT';
  pendingRewards = [];
  earnedCount = 0;
  mockQuery.mockReset();
  mockDbAdmin.findOne.mockReset();
  mockDbAdmin.update.mockReset();
  mockDbAdmin.insert.mockReset();
  mockDbAdmin.findOne.mockResolvedValue(userRow());
  mockDbAdmin.update.mockResolvedValue({});
  mockDbAdmin.insert.mockResolvedValue({ id: 'n-1' });
  mockQuery.mockImplementation(async (text: string, params?: any[]) => {
    if (text.includes('LEFT JOIN bookmarks')) return { rows: [userRow()], rowCount: 1 };
    // Register: existing-email check vs referrer lookup vs mint collision.
    if (text.includes('SELECT id FROM users WHERE email = $1')) return { rows: [], rowCount: 0 };
    if (text.includes('SELECT id FROM users WHERE referral_code = $1')) {
      if (params?.[0] === 'FRIEND1') return { rows: [{ id: 'referrer-9' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    }
    if (text.includes('INSERT INTO users (name, email')) {
      return { rows: [{ id: 'new-1', name: 'New', email: 'n@e.com', role: 'STUDENT' }], rowCount: 1 };
    }
    if (text.includes('INSERT INTO tokens')) return { rows: [], rowCount: 1 };
    if (text.includes('INSERT INTO referrals')) return { rows: [], rowCount: 1 };
    // Verify-email flow.
    if (text.includes('FROM tokens WHERE token')) {
      return { rows: [{ token: 't', user_id: 'referee-1', type: 'email-verification', expires_at: new Date(Date.now() + 3600e3), used_at: null }], rowCount: 1 };
    }
    if (text.includes('UPDATE users SET email_verified = true')) return { rows: [], rowCount: 1 };
    if (text.includes('UPDATE tokens SET used_at')) return { rows: [], rowCount: 1 };
    if (text.includes('UPDATE referrals SET qualified_at')) {
      return { rows: [{ referrer_id: 'referrer-9' }], rowCount: 1 };
    }
    // Reward trigger reads.
    if (text.includes('FROM referral_rewards WHERE referrer_id') && text.includes("status = 'pending'")) {
      return { rows: pendingRewards, rowCount: pendingRewards.length };
    }
    if (text.includes('FROM referrals r') && text.includes('JOIN users u ON u.id = r.referee_id')) {
      const ids = Array.from({ length: earnedCount }, (_, i) => ({ id: `ref-${i}` }));
      return { rows: ids, rowCount: ids.length };
    }
    if (text.includes('INSERT INTO referral_rewards')) {
      return { rows: [{ id: 'rw-1' }], rowCount: 1 };
    }
    if (text.includes('UPDATE referrals SET reward_id = $1')) return { rows: [], rowCount: 1 };
    if (text.includes("FROM users WHERE role = 'ADMIN'")) return { rows: [{ id: 'admin-9' }], rowCount: 1 };
    if (text.includes('SELECT name, email FROM users WHERE id = $1')) {
      return { rows: [{ name: 'Referrer', email: 'r@e.com' }], rowCount: 1 };
    }
    // Mine endpoint.
    if (text.includes('SELECT referral_code FROM users WHERE id = $1')) {
      return { rows: [{ referral_code: 'MINECODE' }], rowCount: 1 };
    }
    if (text.includes('FROM referrals r JOIN users u ON u.id = r.referee_id') && text.includes('r.reward_id IS NULL')) {
      return { rows: [], rowCount: 0 };
    }
    if (text.includes('FROM referral_rewards') && text.includes('ORDER BY created_at DESC LIMIT 1')) {
      return { rows: [], rowCount: 0 };
    }
    // Admin queue + decisions.
    if (text.includes('FROM referral_rewards rw JOIN users u ON u.id = rw.referrer_id')) {
      return { rows: [], rowCount: 0 };
    }
    if (text.includes('SELECT id, referrer_id, status FROM referral_rewards WHERE id = $1')) {
      return { rows: [{ id: 'rw-1', referrer_id: 'referrer-9', status: 'pending' }], rowCount: 1 };
    }
    if (text.includes('UPDATE users') && text.includes("INTERVAL '1 month'")) {
      return { rows: [{ is_premium: true, premium_until: new Date(Date.now() + 30 * 86400e3) }], rowCount: 1 };
    }
    if (text.includes("UPDATE referral_rewards SET status = 'approved'")) return { rows: [], rowCount: 1 };
    if (text.includes("UPDATE referral_rewards SET status = 'rejected'")) {
      return { rows: [{ referrer_id: 'referrer-9' }], rowCount: 1 };
    }
    if (text.includes('UPDATE referrals SET reward_id = NULL')) return { rows: [], rowCount: 1 };
    if (text.includes('SELECT email, name FROM users WHERE id = $1')) {
      return { rows: [{ email: 'r@e.com', name: 'Referrer' }], rowCount: 1 };
    }
    if (text.includes('SELECT id, name, email, role, email_verified')) {
      return { rows: [{ ...userRow(), email_verified: true }], rowCount: 1 };
    }
    throw new Error(`unexpected query in test: ${String(text).slice(0, 120)}`);
  });
});

afterEach(() => {
  process.env = { ...savedEnv };
});

const loadApps = async () => {
  const { default: authRouter } = await import('./auth');
  const { default: subscriptionRouter } = await import('./subscription');
  const { default: adminRouter } = await import('./admin');
  const mk = (mount: string, r: any) => {
    const app = express();
    app.use(express.json());
    app.use(mount, r);
    return app;
  };
  return { authApp: mk('/api/auth', authRouter), subApp: mk('/api/subscription', subscriptionRouter), adminApp: mk('/api/admin', adminRouter) };
};

const tokenFor = (userId = 'u-1') =>
  jwt.sign({ userId, email: 's@e.com' }, 'test-secret');

describe('referral capture at register', () => {
  it('links referred_by + referral row on a valid code, mints own code', async () => {
    const { authApp } = await loadApps();
    const res = await request(authApp)
      .post('/api/auth/register')
      .send({ name: 'New User', email: 'n@e.com', password: 'secret123', referralCode: 'friend1' });
    expect(res.status).toBe(201);
    const insert = mockQuery.mock.calls.find(([sql]: any[]) =>
      String(sql).includes('INSERT INTO users (name, email'));
    expect(insert).toBeDefined();
    // referred_by = resolved referrer id (6th param).
    expect(insert[1][5]).toBe('referrer-9');
    const link = mockQuery.mock.calls.find(([sql]: any[]) =>
      String(sql).includes('INSERT INTO referrals'));
    expect(link[1]).toEqual(['referrer-9', 'new-1']);
  });

  it('unknown code never blocks registration', async () => {
    const { authApp } = await loadApps();
    const res = await request(authApp)
      .post('/api/auth/register')
      .send({ name: 'New User', email: 'n@e.com', password: 'secret123', referralCode: 'NOPE1234' });
    expect(res.status).toBe(201);
    expect(mockQuery.mock.calls.some(([sql]: any[]) =>
      String(sql).includes('INSERT INTO referrals'))).toBe(false);
  });
});

describe('verify-email qualification + reward trigger', () => {
  it('4th verify qualifies without reward or admin ping', async () => {
    earnedCount = 4;
    const { authApp } = await loadApps();
    const res = await request(authApp).get('/api/auth/verify-email').query({ token: 't' });
    expect(res.status).toBe(200);
    const stamp = mockQuery.mock.calls.find(([sql]: any[]) =>
      String(sql).includes('UPDATE referrals SET qualified_at'));
    expect(stamp).toBeDefined();
    expect(mockQuery.mock.calls.some(([sql]: any[]) =>
      String(sql).includes('INSERT INTO referral_rewards'))).toBe(false);
    expect(mockDbAdmin.insert.mock.calls.some((c: any[]) =>
      c[0] === 'notifications' && String(JSON.stringify(c[1])).includes('Referral reward ready'))).toBe(false);
  });

  it('5th verify creates the pending reward and pings admins (awaited)', async () => {
    earnedCount = 5;
    const { authApp } = await loadApps();
    const res = await request(authApp).get('/api/auth/verify-email').query({ token: 't' });
    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls.some(([sql]: any[]) =>
      String(sql).includes('INSERT INTO referral_rewards'))).toBe(true);
    // Awaited delivery: the notification insert completed before verify
    // responded (same guarantee as payment-claim pings).
    expect(mockDbAdmin.insert.mock.calls.some((c: any[]) =>
      c[0] === 'notifications' && String(JSON.stringify(c[1])).includes('Referral reward ready'))).toBe(true);
  });

  it('never stacks a second pending reward', async () => {
    earnedCount = 9;
    pendingRewards = [{ id: 'rw-old' }];
    const { authApp } = await loadApps();
    const res = await request(authApp).get('/api/auth/verify-email').query({ token: 't' });
    expect(res.status).toBe(200);
    expect(mockQuery.mock.calls.some(([sql]: any[]) =>
      String(sql).includes('INSERT INTO referral_rewards'))).toBe(false);
  });
});

describe('student referral dashboard', () => {
  it('returns code, threshold and counts for the logged-in user', async () => {
    const { subApp } = await loadApps();
    const res = await request(subApp)
      .get('/api/subscription/referrals/mine')
      .set('Authorization', `Bearer ${tokenFor()}`);
    expect(res.status).toBe(200);
    expect(res.body.data.code).toBe('MINECODE');
    expect(res.body.data.required).toBe(5);
    expect(res.body.data.rewardMonths).toBe(1);
  });

  it('401s strangers', async () => {
    const { subApp } = await loadApps();
    expect((await request(subApp).get('/api/subscription/referrals/mine')).status).toBe(401);
  });
});

describe('admin referral rewards', () => {
  it('approve stacks +1 Pro month and notifies the referrer', async () => {
    currentRole = 'ADMIN';
    const { adminApp } = await loadApps();
    const res = await request(adminApp)
      .post('/api/admin/referral-rewards/rw-1/approve')
      .set('Authorization', `Bearer ${tokenFor()}`);
    expect(res.status).toBe(200);
    expect(res.body.data.approved).toBe(true);
    const grant = mockQuery.mock.calls.find(([sql]: any[]) =>
      String(sql).includes("INTERVAL '1 month'"));
    expect(grant).toBeDefined();
    expect(mockDbAdmin.insert.mock.calls.some((c: any[]) =>
      c[0] === 'notifications' && String(JSON.stringify(c[1])).includes('Pro reward unlocked'))).toBe(true);
  });

  it('reject releases the referees and tells the referrer', async () => {
    currentRole = 'ADMIN';
    const { adminApp } = await loadApps();
    const res = await request(adminApp)
      .post('/api/admin/referral-rewards/rw-1/reject')
      .set('Authorization', `Bearer ${tokenFor()}`);
    expect(res.status).toBe(200);
    expect(res.body.data.rejected).toBe(true);
    expect(mockQuery.mock.calls.some(([sql]: any[]) =>
      String(sql).includes('UPDATE referrals SET reward_id = NULL'))).toBe(true);
  });

  it('students get 403 on the queue and decisions', async () => {
    currentRole = 'STUDENT';
    const { adminApp } = await loadApps();
    const auth = { Authorization: `Bearer ${tokenFor()}` };
    expect((await request(adminApp).get('/api/admin/referral-rewards').set(auth)).status).toBe(403);
    expect((await request(adminApp).post('/api/admin/referral-rewards/rw-1/approve').set(auth)).status).toBe(403);
    expect((await request(adminApp).post('/api/admin/referral-rewards/rw-1/reject').set(auth)).status).toBe(403);
  });
});
