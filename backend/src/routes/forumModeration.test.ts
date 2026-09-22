import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// Community pre-moderation with earned trust: first-timers queue for
// review, trusted authors and staff go live instantly, strangers only ever
// see approved posts (404, never 403 — no existence leak).
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
  db: {},
  dbAdmin: mockDbAdmin,
  supabaseAdmin: {},
}));

const savedEnv = { ...process.env };
let currentRole = 'STUDENT';
let currentUserId = 'u-9';
let currentPremium = true;
// Trust check outcome: does the author already own an approved post?
let trustHasApproved = false;
// Single-post lookup outcome (detail/vote/comment/edit/delete paths).
let lookupRow: any = { id: 'p-1', author_id: 'u-9', status: 'approved', title: 'Hello' };
// Fail the next dbAdmin.insert with a missing-column error (pre-migration).
let failNextInsertMissingColumn = false;

const setTestEnv = () => {
  process.env.DATABASE_URL = 'postgresql://testuser:testpass@localhost:5432/testdb';
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'test-anon-key';
  process.env.JWT_SECRET = 'test-secret';
};

const approvedPost = (overrides: any = {}) => ({
  id: 'p-1', title: 'T', content: 'C', subject: 'Math', grade: 9, votes: 0,
  views: 0, tags: [], is_solved: false, is_edited: false, ai_answer: null,
  created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  author_id: 'u-9', status: 'approved', decision_reason: null,
  author: 'Student', author_role: 'STUDENT', author_avatar: null, comment_count: '0',
  ...overrides,
});

