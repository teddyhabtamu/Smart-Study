/**
 * Database migration runner (pg-based, no Supabase dashboard pasting).
 *
 * Usage: npm run db:migrate  (needs PG_POOLER_URL or DATABASE_URL in .env)
 *
 * - Applies every *.sql file in src/database/migrations/ in filename order
 * - Tracks applied files in the schema_migrations table (created on first run)
 * - Each file runs inside its own transaction (all-or-nothing per file)
 * - Files must be idempotent (use IF NOT EXISTS / DROP IF EXISTS) since a
 *   failed-then-fixed file will be retried (only unrecorded files run)
 */
import fs from 'fs';
import path from 'path';
import { pool } from './config';

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

const ensureTrackingTable = async (): Promise<void> => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
};

const getApplied = async (): Promise<Set<string>> => {
  const res = await pool.query('SELECT filename FROM schema_migrations');
  return new Set(res.rows.map((r: any) => r.filename));
};

const migrate = async (): Promise<void> => {
  console.log('🚀 Starting database migration...');

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('No migration files found.');
    return;
  }

  await ensureTrackingTable();
  const applied = await getApplied();
  const pending = files.filter((f) => !applied.has(f));

  if (pending.length === 0) {
    console.log(`✅ Database is up to date (${files.length} migrations applied).`);
    return;
  }

  console.log(`📄 Applying ${pending.length} pending migration(s)...`);

  for (const file of pending) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
    if (!sql.trim()) {
      console.log(`⏭️  Skipping empty file: ${file}`);
      continue;
    }
    // Whole file in one transaction. node-postgres executes multi-statement
    // strings (including DO $$ blocks) in a single simple-protocol query.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`✅ Applied: ${file}`);
    } catch (err: any) {
      await client.query('ROLLBACK').catch(() => undefined);
      console.error(`❌ Failed: ${file} — ${err.message?.split('\n')[0]}`);
      throw err;
    } finally {
      client.release();
    }
  }

  console.log('✅ Database migration completed successfully!');
};

migrate()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
