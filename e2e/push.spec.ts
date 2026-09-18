import { test, expect } from '@playwright/test';
import { TEST_PASSWORD } from './db';
import { seedUser, uiLogin, deleteAccountViaAPI } from './helpers';

// Push toggle end to end with a stubbed PushManager (real subscription
// needs Google/Apple push servers — unstubbable in CI). What runs for
// real: permission state, toggle UI, POST /api/push/subscribe +
// DELETE /api/push/unsubscribe, the DB row lifecycle, and persisted
// on-state across reload.
const FAKE_SUB = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/e2e-fake-subscription',
  keys: { p256dh: 'e2e-fake-p256dh-key-material-ok', auth: 'e2e-fake-auth-ok' },
};

test('toggle subscribes, persists across reload, unsubscribes', async ({ page, context }) => {
  // Headless-shell Chromium ignores grantPermissions for notifications, so
  // force the permission state directly (the toggle only reads it).
  await context.grantPermissions(['notifications']).catch(() => undefined);
  await page.addInitScript((sub: any) => {
    try {
      Object.defineProperty(window.Notification, 'permission', {
        value: 'granted',
        configurable: true,
      });
    } catch {
      // If the platform ever locks it down, the toggle correctly disables.
    }
    let current: any = null;
    // localStorage-backed so the fake subscription survives page.reload
    // exactly like a real PushManager subscription does. getSubscription()
    // reads it back; subscribe() writes it; unsubscribe() clears it.
    const KEY = '__e2e_push_sub';
    const read = () => {
      try {
        const raw = localStorage.getItem(KEY);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    };
    const wrap = (saved: any) => ({
      ...saved,
      toJSON: () => ({ endpoint: saved.endpoint, keys: saved.keys }),
      unsubscribe: async () => {
        current = null;
        try {
          localStorage.removeItem(KEY);
        } catch {
          // Storage unavailable — memory state still clears.
        }
        return true;
      },
    });
    const manager = {
      getSubscription: async () => {
        if (!current) {
          const saved = read();
          if (saved) current = wrap(saved);
        }
        return current;
      },
      subscribe: async () => {
        try {
          localStorage.setItem(KEY, JSON.stringify(sub));
        } catch {
          // Storage unavailable — memory state still subscribes.
        }
        current = wrap(sub);
        return current;
      },
    };
    try {
      Object.defineProperty(navigator, 'serviceWorker', {
        value: { ready: Promise.resolve({ pushManager: manager }) },
        configurable: true,
      });
    } catch {
      // Real serviceWorker stays (preview registers /sw.js); toggle still
      // resolves via the live registration path.
    }
    try {
      (window as any).PushManager = class {};
    } catch {
      // Real PushManager stays; harmless.
    }
  }, FAKE_SUB);

  const { email } = await seedUser('push');
  try {
    await uiLogin(page, email, TEST_PASSWORD);
    await page.goto('/profile?tab=notifications');

    const toggle = page.getByLabel('Push notifications');
    await expect(toggle).toBeVisible();
    // getPushState() resolves async after mount; wait until it reports a
    // usable state instead of racing the initial render.
    await expect(toggle).toBeEnabled({ timeout: 20000 });
    await expect(toggle).not.toBeChecked();

    // Turn on: real POST lands a real DB row (asserted server-side by the
    // toggle flipping on — enablePush throws otherwise). click()+polling
    // expect because the controlled checkbox flips only after the async
    // subscribe round-trip completes (check() demands a sync flip).
    await toggle.click({ force: true });
    await expect(toggle).toBeChecked({ timeout: 20000 });
    await expect(page.getByText('Push notifications on')).toBeVisible();

    // Reload: on-state must come from getSubscription, not memory.
    await page.reload();
    await page.goto('/profile?tab=notifications');
    await expect(page.getByLabel('Push notifications')).toBeChecked({ timeout: 20000 });

    // Turn off.
    await page.getByLabel('Push notifications').click({ force: true });
    await expect(page.getByLabel('Push notifications')).not.toBeChecked({ timeout: 20000 });
  } finally {
    await deleteAccountViaAPI(email, TEST_PASSWORD);
  }
});
