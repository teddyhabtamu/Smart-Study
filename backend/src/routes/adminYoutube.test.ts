import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// YouTube grade audit + regrade: the audit re-verifies stored grades with
// the same extractor the sync gate uses (zero API quota), and regrade
// fixes rows with an audit trail.
const mockQuery = vi.fn();

vi.mock('../database/config', () => ({
  query: (...args: any[]) => mockQuery(...args),
  dbAdmin: { findOne: vi.fn(), update: vi.fn(), insert: vi.fn(), delete: vi.fn(), get: vi.fn() },
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
    if (text.includes('LEFT JOIN bookmarks')) {
      return {
        rows: [{ id: 'admin-1', name: 'Admin', email: 'a@e.com', role: currentRole, status: 'Active', is_premium: false, bookmarks: [] }],
        rowCount: 1,
      };
    }
    if (text.includes('FROM videos ORDER BY created_at DESC')) {
      return {
        rows: [
          { id: 'v-ok', title: 'Grade 12 Physics: waves', description: '', subject: 'Physics', grade: 12, video_url: 'https://youtu.be/ok' },
          { id: 'v-bad', title: 'Grade 10 Biology: cells', description: '', subject: 'Biology', grade: 12, video_url: 'https://youtu.be/bad' },
          { id: 'v-quiet', title: 'Photosynthesis explained', description: 'chloroplasts', subject: 'Biology', grade: 11, video_url: 'https://youtu.be/quiet' },
        ],
        rowCount: 3,
      };
    }
    if (text.includes('FROM videos WHERE id = $1')) {
      return { rows: [{ id: 'v-bad', title: 'Grade 10 Biology: cells', subject: 'Biology', grade: 12 }], rowCount: 1 };
    }
    if (text.includes('UPDATE videos SET grade')) {
      return { rows: [{ id: 'v-bad', title: 'Grade 10 Biology: cells', subject: 'Biology', grade: 10 }], rowCount: 1 };
    }
    throw new Error(`unexpected query in test: ${String(text).slice(0, 120)}`);
  });
});

afterEach(() => {
  process.env = { ...savedEnv };
});

const loadApp = async () => {
  const { default: router } = await import('./admin-youtube');
  const app = express();
  app.use(express.json());
  app.use('/api/admin/youtube', router);
  return app;
};

const tokenFor = () => jwt.sign({ userId: 'admin-1', email: 'a@e.com' }, 'test-secret');
const auth = () => ({ Authorization: `Bearer ${tokenFor()}` });

describe('GET /api/admin/youtube/grade-audit', () => {
  it('flags claimed-grade mismatches, counts silent rows, never flags them', async () => {
    const app = await loadApp();
    const res = await request(app).get('/api/admin/youtube/grade-audit').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.checked).toBe(3);
    expect(res.body.data.mismatched).toBe(1);
    expect(res.body.data.silent).toBe(1);
    expect(res.body.data.mismatches[0]).toMatchObject({
      id: 'v-bad', storedGrade: 12, claimedGrades: [10],
    });
  });

  it('403s students', async () => {
    currentRole = 'STUDENT';
    const app = await loadApp();
    expect((await request(app).get('/api/admin/youtube/grade-audit').set(auth())).status).toBe(403);
  });
});

describe('PATCH /api/admin/youtube/videos/:id/grade', () => {
  it('regrades with an audit trail', async () => {
    const app = await loadApp();
    const res = await request(app)
      .patch('/api/admin/youtube/videos/v-bad/grade')
      .set(auth())
      .send({ grade: 10 });
    expect(res.status).toBe(200);
    expect(res.body.data.grade).toBe(10);
    const update = mockQuery.mock.calls.find(([sql]: any[]) =>
      String(sql).includes('UPDATE videos SET grade'));
    expect(update[1]).toEqual([10, 'v-bad']);
  });

  it('validates the grade band and 404s unknown videos', async () => {
    const app = await loadApp();
    expect((await request(app).patch('/api/admin/youtube/videos/v-bad/grade').set(auth()).send({ grade: 7 })).status).toBe(400);
    expect((await request(app).patch('/api/admin/youtube/videos/v-bad/grade').set(auth()).send({})).status).toBe(400);
    mockQuery.mockImplementation(async (text: string) => {
      if (text.includes('LEFT JOIN bookmarks')) {
        return { rows: [{ id: 'admin-1', name: 'Admin', email: 'a@e.com', role: 'ADMIN', status: 'Active', is_premium: false, bookmarks: [] }], rowCount: 1 };
      }
      if (text.includes('FROM videos WHERE id = $1')) return { rows: [], rowCount: 0 };
      throw new Error(`unexpected query in test: ${String(text).slice(0, 120)}`);
    });
    expect((await request(app).patch('/api/admin/youtube/videos/gone/grade').set(auth()).send({ grade: 10 })).status).toBe(404);
  });

  it('403s students', async () => {
    currentRole = 'STUDENT';
    const app = await loadApp();
    expect((await request(app).patch('/api/admin/youtube/videos/v-bad/grade').set(auth()).send({ grade: 10 })).status).toBe(403);
  });
});
