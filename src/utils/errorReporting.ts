// Client crash telemetry: window.onerror + unhandledrejection beacons to
// POST /api/client-errors, where they aggregate into grouped error_log
// rows for the admin Errors card.
//
// Three restraints keep this from becoming its own problem:
// - PROD only: dev consoles already show everything; beacons from
//   localhost would pollute the production signal.
// - Client-side shaping: same message deduped for 60s, hard cap of 10
//   reports per page session. The server limiter is only the backstop.
// - Best-effort transport: sendBeacon first (survives page unload, never
//   blocks), fetch keepalive fallback. Failures are swallowed — telemetry
//   reporting about its own failure would recurse.

const API_URL: string =
  (import.meta as any).env?.VITE_API_URL || 'http://localhost:5000/api';

const DEDUPE_WINDOW_MS = 60_000;
const MAX_PER_SESSION = 10;

let installed = false;
let sentThisSession = 0;
const lastSentAt = new Map<string, number>();

const send = (message: string, route: string): void => {
  try {
    const url = `${API_URL}/client-errors`;
    const body = JSON.stringify({ message: message.slice(0, 500), route: route.slice(0, 200) });
    if (typeof navigator.sendBeacon === 'function') {
      const ok = navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
      if (ok) return;
    }
    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // Swallowed by contract (see header).
  }
};

const report = (raw: unknown): void => {
  try {
    const message =
      raw instanceof Error
        ? `${raw.name}: ${raw.message}`
        : typeof raw === 'string'
          ? raw
          : 'Unknown client error';
    if (!message.trim() || sentThisSession >= MAX_PER_SESSION) return;
    const now = Date.now();
    const last = lastSentAt.get(message) || 0;
    if (now - last < DEDUPE_WINDOW_MS) return;
    lastSentAt.set(message, now);
    sentThisSession += 1;
    send(message, window.location.pathname);
  } catch {
    // Swallowed by contract (see header).
  }
};

export const initErrorReporting = (): void => {
  if (installed) return;
  installed = true;
  if (!(import.meta as any).env?.PROD) return;
  window.addEventListener('error', (e) => {
    // Resource load failures (img/script/link) report via target, not
    // message — the failing URL is the signal, not "Script error".
    const target = e.target as HTMLElement | null;
    if (target && target !== (window as any)) {
      const src = (target as HTMLImageElement).src || (target as HTMLLinkElement).href;
      if (src) report(`Resource failed to load: ${String(src).slice(0, 200)}`);
      return;
    }
    report(e.error || e.message);
  }, true);
  window.addEventListener('unhandledrejection', (e) => {
    report((e as PromiseRejectionEvent).reason);
  });
};
