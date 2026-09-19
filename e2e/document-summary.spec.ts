import { test, expect } from '@playwright/test';
import { TEST_PASSWORD, testDb } from './db';
import { seedUser, uiLogin, deleteAccountViaAPI, dismissTourIfOpen } from './helpers';

// Document summary tiers through the REAL reader page: the chat endpoint is
// stubbed to answer WITHOUT the excerpt (partial + notice, e.g. Pro-gated
// or unscanned file) and the page must render the overview WITH its notice
// banner — never the "couldn't read" wall. A real document row is seeded;
// no AI quota burns.
test('partial summary renders overview with notice banner', async ({ page }) => {
  const { email, id: userId } = await seedUser('docsum');
  const docId = `00000000-0000-4000-8000-${Date.now().toString(16).padStart(12, '0')}`;
  await testDb().query(
    `INSERT INTO documents (id, title, description, subject, grade, file_type, file_url, is_premium, uploaded_by)
     VALUES ($1, 'E2E Photosynthesis Notes', 'Cells and energy.', 'Biology', 10, 'PDF', 'https://drive.google.com/file/d/FAKE123/view', FALSE, $2)`,
    [docId, userId]
  );
  try {
    await uiLogin(page, email, TEST_PASSWORD);
    await dismissTourIfOpen(page);

    await page.route('**/api/ai-tutor/chat', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            response: 'E2E general overview of photosynthesis.',
            grounded: false,
            partial: true,
            notice: 'Pro material — general overview below.',
          },
        }),
      });
    });

    await page.goto(`/document/${docId}`);
    // Overview text renders (not the unavailable wall)…
    await expect(page.getByText('E2E general overview of photosynthesis.')).toBeVisible({ timeout: 30000 });
    // …with its honesty banner, and no retry dead-end.
    await expect(page.getByText('Pro material — general overview below.')).toBeVisible();
    await expect(page.getByText("We couldn't read this document's text.")).toHaveCount(0);
  } finally {
    await deleteAccountViaAPI(email, TEST_PASSWORD);
    await page.unroute('**/api/ai-tutor/chat');
  }
});
