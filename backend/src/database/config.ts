import dotenv from 'dotenv';

// Load environment variables at the top of this module
dotenv.config();

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Pool, PoolClient, types } from 'pg';
import { config } from '../config';

// DATE columns (OID 1082) come back as midnight-UTC Date objects by default,
// which JSON-serializes to "2026-09-09T21:00:00.000Z" — breaking frontend
// date math ("in NaNd"), calendar key matching, and risking off-by-one days
// across timezones. Return the raw YYYY-MM-DD calendar date instead.
types.setTypeParser(1082, (v: string) => v);

// Initialize Supabase client (used for REST API calls: auth, storage, some table ops)
let supabase: SupabaseClient;

if (config.supabase.url && config.supabase.anonKey) {
  supabase = createClient(config.supabase.url, config.supabase.anonKey);
} else {
  throw new Error('Supabase configuration is missing. Please check your environment variables.');
}

// Admin client for server-side operations requiring the service role
let supabaseAdmin: SupabaseClient;

if (config.supabase.url && config.supabase.serviceRoleKey) {
  supabaseAdmin = createClient(config.supabase.url, config.supabase.serviceRoleKey);
} else {
  console.warn('⚠️  Supabase service role key not configured. Some admin operations may not work.');
}

// ---------------------------------------------------------------------------
// PostgreSQL connection pool
//
// Connects over the Supabase connection pooler (IPv4-friendly).
// PG_POOLER_URL takes precedence when set; falls back to DATABASE_URL.
// Transaction mode (port 6543) is preferred — it is Supabase's recommendation
// for serverless (Vercel) and works with node-postgres parameterized queries
// (unnamed statements only; this codebase never uses named prepared statements).
// ---------------------------------------------------------------------------
export const buildPoolConfig = () => {
  const raw = process.env.PG_POOLER_URL || config.database.url;
  if (!raw) {
    throw new Error('Neither PG_POOLER_URL nor DATABASE_URL is configured.');
  }

  // Percent-encode the password so special characters (e.g. '@', '#') survive
  // URI parsing — but only if it isn't already encoded (double-encoding breaks auth).
  let connectionString = raw;
  try {
    const withoutScheme = raw.replace(/^postgres(ql)?:\/\//, '');
    const colonIdx = withoutScheme.indexOf(':');
    const atIdx = withoutScheme.lastIndexOf('@');
    if (colonIdx > 0 && atIdx > colonIdx) {
      const user = withoutScheme.slice(0, colonIdx);
      let password = withoutScheme.slice(colonIdx + 1, atIdx);
      const alreadyEncoded = /%[0-9a-fA-F]{2}/.test(password) && decodeURIComponent(password) !== password;
      if (!alreadyEncoded) {
        password = encodeURIComponent(password);
      }
      const host = withoutScheme.slice(atIdx + 1);
      connectionString = `postgresql://${user}:${password}@${host}`;
    }
  } catch {
    // keep raw string
  }

  return {
    connectionString,
    ssl: { rejectUnauthorized: false },
    // Serverless-sized pool with fail-fast budgets. Context: every Vercel
    // instance holds its own pool against the shared Supabase pooler, and
    // the old shape (max 5, 120s idle, 25s acquire, NO statement/query
    // timeout) produced 60s silent kills: frozen instances hoarded pooler
    // sessions until acquires queued, and half-open zombie sockets hung
    // forever with zero log output — a 14-row INSERT rode one to the Vercel
    // kill. Every wait below now fails loud well inside the function budget.
    max: parseInt(process.env.PG_POOL_MAX || '3', 10),
    // Short idle: evict half-open pooler sockets before a request draws one.
    idleTimeoutMillis: 30000,
    // Fail pool acquisition fast (a saturated pool must 500 with a log line,
    // not burn half the function budget before the route even runs).
    connectionTimeoutMillis: 10000,
    // Kill runaway statements server-side…
    statement_timeout: 20000,
    // …and abandon stuck socket reads client-side (zombie connections).
    query_timeout: 25000,
    // Pooler connections can be flaky over constrained networks; keep them lean.
    keepAlive: true,
  };
};

export const pool = new Pool(buildPoolConfig());

// An idle client that dies (pooler reaps it, network blip) emits 'error' on
// the pool. WITHOUT this listener that event is an uncaughtException and
// takes down the whole process — including every in-flight request, which
// then surfaces client-side as a bare timeout with committed DB effects and
// zero server logs. Log and survive: the broken client is already removed
// from rotation by pg-pool.
pool.on('error', (err: any) => {
  console.error(
    'pg pool idle-client error (client removed, process surviving):',
    (err as any)?.message || err
  );
});

// Pool telemetry: total = slots owned, idle = free slots, waiting = queued
// acquirers. The pair that matters: total=max + idle=0 + waiting>0 sustained
// under light traffic = LEAKED slots (checked out, never released); connect
// errors with idle>0 or low totals = the DATABASE is unreachable, not the
// pool. Logged on every pool failure so the next outage names its cause.
export const getPoolStats = (): { total: number; idle: number; waiting: number; max: number } => ({
  total: pool.totalCount,
  idle: pool.idleCount,
  waiting: pool.waitingCount,
  max: parseInt(process.env.PG_POOL_MAX || '3', 10),
});

// Retry helper for transient connection errors (pooler cold starts, timeouts)
export const isTransientError = (err: any): boolean => {
  const msg = String(err?.message || err || '').toLowerCase();
  return (
    msg.includes('connection terminated') ||
    msg.includes('connection timeout') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('enotfound') ||
    msg.includes('econnrefused')
  );
};

// One retry only (worst case ≈ acquire 10s + backoff + acquire 10s ≈ 22s,
// inside the function budget). Two retries stacked past the Vercel kill —
// a third attempt at a sick pooler helps no one and silences the failure.
const withRetry = async <T>(fn: () => Promise<T>, retries = 1, delayMs = 1500, sqlTag = ''): Promise<T> => {
  let lastError: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < retries && isTransientError(err)) {
        await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
        continue;
      }
      const s = getPoolStats();
      console.error(
        `pg pool failure (total=${s.total} idle=${s.idle} waiting=${s.waiting} max=${s.max}):`,
        (err as any)?.message || err
      );
      // Pool collapses are the outage class admins must see first — report
      // one grouped row. Skipped for error_log's own queries: telemetry
      // writing about its own write failure would recurse forever.
      if (!sqlTag.includes('error_log')) {
        void import('../services/errorLog').then((m) =>
          m.reportError({ source: 'server', route: 'pg-pool', message: String((err as any)?.message || err) })
        ).catch(() => undefined);
      }
      throw err;
    }
  }
  throw lastError;
};

