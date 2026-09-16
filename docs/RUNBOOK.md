# SmartStudy Runbook

Symptom → diagnosis → fix for the failures this system actually has.
Keep it current: every outage should add or sharpen one entry.

## The two URLs that answer everything

- `GET /api/version` — which commit is serving + boot time. No auth, no DB.
  If `commit` is behind `git log --oneline -1`, the deploy is stale: redeploy.
- `GET /api/health` — DB reachability + latency + pool gauges:
  `{ db: { ok, latencyMs }, pool: { total, idle, waiting, max, checkedOut } }`

Local: `http://localhost:5000`. Prod: `https://smart-study-ncwi.vercel.app`.

## Production down (everything 500s / timeouts)

1. Hit `/api/health`.
2. Read the pool gauges:
   - `total=max, idle=0, waiting>0` under light traffic → slots are **leaked**
     (checked out, never released). `checkedOut` should equal `total-idle`.
   - Failures with healthy gauges → the **database** is unreachable
     (Supabase/pooler outage or wrong `PG_POOLER_URL`), not the app.
3. Check the backend log for `pg pool pressure` — it prints holder stacks
   naming the exact code holding slots.
4. Check for `SLOW <METHOD> <path> <ms>` lines — they name slow routes.
5. Restart clears a wedged pool (slots are in-process), but find the holder
   first or it recurs. Locally: `Ctrl+C` + `npm run dev` in `backend/`.

## Single AI feature 429s with AI_QUOTA_EXCEEDED

The shared Gemini key's daily budget is spent. Limits reset daily. Check
how bad it is before acting:

- Admin dashboard → "AI usage · last 7 days" (calls, failures, quota errors
  per route, avg latency). Missing panel = backend predates the `ai_usage`
  table or the migration hasn't run (see below).
- Public aggregate: `GET /api/ai-tutor/usage-status` (24h totals, no PII).
- The `ai-quota-watch` workflow checks twice daily and files a tracked
  `ai-quota` issue past the threshold (default 10 quota errors/24h).

If chronic, the levers in order: per-user daily generation caps (exists for
XP, extend to raw calls) → usage metering review (who burns the key?) →
Pro users bring their own key → paid tier via Chapa funds it.

## Database migrations

Migrations live in `backend/src/database/migrations/` (idempotent
`IF NOT EXISTS` style) and run via `npm run db:migrate` in `backend/`.
The server does NOT auto-migrate — after deploying a migration commit:

1. Local: `cd backend && npm run db:migrate` (uses `.env`).
2. Prod: run the same command with the production `DATABASE_URL`
   (never commit prod credentials; export it for the one command).
3. Verify: the feature that needs the table stops logging its soft-fail
   (e.g. admin `/stats` without `ai_usage_7d` means the table is missing).

## Backend exits and nodemon parks (`app crashed - waiting for file changes`)

Nodemon does NOT restart on crash — the server stays down until a file
changes. Read the red lines ABOVE the crash line: an uncaught exception
(`pool.on('error')` covers idle-client death; anything else prints its
stack). Fix, save (the save itself revives the server), verify `/api/health`.

## Smart Schedule silently fails (generate ok, nothing saved)

The generate route logs every outcome — there is no silent path:
- `smart plan ok` / `smart plan ok on retry` → AI succeeded.
- `deadline mismatch: ...` → date validator rejected, guided retry fired.
- `Study plan persisted inline` / `already persisted (retry deduped)` → saved.
- `Study plan not persisted (validation)` → names the bad field.
- `persisted:false, fallback:true` → skeleton shown, nothing saved (by design).
- Batch route logs `entered handler` → `inserting` → `insert returned`.
  No `entered handler` line at all = the request never reached code
  (proxy/queueing), not an app bug.

## Timeout budgets (the full chain)

| Layer | Limit |
|---|---|
| Frontend default (`apiRequest`) | 30s abort |
| Frontend study-plan / quiz | 55s / 60s abort |
| Vercel function kill | 60s |
| DB pool acquire | 10s, then 500 + log |
| DB statement (`statement_timeout`) | 20s server-side |
| DB socket read (`query_timeout`) | 25s client-side |
| App lease watchdog per op | 20s, destroys the client, loud error |

A healthy AI round trip (6s generation + ~10 warm DB ops at ~400ms) lands
in ~10–15s. Anything slower is either a cold pooler connect (~3.7s, normal
after idle) or a real stall — both now fail loud instead of silent.

## Daily rules run on Ethiopian time

All "daily" boundaries (quiz allowance, XP caps, streaks, dashboard
buckets, plan windows) use `Africa/Addis_Ababa`, never server UTC:
- SQL: `(now() AT TIME ZONE 'Africa/Addis_Ababa')::date`
  (see `EAT_TODAY_SQL` in `backend/src/utils/dates.ts`).
- JS: `eatTodayStr()`. Never `toISOString().split('T')[0]` for day logic.
- New daily rules must use these. Bare `CURRENT_DATE` in a daily rule is a bug.

## AI quota economics (when 429s become chronic)

- Metering is live: `ai_usage` rows per generation, admin widget
  ("AI usage · last 7 days"), public `/api/ai-tutor/usage-status` (24h),
  twice-daily `ai-quota-watch` workflow with a tracked `ai-quota` issue.
- Levers, cheapest first: per-user daily generation caps (exists for XP,
  extend to raw calls) → metering review (who burns the key?) →
  Pro users bring their own key → paid tier via Chapa funds it.

## Deploy checklist

1. `git log --oneline -1` == commit in prod `/api/version`. If not, redeploy.
2. `/api/health`: `db.ok` true, `waiting` 0.
3. Smoke: login → generate quiz → complete a planner task (exercises auth,
   AI, XP, notifications end to end).
4. Never debug prod with the local frontend pointed at it and vice versa —
   mixed environments caused real confusion before.

## Useful commands

```bash
# Local backend (backend/) / frontend (root)
npm run dev

# Backend: typecheck + full suite
npx tsc --noEmit -p tsconfig.json && npx vitest run

# Health ping (local or prod)
node backend/scripts/healthcheck.mjs
BACKEND_URL=https://smart-study-ncwi.vercel.app node backend/scripts/healthcheck.mjs

# Which code is serving right now
curl -s http://localhost:5000/api/version
```
