import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// NOTE: config.ts creates a pg Pool at module load and throws without a
// DATABASE_URL, so we set a dummy URL and import dynamically.
const DUMMY_URL = 'postgresql://testuser:testpass@localhost:5432/testdb';
const savedEnv = { ...process.env };

beforeEach(() => {
  process.env.DATABASE_URL = DUMMY_URL;
  delete process.env.PG_POOLER_URL;
});

afterEach(() => {
  process.env = { ...savedEnv };
});

const load = () => import('./config');

describe('prepareColumnValue (jsonb vs text[] serialization)', () => {
  it('stringifies arrays for jsonb columns', async () => {
    const { prepareColumnValue } = await load();
    const msgs = [{ role: 'user', text: 'hi' }];
    expect(prepareColumnValue('chat_sessions', 'messages', msgs)).toBe(JSON.stringify(msgs));
  });

  it('passes text[] arrays through for native pg serialization', async () => {
    const { prepareColumnValue } = await load();
    const badges = ['b1', 'b5'];
    // Must NOT be JSON ('["b1","b5"]' is a malformed Postgres array literal)
    expect(prepareColumnValue('users', 'unlocked_badges', badges)).toEqual(['b1', 'b5']);
    expect(prepareColumnValue('documents', 'tags', ['a'])).toEqual(['a']);
  });

  it('always stringifies plain objects', async () => {
    const { prepareColumnValue } = await load();
    const prefs = { emailNotifications: true };
    expect(prepareColumnValue('users', 'preferences', prefs)).toBe(JSON.stringify(prefs));
    // Even on tables with no registry entry — no text column takes objects
    expect(prepareColumnValue('other_table', 'whatever', prefs)).toBe(JSON.stringify(prefs));
  });

  it('passes scalars and null through untouched', async () => {
    const { prepareColumnValue } = await load();
    expect(prepareColumnValue('users', 'xp', 5)).toBe(5);
    expect(prepareColumnValue('users', 'name', 'Abi')).toBe('Abi');
    expect(prepareColumnValue('users', 'grade', null)).toBeNull();
    expect(prepareColumnValue('users', 'avatar', undefined)).toBeUndefined();
  });
});

describe('isTransientError', () => {
  it('matches connection failures case-insensitively', async () => {
    const { isTransientError } = await load();
    expect(isTransientError(new Error('Connection terminated due to connection timeout'))).toBe(true);
    expect(isTransientError(new Error('connection terminated unexpectedly'))).toBe(true);
    expect(isTransientError(new Error('read ECONNRESET'))).toBe(true);
    expect(isTransientError(new Error('connect ETIMEDOUT'))).toBe(true);
    expect(isTransientError(new Error('getaddrinfo ENOTFOUND x'))).toBe(true);
    expect(isTransientError(new Error('password authentication failed'))).toBe(false);
    expect(isTransientError(new Error('relation "users" does not exist'))).toBe(false);
    expect(isTransientError(null)).toBe(false);
  });
});

describe('buildPoolConfig password encoding', () => {
  it('encodes raw special chars in password (@, #)', async () => {
    process.env.PG_POOLER_URL = 'postgresql://postgres:ab@#cd@host:5432/postgres';
    const { buildPoolConfig } = await load();
    const cfg = buildPoolConfig();
    expect(cfg.connectionString).toBe('postgresql://postgres:ab%40%23cd@host:5432/postgres');
  });

  it('does not double-encode an already-encoded password', async () => {
    process.env.PG_POOLER_URL = 'postgresql://postgres:ab%40%23cd@host:5432/postgres';
    const { buildPoolConfig } = await load();
    const cfg = buildPoolConfig();
    expect(cfg.connectionString).toBe('postgresql://postgres:ab%40%23cd@host:5432/postgres');
    expect(cfg.connectionString).not.toContain('%25');
  });

  it('prefers PG_POOLER_URL over DATABASE_URL and caps pool size', async () => {
    process.env.PG_POOLER_URL = 'postgresql://a:b@pooler:6543/postgres';
    const { buildPoolConfig } = await load();
    const cfg = buildPoolConfig();
    expect(cfg.connectionString).toContain('pooler:6543');
    expect(cfg.max).toBeLessThanOrEqual(10);
  });

  it('falls back to DATABASE_URL when PG_POOLER_URL is absent', async () => {
    delete process.env.PG_POOLER_URL;
    const { buildPoolConfig } = await load();
    const cfg = buildPoolConfig();
    // beforeEach set DATABASE_URL to the dummy URL
    expect(cfg.connectionString).toContain('localhost:5432');
  });
});
