// Build-time JSON-LD gate.
//
// Why this exists: a single trailing comma in index.html's structured-data
// block made Google Search Console report "Unparsable structured data —
// Missing '}' or object member name" on the homepage, silently killing rich-
// result eligibility. JSON-LD is invisible in the UI, so nothing catches it
// in review. This script fails the build on invalid blocks (loud > sorry:
// an invalid block ships zero value, so blocking the deploy is correct).
//
// Usage: `node scripts/validate-jsonld.mjs` (runs as part of `prebuild`).

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const INDEX_HTML = join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html');

const html = readFileSync(INDEX_HTML, 'utf8');
const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)];

if (blocks.length === 0) {
  console.error('[jsonld] FAIL: no JSON-LD blocks found in index.html — the homepage must ship its Organization/WebSite schema');
  process.exit(1);
}

let failed = false;
blocks.forEach((m, i) => {
  try {
    JSON.parse(m[1]);
    console.log(`[jsonld] block ${i}: valid`);
  } catch (err) {
    failed = true;
    console.error(`[jsonld] FAIL: block ${i} is not valid JSON: ${err.message}`);
  }
});

if (failed) {
  console.error('[jsonld] FAIL: fix the structured data above — Google rejects the entire block on any syntax error');
  process.exit(1);
}
console.log(`[jsonld] ok: ${blocks.length} block(s) valid`);
