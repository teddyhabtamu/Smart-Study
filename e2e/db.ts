import { readFileSync } from 'fs';
import { Pool } from 'pg';

// Direct DB access for E2E setup only (seed verified users, read email
// verification tokens). Specs otherwise drive the real UI + API. Never
// import this from app code — tests only.

const loadEnv = (): Record<string, string> => {
  const env: Record<string, string> = { ...(process.env as Record<string, string>) };
  try {
    // backend/.env locally; real env vars (CI secrets) always win.
    const raw = readFileSync(new URL('../backend/.env', import.meta.url), 'utf8');
    for (const line of raw.split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m || env[m[1]] !== undefined) continue;
      let v = (m[2] ?? '').trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      env[m[1]!] = v;
    }
  } catch {
    // No dotenv file (CI): env vars must cover everything.
  }
  return env;
};

let pool: Pool | undefined;

export const testDb = (): Pool => {
  if (!pool) {
    const env = loadEnv();
    const cs = env.PG_POOLER_URL || env.DATABASE_URL;
    if (!cs) {
      throw new Error(
        'E2E needs PG_POOLER_URL or DATABASE_URL (backend/.env locally, secrets in CI).'
      );
    }
    pool = new Pool({
      connectionString: cs,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 15000,
    });
  }
  return pool;
};

export const closeTestDb = async (): Promise<void> => {
  await pool?.end();
  pool = undefined;
};

export const apiBase = (): string => {
  const env = loadEnv();
  return (env.E2E_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');
};

export const TEST_PASSWORD = 'E2e-test-pass-9!';
// bcrypt(10) of TEST_PASSWORD, precomputed so specs need no hashing dep.
const TEST_PASSWORD_HASH =
  '$2b$10$6NIGttKw5ejbL.T4IOz0KuttO8Gsc9ERUvw2qSoAoAzel.pNLjcR2';

export interface SeededUser {
  id: string;
  email: string;
  password: string;
}

// Verified premium student, created directly: registration itself is covered
// by auth.spec (which goes through real email verification via the token
// lookup below); every other spec needs a ready session without an inbox.
export const createVerifiedUser = async (email: string, name = 'E2E Student'): Promise<SeededUser> => {
  const { randomUUID } = await import('crypto');
  const id = randomUUID();
  await testDb().query(
    `INSERT INTO users (id, name, email, password_hash, role, email_verified, is_premium, grade, unlocked_badges)
     VALUES ($1, $2, $3, $4, 'STUDENT', TRUE, TRUE, 10, ARRAY['b1'])`,
    [id, name, email.toLowerCase(), TEST_PASSWORD_HASH]
  );
  return { id, email: email.toLowerCase(), password: TEST_PASSWORD };
};

// Token the register route mailed (read back for the verify-email step).
export const getVerificationToken = async (userId: string): Promise<string | null> => {
  const r = await testDb().query(
    `SELECT token FROM tokens WHERE user_id = $1 AND type = 'email-verification' ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  return r.rows[0]?.token ?? null;
};

export const getUserIdByEmail = async (email: string): Promise<string | null> => {
  const r = await testDb().query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
  return r.rows[0]?.id ?? null;
};

// YYYY-MM-DD `days` out (test data must sit in the future for validators).
export const futureDate = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const uniqueEmail = (tag: string): string =>
  `e2e.${tag}.${Date.now().toString(36)}@example.com`;
