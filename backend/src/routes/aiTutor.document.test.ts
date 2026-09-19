import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// buildDocumentContext tiering: excerpt → grounded; any metadata-available
// failure → partial overview with notice (never an error wall); no document
// row at all → hard unavailable. The excerpt service is faked; routing and
// prompt-shaping run for real.
const { mockGetExcerpt, mockGetMeta } = vi.hoisted(() => ({
  mockGetExcerpt: vi.fn(),
  mockGetMeta: vi.fn(),
}));

vi.mock('../services/documentContentService', () => ({
  getDocumentExcerpt: mockGetExcerpt,
  getDocumentMeta: mockGetMeta,
}));

vi.mock('../database/config', () => ({
  query: vi.fn(),
  dbAdmin: {},
  supabaseAdmin: {},
}));

const savedEnv = { ...process.env };

const setTestEnv = () => {
  process.env.DATABASE_URL = 'postgresql://testuser:testpass@localhost:5432/testdb';
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'test-anon-key';
  process.env.JWT_SECRET = 'test-secret';
};

beforeEach(() => {
  setTestEnv();
  mockGetExcerpt.mockReset();
  mockGetMeta.mockReset();
});

afterEach(() => {
  process.env = { ...savedEnv };
});

const loadContext = async () => {
  const { buildDocumentContext } = await import('./ai-tutor');
  return buildDocumentContext;
};

const excerptOk = {
  excerpt: 'Photosynthesis converts light to chemical energy.',
  truncated: false,
  totalChars: 49,
  title: 'Biology Ch.4',
  isPremium: false,
};

const metaRow = {
  id: 'd-1',
  title: 'Biology Ch.4',
  description: 'Cells and energy.',
  subject: 'Biology',
  grade: 10,
  isPremium: false,
};

describe('buildDocumentContext (grounding tiers)', () => {
  it('grounds on the excerpt when readable and entitled', async () => {
    mockGetExcerpt.mockResolvedValue(excerptOk);
    const build = await loadContext();
    const r = await build('d-1', false);
    expect(r.grounded).toBe(true);
    expect(r.partial).toBe(false);
    expect(r.context).toContain('Photosynthesis converts light');
  });

  it('serves a labeled metadata overview (not the excerpt) for gated Pro docs', async () => {
    mockGetExcerpt.mockResolvedValue({ ...excerptOk, isPremium: true });
    mockGetMeta.mockResolvedValue({ ...metaRow, isPremium: true });
    const build = await loadContext();
    const r = await build('d-1', false);
    expect(r.grounded).toBe(false);
    expect(r.partial).toBe(true);
    expect(r.context).toContain('Biology Ch.4');
    expect(r.context).not.toContain('Photosynthesis converts light');
    expect(r.context).toMatch(/do NOT have the file/i);
    expect(r.notice).toMatch(/Pro/i);
  });

  it('falls back to metadata with a retry notice when the file is unreadable', async () => {
    mockGetExcerpt.mockResolvedValue({ unavailable: true, reason: 'fetch-failed' });
    mockGetMeta.mockResolvedValue(metaRow);
    const build = await loadContext();
    const r = await build('d-1', true);
    expect(r.grounded).toBe(false);
    expect(r.partial).toBe(true);
    expect(r.notice).toMatch(/retry/i);
    expect(r.context).toContain('Biology Ch.4');
  });

  it('stays hard-unavailable when even the catalog row is missing', async () => {
    mockGetExcerpt.mockResolvedValue({ unavailable: true, reason: 'fetch-failed' });
    mockGetMeta.mockResolvedValue(null);
    const build = await loadContext();
    const r = await build('d-1', true);
    expect(r).toMatchObject({ grounded: false, partial: false });
    expect(r.reason).toBe('fetch-failed');
  });

  it('returns empty without a document id (no DB touch)', async () => {
    const build = await loadContext();
    const r = await build(undefined, false);
    expect(r).toEqual({ context: null, grounded: false, partial: false });
    expect(mockGetExcerpt).not.toHaveBeenCalled();
  });
});
