import { test, expect } from '@playwright/test';
import { TEST_PASSWORD, testDb, uniqueEmail } from './db';
import { seedUser, uiLogin, uiLogout, deleteAccountViaAPI, dismissTourIfOpen } from './helpers';

// Pro payment claims end to end: free student files a claim (ticket UI +
// DB row), admin sees it in the Students queue, approves, student flips to
// premium and the claim settles. Each run seeds its own student + admin.
test('claim, queue, approve, premium', async ({ page }) => {
  const student = await seedUser('claim-student');
  await testDb().query('UPDATE users SET is_premium = FALSE WHERE id = $1', [student.id]);

  const adminEmail = uniqueEmail('claim-admin');
  const admin = await seedUser('claim-admin');
  await testDb().query(`UPDATE users SET role = 'ADMIN', email = $2 WHERE id = $1`, [admin.id, adminEmail]);
  const adminCreds = { email: adminEmail, password: admin.password };

  try {
    // Student files the claim through the real modal flow.
    await uiLogin(page, student.email, TEST_PASSWORD);
    await dismissTourIfOpen(page);
    await page.goto('/subscription');
    await page.getByRole('button', { name: 'Upgrade via Telebirr' }).click();
    await page.getByRole('button', { name: 'I have completed payment' }).click();
    await page.getByPlaceholder(/TXN9X2KQ4M/).fill('E2ETX1');
    await page.getByRole('button', { name: 'I have sent the receipt' }).click();

    // Ticket UI reads server truth (survives modal close — assert after one).
    await expect(page.getByText('Receipt Submitted')).toBeVisible();
    await expect(page.getByText('E2ETX1')).toBeVisible();

    const claimRow = await testDb().query(
      `SELECT id, status, transaction_ref FROM payment_claims WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [student.id]
    );
    expect(claimRow.rows[0]?.status).toBe('pending');
    expect(claimRow.rows[0]?.transaction_ref).toBe('E2ETX1');

    // Admin notification landed inline with the claim (not fire-and-forget:
    // a void post-response block dies on runtime suspend — the production
    // failure this guards).
    const adminIdRow = await testDb().query(`SELECT id FROM users WHERE email = $1`, [adminCreds.email]);
    await expect
      .poll(async () => {
        const n = await testDb().query(
          `SELECT COUNT(*) AS c FROM notifications WHERE user_id = $1 AND title = 'New Pro payment claim'`,
          [adminIdRow.rows[0].id]
        );
        return Number(n.rows[0].c);
      }, { timeout: 15000 })
      .toBeGreaterThan(0);

    // Admin approves from the Students queue (identity pre-linked: no
    // email matching step exists anywhere in this flow). Fresh session:
    // the login page redirects authenticated users away.
    await uiLogout(page);
    await uiLogin(page, adminCreds.email, adminCreds.password);
    await dismissTourIfOpen(page);
    await page.goto('/admin');
    await page.getByRole('button', { name: 'Students' }).click();
    await expect(page.getByText('Pending payments')).toBeVisible();
    // Scope to the amber queue card: the same email also renders in the
    // students table rows below.
    const queue = page.locator('div.border-amber-200', { hasText: 'Pending payments' });
    // Row-scoped (planner.spec pattern): the queue can hold other
    // students' leftover claims, so the bare Approve button is ambiguous.
    const emailEl = queue.getByText(student.email);
    await expect(emailEl).toBeVisible();
    const myRow = emailEl.locator('xpath=ancestor::div[contains(@class,"bg-zinc-50")][1]');
    await myRow.getByRole('button', { name: 'Approve' }).click();
    // Our row settles (other students' leftover rows may keep the queue
    // itself visible — assert ours, not the panel).
    await expect(myRow).toHaveCount(0, { timeout: 20000 });

    // Upgrade applied + claim settled in the DB.
    await expect
      .poll(async () => {
        const u = await testDb().query('SELECT is_premium FROM users WHERE id = $1', [student.id]);
        return u.rows[0]?.is_premium;
      }, { timeout: 20000 })
      .toBe(true);
    const settled = await testDb().query(
      `SELECT status FROM payment_claims WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [student.id]
    );
    expect(settled.rows[0]?.status).toBe('approved');
  } finally {
    await deleteAccountViaAPI(student.email, TEST_PASSWORD);
    await deleteAccountViaAPI(adminCreds.email, adminCreds.password);
  }
});
