import { test, expect } from '@playwright/test';
import { TEST_PASSWORD, testDb } from './db';
import { seedUser, uiLogin, deleteAccountViaAPI, dismissTourIfOpen } from './helpers';

// Review queue through REAL UI + API + DB, AI stubbed at the network layer:
// seeded history (weak Physics, strong Math) → "Review today" surfaces
// Physics → preset Practice with review banner → stubbed 5-question quiz →
// finish → a practice_sessions row lands with the real score. Seeded users
// are premium, so the daily quiz gate never interferes.
const stubQuestions = [1, 2, 3, 4, 5].map((i) => ({
  question: `E2E review question ${i}`,
  options: [`Correct ${i}`, `Wrong ${i} A`, `Wrong ${i} B`, `Wrong ${i} C`],
  // First three resolve to options[0] (clicked), last two to options[1].
  correctAnswer: i <= 3 ? `Correct ${i}` : `Wrong ${i} A`,
  explanation: `Because ${i}.`,
}));

test('weak subject review: card, preset, quiz, recorded session', async ({ page }) => {
  const { email, id } = await seedUser('review');
  await testDb().query(
    `INSERT INTO practice_sessions (user_id, subject, score, total_questions)
     VALUES ($1, 'Physics', 2, 5), ($1, 'Physics', 1, 5), ($1, 'Mathematics', 5, 5)`,
    [id]
  );
  try {
    await uiLogin(page, email, TEST_PASSWORD);
    await page.goto('/dashboard');
    await dismissTourIfOpen(page);

    // Weakest subject surfaces with its average.
    await expect(page.getByText('Review today')).toBeVisible();
    const startBtn = page.getByRole('button', { name: 'Start review' });
    const card = startBtn.locator('xpath=ancestor::div[contains(@class,"rounded-2xl")][1]');
    await expect(card.getByText('Physics')).toBeVisible();

    // AI generation stubbed; everything downstream runs for real.
    await page.route('**/api/ai-tutor/generate-practice-quiz', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { questions: stubQuestions, xpGained: 0 } }),
      });
    });

    await startBtn.click();
    await expect(page).toHaveURL(/practice/);
    await expect(page.getByText(/Review mode: Physics/)).toBeVisible();

    await page.getByRole('button', { name: 'Start Practice Session' }).click();

    // Answer all five with the first option (score 3 by stub design).
    // Scoped to <main>: the sidebar search trigger shares the option
    // button classes, and an unscoped first() opens the search palette.
    const quiz = page.locator('main');
    await expect(quiz.getByText('E2E review question 1')).toBeVisible({ timeout: 60000 });
    for (let i = 0; i < 5; i++) {
      const options = quiz.locator('button.w-full.text-left');
      await expect(options.first()).toBeVisible();
      await options.first().click();
      await page.getByRole('button', { name: i === 4 ? 'Finish Quiz' : 'Next Question' }).click();
    }

    // The completion + session row land in the DB (background write).
    await expect
      .poll(async () => {
        const r = await testDb().query(
          `SELECT score, total_questions FROM practice_sessions
           WHERE user_id = $1 AND subject = 'Physics' ORDER BY completed_at DESC LIMIT 1`,
          [id]
        );
        return r.rows[0] ? `${r.rows[0].score}/${r.rows[0].total_questions}` : 'none';
      }, { timeout: 30000 })
      .toBe('3/5');
  } finally {
    await deleteAccountViaAPI(email, TEST_PASSWORD);
    await page.unroute('**/api/ai-tutor/generate-practice-quiz');
  }
});