// ---------------------------------------------------------------------------
// Query interface — a real PostgreSQL query, parameterized.
// Signature-compatible with the previous fake `query()` so routes keep working:
//   query(text, params) -> { rows, rowCount }
// ---------------------------------------------------------------------------
export const query = async (text: string, params: any[] = []): Promise<{ rows: any[]; rowCount: number }> => {
  const tag = text.trim().slice(0, 34).replace(/\s+/g, ' ');
  // Explicit lease (not pool.query): the client is OURS for the operation,
  // so the watchdog below can destroy exactly the stuck one. pool.query's
  // internal borrow is invisible and proved unrecoverable when wedged.
  const run = async (): Promise<{ rows: any[]; rowCount: number }> => {
    const client = await pool.connect();
    checkedOut.set(client, { since: Date.now(), holder: `query: ${tag}` });
    const origRelease = client.release.bind(client);
    const release = (...args: any[]): void => {
      checkedOut.delete(client);
      (origRelease as any)(...args);
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const res = (await Promise.race([
        client.query(text, params),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(leaseTimeoutError(tag)), LEASE_TIMEOUT_MS);
          (timer as any)?.unref?.();
        }),
      ])) as { rows: any[]; rowCount: number | null };
      release();
      return { rows: res.rows, rowCount: res.rowCount ?? 0 };
    } catch (err) {
      // Timeout (or any failure) destroys the lease: a wedged client must
      // never return to rotation to wedge the next borrower. Releasing with
      // an error drops it from the pool; the pool opens a fresh one on
      // demand. Normal (non-timeout) errors also destroy — a 3.7s reconnect
      // is cheaper than ever trusting a suspect socket again.
      try {
        release(err);
      } catch { /* already gone */ }
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
  // withRetry logs the failure with pool gauges before rethrowing.
  return withRetry(run, 1, 1500, text);
};

// Absolute per-operation ceiling, enforced by OUR OWN timer — not pg's.
// Rationale: queries were observed stuck forever (submitted, executed
// server-side, never settled, pg's readTimeout never fired) with a free
// event loop, permanently leaking the leased slot until the 3-slot pool
// wedged and every route 500'd. Whatever defeats pg's internal timer cannot
// defeat an independent race: on expiry the waiter is rejected AND the
// client is destroyed (released with error so the pool replaces it).
const LEASE_TIMEOUT_MS = 20000;

const leaseTimeoutError = (tag: string): any => {
  const err: any = new Error(`pg lease timeout (20s): ${tag}`);
  err.code = 'PG_LEASE_TIMEOUT';
  return err;
};
//
// Live checkout registry: every leased pool client is tracked with the code
// location that took it and the take timestamp. Added after slots were found
// permanently checked out (frozen gauges for minutes with zero traffic),
// funneling all bursty frontend traffic through 1 slot into 10s acquire
// timeouts and client aborts. Both query() leases and getClient()
// transactions register here; both delete on release/destroy.
const checkedOut = new Map<object, { since: number; holder: string }>();

