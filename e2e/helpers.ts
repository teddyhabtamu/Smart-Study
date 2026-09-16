import type { Page } from '@playwright/test';
import { apiBase, createVerifiedUser, uniqueEmail, TEST_PASSWORD, type SeededUser } from './db';

// Shared fixtures for the journey specs. Every spec seeds its OWN user
// (order-independent, retry-safe) and deletes it through the app's own
// delete-account endpoint (which owns the 27-FK cascade — never raw SQL).

export const seedUser = async (tag: string): Promise<SeededUser> =>
  createVerifiedUser(uniqueEmail(tag));

export const uiLogin = async (page: Page, email: string, password: string): Promise<void> => {
  await page.goto('/login');
  await page.getByPlaceholder('student@example.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(password);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  // Wait for the login round trip to settle before navigating: leaving
  // early aborts the in-flight POST and every later step runs logged-out.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 60000 });
};

// Delete via the real API using a fresh login token (exercises nothing but
// cleanup — the delete-account UI has its own confirm flow we don't need).
export const deleteAccountViaAPI = async (email: string, password: string): Promise<void> => {
  const res = await fetch(`${apiBase()}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    console.log(`e2e cleanup: login failed for ${email} (${res.status}), skipping delete`);
    return;
  }
  const body = await res.json();
  const token = body?.token ?? body?.data?.token;
  if (!token) return;
  await fetch(`${apiBase()}/users/account`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ password }),
  }).catch(() => undefined);
};

// Drive the custom DatePicker to an exact YYYY-MM-DD (no adjacent-month
// ambiguity: this picker renders current-month days only).
export const pickDate = async (page: Page, dateStr: string): Promise<void> => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const targetHeader = new Date(y, (m || 1) - 1, d || 1).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
  await page.getByText('Select Date').click();
  const popup = page.locator('div.absolute.z-\\[999\\]');
  for (let i = 0; i < 14; i++) {
    if ((await popup.getByText(targetHeader, { exact: true }).count()) > 0) break;
    const shown = await popup.locator('span').first().textContent();
    // Header reads "Month Year": navigate toward the target.
    const [shownMonth, shownYear] = (shown || '').split(' ');
    const shownIdx = new Date(`${shownMonth} 1, ${shownYear}`).getTime();
    const targetIdx = new Date(y, (m || 1) - 1, 1).getTime();
    const nav = popup.locator('button');
    if (shownIdx < targetIdx) await nav.nth(1).click();
    else await nav.nth(0).click();
  }
  await popup.getByRole('button', { name: String(d), exact: true }).click();
};
