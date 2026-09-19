// AI Tutor service — Google Gemini 2.x via @google/genai
// Replaces the previous Groq/Llama implementation (weak for math/science tutoring)
// and the three dead geminiService* variants.

import { GoogleGenAI } from '@google/genai';
import {
  eatTodayStr,
  weekdayOfDateStr,
  shiftDateStr,
} from '../utils/dates';
import { logKeyUsage } from './aiKeyUsage';

// --- Client key ring ----------------------------------------------------------
// Free-tier quota attaches to KEYS, not to us: GEMINI_API_KEYS (comma-
// separated) multiplies the free budget by the number of keys; the legacy
// single GEMINI_API_KEY keeps working as a one-key ring. Round-robin
// spreads load across keys; a key that 429s cools down and rejoins later,
// and a dead credential retires for an hour so one bad key never takes
// down the ring. Key identity in logs is the ring index only — never the
// key itself.
const geminiClients = new Map<string, GoogleGenAI>();
let keyCursor = 0;
// key -> timestamp (ms) until which it is skipped.
const keyCooldownUntil = new Map<string, number>();
// key -> why it is cooling ('invalid' retires an hour, quota rejoins soon).
const keyCooldownReason = new Map<string, 'quota' | 'invalid'>();
const KEY_COOLDOWN_CAP_MS = 10 * 60 * 1000;
const BAD_KEY_COOLDOWN_MS = 60 * 60 * 1000;
const bootedAt = Date.now();

// Per-key lifetime counters (in-memory only). Surfaced read-only on the
// admin AI-keys tab; full keys NEVER leave this module (see fingerprint).
interface KeyStats {
  served: number;
  quotaHits: number;
  invalidHits: number;
  otherErrors: number;
  lastOkAt: number | null;
  lastErrorAt: number | null;
  lastErrorKind: 'quota' | 'invalid' | 'other' | null;
}
const keyStats = new Map<string, KeyStats>();
const statsFor = (key: string): KeyStats => {
  let s = keyStats.get(key);
  if (!s) {
    s = { served: 0, quotaHits: 0, invalidHits: 0, otherErrors: 0, lastOkAt: null, lastErrorAt: null, lastErrorKind: null };
    keyStats.set(key, s);
  }
  return s;
};
const noteError = (key: string, kind: 'quota' | 'invalid' | 'other'): void => {
  const s = statsFor(key);
  s.lastErrorAt = Date.now();
  s.lastErrorKind = kind;
  if (kind === 'quota') s.quotaHits += 1;
  else if (kind === 'invalid') s.invalidHits += 1;
  else s.otherErrors += 1;
};

// Visible for tests (lets suites reset module state between cases).
export const __resetTutorKeysForTests = (): void => {
  geminiClients.clear();
  keyCursor = 0;
  keyCooldownUntil.clear();
  keyCooldownReason.clear();
  keyStats.clear();
};

