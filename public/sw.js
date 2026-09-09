/* SmartStudy service worker.
 *
 * Strategy (deliberately conservative):
 * - Same-origin static assets (hashed JS/CSS/images/fonts): cache-first.
 *   Filenames are content-hashed, so cached copies can never go stale.
 * - Navigations: network-first, fall back to cached copy, then offline page.
 * - API (/api/*): NEVER cached. Responses vary by user/token and caching
 *   them risks leaking one user's data to another on shared devices.
 * - Cross-origin CDN (fonts, KaTeX): cache-first, best-effort.
 */
const CACHE = 'smartstudy-v1';
const PRECACHE = ['/offline.html', '/icon.svg', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Navigations: network first, cached copy second, offline page last.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => undefined);
          }
          return res;
        })
        .catch(() =>
          caches.match(req).then(
            (cached) => cached || caches.match('/offline.html')
          )
        )
    );
    return;
  }

  // Same-origin static assets: cache first (content-hashed = immutable).
  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith('/api/')) return; // never cache API
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req).then((res) => {
            if (res && res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => undefined);
            }
            return res;
          })
      )
    );
    return;
  }

  // Cross-origin static (fonts, KaTeX CSS): cache first, best effort.
  // Note: opaque (no-cors) responses have ok === false but are still
  // cacheable — check res.type too.
  if (
    /\.(?:css|js|woff2?|ttf|otf|png|jpg|jpeg|svg|gif)$/i.test(url.pathname)
  ) {
    event.respondWith(
      caches.match(req).then(
        (cached) =>
          cached ||
          fetch(req)
            .then((res) => {
              if (res && (res.ok || res.type === 'opaque')) {
                const copy = res.clone();
                caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => undefined);
              }
              return res;
            })
            .catch(() => caches.match(req))
      )
    );
  }
});
