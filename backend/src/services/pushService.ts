import webpush from 'web-push';
import { query } from '../database/config';
import { config } from '../config';

export interface PushPayload {
  title: string;
  body: string;
  /** In-app path opened on tap, e.g. '/planner'. Defaults to '/dashboard'. */
  url?: string;
  /** Groups/replaces same-tag notifications instead of stacking. */
  tag?: string;
}

export interface PushSubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

let vapidReady = false;

// Lazy VAPID init: missing keys disable push with one warning, never a
// throw — every caller treats "not configured" as a quiet no-op so local
// dev and pre-key deploys behave identically minus pushes.
const ensureVapid = (): boolean => {
  if (vapidReady) return true;
  const { publicKey, privateKey, subject } = config.push;
  if (!publicKey || !privateKey) {
    console.warn('Push disabled: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not configured.');
    return false;
  }
  try {
    webpush.setVapidDetails(subject, publicKey, privateKey);
    vapidReady = true;
    return true;
  } catch (err: any) {
    console.error('Push disabled: invalid VAPID keys:', String(err?.message || err).slice(0, 120));
    return false;
  }
};

// Visible for tests (lets suites reset module state between cases).
export const __resetPushForTests = (): void => {
  vapidReady = false;
};

const toPushSubscription = (row: PushSubscriptionRow): webpush.PushSubscription => ({
  endpoint: row.endpoint,
  keys: { p256dh: row.p256dh, auth: row.auth },
});

// A dead endpoint (410 Gone / 404) means an uninstalled PWA or revoked
// permission: drop the row so every future broadcast doesn't pay for it.
// Anything else (network, 5xx) keeps the row — transient, retry next time.
const isDeadEndpoint = (err: any): boolean =>
  err?.statusCode === 410 || err?.statusCode === 404;

const pruneDeadEndpoint = async (endpoint: string): Promise<void> => {
  try {
    await query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]);
  } catch (err: any) {
    console.error('Failed to prune dead push endpoint:', String(err?.message || err).slice(0, 120));
  }
};

const sendToOne = async (row: PushSubscriptionRow, payload: PushPayload): Promise<boolean> => {
  try {
    await webpush.sendNotification(toPushSubscription(row), JSON.stringify(payload), {
      TTL: 24 * 3600,
    });
    return true;
  } catch (err: any) {
    if (isDeadEndpoint(err)) {
      console.log(`Pruning dead push endpoint: ${row.endpoint.slice(0, 60)}…`);
      await pruneDeadEndpoint(row.endpoint);
    } else {
      console.error('Push send failed:', String(err?.message || err).slice(0, 150));
    }
    return false;
  }
};

// Broadcast to every device a user subscribed. Never throws: a failing push
// layer must not break reminders, streak jobs, or request paths.
export const sendPushToUser = async (userId: string, payload: PushPayload): Promise<number> => {
  try {
    if (!ensureVapid()) return 0;
    const res = await query('SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = $1', [
      userId,
    ]);
    if (res.rows.length === 0) return 0;
    const results = await Promise.allSettled(res.rows.map((row) => sendToOne(row, payload)));
    return results.filter((r) => r.status === 'fulfilled' && r.value).length;
  } catch (err: any) {
    console.error('Push broadcast failed:', String(err?.message || err).slice(0, 150));
    return 0;
  }
};