export const parseKeyRing = (env: NodeJS.ProcessEnv = process.env): string[] => {
  const multi = (env.GEMINI_API_KEYS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (multi.length > 0) return [...new Set(multi)];
  const single = (env.GEMINI_API_KEY || '').trim();
  return single ? [single] : [];
};

export const hasGeminiKeys = (env: NodeJS.ProcessEnv = process.env): boolean =>
  parseKeyRing(env).length > 0;

const clientFor = (key: string): GoogleGenAI => {
  let c = geminiClients.get(key);
  if (!c) {
    c = new GoogleGenAI({ apiKey: key });
    geminiClients.set(key, c);
  }
  return c;
};

const keyLabel = (ring: string[], key: string): string =>
  `key #${ring.indexOf(key) + 1}/${ring.length}`;

// Rotation order for this request: round-robin from the cursor, skipping
// cooling keys. If every key is cooling, try them all anyway — quotas may
// have reset, and attempting beats an instant 429.
const keyOrder = (ring: string[]): string[] => {
  const now = Date.now();
  const live = ring.filter((k) => (keyCooldownUntil.get(k) || 0) <= now);
  const pool = live.length > 0 ? live : [...ring];
  const start = keyCursor % pool.length;
  return [...pool.slice(start), ...pool.slice(0, start)];
};

const markKeyExhausted = (key: string, retryAfterSec: number): void => {
  const ms = Math.min(Math.max(retryAfterSec, 1), KEY_COOLDOWN_CAP_MS / 1000) * 1000;
  keyCooldownUntil.set(key, Date.now() + ms);
  keyCooldownReason.set(key, 'quota');
};

const markKeyInvalid = (key: string): void => {
  keyCooldownUntil.set(key, Date.now() + BAD_KEY_COOLDOWN_MS);
  keyCooldownReason.set(key, 'invalid');
};

export const AI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

// Fallback chain: each model has a separate free-tier quota. If the primary
// model is rate-limited, we try the next one before giving up.
// NOTE: verified 2026-09-09 via live generate probes (models.list LIES —
// it still advertises retired models). gemini-2.0-flash and
// gemini-2.5-flash-lite both 404 with "no longer available". Do NOT add
// version-pinned models back without probing them first.
const MODEL_FALLBACKS = [
  process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  'gemini-3.5-flash-lite',
].filter((m, i, arr) => m && arr.indexOf(m) === i);

// Last model that served successfully — tried first on the next request so a
// quota-exhausted primary doesn't waste a round-trip every time. Resets on
// process restart (safe: worst case is one extra fallback attempt).
let preferredModel: string | null = null;

// Models proven dead (404 retired) with timestamp — skipped for an hour so a
// stale chain entry costs nothing after the first failure. Retried hourly in
// case of transient API-side issues.
const deadModels = new Map<string, number>();
const DEAD_MODEL_TTL_MS = 60 * 60 * 1000;

const isModelKnownDead = (model: string): boolean => {
  const since = deadModels.get(model);
  if (since === undefined) return false;
  if (Date.now() - since > DEAD_MODEL_TTL_MS) {
    deadModels.delete(model);
    return false;
  }
  return true;
};

const markModelDead = (model: string): void => {
  deadModels.set(model, Date.now());
};

// Typed error for quota exhaustion so routes can return 429 (not 500)
export class AIQuotaExceededError extends Error {
  retryAfterSeconds: number;
  constructor(message: string, retryAfterSeconds = 60) {
    super(message);
    this.name = 'AIQuotaExceededError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export const isQuotaError = (err: any): boolean => {
  const msg = String(err?.message || '');
  const status = (err as any)?.status;
  return (
    status === 429 ||
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('Quota exceeded') ||
    msg.includes('quota')
  );
};

// A retired/unknown model (404 NOT_FOUND) should also fall through to the
// next model rather than failing the request.
export const isModelGoneError = (err: any): boolean => {
  const msg = String(err?.message || '');
  const status = (err as any)?.status;
  return (
    status === 404 ||
    (msg.includes('404') && msg.includes('model')) ||
    msg.includes('is no longer available') ||
    msg.includes('NOT_FOUND')
  );
};

// A dead credential (revoked/typo'd key: 401/403 or key-shaped 400).
// Distinct from INVALID_ARGUMENT (bad request SHAPE, which rethrows): only
// key-shaped rejections retire the key, so one bad key in the ring never
// takes down the rest.
export const isInvalidKeyError = (err: any): boolean => {
  const msg = String(err?.message || '').toLowerCase();
  const status = (err as any)?.status;
  return (
    status === 401 ||
    status === 403 ||
    msg.includes('api_key_invalid') ||
    msg.includes('api key not valid') ||
    msg.includes('keyexpired') ||
    msg.includes('key expired') ||
    msg.includes('invalid api key') ||
    (msg.includes('permission_denied') && msg.includes('key'))
  );
};

// An invalid-argument rejection (400). Distinct from quota/gone/overloaded/
// dead-key: the request SHAPE is wrong for this model, not the model itself.
export const isInvalidArgumentError = (err: any): boolean => {
  const msg = String(err?.message || '').toLowerCase();
  return (err as any)?.status === 400 || msg.includes('invalid_argument') || msg.includes('invalid argument');
};

// An overloaded model (503 UNAVAILABLE) is transient and capacity-specific —
// the next model in the chain will usually serve fine.
export const isOverloadedError = (err: any): boolean => {
  const msg = String(err?.message || '');
  const status = (err as any)?.status;
  return (
    status === 503 ||
    msg.includes('503') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('high demand') ||
    msg.includes('overloaded')
  );
};

export const quotaRetryAfter = (err: any): number => {
  try {
    const details = (err as any)?.error?.details || [];
    for (const d of details) {
      const retry = d?.retryDelay;
      if (retry) {
        const m = String(retry).match(/(\d+)/);
        if (m?.[1]) return parseInt(m[1], 10);
      }
    }
  } catch { /* ignore */ }
  const m = String(err?.message || '').match(/retry in ([\d.]+)s/i);
  if (m?.[1]) return Math.ceil(parseFloat(m[1]));
  return 60;
};

// Run fn against each key in rotation, each key against each model in the
// fallback chain. A quota-hit key cools down and the next key takes over;
// if every key is exhausted, throw AIQuotaExceededError. With a single key
// this behaves exactly like the old model-only fallback.
export const withKeyAndModelFallback = async <T>(
  fn: (client: GoogleGenAI, model: string) => Promise<T>
): Promise<T> => {
  const ring = parseKeyRing();
  if (ring.length === 0) {
    throw new Error('GEMINI_API_KEY is not configured');
  }
  let lastQuotaError: any = null;
  let retryAfter = 60;
  for (const key of keyOrder(ring)) {
    const client = clientFor(key);
    const label = keyLabel(ring, key);
    // Adaptive ordering: the model that worked last goes first, known-dead
    // models are skipped, so a stale chain costs nothing after first failure.
    const ordered = preferredModel
      ? [preferredModel, ...MODEL_FALLBACKS.filter((m) => m !== preferredModel)]
      : [...MODEL_FALLBACKS];
    for (const model of ordered) {
      if (isModelKnownDead(model)) {
        console.log(`[tutor] skipping known-dead model ${model}`);
        continue;
      }
      const tStart = Date.now();
      try {
        const result = await fn(client, model);
        preferredModel = model;
        // Rotate on success so consecutive requests spread across the ring
        // instead of camping on key #1 until it 429s.
        keyCursor = (ring.indexOf(key) + 1) % ring.length;
        const st = statsFor(key);
        st.served += 1;
        st.lastOkAt = Date.now();
        console.log(`[tutor] ${label} model ${model} ok in ${Date.now() - tStart}ms`);
        // Durable per-key metering (fire-and-forget: best-effort, never
        // blocks the AI response). In-memory stats above keep the live
        // rotation snappy; this row keeps the admin tab truthful across
        // restarts and serverless cold starts.
        void logKeyUsage({
          fingerprint: keyFingerprint(key),
          keyIndex: ring.indexOf(key),
          outcome: 'served',
          model,
          latencyMs: Date.now() - tStart,
        });
        return result;
      } catch (err) {
        console.log(`[tutor] ${label} model ${model} failed in ${Date.now() - tStart}ms`);
        if (isInvalidKeyError(err)) {
          console.warn(`[tutor] ${label} invalid, retiring it for an hour...`);
          markKeyInvalid(key);
          noteError(key, 'invalid');
          void logKeyUsage({
            fingerprint: keyFingerprint(key),
            keyIndex: ring.indexOf(key),
            outcome: 'invalid',
            model,
            latencyMs: Date.now() - tStart,
          });
          break;
        }
        if (isQuotaError(err)) {
          console.warn(`[tutor] quota hit on ${label} ${model}, cooling it down...`);
          lastQuotaError = err;
          const wait = quotaRetryAfter(err);
          retryAfter = Math.max(retryAfter, wait);
          markKeyExhausted(key, wait);
          noteError(key, 'quota');
          void logKeyUsage({
            fingerprint: keyFingerprint(key),
            keyIndex: ring.indexOf(key),
            outcome: 'quota',
            model,
            latencyMs: Date.now() - tStart,
          });
          continue;
        }
        if (isModelGoneError(err)) {
          console.warn(`[tutor] model ${model} unavailable, trying fallback...`);
          markModelDead(model);
          continue;
        }
        if (isOverloadedError(err)) {
          console.warn(`[tutor] model ${model} overloaded, trying fallback...`);
          continue;
        }
        noteError(key, 'other');
        void logKeyUsage({
          fingerprint: keyFingerprint(key),
          keyIndex: ring.indexOf(key),
          outcome: 'other',
          model,
          latencyMs: Date.now() - tStart,
        });
        throw err;
      }
    }
  }
  throw new AIQuotaExceededError(
    'Daily AI limit reached. Please try again later — limits reset daily.',
    retryAfter
  );
};

// --- Ring observability (admin AI-keys tab) --------------------------------
// Everything the dashboard needs, nothing it must not have: keys are
// identified by their last 4 characters ONLY. The full key material never
// leaves this module — grep the response and you will find no key.
export type KeyRingKeyState = 'next' | 'idle' | 'cooling' | 'retired';

export interface KeyRingKeyStatus {
  index: number;
  /** Masked identity (•••• + last 4) for matching against AI Studio. */
  fingerprint: string;
  state: KeyRingKeyState;
  /** Seconds until it rejoins rotation (cooling/retired only). */
  cooldownEndsInSec: number | null;
  served: number;
  quotaHits: number;
  invalidHits: number;
  otherErrors: number;
  lastOkAt: string | null;
  lastErrorAt: string | null;
  lastErrorKind: 'quota' | 'invalid' | 'other' | null;
}

export interface KeyRingStatus {
  ringSize: number;
  /** Rotation cursor: index serving the next request. */
  cursor: number;
  bootedAt: string;
  preferredModel: string | null;
  deadModels: string[];
  keys: KeyRingKeyStatus[];
}

export const keyFingerprint = (key: string): string => `••••${key.slice(-4)}`;

export const getKeyRingStatus = (): KeyRingStatus => {
  const ring = parseKeyRing();
  const now = Date.now();
  // 'next' is whoever would actually serve now (post-cooldown-skip), not
  // the raw cursor — the cursor can rest on a cooling key.
  const order = keyOrder(ring);
  const nextKey = order.length > 0 ? order[0] : null;
  return {
    ringSize: ring.length,
    cursor: ring.length === 0 ? 0 : keyCursor % ring.length,
    bootedAt: new Date(bootedAt).toISOString(),
    preferredModel,
    deadModels: [...deadModels.keys()],
    keys: ring.map((key, index) => {
      const s = statsFor(key);
      const until = keyCooldownUntil.get(key) || 0;
      const cooling = until > now;
      const reason = keyCooldownReason.get(key);
      return {
        index,
        fingerprint: keyFingerprint(key),
        state: (cooling && reason === 'invalid'
          ? 'retired'
          : cooling ? 'cooling' : key === nextKey ? 'next' : 'idle') as KeyRingKeyState,
        cooldownEndsInSec: cooling ? Math.ceil((until - now) / 1000) : null,
        served: s.served,
        quotaHits: s.quotaHits,
        invalidHits: s.invalidHits,
        otherErrors: s.otherErrors,
        lastOkAt: s.lastOkAt ? new Date(s.lastOkAt).toISOString() : null,
        lastErrorAt: s.lastErrorAt ? new Date(s.lastErrorAt).toISOString() : null,
        lastErrorKind: s.lastErrorKind,
      };
    }),
  };
};

// Zero-spend credential check for the admin tab: models.list costs no
// tokens, so validating a newly added key burns no quota. A confirmed-dead
// key retires immediately; transient failures report without retiring.
export const validateRingKey = async (
  index: number
): Promise<{ ok: boolean; message: string }> => {
  const ring = parseKeyRing();
  const key = ring[index];
  if (!key) return { ok: false, message: `No key at index ${index} (ring has ${ring.length})` };
  try {
    await clientFor(key).models.list();
    return { ok: true, message: `${keyFingerprint(key)} answered — credential live` };
  } catch (err: any) {
    if (isInvalidKeyError(err)) {
      markKeyInvalid(key);
      noteError(key, 'invalid');
      return { ok: false, message: `${keyFingerprint(key)} rejected — check the value in Vercel env` };
    }
    return { ok: false, message: `Validation inconclusive (${String(err?.message || err).slice(0, 100)}) — key kept in rotation` };
  }
};

export const AI_QUOTA_MESSAGE =
  '## ⏳ Daily AI Limit Reached\n\nWe have used up today\'s free AI responses. The limit resets daily — please try again later, or explore the library, videos, and practice materials in the meantime!';

// --- Shared prompts ------------------------------------------------------
const TUTOR_SYSTEM_PROMPT = `
You are SmartStudy AI Tutor for Ethiopian students (Grade 9-12).

CRITICAL: You MUST respond ONLY in ENGLISH. Do not use Amharic, Arabic, or any other language. All responses must be in English.

MOST IMPORTANT: ACCURACY IS CRITICAL. You must provide CORRECT and ACCURATE answers. If you are unsure, say so rather than guessing.

You must:
- Provide ACCURATE and CORRECT answers - double-check your reasoning before responding
- For grammar, punctuation, and language questions: Apply standard English grammar rules correctly
- For multiple choice questions: Carefully analyze each option and identify the CORRECT answer based on established rules
- Explain concepts simply and clearly in ENGLISH only
- Break down complex topics into steps in ENGLISH
- Give relevant examples from Ethiopian context when appropriate, but explain in ENGLISH
- Avoid complex English, use simple and clear language
- Give formulas and equations when needed for math/science (use LaTeX: $...$ inline, $$...$$ display)
- Give final answers clearly and CORRECTLY in ENGLISH
- Be encouraging and patient in ENGLISH
- Focus on helping students understand and learn with ACCURATE information

When answering questions:
1. Read the question carefully
2. Apply the correct rules (grammar, math, science, etc.)
3. Verify your answer is correct before responding
4. Explain why the correct answer is correct and why incorrect options are wrong

Always provide direct, helpful, and ACCURATE answers to questions in ENGLISH only. Do not give generic educational support messages. Respond in English regardless of the student's question language.
`.trim();

// Normalize chat history to Gemini contents format. Tolerates legacy
// session rows where messages is an object/record rather than an array.
const toContents = (
  history: any,
  userPrompt: string
): Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> => {
  const safeHistory = Array.isArray(history) ? history : [];
  const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

  for (const m of safeHistory) {
    if (!m) continue;
    const text = String((m as any).text ?? '');
    if (!text) continue;
    const role = (m as any).role === 'user' ? ('user' as const) : ('model' as const);
    contents.push({ role, parts: [{ text }] });
  }

  contents.push({ role: 'user', parts: [{ text: userPrompt }] });
  return contents;
};

// Models that reject thinkingConfig (400 INVALID_ARGUMENT) — remembered so
// later calls skip straight to the supported shape (mirrors deadModels).
const noThinkingModels = new Set<string>();

// --- Core non-streaming completion --------------------------------------
const complete = async (
  systemPrompt: string,
  userPrompt: string,
  history: { role: string; text: string }[] = [],
  temperature = 0.3,
  maxOutputTokens = 4096,
  // Optional thinking budget override. gemini-2.5-flash reasons with
  // thinking tokens that SHARE maxOutputTokens: on heavy planning tasks the
  // reasoning eats ~4k of a 6144 cap and the visible JSON is cut mid-object
  // (slowly — thinking is also where the 30s latency goes). Pass 0 for
  // formatting-heavy calls that need output, not deliberation. Undefined =
  // model default (chat keeps thinking).
  thinkingBudget?: number
): Promise<string> => {
  const contents = toContents(history, userPrompt);

  return withKeyAndModelFallback(async (client, model) => {
    // One model (observed: gemini-3.5-flash-lite) rejects thinkingConfig with
    // 400 INVALID_ARGUMENT while its siblings accept it. Rather than an
    // allowlist, degrade per model: retry the same model without the field,
    // then remember the verdict so later calls skip straight to the working
    // shape (mirrors deadModels above).
    const sendThinking = thinkingBudget !== undefined && !noThinkingModels.has(model);
    const run = async (withThinking: boolean) => {
      const response = await client.models.generateContent({
        model,
        contents,
        config: {
          systemInstruction: systemPrompt,
          temperature,
          maxOutputTokens,
          ...(withThinking ? { thinkingConfig: { thinkingBudget: thinkingBudget! } } : {}),
        },
      });

      const text = response.text;
      if (!text) {
        throw new Error('Empty response from Gemini');
      }
      return text;
    };
    try {
      return await run(sendThinking);
    } catch (err) {
      if (sendThinking && isInvalidArgumentError(err)) {
        console.warn(`[tutor] model ${model} rejects thinkingConfig, retrying without it`);
        noThinkingModels.add(model);
        return await run(false);
      }
      throw err;
    }
  });
};

// --- Tutor chat (non-streaming fallback) --------------------------------
export interface TutorOptions {
  deepThinking?: boolean;
}

// Deep Think mode: the model reasons step-by-step out loud, verifies its
// answer, and goes deeper (formulas, edge cases, common mistakes). Costs more
// output tokens but stays on the same quota-safe flash model chain.
const DEEP_THINKING_INSTRUCTION = `
DEEP THINKING MODE is ON. Before your final answer:
1. Think through the problem step-by-step and SHOW key reasoning steps briefly.
2. Double-check formulas, calculations, and grammar rules as you go.
3. Point out the most common mistake students make on this topic.
4. Then give the final answer clearly.
Be thorough but stay focused — no rambling.`.trim();

const tutorSystemPrompt = (opts?: TutorOptions): string =>
  opts?.deepThinking ? `${TUTOR_SYSTEM_PROMPT}\n\n${DEEP_THINKING_INSTRUCTION}` : TUTOR_SYSTEM_PROMPT;

const tutorMaxTokens = (opts?: TutorOptions): number => (opts?.deepThinking ? 8192 : 4096);

export async function getTutorResponse(
  history: any[],
  message: string,
  subject: string,
  grade: number,
  opts?: TutorOptions
): Promise<string> {
  // Detect if this is a grammar/punctuation question
  const lower = message.toLowerCase();
  const isGrammarQuestion =
    lower.includes('punctuation') ||
    lower.includes('capitalization') ||
    lower.includes('grammar') ||
    lower.includes('correctly punctuated') ||
    (subject.toLowerCase() === 'english' && message.includes('A.') && message.includes('B.'));

  let userMessage = `Subject: ${subject}, Grade: ${grade}\nQuestion: ${message}`;
  if (isGrammarQuestion) {
    userMessage += `

IMPORTANT: This is a grammar/punctuation question. Apply standard English grammar rules strictly. For punctuation questions:
- Two independent clauses must be separated by a period (.), semicolon (;), or joined with a comma + conjunction
- A comma alone cannot join two independent clauses (this is a comma splice error)
- After a semicolon, the next clause should start with a lowercase letter unless it's a proper noun
- Carefully analyze each option and identify which follows correct grammar rules`;
  }

  try {
    return await complete(tutorSystemPrompt(opts), userMessage, history, 0.3, tutorMaxTokens(opts));
  } catch (error) {
    // Quota errors must propagate so routes can return 429 with a clear
    // message — swallowing them here would show a misleading generic error.
    if (error instanceof AIQuotaExceededError) throw error;
    console.error('Gemini AI Error:', error);
    return `## 🤖 AI Tutor Temporarily Unavailable

I'm currently unable to connect to the AI service. This might be because:

- The AI service is temporarily down
- Network connectivity issues
- API rate limits

Please try again in a few moments, or explore other study materials on the platform in the meantime!`;
  }
}

// --- Tutor chat (streaming) ----------------------------------------------
// Calls onChunk with incremental text deltas; returns the full text at the end.
export async function streamTutorResponse(
  history: any[],
  message: string,
  subject: string,
  grade: number,
  onChunk: (delta: string) => void,
  opts?: TutorOptions
): Promise<string> {
  const lower = message.toLowerCase();
  const isGrammarQuestion =
    lower.includes('punctuation') ||
    lower.includes('capitalization') ||
    lower.includes('grammar') ||
    lower.includes('correctly punctuated') ||
    (subject.toLowerCase() === 'english' && message.includes('A.') && message.includes('B.'));

  let userMessage = `Subject: ${subject}, Grade: ${grade}\nQuestion: ${message}`;
  if (isGrammarQuestion) {
    userMessage += `

IMPORTANT: This is a grammar/punctuation question. Apply standard English grammar rules strictly. For punctuation questions:
- Two independent clauses must be separated by a period (.), semicolon (;), or joined with a comma + conjunction
- A comma alone cannot join two independent clauses (this is a comma splice error)
- After a semicolon, the next clause should start with a lowercase letter unless it's a proper noun
- Carefully analyze each option and identify which follows correct grammar rules`;
  }

  const contents = toContents(history, userMessage);
  const systemInstruction = tutorSystemPrompt(opts);
  const maxOutputTokens = tutorMaxTokens(opts);

  // Streaming can't retry mid-stream cleanly, so we attempt models in order
  // (preferred working model first). The whole model chain runs per key:
  // a key that dies quietly (quota/invalid, nothing streamed yet) yields
  // to the next key. Partially-streamed content is NEVER regenerated on
  // another key (the user already saw those chunks) — it returns as-is.
  // `emitted` accumulates everything sent to the client across fallbacks so
  // the persisted session text always matches what the user actually saw.
  const ring = parseKeyRing();
  if (ring.length === 0) {
    throw new Error('GEMINI_API_KEY is not configured');
  }
  const ordered = preferredModel
    ? [preferredModel, ...MODEL_FALLBACKS.filter((m) => m !== preferredModel)]
    : [...MODEL_FALLBACKS];
  let lastQuotaError: any = null;
  let lastRetryAfter = 60;
  let emitted = '';
  for (const key of keyOrder(ring)) {
    const client = clientFor(key);
    const label = keyLabel(ring, key);
    let keyQuotaHit = false;
    for (const model of ordered) {
    if (isModelKnownDead(model)) {
      console.log(`[tutor] skipping known-dead stream model ${model}`);
      continue;
    }
    const tStart = Date.now();
    try {
      const stream = await client.models.generateContentStream({
        model,
        contents,
        config: {
          systemInstruction,
          temperature: 0.3,
          maxOutputTokens,
        },
      });

      let gotChunk = false;
      for await (const chunk of stream) {
        const delta = chunk.text;
        if (delta) {
          emitted += delta;
          gotChunk = true;
          onChunk(delta);
        }
      }
      // A quota error can surface mid-stream as an exception; an empty stream
      // with no chunks means this model failed — try the next one.
      if (gotChunk || emitted) {
        preferredModel = model;
        keyCursor = (ring.indexOf(key) + 1) % ring.length;
        const st = statsFor(key);
        st.served += 1;
        st.lastOkAt = Date.now();
        console.log(`[tutor] stream ${label} ${model} ok in ${Date.now() - tStart}ms`);
        void logKeyUsage({
          fingerprint: keyFingerprint(key),
          keyIndex: ring.indexOf(key),
          outcome: 'served',
          model,
          latencyMs: Date.now() - tStart,
        });
        return emitted;
      }
      throw new Error('Empty stream from model ' + model);
    } catch (err) {
      console.log(`[tutor] stream ${label} ${model} failed in ${Date.now() - tStart}ms`);
      if (isInvalidKeyError(err)) {
        console.warn(`[tutor] stream ${label} invalid, retiring it for an hour...`);
        markKeyInvalid(key);
        noteError(key, 'invalid');
        void logKeyUsage({
          fingerprint: keyFingerprint(key),
          keyIndex: ring.indexOf(key),
          outcome: 'invalid',
          model,
          latencyMs: Date.now() - tStart,
        });
        keyQuotaHit = true;
        break;
      }
      if (isQuotaError(err)) {
        console.warn(`[tutor] streaming quota hit on ${label} ${model}, cooling it down...`);
        lastQuotaError = err;
        lastRetryAfter = Math.max(lastRetryAfter, quotaRetryAfter(err));
        markKeyExhausted(key, lastRetryAfter);
        noteError(key, 'quota');
        void logKeyUsage({
          fingerprint: keyFingerprint(key),
          keyIndex: ring.indexOf(key),
          outcome: 'quota',
          model,
          latencyMs: Date.now() - tStart,
        });
        keyQuotaHit = true;
        continue;
      }
      if (isModelGoneError(err)) {
        console.warn(`[tutor] streaming model ${model} unavailable, trying fallback...`);
        markModelDead(model);
        continue;
      }
      if (isOverloadedError(err)) {
        console.warn(`[tutor] streaming model ${model} overloaded, trying fallback...`);
        continue;
      }
      noteError(key, 'other');
      void logKeyUsage({
        fingerprint: keyFingerprint(key),
        keyIndex: ring.indexOf(key),
        outcome: 'other',
        model,
        latencyMs: Date.now() - tStart,
      });
      throw err;
    }
    }
    // Model chain done for this key. Partial content returns as-is (never
    // regenerated on another key); a quietly-dead key yields to the next.
    // Anything else falls through to the quota error below.
    if (emitted) return emitted;
    if (!keyQuotaHit) break;
  }
  // If we already streamed partial content, return it (better than an error);
  // the route persists exactly what the user saw.
  if (emitted) return emitted;
  throw new AIQuotaExceededError(
    'Daily AI limit reached. Please try again later — limits reset daily.',
    lastQuotaError ? quotaRetryAfter(lastQuotaError) : 60
  );
}

// --- Study plan entries (shared shape with the frontend schedule) ----------
export interface StudyPlanEntry {
  title: string;
  subject: string;
  date: string;
  type: string;
  notes: string;
}

// Pull the first complete JSON value ({...} or [...]) out of model output,
// tolerating fences and surrounding prose. Returns the substring plus
// whether the value was cut off (depth never closed = truncated generation,
// not garbage — the caller can ask for a shorter retry instead of failing).
export const extractJsonValue = (raw: string): { json: string | null; truncated: boolean } => {
  const cleaned = (raw || '').replace(/```json\n?/g, '').replace(/```\n?/g, '');
  let start = -1;
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch === '{' || ch === '[') {
      start = i;
      break;
    }
  }
  if (start === -1) return { json: null, truncated: false };
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') depth++;
    else if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) {
        return { json: cleaned.substring(start, i + 1), truncated: false };
      }
    }
  }
  return { json: null, truncated: true };
};

