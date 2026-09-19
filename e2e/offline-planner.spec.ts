import { test, expect } from '@playwright/test';
import { futureDate, TEST_PASSWORD, testDb } from './db';
import { seedUser, uiLogin, deleteAccountViaAPI, pickDate } from './helpers';

// Offline planner through the REAL UI + API + DB: create a task online,
// kill the network, complete it (optimistic toggle + offline banner +
// pending chip, no failure toast), prove nothing synced yet, reconnect,
// prove the completion lands in the DB and the banner clears. Seeded users
// are premium, so no paywall interferes.
test('offline complete queues, reconnect syncs', async ({ page }) => {
  const { email, id } = await seedUser('offline');
  const stamp = Date.now().toString(36);
  const title = `E2E offline task ${stamp}`;
  try {
    await uiLogin(page, email, TEST_PASSWORD);
    await page.goto('/planner');

    await page.getByRole('button', { name: 'Add Task' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('e.g. Algebra Chapter 1 Review').fill(title);
    await pickDate(page, futureDate(5));
    await dialog.getByRole('button', { name: 'Add to Schedule' }).click();
    const titleEl = page.locator('h4.truncate', { hasText: title });
    await expect(titleEl).toBeVisible();
    const card = titleEl.locator('xpath=ancestor::div[contains(@class,"group")][1]');

    // Kill the network with the page loaded (no reload: dev has no SW).
    await page.context().setOffline(true);

    await card.getByTitle('Complete task').click();

    // Optimistic success, explicitly offline: struck title, success toast
    // (never the failure one), planner banner + pending chip. (The PWA
    // shell has its own offline strip, so scope to the planner copy.)
    await expect(titleEl).toHaveClass(/line-through/);
    await expect(page.getByText(/Task [Cc]ompleted/)).toBeVisible();
    await expect(page.getByText('showing your saved plan')).toBeVisible();
    await expect(page.getByText('1 pending')).toBeVisible();
    await expect(page.getByText('Failed to update task status')).toHaveCount(0);

    // Nothing reached the server while offline.
    const whileOffline = await testDb().query(
      'SELECT is_completed FROM study_events WHERE user_id = $1 AND title = $2',
      [id, title]
    );
    expect(whileOffline.rows[0]?.is_completed).toBe(false);

    // Reconnect: the queued tap replays (XP-safe by server guard) and the
    // planner banner clears.
    await page.context().setOffline(false);
    await expect(page.getByText('showing your saved plan')).toHaveCount(0, { timeout: 30000 });
    await expect
      .poll(async () => {
        const r = await testDb().query(
          'SELECT is_completed FROM study_events WHERE user_id = $1 AND title = $2',
          [id, title]
        );
        return r.rows[0]?.is_completed;
      }, { timeout: 30000 })
      .toBe(true);
  } finally {
    await page.context().setOffline(false).catch(() => undefined);
    await deleteAccountViaAPI(email, TEST_PASSWORD);
  }
});
