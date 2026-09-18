import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Hermetic env (see pushService.test.ts): neutralize dotenv so a real
// backend/.env carrying VAPID keys can't resurrect them mid-suite and
// flip the no-key 503 test into a configured-path test.
vi.mock('dotenv', () => ({ default: { config: vi.fn() } }));
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// Push subscribe/unsubscribe contract: auth gating, shape validation,
// no-key 503, upsert + idempotent delete. The DB facade is mocked; only
// validation and wiring run for real.
const mockQuery = vi.fn();

vi.mock('../database/config', () => ({
  query: mockQuery,
  dbAdmin: {},
}));

const savedEnv = { ...process.env };

const setTestEnv = (withKeys = true) => {
  process.env.DATABASE_URL = 'postgresql://testuser:testpass@localhost:5432/testdb';
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'test-anon-key';
  process.env.JWT_SECRET = 'test-secret';
  process.env.GOOGLE_CLIENT_ID = 'test-google-id';
  process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret';
  process.env.FRONTEND_URL = 'http://localhost:5173';
  process.env.BACKEND_URL = 'http://localhost:5000';
  process.env.VAPID_PUBLIC_KEY =
    'BCoZ2aJefX8xlHeaQER_Gr9OTK9z1WfAf9XYCWEQy4r3iDyl-T59BtmhvW9vtAcSKFiFbLDDobSF9OnXAHZnZXY';
  if (withKeys) {
    process.env.VAPID_PRIVATE_KEY = 'rMBfGvUb9XST_o-AnK8o7WwzYJIzShPPkWLkJ438B_E';
  } else {
    delete process.env.VAPID_PRIVATE_KEY;
  }
};

beforeEach(() => {
  setTestEnv();
  mockQuery.mockReset();
  mockQuery.mockImplementation(async (text: string) => {
    if (text.includes('FROM users')) {
      return {
        rows: [{
          id: 'user-1',
          name: 'Test Student',
          email: 'student@example.com',
          role: 'STUDENT',
          status: 'Active',
          is_premium: true,
          bookmarks: [],
        }],
        rowCount: 1,
      };
    }
    if (text.startsWith('INSERT INTO push_subscriptions')) {
      return { rows: [{ id: 'sub-1' }], rowCount: 1 };
    }
    if (text.startsWith('DELETE FROM push_subscriptions')) {
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`unexpected query in test: ${String(text).slice(0, 80)}`);
  });
});

afterEach(() => {
  process.env = { ...savedEnv };
});

const loadApp = async () => {
  const { default: pushRouter } = await import('./push');
  const app = express();
  app.use(express.json());
  app.use('/api/push', pushRouter);
  return app;
};

const tokenFor = () =>
  jwt.sign({ userId: 'user-1', email: 'student@example.com', role: 'STUDENT' }, 'test-secret');

const validBody = () => ({
  endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint-123',
  keys: { p256dh: 'test-p256dh-key-material-ok', auth: 'test-auth-secret-ok' },
});

describe('POST /api/push/subscribe', () => {
  it('rejects missing token with 401', async () => {
    const app = await loadApp();
    const res = await request(app).post('/api/push/subscribe').send(validBody());
    expect(res.status).toBe(401);
  });

  it('rejects shape violations with 400', async () => {
    const app = await loadApp();
    const token = tokenFor();
    const noKeys = await request(app)
      .post('/api/push/subscribe')
      .set('Authorization', `Bearer ${token}`)
      .send({ endpoint: validBody().endpoint });
    expect(noKeys.status).toBe(400);
    const noEndpoint = await request(app)
      .post('/api/push/subscribe')
      .set('Authorization', `Bearer ${token}`)
      .send({ keys: validBody().keys });
    expect(noEndpoint.status).toBe(400);
  });

  it('rejects non-https and junk-key subscriptions with 400', async () => {
    const app = await loadApp();
    const token = tokenFor();
    for (const body of [
      { ...validBody(), endpoint: 'http://evil.example.com/push' },
      { ...validBody(), endpoint: 'not-a-url' },
      { ...validBody(), keys: { p256dh: 'x', auth: 'y' } },
    ]) {
      const res = await request(app)
        .post('/api/push/subscribe')
        .set('Authorization', `Bearer ${token}`)
        .send(body);
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Invalid push subscription');
    }
  });

  it('upserts a valid subscription with 201', async () => {
    const app = await loadApp();
    const res = await request(app)
      .post('/api/push/subscribe')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send(validBody());
    expect(res.status).toBe(201);
    expect(res.body.data).toEqual({ subscribed: true });
    const insertCall = mockQuery.mock.calls.find(([sql]: any[]) =>
      String(sql).startsWith('INSERT INTO push_subscriptions')
    );
    expect(insertCall).toBeDefined();
    expect(String(insertCall![0])).toContain('ON CONFLICT (endpoint) DO UPDATE');
    expect(insertCall![1].slice(0, 4)).toEqual([
      'user-1',
      validBody().endpoint,
      'test-p256dh-key-material-ok',
      'test-auth-secret-ok',
    ]);
  });

  it('answers 503 without leaking internals when VAPID is unconfigured', async () => {
    vi.resetModules();
    setTestEnv(false);
    const { default: pushRouter } = await import('./push');
    const app = express();
    app.use(express.json());
    app.use('/api/push', pushRouter);
    const res = await request(app)
      .post('/api/push/subscribe')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send(validBody());
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('PUSH_NOT_CONFIGURED');
  });
});

describe('DELETE /api/push/unsubscribe', () => {
  it('rejects missing token with 401 and missing endpoint with 400', async () => {
    const app = await loadApp();
    expect((await request(app).delete('/api/push/unsubscribe').send({})).status).toBe(401);
    const res = await request(app)
      .delete('/api/push/unsubscribe')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('removes idempotently with 200', async () => {
    const app = await loadApp();
    const res = await request(app)
      .delete('/api/push/unsubscribe')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({ endpoint: validBody().endpoint });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ removed: 1 });
  });
});
