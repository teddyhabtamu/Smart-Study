import { pushAPI } from '../services/api';

// Web Push client: subscribes this browser so study reminders and
// streak-risk nudges arrive with the app closed (the old in-page
// Notification path only fires while a tab is alive).
//
// Flow: toggle ON (user gesture — browsers require it for permission) ->
// ensure SW registration -> pushManager.subscribe -> POST subscription.
// Toggle OFF reverses it. All server errors surface as thrown Errors with
// human messages; support/permission states are pure queries for UI.

export type PushState =
  | { kind: 'unsupported' }
  | { kind: 'unconfigured' }
  | { kind: 'blocked' }
  | { kind: 'off' }
  | { kind: 'on' };

export const isPushSupported = (): boolean =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

const vapidKey = (): string | null =>
  (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) || null;

// Base64url (VAPID key format) -> Uint8Array for pushManager.subscribe.
// Typed as Uint8Array<ArrayBuffer>: TS 5.7+ generics otherwise widen to
// ArrayBufferLike, which BufferSource rejects.
export const urlBase64ToUint8Array = (base64: string): Uint8Array<ArrayBuffer> => {
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = globalThis.atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
};

// Service-worker lookups hang forever when no worker is registered (dev
// builds don't register one) — bound every wait so a missing worker reads
// as "off", never as a stuck toggle.
const SW_READY_TIMEOUT_MS = 8000;

const serviceWorkerReady = async (): Promise<ServiceWorkerRegistration> => {
  const ready = navigator.serviceWorker.ready;
  const timeout = new Promise<never>((_, reject) => {
    const t = setTimeout(() => reject(new Error('No service worker — push needs the installed production app.')), SW_READY_TIMEOUT_MS);
    (t as any)?.unref?.();
  });
  return Promise.race([ready, timeout]);
};

export const getPushState = async (): Promise<PushState> => {
  if (!isPushSupported()) return { kind: 'unsupported' };
  if (!vapidKey()) return { kind: 'unconfigured' };
  if (Notification.permission === 'denied') return { kind: 'blocked' };
  try {
    const reg = await serviceWorkerReady();
    const sub = await reg.pushManager.getSubscription();
    return sub ? { kind: 'on' } : { kind: 'off' };
  } catch {
    return { kind: 'off' };
  }
};

export const enablePush = async (): Promise<void> => {
  if (!isPushSupported()) throw new Error('Push notifications are not supported in this browser.');
  const key = vapidKey();
  if (!key) throw new Error('Push notifications are not configured yet.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(
      permission === 'denied'
        ? 'Notifications are blocked — allow them in your browser settings to turn this on.'
        : 'Notification permission was dismissed.'
    );
  }
  const reg = await serviceWorkerReady();
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key),
  });
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('Browser produced an unusable subscription.');
  }
  await pushAPI.subscribe({
    endpoint: json.endpoint,
    keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
  });
};

export const disablePush = async (): Promise<void> => {
  try {
    if (!isPushSupported()) return;
    const reg = await serviceWorkerReady();
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe().catch(() => undefined);
      // Tell the server even if the browser unsubscribe hiccups — a stale
      // row self-heals on first send (410 pruning), but prompt removal is
      // kinder to quota and to shared devices.
      await pushAPI.unsubscribe(endpoint).catch(() => undefined);
    }
  } catch {
    // Disabling must never trap the toggle on.
  }
};