beforeEach(() => {
  setTestEnv();
  currentRole = 'STUDENT';
  currentUserId = 'u-9';
  currentPremium = true;
  trustHasApproved = false;
  lookupRow = { id: 'p-1', author_id: 'u-9', status: 'approved', title: 'Hello' };
  failNextInsertMissingColumn = false;
  mockQuery.mockReset();
  mockDbAdmin.findOne.mockReset();
  mockDbAdmin.update.mockReset();
  mockDbAdmin.insert.mockReset();
  mockDbAdmin.delete.mockReset();
  mockDbAdmin.get.mockReset();
  mockDbAdmin.findOne.mockResolvedValue(null);
  mockDbAdmin.update.mockImplementation(async (_t: string, id: string, updates: any) => ({ id, ...updates }));
  mockDbAdmin.insert.mockImplementation(async (table: string, data: any) => {
    if (table === 'forum_posts' && failNextInsertMissingColumn && (data as any)?.status !== undefined) {
      failNextInsertMissingColumn = false;
      const err: any = new Error(`Could not find the 'status' column of 'forum_posts' in the schema cache`);
      throw err;
    }
    return { id: table === 'forum_posts' ? 'p-new' : 'n-1', ...data };
  });
  mockQuery.mockImplementation(async (text: string) => {
    if (text.includes('LEFT JOIN bookmarks')) {
      return {
        rows: [{ id: currentUserId, name: 'U', email: 'u@e.com', role: currentRole, status: 'Active', is_premium: currentPremium, bookmarks: [] }],
        rowCount: 1,
      };
    }
    // optionalAuth (public routes) fetches the user without the bookmarks
    // join — same identity, different projection.
    if (text.includes('FROM users WHERE id = $1')) {
      return {
        rows: [{ id: currentUserId, name: 'U', email: 'u@e.com', role: currentRole, status: 'Active', is_premium: currentPremium }],
        rowCount: 1,
      };
    }
    // Earned-trust check.
    if (text.includes("FROM forum_posts WHERE author_id = $1 AND status = 'approved'")) {
      return trustHasApproved ? { rows: [{}], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    // Free daily limit.
    if (text.includes('FROM forum_posts') && text.includes('created_at >=')) {
      return { rows: [{ count: '0' }], rowCount: 1 };
    }
    // List pair.
    if (text.includes('SELECT COUNT(*) as total FROM forum_posts')) {
      return { rows: [{ total: '1' }], rowCount: 1 };
    }
    if (text.includes('ORDER BY p.created_at DESC')) {
      return { rows: [approvedPost()], rowCount: 1 };
    }
    // Single-post lookups (detail/vote/solved/ai/comment/delete/edit).
    if (text.includes('FROM forum_posts') && (text.includes('WHERE id = $1') || text.includes('WHERE p.id = $1'))) {
      return lookupRow ? { rows: [lookupRow], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    if (text.includes('FROM forum_posts WHERE id = $1')) {
      return lookupRow ? { rows: [lookupRow], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    // Detail-page extras (only reached when the gate passes).
    if (text.includes('FROM forum_views')) return { rows: [], rowCount: 0 };
    if (text.includes('INSERT INTO forum_views')) return { rows: [], rowCount: 1 };
    if (text.includes('UPDATE forum_posts SET views')) return { rows: [], rowCount: 1 };
    if (text.includes('FROM forum_comments')) return { rows: [], rowCount: 0 };
    if (text.includes('FROM forum_votes')) return { rows: [], rowCount: 0 };
    if (text.includes('FROM forum_votes')) return { rows: [], rowCount: 0 };
    if (text.includes('UPDATE forum_posts SET votes')) return { rows: [{ votes: 1 }], rowCount: 1 };
    // Admin queue + decisions.
    if (text.includes("p.status = 'pending'") && text.includes('ORDER BY p.created_at ASC')) {
      return { rows: [{ id: 'p-q', title: 'Q', content: 'C', author_id: 'u-9', author: 'S', author_email: 's@e.com' }], rowCount: 1 };
    }
    if (text.includes("SET status = 'approved'") && text.includes('RETURNING')) {
      return { rows: [{ id: 'p-q', author_id: 'u-9', title: 'Q' }], rowCount: 1 };
    }
    if (text.includes("SET status = 'rejected'") && text.includes('RETURNING')) {
      return { rows: [{ id: 'p-q', author_id: 'u-9', title: 'Q' }], rowCount: 1 };
    }
    throw new Error(`unexpected query in test: ${String(text).slice(0, 140)}`);
  });
});

afterEach(() => {
  process.env = { ...savedEnv };
});

const loadApps = async () => {
  const { default: forumRouter } = await import('./forum');
  const { default: adminRouter } = await import('./admin');
  const mk = (mount: string, r: any) => {
    const app = express();
    app.use(express.json());
    app.use(mount, r);
    return app;
  };
  return { forumApp: mk('/api/forum', forumRouter), adminApp: mk('/api/admin', adminRouter) };
};

const tokenFor = (userId = currentUserId) =>
  jwt.sign({ userId, email: 'u@e.com' }, 'test-secret');
const auth = () => ({ Authorization: `Bearer ${tokenFor()}` });
const validPost = { title: 'Why is the sky blue?', content: 'I really want to understand Rayleigh scattering in detail.', subject: 'Physics', grade: 10 };

describe('create: earned trust', () => {
  it('queues first-timers as pending with a review message', async () => {
    const { forumApp } = await loadApps();
    const res = await request(forumApp).post('/api/forum/posts').set(auth()).send(validPost);
    expect(res.status).toBe(201);
    const insert = mockDbAdmin.insert.mock.calls.find((c: any[]) => c[0] === 'forum_posts');
    expect(insert[1].status).toBe('pending');
    expect(res.body.message).toMatch(/review/i);
    expect(res.body.data.status).toBe('pending');
  });

  it('auto-approves authors with a live post and staff', async () => {
    trustHasApproved = true;
    const { forumApp } = await loadApps();
    const trusted = await request(forumApp).post('/api/forum/posts').set(auth()).send(validPost);
    expect(trusted.body.data.status).toBe('approved');

    currentRole = 'MODERATOR';
    trustHasApproved = false;
    const staff = await request(forumApp).post('/api/forum/posts').set(auth()).send(validPost);
    expect(staff.body.data.status).toBe('approved');
  });

  it('falls back to legacy live insert on pre-migration DBs', async () => {
    failNextInsertMissingColumn = true;
    const { forumApp } = await loadApps();
    const res = await request(forumApp).post('/api/forum/posts').set(auth()).send(validPost);
    expect(res.status).toBe(201);
    expect(res.body.message).toMatch(/created successfully/);
    const inserts = mockDbAdmin.insert.mock.calls.filter((c: any[]) => c[0] === 'forum_posts');
    expect(inserts.length).toBe(2);
    expect(inserts[1][1].status).toBeUndefined();
  });
});

describe('visibility: strangers see approved only', () => {
  it('guest list only asks for approved posts', async () => {
    const { forumApp } = await loadApps();
    const res = await request(forumApp).get('/api/forum/posts');
    expect(res.status).toBe(200);
    const listCall = mockQuery.mock.calls.find(([sql]: any[]) =>
      String(sql).includes('ORDER BY p.created_at DESC'));
    expect(String(listCall[0])).toContain(`p.status = 'approved'`);
    expect(res.body.data.posts.every((p: any) => p.status === 'approved')).toBe(true);
  });

  it('author list includes their own pending post', async () => {
    mockQuery.mockImplementation(async (text: string) => {
      if (text.includes('LEFT JOIN bookmarks')) {
        return { rows: [{ id: 'u-9', name: 'U', email: 'u@e.com', role: 'STUDENT', status: 'Active', is_premium: true, bookmarks: [] }], rowCount: 1 };
      }
      if (text.includes('SELECT COUNT(*) as total FROM forum_posts')) return { rows: [{ total: '1' }], rowCount: 1 };
      if (text.includes('ORDER BY p.created_at DESC')) {
        return { rows: [approvedPost({ id: 'p-9', author_id: 'u-9', status: 'pending' })], rowCount: 1 };
      }
      throw new Error(`unexpected query in test: ${String(text).slice(0, 140)}`);
    });
    const { forumApp } = await loadApps();
    const res = await request(forumApp).get('/api/forum/posts').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data.posts[0].status).toBe('pending');
    expect(res.body.data.posts[0].author_id).toBe('u-9');
  });

  it('detail 404s strangers but serves author and staff', async () => {
    lookupRow = { ...approvedPost(), status: 'pending', author_id: 'author-1', title: 'Hidden', content: 'C', ai_answer: null };
    const { forumApp } = await loadApps();
    // Stranger (and guest): 404, not 403.
    currentUserId = 'stranger-1';
    expect((await request(forumApp).get('/api/forum/posts/p-1').set(auth())).status).toBe(404);
    expect((await request(forumApp).get('/api/forum/posts/p-1')).status).toBe(404);
    // Author: 200 with state.
    currentUserId = 'author-1';
    const mine = await request(forumApp).get('/api/forum/posts/p-1').set(auth());
    expect(mine.status).toBe(200);
    expect(mine.body.data.status).toBe('pending');
    // Staff: 200.
    currentUserId = 'mod-1';
    currentRole = 'MODERATOR';
    expect((await request(forumApp).get('/api/forum/posts/p-1').set(auth())).status).toBe(200);
  });

  it('votes and comments on hidden posts 404 for strangers', async () => {
    lookupRow = { ...approvedPost(), status: 'pending', author_id: 'author-1' };
    currentUserId = 'stranger-1';
    const { forumApp } = await loadApps();
    expect((await request(forumApp).post('/api/forum/posts/p-1/vote').set(auth()).send({ vote: 1 })).status).toBe(404);
    expect((await request(forumApp).post('/api/forum/posts/p-1/comments').set(auth()).send({ content: 'spammy reply here' })).status).toBe(404);
  });
});

describe('edits re-check trust', () => {
  it('untrusted content edit re-queues and clears the stale reason', async () => {
    lookupRow = { id: 'p-1', author_id: 'u-9', status: 'approved' };
    trustHasApproved = false;
    const { forumApp } = await loadApps();
    const res = await request(forumApp).put('/api/forum/posts/p-1').set(auth()).send({ title: 'New title here' });
    expect(res.status).toBe(200);
    const update = mockDbAdmin.update.mock.calls.find((c: any[]) => c[0] === 'forum_posts');
    expect(update[2].status).toBe('pending');
    expect(update[2].decision_reason).toBeNull();
  });

  it('rejected posts re-queue even for trusted authors', async () => {
    lookupRow = { id: 'p-1', author_id: 'u-9', status: 'rejected' };
    trustHasApproved = true; // other live posts exist — still re-reviewed
    const { forumApp } = await loadApps();
    const res = await request(forumApp).put('/api/forum/posts/p-1').set(auth()).send({ content: 'rewrote the whole question body here' });
    expect(res.status).toBe(200);
    const update = mockDbAdmin.update.mock.calls.find((c: any[]) => c[0] === 'forum_posts');
    expect(update[2].status).toBe('pending');
  });

  it('tags-only edits leave visibility untouched', async () => {
    lookupRow = { id: 'p-1', author_id: 'u-9', status: 'approved' };
    trustHasApproved = true;
    const { forumApp } = await loadApps();
    await request(forumApp).put('/api/forum/posts/p-1').set(auth()).send({ tags: ['physics'] });
    const update = mockDbAdmin.update.mock.calls.find((c: any[]) => c[0] === 'forum_posts');
    expect(update[2].status).toBeUndefined();
  });
});

describe('admin review queue', () => {
  it('lists pending oldest-first for staff, 403s students', async () => {
    currentRole = 'MODERATOR';
    const { adminApp } = await loadApps();
    const res = await request(adminApp).get('/api/admin/forum/pending').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].author_email).toBe('s@e.com');

    currentRole = 'STUDENT';
    expect((await request(adminApp).get('/api/admin/forum/pending').set(auth())).status).toBe(403);
  });

  it('approve goes live; unknown id 404s', async () => {
    currentRole = 'ADMIN';
    const { adminApp } = await loadApps();
    const res = await request(adminApp).post('/api/admin/forum/posts/p-q/approve').set(auth());
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ approved: true });

    mockQuery.mockImplementation(async (text: string) => {
      if (text.includes('LEFT JOIN bookmarks')) {
        return { rows: [{ id: 'admin-1', name: 'A', email: 'a@e.com', role: 'ADMIN', status: 'Active', is_premium: false, bookmarks: [] }], rowCount: 1 };
      }
      if (text.includes('RETURNING')) return { rows: [], rowCount: 0 };
      throw new Error(`unexpected query in test: ${String(text).slice(0, 140)}`);
    });
    expect((await request(adminApp).post('/api/admin/forum/posts/p-gone/approve').set(auth())).status).toBe(404);
  });

  it('reject stores the reason and notifies the author', async () => {
    currentRole = 'ADMIN';
    const { adminApp } = await loadApps();
    const res = await request(adminApp)
      .post('/api/admin/forum/posts/p-q/reject')
      .set(auth())
      .send({ reason: '  Ask one clear question  ' });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ rejected: true, reason: 'Ask one clear question' });
    const update = mockQuery.mock.calls.find(([sql]: any[]) =>
      String(sql).includes("SET status = 'rejected'"));
    expect(update[1]).toEqual(expect.arrayContaining(['u-9', 'Ask one clear question', 'p-q']));
    const ping = mockDbAdmin.insert.mock.calls.find((c: any[]) =>
      c[0] === 'notifications' && String(c[1]?.user_id) === 'u-9');
    expect(ping).toBeDefined();
    expect(String(ping[1]?.message)).toContain('Ask one clear question');
  });

  it('reject validates reason length and role', async () => {
    currentRole = 'ADMIN';
    const { adminApp } = await loadApps();
    expect((await request(adminApp).post('/api/admin/forum/posts/p-q/reject').set(auth()).send({ reason: 'x'.repeat(501) })).status).toBe(400);
    currentRole = 'STUDENT';
    expect((await request(adminApp).post('/api/admin/forum/posts/p-q/reject').set(auth()).send({})).status).toBe(403);
  });
});
