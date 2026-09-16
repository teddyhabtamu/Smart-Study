import { describe, it, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import type { BatchEventInput } from '../services/plannerBatch';

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
    // Retry-dedup pre-check: no recent duplicates by default. Individual
    // tests override with mockQuery.mockImplementationOnce for dup cases.
    if (text.includes('FROM study_events') && text.includes('created_at > NOW()')) {
      return { rows: [], rowCount: 0 };
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

// Pure validator + SQL builder: millisecond tests that pin every rule
// without HTTP. The integration suite above pins the contract; these pin
// the logic (boundaries, normalization, all-or-nothing indexing).
describe('validateBatchEvents (pure validator)', () => {
  let helpers: typeof import('../services/plannerBatch');
  beforeAll(async () => {
    helpers = await import('../services/plannerBatch');
  });

  const good = (over: Record<string, unknown> = {}) => ({
    title: 'Quadratic equation Exam',
    subject: 'Mathematics',
    event_date: '2026-09-24',
    event_type: 'Exam',
    notes: 'Today.',
    ...over,
  });

  it('accepts valid items, trims, and normalizes subjects', () => {
    const verdict = helpers.validateBatchEvents(
      [good({ title: '  spaced  ', subject: '  Maths ' })],
      'user-1'
    );
    expect(verdict.ok).toBe(true);
    if (verdict.ok) {
      expect(verdict.rows[0]).toEqual(
        ['user-1', 'spaced', 'Mathematics', '2026-09-24', 'Exam', 'Today.']
      );
    }
  });

  it('rejects null/blank/overlong titles with the item index', () => {
    for (const title of [null, '', '   ', 'x'.repeat(201)]) {
      const verdict = helpers.validateBatchEvents([good({ title }) as any], 'user-1');
      expect(verdict.ok).toBe(false);
      if (!verdict.ok) expect(verdict.message).toContain('events[0].title');
    }
    const ok = helpers.validateBatchEvents([good({ title: 'x'.repeat(200) })], 'user-1');
    expect(ok.ok).toBe(true);
  });

  it('rejects unknown subjects and impossible dates', () => {
    const badSubject = helpers.validateBatchEvents([good({ subject: 'Klingon' })], 'user-1');
    expect(badSubject.ok).toBe(false);
    const badDate = helpers.validateBatchEvents([good({ event_date: '2026-13-40' })], 'user-1');
    expect(badDate.ok).toBe(false);
    if (!badDate.ok) expect(badDate.message).toContain('events[0].event_date');
  });

  it('rejects wrong-cased event types (strict enum, matches the route)', () => {
    const verdict = helpers.validateBatchEvents([good({ event_type: 'exam' })], 'user-1');
    expect(verdict.ok).toBe(false);
  });

  it('fails the whole batch on the first bad item, reporting its index', () => {
    const verdict = helpers.validateBatchEvents(
      [good(), good({ event_type: 'Party' }), good({ title: '' })],
      'user-1'
    );
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.message).toContain('events[1].event_type');
  });

  it('coerces non-string notes instead of throwing', () => {
    const verdict = helpers.validateBatchEvents([good({ notes: 5 }) as any], 'user-1');
    expect(verdict.ok).toBe(true);
    if (verdict.ok) expect(verdict.rows[0][5]).toBe('5');
  });
});

describe('buildBatchInsert (SQL builder)', () => {
  let helpers: typeof import('../services/plannerBatch');
  beforeAll(async () => {
    helpers = await import('../services/plannerBatch');
  });

  it('builds one multi-row INSERT with sequential placeholders', () => {
    const { text, values } = helpers.buildBatchInsert([
      ['user-1', 'A', 'Physics', '2026-09-20', 'Revision', 'n1'],
      ['user-1', 'B', 'Physics', '2026-09-21', 'Exam', 'n2'],
    ]);
    expect(text).toContain('INSERT INTO study_events');
    expect(text).toContain('RETURNING *');
    expect(text).toContain('($1, $2, $3, $4, $5, $6, $7), ($8, $9, $10, $11, $12, $13, $14)');
    expect(values).toHaveLength(14);
    expect(values.slice(0, 7)).toEqual(['user-1', 'A', 'Physics', '2026-09-20', 'Revision', false, 'n1']);
  });
});

// Retry dedup: abort-then-retry must never duplicate events.
describe('retry dedup (pure helpers)', () => {
  let helpers: typeof import('../services/plannerBatch');
  beforeAll(async () => {
    helpers = await import('../services/plannerBatch');
  });

  it('keys rows by title + calendar date (time portion ignored)', () => {
    expect(helpers.batchRowKey('A', '2026-09-24')).toBe('A|||2026-09-24');
    expect(helpers.batchRowKey('A', '2026-09-24T21:00:00.000Z')).toBe('A|||2026-09-24');
  });

  it('builds one parameterized SELECT covering every candidate pair', () => {
    const { text, values } = helpers.buildRecentDuplicatesSelect('user-1', [
      ['user-1', 'A', 'Physics', '2026-09-20', 'Revision', 'n1'],
      ['user-1', 'B', 'Physics', '2026-09-21', 'Exam', 'n2'],
    ]);
    expect(text).toContain('FROM study_events WHERE user_id = $1');
    expect(text).toContain('MAKE_INTERVAL');
    expect(text).toContain('(title = $3 AND event_date = $4) OR (title = $5 AND event_date = $6)');
    expect(values).toEqual(['user-1', 30, 'A', '2026-09-20', 'B', '2026-09-21']);
  });

  it('splits fresh vs already-present rows', () => {
    const rows: Array<[string, string, string, string, string, string]> = [
      ['user-1', 'A', 'Physics', '2026-09-20', 'Revision', 'n1'],
      ['user-1', 'B', 'Physics', '2026-09-21', 'Exam', 'n2'],
    ];
    const { fresh, existingRows } = helpers.splitNewVsExisting(rows, [
      { id: 'old', title: 'A', event_date: '2026-09-20' },
      { id: 'unrelated', title: 'Z', event_date: '2026-09-20' },
    ]);
    expect(fresh.map((r) => r[1])).toEqual(['B']);
    expect(existingRows.map((r: any) => r.id)).toEqual(['old']);
  });
});

describe('POST /events/batch (retry dedup)', () => {
  it('returns 201 with existing rows and no INSERT when all are duplicates', async () => {
    const app = await loadApp();
    mockQuery.mockImplementation(async (text: string, params: any[] = []) => {
      if (text.includes('FROM users')) {
        return {
          rows: [{ id: 'user-1', role: 'STUDENT', status: 'Active', is_premium: true, bookmarks: [] }],
          rowCount: 1,
        };
      }
      if (text.includes('created_at > NOW()')) {
        return {
          rows: [
            { id: 'e0', title: 'Quadratic equation Exam', event_date: '2026-09-24' },
            { id: 'e1', title: 'Newton revision', event_date: '2026-09-25' },
          ],
          rowCount: 2,
        };
      }
      throw new Error('INSERT should not run for a fully-duplicate batch');
    });
    const res = await request(app)
      .post('/api/planner/events/batch')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send(validBody());
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
    expect(
      mockQuery.mock.calls.some(([sql]: any[]) => String(sql).startsWith('INSERT INTO study_events'))
    ).toBe(false);
  });

  it('inserts only the fresh rows on a partial duplicate', async () => {
    const app = await loadApp();
    mockQuery.mockImplementation(async (text: string, params: any[] = []) => {
      if (text.includes('FROM users')) {
        return {
          rows: [{ id: 'user-1', role: 'STUDENT', status: 'Active', is_premium: true, bookmarks: [] }],
          rowCount: 1,
        };
      }
      if (text.includes('created_at > NOW()')) {
        return {
          rows: [{ id: 'e0', title: 'Quadratic equation Exam', event_date: '2026-09-24' }],
          rowCount: 1,
        };
      }
      if (text.startsWith('INSERT INTO study_events')) {
        return { rows: [{ id: 'new-1', title: params[1] }], rowCount: 1 };
      }
      throw new Error(`unexpected query in test: ${String(text).slice(0, 80)}`);
    });
    const res = await request(app)
      .post('/api/planner/events/batch')
      .set('Authorization', `Bearer ${tokenFor()}`)
      .send(validBody());
    expect(res.status).toBe(201);
    // 1 pre-existing + 1 freshly inserted.
    expect(res.body.data).toHaveLength(2);
    const insertCall = mockQuery.mock.calls.find(([sql]: any[]) =>
      String(sql).startsWith('INSERT INTO study_events')
    );
    // 7 params = exactly one row inserted (the non-duplicate).
    expect(insertCall![1]).toHaveLength(7);
    expect(insertCall![1][1]).toBe('Newton revision');
  });
});
