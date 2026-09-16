import { testDb, closeTestDb, apiBase, TEST_PASSWORD } from './db';

// Safety net: specs delete their own users via the app API, but a failed
// run can orphan e2e accounts. Purge any leftovers through the same
// delete-account endpoint (which owns the FK cascade — never raw SQL).
export default async function globalTeardown(): Promise<void> {
  try {
    const r = await testDb().query(
      `SELECT email FROM users WHERE email LIKE 'e2e.%@example.com'`
    );
    for (const row of r.rows as Array<{ email: string }>) {
      try {
        const login = await fetch(`${apiBase()}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: row.email, password: TEST_PASSWORD }),
        });
        if (!login.ok) continue;
        const body = await login.json();
        const token = body?.token ?? body?.data?.token;
        if (!token) continue;
        await fetch(`${apiBase()}/users/account`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ password: TEST_PASSWORD }),
        }).catch(() => undefined);
        console.log(`e2e teardown: purged orphan ${row.email}`);
      } catch {
        // Best effort per account; never fail the run on cleanup.
      }
    }
  } catch (err: any) {
    console.log(`e2e teardown: orphan scan skipped (${String(err?.message || err).slice(0, 100)})`);
  }
  await closeTestDb();
}