// Pure parser for the study-plan JSON (exported for unit tests): shape +
// per-day validation. `todayStr` is a parameter (YYYY-MM-DD) so tests don't
// depend on the wall clock. Days carry a single plain-text `tip` (the
// planner UI renders fallback guidance for plain-text notes). Returns null
// when nothing usable survives.
export const parseStudyPlanResponse = (raw: string, todayStr: string): StudyPlanEntry[] | null => {
  try {
    const { json } = extractJsonValue(raw);
    if (!json) return null;
    const parsed = JSON.parse(json);
    // Models sometimes emit the day array bare instead of {"days": [...]}.
    const days = Array.isArray(parsed) ? parsed : parsed?.days;
    if (!Array.isArray(days) || days.length === 0) return null;

    const validTypes = new Set(['Exam', 'Assignment', 'Revision']);
    const entries: StudyPlanEntry[] = [];
    for (const d of days.slice(0, 14)) {
      if (!d || typeof d !== 'object') continue;
      const date = String((d as any).date || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      if (date < todayStr) continue; // no past days, ever
      const subject = String((d as any).subject || '').trim();
      const title = String((d as any).title || '').trim();
      if (!subject || !title) continue;
      const type = validTypes.has((d as any).type) ? (d as any).type : 'Revision';
      entries.push({
        title: title.slice(0, 200),
        subject: subject.slice(0, 100),
        date,
        type,
        notes: String((d as any).tip || '').slice(0, 500),
      });
    }
    return entries.length > 0 ? entries : null;
  } catch {
    return null;
  }
};

// --- Practice quiz generation --------------------------------------------
export async function generatePracticeQuiz(
  subject: string,
  grade: number,
  difficulty: string,
  count: number
): Promise<any[]> {
  const prompt = `Generate ${count} ${difficulty} practice questions for ${subject} at Grade ${grade} level (Ethiopian curriculum). Each question must be multiple choice with 4 options, exactly one correct answer, and a brief explanation of why it is correct.

Formatting rules (the app renders markdown + LaTeX, options get A/B/C/D chips automatically):
- Write ALL math with LaTeX: inline $...$ (e.g. $f(x) = x^2 + 1$, $\\frac{a}{b}$), display $$...$$ for standalone equations.
- NEVER prefix options with letters ("A. ", "B) ", ...) — chips are added by the app.
- Keep each option short (one line); make wrong options plausible (common student mistakes), not obviously absurd.
- Explanation: 1-2 sentences, plain words, LaTeX only where a formula is needed.

Return ONLY a valid JSON array in exactly this format, with no markdown fences and no extra text:
[
  {
    "question": "The question text",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswer": "The exact text of the correct option",
    "explanation": "One or two sentences explaining the answer"
  }
]`;

  const raw = await complete(
    'You are a helpful AI that generates JSON responses for practice quizzes. Always respond with valid JSON only. Do not include any text before or after the JSON.',
    prompt,
    [],
    0.4
  );

  // Parse and validate
  let cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start !== -1 && end > start) {
    cleaned = cleaned.substring(start, end + 1);
  }

  const questions = JSON.parse(cleaned);
  if (!Array.isArray(questions)) {
    throw new Error('AI returned non-array quiz');
  }
  return questions;
}

