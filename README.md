# SmartStudy

AI-powered study platform for Ethiopian secondary students (Grades 9–12):
library and past exams, video lessons, AI tutor, smart study planner,
practice quizzes with spaced review, community discussions, and Pro
memberships. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how the
systems fit together and [`DEPLOYMENT.md`](DEPLOYMENT.md) for hosting.

## Repo layout

- `/` — React 18 + Vite + TypeScript + Tailwind frontend (`src/`, `e2e/`)
- `/backend` — Express 5 + TypeScript API (`src/`, migrations in
  `src/database/migrations/`)
- `/docs` — architecture notes (`ARCHITECTURE.md`), runbook (`RUNBOOK.md`)

## Run locally

**Prerequisites:** Node.js 18+, a Postgres database (Supabase works).

1. **Frontend**
   ```bash
   npm install
   # .env — point at your backend API (path must end with /api):
   # VITE_API_URL=http://localhost:5000/api
   npm run dev        # http://localhost:5173
   ```

2. **Backend**
   ```bash
   cd backend
   npm install
   # backend/.env — required keys:
   #   DATABASE_URL (or PG_POOLER_URL — required in production),
   #   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
   #   JWT_SECRET, FRONTEND_URL, BACKEND_URL,
   #   GEMINI_API_KEYS (comma-separated; legacy GEMINI_API_KEY also works),
   #   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (Google sign-in),
   #   YOUTUBE_API_KEY, BREVO_API_KEY / BREVO_SENDER_* (email),
   #   VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT (push)
   npm run db:migrate  # apply SQL migrations (tracked, idempotent)
   npm run dev         # http://localhost:5000
   ```

## Test

```bash
# Frontend unit tests
npm run test:unit
# Backend unit + route tests
cd backend && npm test
# End-to-end (real stack, AI stubbed at the network layer)
npm run test:e2e
```

## Build

```bash
npm run build   # typecheck + Vite production build into dist/
```
