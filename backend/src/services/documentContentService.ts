import axios from 'axios';
import { supabaseAdmin } from '../database/config';

// ---------------------------------------------------------------------------
// Document content extraction for content-aware AI (summary / chat / quiz).
//
// Problem it solves: DocumentView's AI prompts only sent title + description,
// so the model honestly replied "I cannot access external documents." This
// service fetches the actual file (Google Drive PDFs), extracts text, and
// returns a bounded excerpt for prompt injection.
//
// Design constraints (all deliberate):
// - Best-effort: ANY failure returns null and callers fall back to
//   metadata-only prompts. A slow Drive download must never 500 a chat.
// - SSRF-safe: only Google Drive / Supabase-storage hosts are fetched.
//   file_url is admin-controlled but validated as URL on write; still, a
//   compromised/compromised-redirect URL must not reach internal hosts.
// - Bounded: 15MB download cap, 12s fetch timeout, excerpt capped so prompt
//   token cost stays predictable on shared Gemini quota.
// - Cached in-memory (TTL 1h, max 50 docs): every chat turn would otherwise
//   re-download + re-parse the same PDF. Serverless cold starts re-fetch
//   once per warm instance — acceptable, still best-effort.
// - Premium-gated by the CALLER (ai-tutor route knows the requester's
//   premium flag). This service only reports doc.is_premium.
// ---------------------------------------------------------------------------

export interface DocumentExcerpt {
  excerpt: string;
  truncated: boolean;
  totalChars: number;
  title: string;
  isPremium: boolean;
}

const CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_CACHE_ENTRIES = 50;
// Full cached text cap: enough for summary + chat + quiz excerpts without
// holding entire 200-page books in memory per warm instance.
const MAX_CACHED_CHARS = 60_000;

const cache = new Map<string, { text: string; title: string; isPremium: boolean; expires: number }>();

const ALLOWED_HOSTS = new Set([
  'drive.google.com',
  'drive.usercontent.google.com',
  'docs.google.com',
]);

export const isAllowedUrl = (url: string): boolean => {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    if (ALLOWED_HOSTS.has(u.hostname)) return true;
    // Supabase storage hosts (*.supabase.co) — project storage, if ever used.
    if (u.hostname.endsWith('.supabase.co')) return true;
    return false;
  } catch {
    return false;
  }
};

/** Extract a Drive file ID from the common sharing-link shapes. */
export const extractDriveFileId = (url: string): string | null => {
  if (!url) return null;
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
};

const downloadPdfBuffer = async (fileId: string): Promise<Buffer | null> => {
  // Try direct-download hosts first (return bytes), then the view URL.
  const candidates = [
    `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`,
    `https://drive.google.com/uc?export=download&id=${fileId}`,
  ];
  for (const url of candidates) {
    if (!isAllowedUrl(url)) continue;
    try {
      const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 12_000,
        maxContentLength: 15 * 1024 * 1024,
        maxRedirects: 5,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; SmartStudy/1.0)',
        },
        // Drive's virus-scan interstitial returns HTML for large files —
        // accept anything here and validate magic bytes below.
        validateStatus: (s) => s >= 200 && s < 300,
      });
      if (!res.data) continue;
      const buf = Buffer.from(res.data);
      if (buf.length < 5) continue;
      // PDF magic bytes; HTML interstitial starts with '<'.
      if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) {
        return buf;
      }
      // Not a PDF (interstitial HTML or image) — try next candidate.
    } catch {
      // Try next candidate.
    }
  }
  return null;
};

const normalizeText = (raw: string): string =>
  raw
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

/**
 * Load a document's text excerpt. Returns null when content is unavailable
 * (no file, non-PDF, download/parse failure, disallowed host) — callers MUST
 * fall back to metadata-only prompts. Never throws.
 */
export const getDocumentExcerpt = async (
  documentId: string,
  maxChars = 12_000
): Promise<DocumentExcerpt | null> => {
  try {
    if (!documentId || !/^[0-9a-fA-F-]{8,36}$/.test(documentId)) return null;

    // Cache first (stores normalized full-ish text; excerpt sliced per call).
    const cached = cache.get(documentId);
    if (cached && cached.expires > Date.now()) {
      const excerpt = cached.text.slice(0, maxChars);
      return {
        excerpt,
        truncated: cached.text.length > maxChars,
        totalChars: cached.text.length,
        title: cached.title,
        isPremium: cached.isPremium,
      };
    } else if (cached) {
      cache.delete(documentId);
    }

    // Load document metadata.
    const { data: doc, error } = await supabaseAdmin
      .from('documents')
      .select('id, title, file_type, file_url, is_premium')
      .eq('id', documentId)
      .maybeSingle();
    if (error || !doc) return null;
    if (!doc.file_url) return null;

    // PDF-only for now: DOCX/PPT extraction is a separate library (mammoth)
    // and image PDFs need OCR. Metadata fallback covers those honestly.
    const fileType = String(doc.file_type || '').toUpperCase();
    if (fileType && !['PDF'].includes(fileType)) return null;

    const fileId = extractDriveFileId(String(doc.file_url));
    if (!fileId) {
      // Non-Drive URL: only fetch allow-listed hosts (SSRF guard).
      if (!isAllowedUrl(String(doc.file_url))) return null;
      return null; // direct-URL PDFs: not yet supported, metadata fallback.
    }

    const pdfBuffer = await downloadPdfBuffer(fileId);
    if (!pdfBuffer) return null;

    let rawText = '';
    try {
      // pdf-parse v2 API (class-based). Dynamically imported so a broken
      // native/worker setup degrades to metadata-only instead of crashing
      // the route module at load time.
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: pdfBuffer });
      try {
        const result = await parser.getText();
        rawText = String((result as any)?.text || '');
      } finally {
        try {
          await parser.destroy();
        } catch {
          /* ignore */
        }
      }
    } catch (parseErr) {
      console.error(`[doc-content] PDF parse failed for ${documentId}:`, (parseErr as Error)?.message);
      return null;
    }

    const text = normalizeText(rawText);
    // Scanned PDFs have no text layer (extraction returns ~nothing). Say so
    // via null so the caller prompts honestly instead of summarizing garbage.
    if (text.length < 200) return null;

    const capped = text.slice(0, MAX_CACHED_CHARS);
    // LRU-ish eviction: drop oldest inserts when full.
    if (cache.size >= MAX_CACHE_ENTRIES) {
      const oldest = cache.keys().next();
      if (!oldest.done) cache.delete(oldest.value as string);
    }
    cache.set(documentId, {
      text: capped,
      title: String(doc.title || ''),
      isPremium: !!doc.is_premium,
      expires: Date.now() + CACHE_TTL_MS,
    });

    const excerpt = capped.slice(0, maxChars);
    return {
      excerpt,
      truncated: capped.length > maxChars,
      totalChars: capped.length,
      title: String(doc.title || ''),
      isPremium: !!doc.is_premium,
    };
  } catch (err) {
    console.error('[doc-content] excerpt error:', (err as Error)?.message);
    return null;
  }
};

/** Test-only: clear the in-memory cache. */
export const __clearDocContentCache = (): void => {
  cache.clear();
};
