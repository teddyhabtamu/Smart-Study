import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// Bulk content management: one-request bulk delete + bulk premium flag for
// documents and videos (admin cleanup: dedupe runs, bad imports, Pro/ Free
// retagging). Honest partial counts, single audit entry, strict validation.
const mockQuery = vi.fn();

vi.mock('../database/config', () => ({
  query: (...args: any[]) => mockQuery(...args),
  db: {},
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
    if (text.includes('DELETE FROM documents WHERE id = ANY')) return { rowCount: 2 };
    if (text.includes('DELETE FROM videos WHERE id = ANY')) return { rowCount: 1 };
    if (text.includes('UPDATE documents SET is_premium')) return { rowCount: 3 };
    if (text.includes('UPDATE videos SET is_premium')) return { rowCount: 0 };
    throw new Error(`unexpected query in test: ${String(text).slice(0, 120)}`);
  });
});

afterEach(() => {
  process.env = { ...savedEnv };
});

const loadApps = async () => {
  const { default: documentsRouter } = await import('./documents');
  const { default: videosRouter } = await import('./videos');
  const mk = (mount: string, r: any) => {
    const app = express();
    app.use(express.json());
    app.use(mount, r);
    return app;
  };
  return { docsApp: mk('/api/documents', documentsRouter), vidsApp: mk('/api/videos', videosRouter) };
};

const tokenFor = () => jwt.sign({ userId: 'admin-1', email: 'a@e.com' }, 'test-secret');
const auth = () => ({ Authorization: `Bearer ${tokenFor()}` });

describe('documents bulk-delete', () => {
  it('deletes in one request and reports honest counts', async () => {
    const { docsApp } = await loadApps();
    const res = await request(docsApp)
      .post('/api/documents/bulk-delete')
      .set(auth())
      .send({ ids: ['d1', 'd2', 'd1'] }); // dupes collapse server-side
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ deleted: 2, requested: 2 });
    const del = mockQuery.mock.calls.find(([sql]: any[]) =>
      String(sql).includes('DELETE FROM documents WHERE id = ANY'));
    expect(del).toBeDefined();
    expect(del[1][0].sort()).toEqual(['d1', 'd2']);
  });

  it('rejects empty, oversized, and non-string id lists', async () => {
    const { docsApp } = await loadApps();
    expect((await request(docsApp).post('/api/documents/bulk-delete').set(auth()).send({ ids: [] })).status).toBe(400);
    expect((await request(docsApp).post('/api/documents/bulk-delete').set(auth()).send({ ids: Array(101).fill('x') })).status).toBe(400);
    expect((await request(docsApp).post('/api/documents/bulk-delete').set(auth()).send({ ids: ['ok', 42] })).status).toBe(400);
    expect((await request(docsApp).post('/api/documents/bulk-delete').set(auth()).send({})).status).toBe(400);
  });

  it('403s students', async () => {
    currentRole = 'STUDENT';
    const { docsApp } = await loadApps();
    const res = await request(docsApp)
      .post('/api/documents/bulk-delete')
      .set(auth())
      .send({ ids: ['d1'] });
    expect(res.status).toBe(403);
  });
});

describe('documents bulk-premium', () => {
  it('flags a batch Pro in one request', async () => {
    const { docsApp } = await loadApps();
    const res = await request(docsApp)
      .patch('/api/documents/bulk-premium')
      .set(auth())
      .send({ ids: ['d1', 'd2', 'd3'], isPremium: true });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ updated: 3, requested: 3 });
  });

  it('requires a boolean flag', async () => {
    const { docsApp } = await loadApps();
    expect((await request(docsApp).patch('/api/documents/bulk-premium').set(auth()).send({ ids: ['d1'] })).status).toBe(400);
    expect((await request(docsApp).patch('/api/documents/bulk-premium').set(auth()).send({ ids: ['d1'], isPremium: 'yes' })).status).toBe(400);
  });
});

describe('videos bulk ops', () => {
  it('bulk-deletes with honest counts', async () => {
    const { vidsApp } = await loadApps();
    const res = await request(vidsApp)
      .post('/api/videos/bulk-delete')
      .set(auth())
      .send({ ids: ['v1', 'v-missing'] });
    expect(res.status).toBe(200);
    // Mock deletes 1 of 2 → partial success is reported, not hidden.
    expect(res.body.data).toEqual({ deleted: 1, requested: 2 });
  });

  it('bulk-premium reports zero-match honestly', async () => {
    const { vidsApp } = await loadApps();
    const res = await request(vidsApp)
      .patch('/api/videos/bulk-premium')
      .set(auth())
      .send({ ids: ['v-gone'], isPremium: false });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ updated: 0, requested: 1 });
  });

  it('403s students on both', async () => {
    currentRole = 'STUDENT';
    const { vidsApp } = await loadApps();
    expect((await request(vidsApp).post('/api/videos/bulk-delete').set(auth()).send({ ids: ['v1'] })).status).toBe(403);
    expect((await request(vidsApp).patch('/api/videos/bulk-premium').set(auth()).send({ ids: ['v1'], isPremium: true })).status).toBe(403);
  });
});
