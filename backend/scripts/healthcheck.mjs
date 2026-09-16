#!/usr/bin/env node
// Production health ping for SmartStudy's API.
//
// Usage: BACKEND_URL=https://<api-host> node scripts/healthcheck.mjs
//        (or pass the base URL as argv[2]; defaults to http://localhost:5000)
//
// Checks, in order:
//   1. /api/version answers (proves which commit is actually serving)
//   2. /api/health answers 200 with db.ok true
//   3. pool.waiting == 0 (any queued acquirer means the pool is saturated)
//   4. db latency under HEALTH_MAX_DB_MS (default 8000)
//
// Exit 0 = healthy. Exit 1 = degraded (prints FAIL lines + one JSON
// summary, so both humans and the scheduled GitHub workflow can read it).
// Designed for .github/workflows/health-ping.yml (every 15 min).

const base = (process.argv[2] || process.env.BACKEND_URL || 'http://localhost:5000').replace(/\/$/, '');
const maxDbMs = parseInt(process.env.HEALTH_MAX_DB_MS || '8000', 10);
const failures = [];

const getJson = async (path, timeoutMs = 20000) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}${path}`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
};

const fail = (msg) => {
  failures.push(msg);
  console.log(`FAIL: ${msg}`);
};

try {
  const version = await getJson('/api/version', 15000);
  console.log(`version: commit=${version?.data?.commit ?? '?'} env=${version?.data?.env ?? '?'} boot=${version?.data?.bootTime ?? '?'}`);
} catch (err) {
  fail(`version endpoint unreachable: ${err.message}`);
}

let health = null;
try {
  health = await getJson('/api/health', 25000);
} catch (err) {
  fail(`health endpoint unreachable: ${err.message}`);
}

if (health) {
  const db = health.db ?? {};
  if (!db.ok) fail(`database unreachable: ${db.error ?? 'unknown'}`);
  else {
    console.log(`db: ok latencyMs=${db.latencyMs}`);
    if (typeof db.latencyMs === 'number' && db.latencyMs > maxDbMs) {
      fail(`db latency ${db.latencyMs}ms over budget ${maxDbMs}ms`);
    }
  }
  const pool = health.pool ?? {};
  console.log(`pool: total=${pool.total} idle=${pool.idle} waiting=${pool.waiting} checkedOut=${pool.checkedOut}`);
  if (typeof pool.waiting === 'number' && pool.waiting > 0) {
    fail(`pool saturated: ${pool.waiting} acquirers queued (total=${pool.total} idle=${pool.idle})`);
  }
}

console.log(JSON.stringify({ base, ok: failures.length === 0, failures }));
process.exit(failures.length === 0 ? 0 : 1);
