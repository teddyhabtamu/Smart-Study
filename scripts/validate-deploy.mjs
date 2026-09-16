// Build-time deploy gate: machine-read config must parse.
//
// Why this exists (twice bitten):
//  1. A trailing comma in index.html's JSON-LD block made Search Console
//     report "Unparsable structured data", killing rich-result eligibility.
//  2. A `//` comment in backend/vercel.json (JSON forbids comments, unlike
//     tsconfig's JSONC) failed the entire backend deployment.
// Both are invisible in UI review, so the build validates them instead.
// Failing here blocks the deploy — shipping an unparseable config is
// strictly worse than not shipping.
//
// Usage: `node scripts/validate-deploy.mjs` (runs as part of `prebuild`).

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let failed = false;
const fail = (msg) => {
  failed = true;
  console.error(`[deploy-gate] FAIL: ${msg}`);
};

// 1. Every JSON-LD block in index.html must be valid JSON (Google rejects
//    the whole block on any syntax error).
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)];
if (blocks.length === 0) {
  fail('no JSON-LD blocks found in index.html — the homepage must ship its Organization/WebSite schema');
}
blocks.forEach((m, i) => {
  try {
    JSON.parse(m[1]);
    console.log(`[deploy-gate] index.html JSON-LD block ${i}: valid`);
  } catch (err) {
    fail(`index.html JSON-LD block ${i} is not valid JSON: ${err.message}`);
  }
});

// 2. Vercel configs must be STRICT JSON (no comments, no trailing commas).
//    Vercel rejects the deploy when these don't parse.
for (const rel of ['vercel.json', 'backend/vercel.json']) {
  try {
    const parsed = JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
    console.log(`[deploy-gate] ${rel}: valid JSON`);
    const durations = JSON.stringify(parsed?.functions || {});
    console.log(`[deploy-gate] ${rel} functions: ${durations}`);
  } catch (err) {
    fail(`${rel} is not valid strict JSON: ${err.message}`);
  }
}

if (failed) {
  console.error('[deploy-gate] FAIL: fix the files above — an unparseable config ships zero value');
  process.exit(1);
}
console.log('[deploy-gate] ok');