// --- Smart schedule generation (from scratch) -------------------------------
// ONE AI call plans the entire schedule: it understands natural language
// ("tomorrow physics assignment", "exam next week") natively, resolves
// relative dates against today, picks correct event types, and balances the
// daily load. The old regex-based extractor (split on "and", keyword match)
// is gone — it mislabeled assignments as exams, ignored relative dates, and
// spammed 3 sessions every day.

// Race a promise against a timer so a hung upstream can't wedge the caller
// forever. Express/proxies kill requests that produce no bytes, which
// surfaces as a mystery client-side failure with no server log. Timing out
// fast lets the plan flow fall through to its skeleton instead. Exported
// for unit tests.
export const withPlanTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
  Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`study-plan attempt timed out after ${ms}ms`)),
        ms
      );
      // Don't hold the process open for the timer alone.
      (timer as any)?.unref?.();
    }),
  ]);

const PLAN_ATTEMPT_TIMEOUT_MS = 25_000;
const PLAN_MAX_OUTPUT_TOKENS = 2048;

// --- Deadline date grounding ------------------------------------------------
// Observed failure: "math exam next Friday, physics test next Monday" (from
// Wed Sep 16) came back as a math EXAM on Sunday Sep 20 and a physics test
// on Friday Sep 25 — both deadline weekdays wrong, and the plan was
// self-consistent around the wrong dates, so no downstream check could catch
// it. Prose weekday rules don't stick; a deterministic date table plus a
// code backstop does.

const WEEKDAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
] as const;

// Weekday names the student actually wrote ("Friday", "fri", "Mon"…).
// Word-boundary matched so "Monday" doesn't fire inside "money". Used only
// to CHECK deadline weekdays, never to schedule.
export const mentionedWeekdays = (request: string): Set<string> => {
  const found = new Set<string>();
  const padded = ` ${String(request || '').toLowerCase()} `;
  const aliases: Record<string, string> = {
    sunday: 'Sunday', sun: 'Sunday',
    monday: 'Monday', mon: 'Monday',
    tuesday: 'Tuesday', tue: 'Tuesday', tues: 'Tuesday',
    wednesday: 'Wednesday', wed: 'Wednesday',
    thursday: 'Thursday', thu: 'Thursday', thur: 'Thursday', thurs: 'Thursday',
    friday: 'Friday', fri: 'Friday',
    saturday: 'Saturday', sat: 'Saturday',
  };
  for (const [alias, canonical] of Object.entries(aliases)) {
    if (new RegExp(`[^a-z]${alias}[^a-z]`).test(padded)) found.add(canonical);
  }
  return found;
};

// 14-day reference table (Ethiopian calendar dates — same convention as the
// planner UI) injected into the prompt so the model looks dates up instead
// of doing weekday arithmetic.
export const buildDateTable = (todayStr: string): string => {
  const rows: string[] = [];
  for (let i = 0; i < 14; i++) {
    const iso = shiftDateStr(todayStr, i);
    rows.push(`${weekdayOfDateStr(iso)} ${iso}${i === 0 ? ' (today)' : ''}`);
  }
  return rows.join('\n');
};

