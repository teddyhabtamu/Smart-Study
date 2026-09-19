import { test, expect } from '@playwright/test';
import { TEST_PASSWORD } from './db';
import { seedUser, uiLogin, uiLogout, deleteAccountViaAPI, dismissTourIfOpen } from './helpers';

// Shared ChatInput through the REAL AI Tutor page, SSE stubbed at the
// network layer: Enter sends, Shift+Enter makes a newline (no send), and
// oversized images are rejected before OCR starts. Seeded users are
// premium, so no guest gate interferes.
const SSE_REPLY = 'E2E stubbed tutor reply';

test('enter sends, shift+enter newlines, oversized image rejected', async ({ page }) => {
  const { email } = await seedUser('aichat');
  try {
    await uiLogin(page, email, TEST_PASSWORD);
    await dismissTourIfOpen(page);
    await page.goto('/ai-tutor');

    let streamHits = 0;
    await page.route('**/api/ai-tutor/chat/stream', async (route) => {
      streamHits += 1;
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: `event: delta\ndata: {"text":"${SSE_REPLY}"}\n\nevent: done\ndata: {"xpGained":0}\n\n`,
      });
    });

    const box = page.getByPlaceholder(/Ask a question/);

    // Shift+Enter inserts a newline and sends nothing (no stream request).
    await box.fill('first line');
    await box.press('Shift+Enter');
    await expect(box).toHaveValue('first line\n');
    await expect.poll(() => streamHits, { timeout: 5000 }).toBe(0);

    // Plain Enter sends the two-line message; the stubbed reply streams in.
    await box.press('Enter');
    await expect(page.getByText('first line')).toBeVisible({ timeout: 20000 });
    await expect(page.getByText(SSE_REPLY)).toBeVisible({ timeout: 20000 });
    await expect(box).toHaveValue('');

    // Oversized image: friendly rejection, no OCR attempt, field untouched.
    const big = Buffer.alloc(9 * 1024 * 1024, 0);
    await page.locator('#image-upload-input').setInputFiles([
      { name: 'huge.png', mimeType: 'image/png', buffer: big },
    ]);
    await expect(page.getByText(/too large/i)).toBeVisible({ timeout: 15000 });
    await expect(box).toHaveValue('');
  } finally {
    await uiLogout(page).catch(() => undefined);
    await deleteAccountViaAPI(email, TEST_PASSWORD);
    await page.unroute('**/api/ai-tutor/chat/stream');
  }
});
