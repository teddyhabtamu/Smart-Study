// Coordination between the session-expired flow and Layout's guest rule.
//
// Layout redirects logged-out visitors on app routes to `/` (landing-first
// for guests), while an expired session must land on `/login?next=…` with an
// explanation. Both react to the same setUser(null); without coordination
// Layout's effect wins the race and the expired user silently lands on `/`
// with no toast and no return URL. The handler stamps this marker
// synchronously on broadcast; Layout yields while it is fresh.
const WINDOW_MS = 10_000;
let expiredAt = 0;

export const markSessionExpiredNav = (): void => {
  expiredAt = Date.now();
};

export const wasRecentSessionExpiredNav = (): boolean =>
  Date.now() - expiredAt < WINDOW_MS;