// Every in-window date for each mentioned weekday, e.g. from Wed 09-16:
// "Friday: 2026-09-18, 2026-09-25; Monday: 2026-09-21, 2026-09-28".
// Spelled out in the retry correction so even a weak model can't miss twice.
export const candidateDatesForMentioned = (
  mentioned: Set<string>,
  todayStr: string
): string =>
  [...mentioned]
    .sort((a, b) => WEEKDAY_NAMES.indexOf(a as never) - WEEKDAY_NAMES.indexOf(b as never))
    .map((wd) => {
      const dates: string[] = [];
      for (let i = 0; i < 14; i++) {
        const d = shiftDateStr(todayStr, i);
        if (weekdayOfDateStr(d) === wd) dates.push(d);
      }
      return `${wd}: ${dates.join(', ')}`;
    })
    .join('; ');

// Backstop for grounded dates: every Exam/Assignment must land on a weekday
// the student named (when they named any) and inside the 14-day window.
// Returns a correctable-feedback sentence or null when clean.
export const findDeadlineMismatch = (
  entries: StudyPlanEntry[],
  request: string,
  todayStr: string
): string | null => {
  const mentioned = mentionedWeekdays(request);
  const maxDate = shiftDateStr(todayStr, 13);
  for (const e of entries) {
    if (e.type !== 'Exam' && e.type !== 'Assignment') continue;
    if (e.date < todayStr) return `"${e.title}" is a ${e.type} dated ${e.date}, before today ${todayStr}`;
    if (e.date > maxDate) return `"${e.title}" is a ${e.type} dated ${e.date}, outside the 14-day window`;
    if (mentioned.size > 0) {
      const wd = weekdayOfDateStr(e.date);
      if (!mentioned.has(wd)) {
        return `"${e.title}" is a ${e.type} on ${e.date} (${wd}) but the request names ${[...mentioned].join(' / ')}`;
      }
    }
  }
  return null;
};

