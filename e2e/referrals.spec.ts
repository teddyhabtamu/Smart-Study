import { test, expect } from '@playwright/test';
import { TEST_PASSWORD, testDb, uniqueEmail, apiBase, getVerificationToken } from './db';
import { seedUser, uiLogin, uiLogout, deleteAccountViaAPI, dismissTourIfOpen } from './helpers';

// Referral program end to end: referrer shares ?ref=CODE, 5 friends register
// through the real API and verify (real tokens), a pending reward + admin
// notification land, the referrer sees 5/5 + Under review on /subscription,
// admin approves, referrer flips to premium with ~1 month of premium_until.
// admin approves, referrer flips to premium with ~1 month of premium_until.
// Long budget: 5 real registers (bcrypt) + 5 verifies + 3 UI logins.
test.setTimeout(300000);
test('refer 5 verified friends, queue, approve, +1 Pro month', async ({ page }) => {
  const referrer = await seedUser('referrer');
  await testDb().query('UPDATE users SET is_premium = FALSE WHERE id = $1', [referrer.id]);
  const codeRow = await testDb().query('SELECT referral_code FROM users WHERE id = $1', [referrer.id]);
  let refCode: string | null = codeRow.rows[0]?.referral_code || null;

  const admin = await seedUser('referral-admin');
  const adminEmail = uniqueEmail('referral-admin');
  await testDb().query(`UPDATE users SET role = 'ADMIN', email = $2 WHERE id = $1`, [admin.id, adminEmail]);

  const refereeEmails: string[] = [];
  try {
    // Referrer's card mints a code lazily if the seeded row lacks one.
    if (!refCode) {
      await uiLogin(page, referrer.email, TEST_PASSWORD);
      await dismissTourIfOpen(page);
      await page.goto('/subscription');
      await expect(page.getByText('Get Pro free — invite friends')).toBeVisible({ timeout: 20000 });
      const minted = await testDb().query('SELECT referral_code FROM users WHERE id = $1', [referrer.id]);
      refCode = minted.rows[0]?.referral_code || null;
      await uiLogout(page);
    }
    expect(refCode).toBeTruthy();

    // 5 friends: real register (with ?ref= code) + real email verification.
    for (let i = 0; i < 5; i++) {
      const email = uniqueEmail(`ref-friend${i}`);
      refereeEmails.push(email);
      const reg = await fetch(`${apiBase()}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `Friend ${i}`, email, password: TEST_PASSWORD, referralCode: refCode }),
      });
      expect(reg.status).toBe(201);
      const userIdRow = await testDb().query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
      const token = await getVerificationToken(userIdRow.rows[0].id);
      expect(token).toBeTruthy();
      const ver = await fetch(`${apiBase()}/auth/verify-email?token=${token}`);
      expect(ver.status).toBe(200);
    }

    // Pending reward + awaited admin notification (same guarantee as claims).
    const rewardRow = await testDb().query(
      `SELECT id, status FROM referral_rewards WHERE referrer_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [referrer.id]
    );
    expect(rewardRow.rows[0]?.status).toBe('pending');
    const adminIdRow = await testDb().query(`SELECT id FROM users WHERE email = $1`, [adminEmail]);
    await expect
      .poll(async () => {
        const n = await testDb().query(
          `SELECT COUNT(*) AS c FROM notifications WHERE user_id = $1 AND title = 'Referral reward ready'`,
          [adminIdRow.rows[0].id]
        );
        return Number(n.rows[0].c);
      }, { timeout: 15000 })
      .toBeGreaterThan(0);

    // Referrer sees live progress on the Subscription page.
    await uiLogin(page, referrer.email, TEST_PASSWORD);
    await dismissTourIfOpen(page);
    await page.goto('/subscription');
    await expect(page.getByText('5 of 5 verified')).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Under review 🎉')).toBeVisible();
    await uiLogout(page);

    // Admin approves from the Students queue (row-scoped like claims).
    await uiLogin(page, adminEmail, TEST_PASSWORD);
    await dismissTourIfOpen(page);
    await page.goto('/admin');
    await page.getByRole('button', { name: 'Students' }).click();
    await expect(page.getByText('Referral rewards')).toBeVisible({ timeout: 20000 });
    const queue = page.locator('div.border-emerald-200', { hasText: 'Referral rewards' });
    const emailEl = queue.getByText(referrer.email);
    await expect(emailEl).toBeVisible();
    const myRow = emailEl.locator('xpath=ancestor::div[contains(@class,"bg-zinc-50")][1]');
    await myRow.getByRole('button', { name: 'Approve +1 mo' }).click();
    await expect(myRow).toHaveCount(0, { timeout: 20000 });
    await uiLogout(page);

    // Pro flipped with a stacked ~1-month expiry (not forever like paid).
    const proRow = await testDb().query(
      `SELECT is_premium, premium_until FROM users WHERE id = $1`,
      [referrer.id]
    );
    expect(proRow.rows[0]?.is_premium).toBe(true);
    const until = new Date(proRow.rows[0]?.premium_until).getTime();
    const days = (until - Date.now()) / 86400e3;
    expect(days).toBeGreaterThan(27);
    expect(days).toBeLessThan(33);
  } finally {
    for (const email of refereeEmails) {
      await deleteAccountViaAPI(email, TEST_PASSWORD).catch(() => undefined);
    }
    await deleteAccountViaAPI(referrer.email, TEST_PASSWORD).catch(() => undefined);
    await deleteAccountViaAPI(adminEmail, TEST_PASSWORD).catch(() => undefined);
  }
});
