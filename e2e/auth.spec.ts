import { test, expect } from '@playwright/test';
import {
  getUserIdByEmail,
  getVerificationToken,
  uniqueEmail,
  TEST_PASSWORD,
} from './db';
import { deleteAccountViaAPI, seedUser, uiLogin } from './helpers';

// Auth journey through the REAL UI + API: register (pending → verified via
// the mailed token read back from the DB, no inbox needed) → dashboard →
// logout. Cleans up its user through the app's own delete endpoint.
test('register, verify, login, logout', async ({ page }) => {
  const email = uniqueEmail('reg');
  const name = 'E2E Register';

  // Register.
  await page.goto('/register');
  await page.getByPlaceholder('e.g. Hana Tesfaye').fill(name);
  await page.getByPlaceholder('student@example.com').fill(email);
  await page.getByPlaceholder('••••••••').nth(0).fill(TEST_PASSWORD);
  await page.getByPlaceholder('••••••••').nth(1).fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Create Account', exact: true }).click();
  await expect(page.getByText('Check your inbox')).toBeVisible();

  // Verify via the token the server mailed (no inbox in tests).
  // Verification auto-signs-in: the dashboard greeting proves it.
  const userId = await getUserIdByEmail(email);
  expect(userId).not.toBeNull();
  const token = await getVerificationToken(userId!);
  expect(token).not.toBeNull();
  await page.goto(`/verify-email?token=${token}`);
  await expect(page.getByRole('heading', { name: 'Email Verified Successfully!' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /E2E/ })).toBeVisible();

  // Logout returns to login (logged-in visits to /login bounce to dashboard,
  // so the form only exists once logged out).
  await page.getByRole('button', { name: 'Sign Out', exact: true }).first().click();
  await page.getByRole('button', { name: 'Sign Out', exact: true }).last().click();
  await expect(page).toHaveURL(/\/login/);

  // Login through the form reaches the dashboard greeting.
  await page.getByPlaceholder('student@example.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  await expect(page.getByRole('heading', { name: /E2E/ })).toBeVisible();

  await deleteAccountViaAPI(email, TEST_PASSWORD);
});

// Dead session (UI believes logged in, token gone — multi-tab logout,
// evicted storage): the app must redirect to login with an explanation,
// never render raw backend text ("Access token required") with a doomed
// Try Again button.
test('dead session redirects to login with an explanation', async ({ page }) => {
  const { email } = await seedUser('expired');
  try {
    await uiLogin(page, email, TEST_PASSWORD);
    await expect(page.getByRole('heading', { name: /E2E/ })).toBeVisible();

    await page.evaluate(() => localStorage.removeItem('auth_token'));
    await page.goto('/planner');

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText(/session expired/i)).toBeVisible();
    await expect(page.getByText('Access token required')).toHaveCount(0);
  } finally {
    await deleteAccountViaAPI(email, TEST_PASSWORD);
  }
});