export async function generateSmartPlan(
  userRequest: string,
  grade: number = 10
): Promise<{ plan: StudyPlanEntry[]; fallback: boolean }> {
  const now = new Date();
  // Ethiopian calendar day: every daily rule, window, and deadline runs on
  // the student's day (UTC midnight = 3am EAT — a UTC slice steals the last
  // hours of every evening and once labeled "today" wrong).
  const todayStr = eatTodayStr(now);
  const weekday = weekdayOfDateStr(todayStr);
  const dateTable = buildDateTable(todayStr);

  const systemPrompt = `You are SmartStudy's expert study planner for Ethiopian secondary students (Grade ${grade}). You turn a student's plain-language description of upcoming deadlines into a concrete day-by-day study schedule.

Return ONLY valid JSON — no markdown fences, no commentary, no extra text. Keep the whole reply SHORT.`;

  const userPrompt = `Today is ${weekday}, ${todayStr}. Grade ${grade} student writes:

"${userRequest}"

Use ONLY these dates (look them up — never compute weekdays yourself):
${dateTable}

Build their study schedule as JSON in EXACTLY this shape:
{
  "days": [
    {
      "date": "YYYY-MM-DD",
      "subject": "Physics",
      "title": "Short specific session title",
      "type": "Revision",
      "tip": "One concrete sentence for THIS session"
    }
  ]
}

Rules — follow ALL of them:
1. DATES: resolve every relative date from the table above — never compute
   weekdays yourself. "this <weekday>" = the nearest one (this week);
   "next <weekday>" = the same weekday in the FOLLOWING week. Deadline
   events (Exam/Assignment) MUST sit on the weekday the student named —
   e.g. a "Friday" exam belongs on a Friday row of the table. NEVER invent
   dates in the past. Every "date" must be >= today.
2. TYPES (only these three, exactly spelled): "Exam" for exams/tests, "Assignment" for assignments, homework, projects, group work, presentations, "Revision" for everything else (study sessions, preparation, review).
3. DEADLINE DAYS hold only the deadline event(s) themselves — e.g. {"title": "Physics Assignment", "type": "Assignment"}. No extra revision sessions on a deadline day.
4. LOAD: at most 2 sessions per day, prefer 1. Spread subjects across days so each deadline gets preparation time. Closer deadlines get priority on shared days. Respect any daily study time the student states.
5. The day BEFORE a deadline is light: revision for that subject only, focused on readiness and confidence.
6. LENGTH: at most 14 days total. If deadlines stretch further, cover the first 14 days starting today.
7. TITLES are human and specific ("Physics: forces practice problems"), never mechanical ("Physics Day 3 - 5 days to exam").
8. HONESTY — NEVER invent specifics the student didn't state. If they didn't name chapters/topics (e.g. they said "maths exam" with no topic), keep sessions at subject level ("review your class notes", "redo homework problems") — do NOT invent chapter names like "Algebra and Functions". Only use topics the student actually mentioned.
9. TIPS must be concrete and grounded in that day ("your Physics assignment is tomorrow") — never generic filler repeated across days.
10. Sort days chronologically by date.
11. SUBJECTS must use exactly these canonical names: Mathematics, English, History, Chemistry, Physics, Biology, Civics, Geography, Economics, Business, ICT, Amharic, Afaan Oromoo, Tigrigna, Aptitude. Never "Maths", "Math", "Bio", "IT", etc. (these are the only names the planner accepts).
12. TIPS name the session's date ("Sep 24: ...") — never "today", "tomorrow" or "tonight", which read wrong on every other day the student views them.`;

  // Log the raw head on parse failure: "unparseable" without the output is
  // undebuggable (truncation vs prose vs wrong shape need different fixes).
  // Capped at 400 chars — enough to see the failure mode, never a full dump.
  const logRawHead = (label: string, raw: string) => {
    const { truncated } = extractJsonValue(raw);
    console.warn(`[study-plan] ${label} (raw ${raw.length} chars${truncated ? ', TRUNCATED mid-JSON' : ''}): ${raw.slice(0, 400)}`);
  };

  // Single attempt, bounded. The compact contract above keeps real outputs
  // near ~1k tokens (≈ 5-10s), so one shot plus the honest skeleton below is
  // the whole strategy — no repair ladder. Worst case ≈ auth + 25s + award:
  // inside the frontend's 55s abort and Vercel's 60s kill with wide margin.
  // Thinking DISABLED (0): schedule-building is formatting work, and flash's
  // thinking tokens share the output budget — reasoning was eating most of
  // it and the JSON arrived cut mid-object after 30s of deliberation.
  //
  // Date errors get exactly ONE guided retry (same budgets, so worst case
  // ≈ auth + 25s + 25s + award — still inside both kills): the validator
  // below names the offending event and the named weekdays, which is
  // correctable feedback rather than a blind second attempt.
  let dateCorrection: string | null = null;
  try {
    const runAttempt = async (prompt: string): Promise<StudyPlanEntry[] | null> => {
      const raw = await withPlanTimeout(
        complete(systemPrompt, prompt, [], 0.4, PLAN_MAX_OUTPUT_TOKENS, 0),
        PLAN_ATTEMPT_TIMEOUT_MS
      );
      const parsed = parseStudyPlanResponse(raw, todayStr);
      if (!parsed) {
        logRawHead('attempt unparseable', raw);
        return null;
      }
      dateCorrection = findDeadlineMismatch(parsed, userRequest, todayStr);
      if (dateCorrection) {
        console.warn(`[study-plan] deadline mismatch: ${dateCorrection}`);
        return null;
      }
      return parsed;
    };

    const first = await runAttempt(userPrompt);
    if (first) {
      console.log(`[study-plan] smart plan ok: ${first.length} days`);
      return { plan: first, fallback: false };
    }
    if (dateCorrection) {
      const candidates = candidateDatesForMentioned(mentionedWeekdays(userRequest), todayStr);
      const second = await runAttempt(
        `${userPrompt}\n\nCORRECTION NEEDED: ${dateCorrection}. ` +
          `The ONLY acceptable dates for those weekdays in range are — ${candidates}. ` +
          `Fix ONLY the dates, using the reference table above; keep titles, subjects and tips.`
      );
      if (second) {
        console.log(`[study-plan] smart plan ok on retry: ${second.length} days`);
        return { plan: second, fallback: false };
      }
    }
  } catch (err) {
    console.error('[study-plan] attempt failed:', (err as Error)?.message);
  }

  // Last resort: honest deterministic skeleton (7 light revision days). The
  // frontend tooltip generates fallback guidance for plain-text notes, so
  // these still render usefully. Flagged as fallback: the route must NOT
  // persist these (a failure that saves 7 generic tasks creates cleanup
  // work), and the client shows retry instead of success.
  console.warn('[study-plan] AI planning failed — returning skeleton schedule');
  const skeleton: StudyPlanEntry[] = [];
  const subjects = ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'English'];
  for (let i = 0; i < 7; i++) {
    const subject: string = subjects[i % subjects.length] ?? 'Mathematics';
    skeleton.push({
      title: `${subject} revision`,
      subject,
      date: shiftDateStr(todayStr, i),
      type: 'Revision',
      notes: `Light revision session for ${subject}. Open your textbook, review recent topics, and solve a few practice problems.`,
    });
  }
  return { plan: skeleton, fallback: true };
}
