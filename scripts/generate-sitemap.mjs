// Build-time sitemap generator.
//
// Why this exists: the catalog holds 800+ videos and hundreds of documents
// at /video/:id and /document/:id. A hand-maintained sitemap.xml can only
// list hub pages, leaving every detail page — the exact long-tail URLs that
// can rank for "grade 11 chemistry ..." queries — discoverable only through
// client-side crawling. This script pages the public list APIs and rewrites
// public/sitemap.xml with static routes + every public detail URL.
//
// Fail-soft by design: CI and offline builds have no API (localhost), and
// production backends can cold-start. ANY failure warns and exits 0,
// leaving the checked-in fallback sitemap untouched — a deploy must never
// ship an empty sitemap because the API blinked.
//
// Usage: `node scripts/generate-sitemap.mjs` (also runs as `prebuild`).
// Env: VITE_API_URL (injected by Vercel at deploy) or SITEMAP_API_BASE.

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = 'https://smartstudy.pro.et';
const API_BASE =
  process.env.SITEMAP_API_BASE || process.env.VITE_API_URL || 'http://localhost:5000/api';
const OUTFILE = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sitemap.xml');
const PAGE_SIZE = 100;
const TODAY = new Date().toISOString().slice(0, 10);

// Static hub routes (must stay in sync with public/sitemap.xml fallback).
const STATIC_ROUTES = [
  { loc: '/', changefreq: 'weekly', priority: '1.0' },
  { loc: '/library', changefreq: 'weekly', priority: '0.9' },
  { loc: '/ai-tutor', changefreq: 'weekly', priority: '0.9' },
  { loc: '/videos', changefreq: 'weekly', priority: '0.9' },
  { loc: '/past-exams', changefreq: 'weekly', priority: '0.8' },
  { loc: '/practice', changefreq: 'weekly', priority: '0.8' },
  { loc: '/community', changefreq: 'daily', priority: '0.8' },
  { loc: '/login', changefreq: 'monthly', priority: '0.6' },
  { loc: '/register', changefreq: 'monthly', priority: '0.6' },
  { loc: '/about', changefreq: 'monthly', priority: '0.7' },
  { loc: '/careers', changefreq: 'monthly', priority: '0.6' },
  { loc: '/privacy-policy', changefreq: 'monthly', priority: '0.5' },
  { loc: '/terms-of-service', changefreq: 'monthly', priority: '0.5' },
];

const toDate = (value) => {
  if (!value) return TODAY;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? TODAY : d.toISOString().slice(0, 10);
};

async function fetchJson(url, tries = 3) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw lastErr;
}

// Pages the public list endpoint; unwraps EITHER the raw backend envelope
// { success, data: { items, pagination } } or an already-unwrapped payload.
async function fetchAll(endpoint, listKey) {
  const items = [];
  let offset = 0;
  for (;;) {
    const json = await fetchJson(
      `${API_BASE}${endpoint}?limit=${PAGE_SIZE}&offset=${offset}`
    );
    const data = json?.data && typeof json.data === 'object' && !Array.isArray(json.data)
      ? json.data
      : json;
    const batch = data?.[listKey] ?? [];
    const pagination = data?.pagination;
    items.push(...batch);
    const total = pagination?.total;
    if (typeof total === 'number' ? offset + batch.length >= total : !pagination?.hasMore) break;
    if (batch.length === 0) break;
    offset += batch.length;
    if (offset > 50000) break; // sanity cap (sitemap protocol max)
  }
  return items;
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

try {
  // Settled, not all: a documents-endpoint hiccup must not cost us the
  // 800 video URLs (or vice versa). Each source degrades independently.
  const [videosRes, docsRes] = await Promise.allSettled([
    fetchAll('/videos', 'videos'),
    fetchAll('/documents', 'documents'),
  ]);
  const videos = videosRes.status === 'fulfilled' ? videosRes.value : [];
  const documents = docsRes.status === 'fulfilled' ? docsRes.value : [];
  if (videosRes.status === 'rejected') {
    console.warn(`[sitemap] videos skipped (${videosRes.reason?.message || videosRes.reason})`);
  }
  if (docsRes.status === 'rejected') {
    console.warn(`[sitemap] documents skipped (${docsRes.reason?.message || docsRes.reason})`);
  }

  if (videos.length === 0 && documents.length === 0) {
    throw new Error('API returned zero videos and zero documents — refusing to shrink the sitemap');
  }

  const urls = [
    ...STATIC_ROUTES.map((r) => ({ ...r, lastmod: TODAY })),
    ...videos.map((v) => ({
      loc: `/video/${encodeURIComponent(v.id)}`,
      lastmod: toDate(v.updated_at || v.created_at || v.uploadedAt),
      changefreq: 'monthly',
      priority: '0.7',
    })),
    ...documents.map((d) => ({
      loc: `/document/${encodeURIComponent(d.id)}`,
      lastmod: toDate(d.updated_at || d.created_at || d.uploadedAt),
      changefreq: 'monthly',
      priority: '0.7',
    })),
  ];

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<!-- Generated at build time by scripts/generate-sitemap.mjs (${TODAY}).\n` +
    `     Do not hand-edit detail URLs here — edit the script instead. -->\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map(
        (u) =>
          `  <url>\n    <loc>${esc(SITE + u.loc)}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`
      )
      .join('\n') +
    `\n</urlset>\n`;

  writeFileSync(OUTFILE, xml);
  console.log(
    `[sitemap] wrote ${urls.length} URLs (${videos.length} videos, ${documents.length} documents) from ${API_BASE}`
  );
} catch (err) {
  console.warn(`[sitemap] skipped (${err?.message || err}) — keeping existing sitemap.xml`);
}
