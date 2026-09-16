# Vercel Deployment Checklist

1. **Build Settings**:
   - Framework Preset: Vite
   - Build Command: `npm run build`
   - Output Directory: `dist`

2. **Environment Variables** — frontend and backend take DIFFERENT keys
   (mixing them up ships a silently broken deploy):
   - Frontend (Vercel, this repo): `VITE_API_URL` = your backend base URL
     + `/api` (e.g. `https://<backend-host>/api`). Baked in at BUILD time —
     preview deployments need their own value pointing at a backend that is
     actually running, or every `/api/*` call fails.
   - Backend host (Render/Railway/VPS — NOT Vercel): `GEMINI_API_KEY` (your
     Google Gemini key — the name must match exactly; a bare `API_KEY` is
     ignored and every AI feature 500s), `DATABASE_URL`,
     `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`,
     `JWT_SECRET`, `FRONTEND_URL`.
   - Symptom guide: Smart Schedule dying with "Failed to generate study
     plan" + `GET /api/users/profile` 500ing on a deploy almost always means
     the backend env (key or DB vars) — check the backend logs for
     `GEMINI_API_KEY is not configured`, `Get profile error:`, or
     `Generate study plan error:` before touching code.

3. **Node Version**:
   - Ensure Vercel Project Settings > General > Node.js Version is set to 18.x or 20.x.

4. **Troubleshooting**:
   - If peer dependency errors occur (rare with these fixed versions), set Environment Variable: `NPM_FLAGS` = `--legacy-peer-deps`.

# Local Verification Commands

Run these in your terminal to verify the fix:

```bash
# 1. Clean install
rm -rf node_modules package-lock.json
npm install

# 2. Verify Dev Server
# Should start at http://localhost:5173 and show styled content
npm run dev

# 3. Verify Production Build
# Should create 'dist' folder with assets/index-*.css containing Tailwind styles
npm run build
```