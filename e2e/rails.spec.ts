import { test, expect } from '@playwright/test';
import { TEST_PASSWORD } from './db';
import { seedUser, uiLogin, deleteAccountViaAPI } from './helpers';

// Mouse-wheel horizontal scrolling: touchpads swipe rails natively, but a
// plain mouse wheel must translate to sideways motion while hovering the
// strip — and release back to the page at either edge (never trap scroll).
test('mouse wheel scrolls the subject rail sideways, releases at edges', async ({ page }) => {
  const { email } = await seedUser('rails');
  try {
    await uiLogin(page, email, TEST_PASSWORD);
    await page.goto('/videos');

    // Subject pills live in drill-down mode: enter any grade first.
    await page.getByRole('button', { name: /Grade 9/ }).click();
    const rail = page.getByRole('region', { name: 'Subjects' });
    await expect(rail).toBeVisible();
    const box = await rail.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);

    const at = () => rail.evaluate((el) => (el as HTMLElement).scrollLeft);
    expect(await at()).toBe(0);

    // Roll down: strip moves right.
    await page.mouse.wheel(0, 300);
    await expect.poll(at, { timeout: 5000 }).toBeGreaterThan(50);

    // Roll up: strip moves back to the start (edge release hands the page
    // back instead of sticking).
    await page.mouse.wheel(0, -3000);
    await expect.poll(at, { timeout: 5000 }).toEqual(0);
  } finally {
    await deleteAccountViaAPI(email, TEST_PASSWORD);
  }
});
