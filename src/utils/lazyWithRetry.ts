import React from 'react';

// Lazy pages with post-deploy self-healing.
//
// Route chunks load by content-hashed URL recorded in the running bundle.
// After a redeploy, an already-open tab can request a chunk file the new
// deployment pruned, so the dynamic import 404s and React parks the user on
// the error screen until they manually refresh. Instead: retry once
// (transient blip), then hard-reload to boot the fresh deployment. The
// session flag survives the reload, so a still-broken chunk throws to the
// ErrorBoundary instead of reload-looping forever.
const RETRY_FLAG = 'ss-chunk-retry';

export function lazyWithRetry<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>
): React.LazyExoticComponent<T> {
  return React.lazy(() =>
    factory()
      .then((mod) => {
        try {
          sessionStorage.removeItem(RETRY_FLAG);
        } catch {
          // Private mode: reloading still works, the loop guard just won't
          // persist — acceptable, the boundary's Reload button remains.
        }
        return mod;
      })
      .catch((err) => {
        let alreadyRetried = false;
        try {
          alreadyRetried = sessionStorage.getItem(RETRY_FLAG) === '1';
          if (!alreadyRetried) sessionStorage.setItem(RETRY_FLAG, '1');
        } catch {
          // Storage unavailable: fall through to the throw below.
        }
        if (alreadyRetried) throw err;
        window.location.reload();
        return new Promise<{ default: T }>(() => {
          // Parked: the reload takes over from here.
        });
      })
  );
}
