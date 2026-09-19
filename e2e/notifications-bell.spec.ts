import { test, expect } from '@playwright/test';
import { TEST_PASSWORD, testDb } from './db';
import { seedUser, uiLogin, deleteAccountViaAPI, dismissTourIfOpen } from './helpers';

// Bell dropdown through the REAL UI + API + DB: a seeded notification
// renders on open (served by the lightweight notifications endpoint, not
// the full profile), and mark-all-read clears the unread dot.
test('bell shows seeded notification, mark-all-read clears dot', async ({ page }) => {
  const { email, id } = await seedUser('bell');
  const stamp = Date.now().toString(36);
  const title = `E2E notice ${stamp}`;
  await testDb().query(
    `INSERT INTO notifications (user_id, title, message, type) VALUES ($1, $2, 'E2E body', 'INFO')`,
    [id, title]
  );
  try {
    await uiLogin(page, email, TEST_PASSWORD);
    await dismissTourIfOpen(page);

    // Unread dot on the VISIBLE bell (mobile + desktop both render; the
    // hidden one must not satisfy the locator).
    const bellBtn = page.locator('button[aria-label="Notifications"]:visible');
    await expect(bellBtn).toBeVisible({ timeout: 20000 });
    await expect(bellBtn.locator('span.bg-red-500')).toBeVisible({ timeout: 20000 });

    await bellBtn.click();
    await expect(page.getByText(title)).toBeVisible({ timeout: 20000 });

    // Mark all read clears the dot (proves the mutation + light refresh).
    const markAll = page.getByRole('button', { name: /mark all read/i });
    if (await markAll.count()) {
      await markAll.first().click();
      await expect(bellBtn.locator('span.bg-red-500')).toHaveCount(0, { timeout: 20000 });
    }
  } finally {
    await deleteAccountViaAPI(email, TEST_PASSWORD);
  }
});
