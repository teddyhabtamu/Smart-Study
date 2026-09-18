import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// Admin AI-keys contract: ADMIN-only gating, masked status payload, and the
// zero-spend validate leg. DB + Google clients are faked; routing, auth,
// validation and wiring run for real.
const mockQuery = vi.fn();
const mockList = vi.fn();

vi.mock('../database/config', () => ({
  query: mockQuery,
  dbAdmin: {},
  supabaseAdmin: {},
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models: any;
    constructor(_opts: { apiKey: string }) {
      this.models = { list: (...args: any[]) => mockList(...args) };
    }
  },
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
  mockList.mockReset();
  mockList.mockResolvedValue({ models: [] });
  mockQuery.mockImplementation(async (text: string) => {
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
    throw new Error(`unexpected query in test: ${String(text).slice(0, 80)}`);
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
  jwt.sign({ userId: 'admin-1', email: 'admin@example.com' }, 'test-secret');

describe('GET /api/admin/ai-keys (gating + masking)', () => {
  it('serves masked ring status to admins', async () => {
    const app = await loadApp();
    const res = await request(app)
      .get('/api/admin/ai-keys')
      .set('Authorization', `Bearer ${tokenFor()}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.ringSize).toBe(2);
    expect(res.body.data.keys).toHaveLength(2);
    expect(res.body.data.keys[0].fingerprint).toBe('••••aaaa');
    expect(res.body.data.keys[0].state).toBe('next');
    expect(res.body.data.keys[1].state).toBe('idle');
    // Full key material must never reach an admin browser:
    expect(JSON.stringify(res.body)).not.toContain('adminkey-one-aaaa');
    expect(JSON.stringify(res.body)).not.toContain('adminkey-two-bbbb');
  });

  it('rejects students with 403 and strangers with 401', async () => {
    const app = await loadApp();
    currentRole = 'STUDENT';
    const denied = await request(app)
      .get('/api/admin/ai-keys')
      .set('Authorization', `Bearer ${tokenFor()}`);
    expect(denied.status).toBe(403);
    const anon = await request(app).get('/api/admin/ai-keys');
    expect(anon.status).toBe(401);
  });
});

describe('POST /api/admin/ai-keys/:index/validate', () => {
  it('confirms a live key without spending quota', async () => {
    const app = await loadApp();
    const res = await request(app)
      .post('/api/admin/ai-keys/1/validate')
      .set('Authorization', `Bearer ${tokenFor()}`);
    expect(res.status).toBe(200);
    expect(res.body.data.ok).toBe(true);
    expect(mockList).toHaveBeenCalledTimes(1);
  });

  it('reports a dead key as not-ok (still 200: the check worked)', async () => {
    mockList.mockRejectedValue(Object.assign(new Error('API key not valid.'), { status: 400 }));
    const app = await loadApp();
    const res = await request(app)
      .post('/api/admin/ai-keys/0/validate')
      .set('Authorization', `Bearer ${tokenFor()}`);
    expect(res.status).toBe(200);
    expect(res.body.data.ok).toBe(false);
  });

  it('400s non-integer indexes, 200s out-of-range without calling the API', async () => {
    const app = await loadApp();
    const bad = await request(app)
      .post('/api/admin/ai-keys/abc/validate')
      .set('Authorization', `Bearer ${tokenFor()}`);
    expect(bad.status).toBe(400);
    const missing = await request(app)
      .post('/api/admin/ai-keys/99/validate')
      .set('Authorization', `Bearer ${tokenFor()}`);
    expect(missing.status).toBe(200);
    expect(missing.body.data.ok).toBe(false);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('requires admin for validation too', async () => {
    const app = await loadApp();
    currentRole = 'STUDENT';
    const res = await request(app)
      .post('/api/admin/ai-keys/0/validate')
      .set('Authorization', `Bearer ${tokenFor()}`);
    expect(res.status).toBe(403);
  });
});
