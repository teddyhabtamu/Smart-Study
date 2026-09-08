import dotenv from 'dotenv';

// Load environment variables at the top of this module
dotenv.config();

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Pool, PoolClient } from 'pg';
import { config } from '../config';

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
// Connects over the Supabase connection pooler (IPv4-friendly session mode).
// The DATABASE_URL in the environment may point at the direct (IPv6-only)
// db.<ref>.supabase.co host; PG_POOLER_URL takes precedence when set.
// ---------------------------------------------------------------------------
const buildPoolConfig = () => {
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
    max: parseInt(process.env.PG_POOL_MAX || '10', 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 15000,
    // Pooler connections can be flaky over constrained networks; keep them lean.
    keepAlive: true,
  };
};

export const pool = new Pool(buildPoolConfig());

// Retry helper for transient connection errors (pooler cold starts, timeouts)
const isTransientError = (err: any): boolean => {
  const msg = String(err?.message || err || '');
  return (
    msg.includes('connection terminated') ||
    msg.includes('connection timeout') ||
    msg.includes('Connection terminated') ||
    msg.includes('ECONNRESET') ||
    msg.includes('ETIMEDOUT')
  );
};

const withRetry = async <T>(fn: () => Promise<T>, retries = 2, delayMs = 1500): Promise<T> => {
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
  const res = await withRetry(() => pool.query(text, params));
  return { rows: res.rows, rowCount: res.rowCount ?? 0 };
};

// Get a client from the pool (for multi-statement transactions)
export const getClient = async (): Promise<PoolClient> => {
  const client = await pool.connect();
  const wrappedQuery = client.query.bind(client);
  (client as any).query = async (text: string, p: any[] = []) => {
    return withRetry(() => wrappedQuery(text, p));
  };
  return client;
};

// ---------------------------------------------------------------------------
// Lightweight table helpers (replace the legacy SupabaseDB wrapper).
// Thin, predictable wrappers over real SQL — used by routes that previously
// relied on db/dbAdmin.get/insert/update/delete/findOne/find.
// ---------------------------------------------------------------------------
export class Table {
  constructor(public name: string) {}

  private cols(row: Record<string, any>): { set: string[]; vals: any[] } {
    const keys = Object.keys(row).filter((k) => row[k] !== undefined);
    return { set: keys, vals: keys.map((k) => row[k]) };
  }

  async all(orderBy?: string, limit?: number): Promise<any[]> {
    let sql = `SELECT * FROM ${this.name}`;
    if (orderBy) sql += ` ORDER BY ${orderBy}`;
    if (limit) sql += ` LIMIT ${limit}`;
    const res = await query(sql);
    return res.rows;
  }

  async findBy(conditions: Record<string, any>, orderBy?: string, limit?: number): Promise<any[]> {
    const keys = Object.keys(conditions);
    if (keys.length === 0) return this.all(orderBy, limit);
    const where = keys.map((k, i) => `${k} = $${i + 1}`).join(' AND ');
    let sql = `SELECT * FROM ${this.name} WHERE ${where}`;
    if (orderBy) sql += ` ORDER BY ${orderBy}`;
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
    const columns = set.join(', ');
    const res = await query(
      `INSERT INTO ${this.name} (${columns}) VALUES (${placeholders}) RETURNING *`,
      vals
    );
    return res.rows[0];
  }

  async update(id: any, updates: Record<string, any>): Promise<any | null> {
    const { set, vals } = this.cols(updates);
    if (set.length === 0) return this.findOneBy({ id });
    const assignments = set.map((c, i) => `${c} = $${i + 1}`).join(', ');
    const res = await query(
      `UPDATE ${this.name} SET ${assignments} WHERE id = $${set.length + 1} RETURNING *`,
      [...vals, id]
    );
    return res.rows[0] ?? null;
  }

  async deleteWhere(conditions: Record<string, any>): Promise<number> {
    const keys = Object.keys(conditions);
    if (keys.length === 0) throw new Error('deleteWhere requires at least one condition');
    const where = keys.map((k, i) => `${k} = $${i + 1}`).join(' AND ');
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
