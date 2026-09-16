import { testDb, closeTestDb } from './db';

// Global setup: fail fast with a USEFUL message when the database is
// unreachable, instead of letting every spec time out one by one.
// (Per-test users are seeded inside specs via helpers, not here.)
export default async function globalSetup(): Promise<void> {
  try {
    const r = await testDb().query('SELECT 1 AS ok');
    if (r.rows[0]?.ok !== 1) throw new Error('unexpected SELECT 1 result');
    console.log('\ne2e setup: database reachable\n');
  } catch (err: any) {
    await closeTestDb().catch(() => undefined);
    throw new Error(
      `E2E setup: cannot reach Postgres (${String(err?.message || err).slice(0, 120)}). ` +
        'Start the backend once (npm run dev in backend/) or set DATABASE_URL.'
    );
  }
  await closeTestDb();
}
