# SmartStudy Architecture

Living overview for developers. Code comments explain the *what*; this file
explains the *why* — the decisions you'd otherwise have to rediscover.

## Stack

- **Frontend** (`/`): React 18 + Vite + TypeScript + Tailwind v3 +
  react-router-dom 6. State via Context only (`Auth`, `Data`, `Theme`,
  `Toast`) — no Redux/Zustand. One central API client (`src/services/api.ts`).
- **Backend** (`/backend`): Express 5 + TypeScript. Postgres via `pg` Pool
  (prefers `PG_POOLER_URL`, Supabase pooler) + Supabase JS client. JWT auth
  (7d access + 30d refresh), Passport Google OAuth. Vercel serverless
  (`backend/api/index.ts`) or plain Node (`dist/server.js`).
- **AI**: Google Gemini via a rotating key ring (`GEMINI_API_KEYS`,
  comma-separated). Quota attaches to keys, not to us — the ring multiplies
  the free budget. Round-robin + quota cooldown + invalid-key retirement.
- **Tests**: vitest unit/integration (backend `src/**/*.test.ts`, frontend
  `src/utils/`), supertest route tests with mocked DB, Playwright e2e
  (`/e2e`, real stack, AI stubbed at the network layer).

## Cross-cutting conventions

- **Best-effort telemetry.** Metering (`ai_usage`, `ai_key_usage`,
  `error_log`, XP history) never throws, never blocks: 3s bounds, try/catch,
  fire-and-forget from hot paths. An observability outage must not become a
  product outage.
- **Soft-fail aggregates.** Every admin/user aggregate degrades to
  empty/zeros on old databases instead of 500ing (tables arrive via
  migrations that may not have run everywhere yet).
- **Ethiopian (EAT) days.** All day windows (`ai_usage_7d`, recap, quiz
  gates) anchor on `(now() AT TIME ZONE 'Africa/Addis_Ababa')::date` — UTC
  slices steal evening hours.
- **No client-minted value.** XP, quiz scores for pay, completion awards
  are priced server-side and clamped; the client only displays.
- **No destructive migrations.** Repair by rename-aside + create
  (`ai_key_usage_legacy`), never DROP. `IF NOT EXISTS` everywhere.
- **Themes are data.** All color ramps resolve through CSS channels per
  `[data-theme]` (`src/index.css` + `tailwind.config.js`). Rules:
  fixed-dark panel → fixed-white text; fixed-light panel → fixed-dark text;
  theme panel → theme tokens (`ink`/`inksoft`). Never pair two remapped
  zinc stops as bg+text — the ramp compresses in dark themes and goes
  invisible. `warn`/`danger` tokens exist for bare warning/destructive text
  on theme surfaces; fixed-bg pills keep the fixed ramp.
- **Skeletons are mandatory.** Every async surface ships a
  dimension-matched skeleton — no pop-in, no layout jump.

## Subsystems (newest first)

### Offline planner (`DataContext`, `Planner.tsx`)
`studyEvents` snapshot to localStorage on every successful fetch; network
failures serve the snapshot + `isOffline` banner instead of an error wall
(auth/validation errors pass through untouched). Completion taps queue
(`smartstudy_pending_ops`) and replay in order on reconnect; XP-safe via
the server `xp_awarded` guard (replays are no-ops for pay). Only
completions queue — edits/deletes still require connectivity (no merge
strategy). Flush triggers: `online` event + successful event fetch.

### Pro payment claims (`payment_claims`, `routes/subscription.ts`)
Money moves over Telebirr outside the app (business process, unchanged);
the *claim* links payer identity at click time. One pending per user
(repeat clicks return it), optional transaction ref, admins pinged in-app.
Student sees a persistent ticket across sessions. Approval flows through
the existing premium toggle, which auto-settles pending claims; rejection
is explicit. No receipt uploads by design — matching happens by identity,
not by emailed screenshots.

### Review queue (`GET /planner/practice/review-queue`, `ReviewTodayCard`)
Spaced repetition v1: weakest subjects by average quiz score (tiebreak:
least recently practiced), falling back to recent planner subjects with
no history. All-100% reframes as maintenance copy. Practice presets from
navigation state but never autostarts (no surprise AI spend); reviews use
the same generator and the same daily limit — no new quota surface, no
monetization change.

### Weekly recap (`GET /dashboard/recap`, `WeeklyRecapCard`)
7-day totals + zero-filled per-day series from already-logged tables
(events, `xp_history`, practice, AI, videos). Quiz count reads *completion*
XP (`practice_quiz` source) because `practice_sessions` was write-only-dead
until quiz-complete started inserting rows. Empty state stays visible
(onboarding); only fetch failure hides the card.

### Per-student AI usage (`GET /admin/ai-usage/top-users`, `GET /users/ai-usage`)
Visibility only, by decision — no per-student quotas (the binding
constraint is global free-tier quota). Guests log with `user_id NULL` and
are excluded from attribution. Composite `(user_id, created_at)` index —
without it these aggregates scan the per-call table.

### Durable key metering (`ai_key_usage`, `aiKeyUsage.ts`)
One row per key attempt (served/quota/invalid/other). Logged
fire-and-forget inside the rotation loop, where the key is in scope —
routes never plumb key identity. `GET /admin/ai-keys` merges durable
counts with live in-memory rotation state; 90-day retention with scheduler
trim. Legacy snapshot-shaped table preserved as `ai_key_usage_legacy`
(see repair migration).

### Error pipeline (`error_log`, `errorLog.ts`, `routes/clientErrors.ts`)
Grouped failures: normalized fingerprint (ids/counts stripped) → one row
per distinct bug with occurrences + reopen-on-repeat. Client capture is
PROD-only, deduped, session-capped, sendBeacon-first. Server capture needs
zero per-route code: Express 500 handler + pg pool-failure line (guarded
against recursing on `error_log`'s own queries). Intake is unauthenticated
+ rate-limited and always 200s. Admin Overview renders all states —
including explicit "all quiet", never a hidden panel.

### Admin Errors/Top-consumers cards (`OverviewTab.tsx`)
Ride-along fetches that never fail the tab; empty states, not hidden
panels. Same pattern for every future admin widget.

## Test strategy

- Pure logic → vitest unit (fingerprinting, date math, validators).
- Routes → supertest with `vi.mock('../database/config')`; branch the mock
  by SQL text; always cover gating (403/401), validation (400), and the
  table-missing degradation path.
- Journeys → Playwright with per-spec seeded users (order-independent),
  AI stubbed via `page.route(...fulfill...)`, DB assertions via `testDb()`,
  cleanup through the app's own delete-account endpoint (owns the FK
  cascade). Known helpers: `dismissTourIfOpen` (fresh-account tour
  overlays), `uiLogout` (account switching — `/login` redirects authed
  users away). Workers stay at 1 (shared DB).
- Pre-existing failure (unrelated): `auth.spec.ts` dead-session redirect
  reproduces on a clean tree.