// Counts for /api/health (public-safe: no stacks). Full holder stacks go to
// the server log on the pressure warning below.
export const getPoolCheckoutDebug = (): {
  checkedOut: number;
  holders: Array<{ heldMs: number; holder: string }>;
} => ({
  checkedOut: checkedOut.size,
  holders: [...checkedOut.values()].map((v) => ({
    heldMs: Date.now() - v.since,
    holder: v.holder,
  })),
});

export const getClient = async (): Promise<PoolClient> => {
  const waitStart = Date.now();
  const client = await pool.connect();
  const waitMs = Date.now() - waitStart;
  const holder =
    new Error('pool checkout').stack?.split('\n').slice(2, 6).join(' <- ') ?? 'unknown';
  checkedOut.set(client, { since: Date.now(), holder });
  // Fire exactly in the failure mode: acquiring had to queue, or the pool is
  // one checkout from empty. The holders list then names the stuck code.
  const maxSlots = pool.options.max ?? 3;
  if (waitMs > 2000 || checkedOut.size >= maxSlots - 1) {
    console.warn(
      `pg pool pressure: acquire waited ${waitMs}ms, ${checkedOut.size}/${maxSlots} checked out:`,
      JSON.stringify(getPoolCheckoutDebug())
    );
  }
  const origRelease = client.release.bind(client);
  client.release = (...args: any[]): any => {
    checkedOut.delete(client);
    return (origRelease as any)(...args);
  };
  const wrappedQuery = client.query.bind(client);
  (client as any).query = async (text: string, p: any[] = []) => {
    return withRetry(() => wrappedQuery(text, p), 1, 1500, text);
  };
  return client;
};

// Columns of type jsonb, per table (verified against information_schema).
// Arrays written to these columns must be JSON-stringified; arrays written
// to text[] columns (users.unlocked_badges, documents.tags, forum_posts.tags)
// must NOT be — pg serializes those natively.
const JSONB_COLUMNS: Record<string, Set<string>> = {
  chat_sessions: new Set(['messages']),
  users: new Set(['preferences']),
  admin_activity_logs: new Set(['before', 'after', 'meta']),
};

// Pure value preparation (exported for unit tests).
// See Table.prepareValue for the why.
export const prepareColumnValue = (table: string, column: string, v: any): any => {
  if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
    return JSON.stringify(v);
  }
  if (Array.isArray(v) && JSONB_COLUMNS[table]?.has(column)) {
    return JSON.stringify(v);
  }
  return v;
};

// Identifiers (column names) are interpolated into SQL — values are always
// parameterized, but keys are not. A crafted JSON key like `a = 1 --` sent as
// a body field would otherwise inject SQL through any dynamic SET/WHERE
// builder. Every helper below validates keys and quotes them.
// Exported for unit tests (injection contract below).
export const assertSafeIdent = (ident: string): void => {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(ident)) {
    throw new Error(`Unsafe SQL identifier: ${ident}`);
  }
};

export const quoteIdent = (ident: string): string => {
  assertSafeIdent(ident);
  return `"${ident}"`;
};

// ---------------------------------------------------------------------------
// Lightweight table helpers (replace the legacy SupabaseDB wrapper).
// Thin, predictable wrappers over real SQL — used by routes that previously
// relied on db/dbAdmin.get/insert/update/delete/findOne/find.
// ---------------------------------------------------------------------------
export class Table {
  constructor(public name: string) {}

  // Prepare a value for insert/update.
  //
  // Background: pg serializes JS arrays as Postgres array literals ({"a","b"}),
  // which is correct for text[] columns (users.unlocked_badges, *.tags) but
  // INVALID for jsonb columns (chat_sessions.messages, users.preferences).
  // So: plain objects are always JSON-stringified; arrays only when the
  // target column is jsonb (registry above); everything else passes through
  // for pg's native serialization.
  private prepareValue(column: string, v: any): any {
    return prepareColumnValue(this.name, column, v);
  }

  private cols(row: Record<string, any>): { set: string[]; vals: any[] } {
    const keys = Object.keys(row).filter((k) => row[k] !== undefined);
    return { set: keys, vals: keys.map((k) => this.prepareValue(k, row[k])) };
  }

