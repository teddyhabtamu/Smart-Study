import { test, expect } from '@playwright/test';
import { futureDate, TEST_PASSWORD } from './db';
import { seedUser, uiLogin, deleteAccountViaAPI } from './helpers';

// Smart Schedule with the AI leg stubbed at the network layer: deterministic
// (no quota burn, no flakes) while the persist leg — batch INSERT, dedup,
// list refresh, toast — runs for real against the API + DB. The AI contract
// itself is covered by backend integration tests with a mocked AI service.
test('stubbed plan persists via batch and renders as cards', async ({ page }) => {
  const { email } = await seedUser('plan');
  const stamp = Date.now().toString(36);
  const titles = [`E2E plan ${stamp} A`, `E2E plan ${stamp} B`];
  const plan = [
    {
      title: titles[0],
      subject: 'Mathematics',
      date: futureDate(7),
      type: 'Revision',
      notes: 'Stubbed session one.',
    },
    {
      title: titles[1],
      subject: 'Physics',
      date: futureDate(8),
      type: 'Exam',
      notes: 'Stubbed session two.',
    },
  ];
  try {
    await uiLogin(page, email, TEST_PASSWORD);
    await page.goto('/planner');

    await page.route('**/api/ai-tutor/generate-study-plan', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { plan, xpGained: 0, persisted: false, events: [] },
          message: 'Study plan generated successfully',
        }),
      });
    });

    await page.getByRole('button', { name: 'Smart Schedule' }).click();
    await page
      .getByPlaceholder(/Math exam on Quadratic/)
      .fill('E2E stubbed schedule please');
    await page.getByRole('button', { name: 'Generate Schedule' }).click();

    // Batch path: success toast with the scheduled count…
    await expect(page.getByText('Study plan generated successfully! (2 sessions scheduled)')).toBeVisible();
    // …and both sessions render as cards (proves INSERT + refresh; the Up
    // Next rail duplicates titles, so scope to list cards like planner.spec).
    await expect(page.locator('h4.truncate', { hasText: titles[0] })).toBeVisible();
    await expect(page.locator('h4.truncate', { hasText: titles[1] })).toBeVisible();
  } finally {
    await deleteAccountViaAPI(email, TEST_PASSWORD);
    await page.unroute('**/api/ai-tutor/generate-study-plan');
  }
});
