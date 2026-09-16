import { test, expect } from '@playwright/test';
import { futureDate, TEST_PASSWORD } from './db';
import { seedUser, uiLogin, deleteAccountViaAPI, pickDate } from './helpers';

// Planner journey through the REAL UI + API + DB: empty state → create via
// the Add Task modal (custom DatePicker included) → complete for XP (toast
// + completed style) → delete. Each run seeds its own user, so reruns and
// ordering can never pollute assertions.
test('create, complete (XP toast), delete a study task', async ({ page }) => {
  const { email } = await seedUser('planner');
  const stamp = Date.now().toString(36);
  const title = `E2E task ${stamp}`;
  try {
    await uiLogin(page, email, TEST_PASSWORD);
    await page.goto('/planner');

    // Fresh account starts empty.
    await expect(page.getByText('Your schedule is empty')).toBeVisible();

    // Create through the modal (defaults: Mathematics / Revision are fine).
    await page.getByRole('button', { name: 'Add Task' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByPlaceholder('e.g. Algebra Chapter 1 Review').fill(title);
    await pickDate(page, futureDate(5));
    await dialog.getByRole('button', { name: 'Add to Schedule' }).click();

    // The new card renders in its day group (the Up Next rail shows a
    // second h4 with the same title — .truncate picks the list card).
    const titleEl = page.locator('h4.truncate', { hasText: title });
    await expect(titleEl).toBeVisible();
    const card = titleEl.locator('xpath=ancestor::div[contains(@class,"group")][1]');

    // Complete it: XP toast + struck-through title.
    await card.getByTitle('Complete task').click();
    await expect(page.getByText(/Task [Cc]ompleted/)).toBeVisible();
    await expect(titleEl).toHaveClass(/line-through/);

    // Delete it again.
    await card.getByTitle('Delete task').click();
    await expect(page.locator('h4.truncate', { hasText: title })).toHaveCount(0);
  } finally {
    await deleteAccountViaAPI(email, TEST_PASSWORD);
  }
});
