import { test, expect } from '@playwright/test';
import { TEST_PASSWORD } from './db';
import { seedUser, uiLogin, deleteAccountViaAPI } from './helpers';

// Video like: optimistic flip, server reconcile, persistence across reload.
// No timing assertions (those flake) — the contract is state truth: after
// reload, the server-known liked state must show, and unliking must clear
// it (leaves zero residue for other runs).
test('like persists across reload, unlike clears it', async ({ page }) => {
  const { email } = await seedUser('like');
  try {
    await uiLogin(page, email, TEST_PASSWORD);
    await page.goto('/videos');

    // Open the first video card in the listing.
    const firstCard = page.locator('a[href*="/video/"], a[href*="/watch"]').first();
    await expect(firstCard).toBeVisible();
    await firstCard.click();

    // Like: toast confirms, button flips to Unlike.
    await page.getByTitle('Like').click();
    await expect(page.getByText('Video liked!')).toBeVisible();
    await expect(page.getByTitle('Unlike')).toBeVisible();

    // Reload: the liked state must come from the server, not memory.
    await page.reload();
    await expect(page.getByTitle('Unlike')).toBeVisible();

    // Unlike to leave clean state.
    await page.getByTitle('Unlike').click();
    await expect(page.getByText('Video unliked')).toBeVisible();
    await expect(page.getByTitle('Like')).toBeVisible();
  } finally {
    await deleteAccountViaAPI(email, TEST_PASSWORD);
  }
});
