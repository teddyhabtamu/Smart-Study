import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Key-ring rotation: multiple free-tier Gemini keys multiply the free
// budget. GoogleGenAI is faked at the module boundary; the mock routes by
// the apiKey each client was constructed with, so tests observe exactly
// which key serves each attempt.
const { mockGenerateContent } = vi.hoisted(() => ({
  mockGenerateContent: vi.fn(),
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models: any;
    constructor(opts: { apiKey: string }) {
      const key: string = opts.apiKey;
      this.models = {
        generateContent: (...args: any[]) => mockGenerateContent(key, ...args),
      };
    }
  },
}));

import {
  parseKeyRing,
  hasGeminiKeys,
  isInvalidKeyError,
  withKeyAndModelFallback,
  AIQuotaExceededError,
  __resetTutorKeysForTests,
} from './aiTutor';

const K1 = 'ring-key-one';
const K2 = 'ring-key-two';
const savedEnv = { ...process.env };

const quotaErr = () => Object.assign(new Error('Quota exceeded for quota metric'), { status: 429 });
const invalidKeyErr = () =>
  Object.assign(new Error('API key not valid. Please pass a valid API key.'), { status: 400 });

beforeEach(() => {
  __resetTutorKeysForTests();
  mockGenerateContent.mockReset();
  delete process.env.GEMINI_API_KEYS;
  delete process.env.GEMINI_API_KEY;
});

afterEach(() => {
  process.env = { ...savedEnv };
});

describe('parseKeyRing', () => {
  it('splits, trims and dedupes the plural var', () => {
    process.env.GEMINI_API_KEYS = ` ${K1} ,${K2},${K1} , `;
    expect(parseKeyRing()).toEqual([K1, K2]);
    expect(hasGeminiKeys()).toBe(true);
  });

  it('falls back to the legacy single key', () => {
    process.env.GEMINI_API_KEY = 'solo-key';
    expect(parseKeyRing()).toEqual(['solo-key']);
  });

  it('prefers the ring when both are set, reports none when neither is', () => {
    process.env.GEMINI_API_KEY = 'solo-key';
    process.env.GEMINI_API_KEYS = K1;
    expect(parseKeyRing()).toEqual([K1]);
    delete process.env.GEMINI_API_KEYS;
    delete process.env.GEMINI_API_KEY;
    expect(parseKeyRing()).toEqual([]);
    expect(hasGeminiKeys()).toBe(false);
  });
});

describe('isInvalidKeyError', () => {
  it('catches dead credentials without catching bad shapes', () => {
    expect(isInvalidKeyError({ status: 401, message: 'x' })).toBe(true);
    expect(isInvalidKeyError({ status: 403, message: 'x' })).toBe(true);
    expect(isInvalidKeyError({ status: 400, message: 'API_KEY_INVALID' })).toBe(true);
    expect(isInvalidKeyError({ status: 400, message: 'API key not valid. Pass a valid key.' })).toBe(true);
    // Shape/quota/model errors must NOT retire the key:
    expect(isInvalidKeyError({ status: 429, message: 'quota' })).toBe(false);
    expect(isInvalidKeyError({ status: 404, message: 'model not found' })).toBe(false);
    expect(isInvalidKeyError({ status: 400, message: 'INVALID_ARGUMENT: thinkingConfig' })).toBe(false);
    expect(isInvalidKeyError({ status: 503, message: 'overloaded' })).toBe(false);
  });
});

describe('withKeyAndModelFallback (rotation)', () => {
  // Drive the fallback the way production does: through the per-key client
  // the mock class binds to its own apiKey. The first mock arg is always
  // the serving key, so assertions read key order directly.
  const via = (fn?: (key: string) => any) => {
    if (fn) mockGenerateContent.mockImplementation(fn);
    return withKeyAndModelFallback(async (client) => {
      const r: any = await client.models.generateContent({});
      return r.text;
    });
  };

  it('round-robins consecutive requests across keys', async () => {
    process.env.GEMINI_API_KEYS = `${K1},${K2}`;
    mockGenerateContent.mockImplementation(async (key: string) => ({ text: `from ${key}` }));
    const r1 = await via();
    const r2 = await via();
    expect(r1).toContain(K1);
    expect(r2).toContain(K2);
    expect(mockGenerateContent.mock.calls.map(([k]) => k)).toEqual([K1, K2]);
  });

  it('fails over to key #2 when key #1 hits quota, then skips the cooling key', async () => {
    process.env.GEMINI_API_KEYS = `${K1},${K2}`;
    mockGenerateContent.mockImplementation(async (key: string) => {
      if (key === K1) throw quotaErr();
      return { text: `from ${key}` };
    });
    const r1 = await via();
    expect(r1).toContain(K2);
    const k1Calls = mockGenerateContent.mock.calls.filter(([k]) => k === K1).length;
    expect(k1Calls).toBeGreaterThan(0);
    // Key #1 is cooling: the next request must not touch it.
    mockGenerateContent.mockClear();
    const r2 = await via();
    expect(r2).toContain(K2);
    expect(mockGenerateContent.mock.calls.every(([k]) => k === K2)).toBe(true);
  });

  it('retires an invalid key and serves from the next one', async () => {
    process.env.GEMINI_API_KEYS = `${K1},${K2}`;
    mockGenerateContent.mockImplementation(async (key: string) => {
      if (key === K1) throw invalidKeyErr();
      return { text: `from ${key}` };
    });
    const r = await via();
    expect(r).toContain(K2);
  });

  it('throws quota exhaustion only when every key is spent', async () => {
    process.env.GEMINI_API_KEYS = `${K1},${K2}`;
    mockGenerateContent.mockRejectedValue(quotaErr());
    await expect(via()).rejects.toBeInstanceOf(AIQuotaExceededError);
  });

  it('throws the not-configured error with no keys at all', async () => {
    await expect(via()).rejects.toThrow('GEMINI_API_KEY is not configured');
  });
});