  async all(orderBy?: string, limit?: number): Promise<any[]> {
    let sql = `SELECT * FROM ${this.name}`;
    if (orderBy) {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*(\s+(ASC|DESC))?$/i.test(orderBy)) {
        throw new Error(`Unsafe ORDER BY: ${orderBy}`);
      }
      sql += ` ORDER BY ${orderBy}`;
    }
    if (limit) sql += ` LIMIT ${limit}`;
    const res = await query(sql);
    return res.rows;
  }

  async findBy(conditions: Record<string, any>, orderBy?: string, limit?: number): Promise<any[]> {
    const keys = Object.keys(conditions);
    if (keys.length === 0) return this.all(orderBy, limit);
    const where = keys.map((k, i) => `${quoteIdent(k)} = $${i + 1}`).join(' AND ');
    let sql = `SELECT * FROM ${this.name} WHERE ${where}`;
    if (orderBy) {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*(\s+(ASC|DESC))?$/i.test(orderBy)) {
        throw new Error(`Unsafe ORDER BY: ${orderBy}`);
      }
      sql += ` ORDER BY ${orderBy}`;
    }
    if (limit) sql += ` LIMIT ${limit}`;
    const res = await query(sql, keys.map((k) => conditions[k]));
    return res.rows;
  }

  async findOneBy(conditions: Record<string, any>): Promise<any | null> {
    const rows = await this.findBy(conditions, undefined, 1);
    return rows[0] ?? null;
  }

  async insert(row: Record<string, any>): Promise<any> {
    const { set, vals } = this.cols(row);
    const placeholders = set.map((_, i) => `$${i + 1}`).join(', ');
    const columns = set.map((c) => quoteIdent(c)).join(', ');
    const res = await query(
      `INSERT INTO ${this.name} (${columns}) VALUES (${placeholders}) RETURNING *`,
      vals
    );
    return res.rows[0];
  }

  async update(id: any, updates: Record<string, any>): Promise<any | null> {
    const { set, vals } = this.cols(updates);
    if (set.length === 0) return this.findOneBy({ id });
    const assignments = set.map((c, i) => `${quoteIdent(c)} = $${i + 1}`).join(', ');
    const res = await query(
      `UPDATE ${this.name} SET ${assignments} WHERE id = $${set.length + 1} RETURNING *`,
      [...vals, id]
    );
    return res.rows[0] ?? null;
  }

  async deleteWhere(conditions: Record<string, any>): Promise<number> {
    const keys = Object.keys(conditions);
    if (keys.length === 0) throw new Error('deleteWhere requires at least one condition');
    keys.forEach(assertSafeIdent);
    const where = keys.map((k, i) => `${quoteIdent(k)} = $${i + 1}`).join(' AND ');
    const res = await query(`DELETE FROM ${this.name} WHERE ${where}`, keys.map((k) => conditions[k]));
    return res.rowCount ?? 0;
  }
}

// Named table helpers for common tables
export const tables = {
  users: new Table('users'),
  documents: new Table('documents'),
  videos: new Table('videos'),
  forumPosts: new Table('forum_posts'),
  forumComments: new Table('forum_comments'),
  notifications: new Table('notifications'),
  studyEvents: new Table('study_events'),
  bookmarks: new Table('bookmarks'),
  chatSessions: new Table('chat_sessions'),
  tokens: new Table('tokens'),
  xpHistory: new Table('xp_history'),
  badges: new Table('badges'),
  badgeUnlocks: new Table('badge_unlocks'),
  documentViews: new Table('document_views'),
  videoViews: new Table('video_views'),
  videoLikes: new Table('video_likes'),
  videoCompletions: new Table('video_completions'),
  forumVotes: new Table('forum_votes'),
  forumViews: new Table('forum_views'),
  practiceSessions: new Table('practice_sessions'),
  notificationsTable: new Table('notifications'),
};

// ---------------------------------------------------------------------------
// Backward-compatible facade — the old code imported `db` / `dbAdmin`
// (SupabaseDB instances) and called .get/.findOne/.find/.insert/.update/.delete.
// These now delegate to real SQL through Table with identical semantics.
// ---------------------------------------------------------------------------
const legacyToTable = (table: string) => new Table(table);

class LegacyDBFacade {
  async get(table: string, orderBy?: string): Promise<any[]> {
    return legacyToTable(table).all(orderBy);
  }

  async findOne(table: string, predicate: (row: any) => boolean): Promise<any | null> {
    // Old semantics: fetch all, filter client-side. Kept for compatibility,
    // but prefer findBy/findOneBy with explicit conditions.
    const rows = await legacyToTable(table).all();
    return rows.find(predicate) || null;
  }

  async find(table: string, predicate: (row: any) => boolean): Promise<any[]> {
    const rows = await legacyToTable(table).all();
    return rows.filter(predicate);
  }

  async insert(table: string, record: Record<string, any>): Promise<any> {
    return legacyToTable(table).insert(record);
  }

  async update(table: string, id: any, updates: Record<string, any>): Promise<any | null> {
    return legacyToTable(table).update(id, updates);
  }

  async delete(table: string, id: any): Promise<boolean> {
    const res = await legacyToTable(table).deleteWhere({ id });
    return res > 0;
  }
}

export const db = new LegacyDBFacade();
export const dbAdmin = new LegacyDBFacade();

export { supabase, supabaseAdmin };
