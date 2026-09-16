import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// End-to-end (minus real DB/AI) coverage for POST /planner/events/batch —
// the persist leg of Smart Schedule. The route, auth middleware, validators,
// subject normalization, SQL mapping and error shapes all run for real;
// only the pg pool is faked. Written after a production incident where the
// generate leg worked but batch silently died, and nobody had ever driven
// this endpoint in a test.
const mockQuery = vi.fn();

vi.mock('../database/config', () => ({
  query: mockQuery,
  dbAdmin: {},
}));

const savedEnv = { ...process.env };

const setTestEnv = () => {
  process.env.DATABASE_URL = 'postgresql://testuser:testpass@localhost:5432/testdb';
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'test-anon-key';
  process.env.JWT_SECRET = 'test-secret';
  process.env.GOOGLE_CLIENT_ID = 'test-google-id';
  process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret';
  process.env.FRONTEND_URL = 'http://localhost:5173';
  process.env.BACKEND_URL = 'http://localhost:5000';
};

beforeEach(() => {
  setTestEnv();
  mockQuery.mockReset();
  // authenticateToken's user lookup: premium student, good standing.
  mockQuery.mockImplementation(async (text: string, params: any[] = []) => {
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
    if (text.startsWith('INSERT INTO study_events')) {
      const rows = [];
      for (let i = 0; i < params.length; i += 7) {
        rows.push({
          id: `evt-${i / 7}`,
          user_id: params[i],
          title: params[i + 1],
          subject: params[i + 2],
          event_date: params[i + 3],
          event_type: params[i + 4],
          is_completed: params[i + 5],
          notes: params[i + 6],
          created_at: '2026-09-16T00:00:00.000Z',
          updated_at: '2026-09-16T00:00:00.000Z',
        });
      }
      return { rows, rowCount: rows.length };
    }
    throw new Error(`unexpected query in test: ${String(text).slice(0, 80)}`);
  });
});

afterEach(() => {
  process.env = { ...savedEnv };
});

const loadApp = async () => {
  const { default: plannerRouter } = await import('./planner');
  const app = express();
  app.use(express.json());
  // Same mount prefix as server.ts so route paths match production.
  app.use('/api/planner', plannerRouter);
  return app;
};

const tokenFor = (userId = 'user-1') =>
  jwt.sign({ userId, email: 'student@example.com', role: 'STUDENT' }, 'test-secret');

const validBody = () => ({
  events: [
    {
      title: 'Quadratic equation Exam',
      subject: 'Maths',
      event_date: '2026-09-24',
      event_type: 'Exam',
      notes: 'Your Mathematics exam is today.',
    },
    {
      title: 'Newton revision',
      subject: 'Physics',
      event_date: '2026-09-25',
      event_type: 'Revision',
      notes: '',
    },
  ],
});

describe('POST /events/batch (auth gating)', () => {
  it('rejects missing token with 401', async () => {
    const app = await loadApp();
    const res = await request(app).post('/api/planner/events/batch').send(validBody());
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('rejects a forged token with 401', async () => {
    const app = await loadApp();
    const res = await request(app)
      .post('/api/planner/events/batch')
      .set('Authorization', 'Bearer forged.token.here')
      .send(validBody());
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});

describe('POST /events/batch (happy path + SQL mapping)', () => {
  it('creates every event in one INSERT and maps frontend names to columns', async () => {
    const app = await loadApp();
    const res = await request(app)
      .post('/api/planner/events/batch')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send(validBody());

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);

    // One multi-row INSERT (not N round trips), frontend date/type mapped
    // to event_date/event_type, 'Maths' normalized to 'Mathematics'.
    const insertCall = mockQuery.mock.calls.find(([sql]: any[]) =>
      String(sql).startsWith('INSERT INTO study_events')
    );
    expect(insertCall).toBeDefined();
    const params = insertCall![1];
    expect(params).toHaveLength(14);
    expect(params.slice(0, 7)).toEqual([
      'user-1',
      'Quadratic equation Exam',
      'Mathematics',
      '2026-09-24',
      'Exam',
      false,
      'Your Mathematics exam is today.',
    ]);
    expect(params.slice(7, 14)[2]).toBe('Physics');
  });
});

describe('POST /events/batch (validation)', () => {
  it('rejects an unknown subject naming the offender', async () => {
    const app = await loadApp();
    const body = validBody();
    (body.events[1] as any).subject = 'Klingon';
    const res = await request(app)
      .post('/api/planner/events/batch')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send(body);
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('events[1].subject');
    expect(res.body.message).toContain('Klingon');
  });

  it('rejects a missing event_date', async () => {
    const app = await loadApp();
    const body = validBody();
    delete (body.events[0] as any).event_date;
    const res = await request(app)
      .post('/api/planner/events/batch')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send(body);
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('events[0].event_date');
  });

  it('rejects a bad event_type', async () => {
    const app = await loadApp();
    const body = validBody();
    (body.events[0] as any).event_type = 'Party';
    const res = await request(app)
      .post('/api/planner/events/batch')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send(body);
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('events[0].event_type');
  });

  it('rejects an overlong title', async () => {
    const app = await loadApp();
    const body = validBody();
    (body.events[0] as any).title = 'x'.repeat(201);
    const res = await request(app)
      .post('/api/planner/events/batch')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send(body);
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('events[0].title');
  });

  it('rejects an empty batch', async () => {
    const app = await loadApp();
    const res = await request(app)
      .post('/api/planner/events/batch')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({ events: [] });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('rejects batches over 31 items', async () => {
    const app = await loadApp();
    const events = Array.from({ length: 32 }, (_, i) => ({
      title: `Session ${i}`,
      subject: 'Physics',
      event_date: '2026-09-20',
      event_type: 'Revision',
    }));
    const res = await request(app)
      .post('/api/planner/events/batch')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send({ events });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('POST /events/batch (DB failure)', () => {
  it('returns a generic 500 without leaking pg internals', async () => {
    const app = await loadApp();
    mockQuery.mockImplementation(async (text: string) => {
      if (text.includes('FROM users')) {
        return {
          rows: [{ id: 'user-1', role: 'STUDENT', status: 'Active', is_premium: true, bookmarks: [] }],
          rowCount: 1,
        };
      }
      throw new Error('relation "study_events" does not exist');
    });
    const res = await request(app)
      .post('/api/planner/events/batch')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send(validBody());
    expect(res.status).toBe(500);
    expect(res.body.message).toBe('Failed to create study events');
    expect(JSON.stringify(res.body)).not.toContain('relation');
  });
});
