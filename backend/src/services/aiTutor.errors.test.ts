import { describe, it, expect } from 'vitest';
import {
  isQuotaError,
  isModelGoneError,
  isOverloadedError,
  quotaRetryAfter,
  withPlanTimeout,
  parseStudyPlanResponse,
  extractJsonValue,
} from './aiTutor';

describe('AI error classifiers (model fallback routing)', () => {
  it('detects quota exhaustion', () => {
    expect(isQuotaError({ status: 429, message: 'nope' })).toBe(true);
    expect(isQuotaError(new Error('Quota exceeded for metric xyz'))).toBe(true);
    expect(isQuotaError(new Error('RESOURCE_EXHAUSTED'))).toBe(true);
    expect(isQuotaError(new Error('You exceeded your current quota (429)'))).toBe(true);
    expect(isQuotaError(new Error('model is overloaded'))).toBe(false);
    expect(isQuotaError(new Error('Empty response from Gemini'))).toBe(false);
  });

  it('detects retired models', () => {
    expect(isModelGoneError({ status: 404, message: 'x' })).toBe(true);
    expect(isModelGoneError(new Error('This model models/gemini-2.0-flash is no longer available'))).toBe(true);
    expect(isModelGoneError(new Error('404 model foo NOT_FOUND'))).toBe(true);
    expect(isModelGoneError(new Error('Quota exceeded'))).toBe(false);
  });

  it('detects overloaded models', () => {
    expect(isModelGoneError({ status: 404, message: 'x' }) && false).toBe(false); // sanity: no overlap confusion
    expect(isOverloadedError({ status: 503, message: 'x' })).toBe(true);
    expect(isOverloadedError(new Error('UNAVAILABLE: high demand'))).toBe(true);
    expect(isOverloadedError(new Error('model overloaded, retry later'))).toBe(true);
    expect(isOverloadedError(new Error('Empty response'))).toBe(false);
  });

  it('extracts retry delay from quota errors, defaults to 60s', () => {
    expect(quotaRetryAfter(new Error('Please retry in 48.89s.'))).toBe(49);
    expect(quotaRetryAfter({ error: { details: [{ retryDelay: '32s' }] } })).toBe(32);
    expect(quotaRetryAfter(new Error('Quota exceeded'))).toBe(60);
    expect(quotaRetryAfter(null)).toBe(60);
  });
});

// withPlanTimeout bounds the study-plan AI calls: a hung upstream must
// reject (so the flow falls through to its skeleton plan) instead of
// wedging the request until a proxy kills it with no server log.
describe('withPlanTimeout (study-plan hang guard)', () => {
  it('passes through fast resolutions untouched', async () => {
    await expect(withPlanTimeout(Promise.resolve('ok'), 50)).resolves.toBe('ok');
  });

  it('passes through fast rejections untouched', async () => {
    await expect(withPlanTimeout(Promise.reject(new Error('boom')), 50)).rejects.toThrow('boom');
  });

  it('rejects a hung promise instead of waiting forever', async () => {
    await expect(withPlanTimeout(new Promise(() => {}), 20)).rejects.toThrow(/timed out/i);
  });
});

// parseStudyPlanResponse: the study-plan parser, exercised against the
// shapes Gemini actually emits (fences, prose, bare arrays, truncation).
// A fixed `today` keeps these deterministic regardless of wall clock.
describe('parseStudyPlanResponse (study-plan output shapes)', () => {
  const TODAY = '2026-09-16';
  const day = (over: Record<string, unknown> = {}) => ({
    date: '2026-09-20',
    subject: 'Physics',
    title: 'Physics: forces practice problems',
    type: 'Revision',
    tip: 'Redo the worked examples from class, then try five fresh problems.',
    ...over,
  });

  it('parses a fenced plan with surrounding prose', () => {
    const raw = `Here is your schedule:\n\`\`\`json\n${JSON.stringify({ days: [day(), day({ date: '2026-09-21' })] })}\n\`\`\`\nGood luck!`;
    const entries = parseStudyPlanResponse(raw, TODAY);
    expect(entries).toHaveLength(2);
    expect(entries![0]).toMatchObject({ subject: 'Physics', date: '2026-09-20', type: 'Revision' });
    expect(entries![0].notes).toContain('worked examples');
  });

  it('accepts a bare top-level day array', () => {
    const entries = parseStudyPlanResponse(JSON.stringify([day()]), TODAY);
    expect(entries).toHaveLength(1);
  });

  it('rejects truncated JSON (and flags it as truncated)', () => {
    const full = JSON.stringify({ days: [day(), day()] });
    const cut = full.slice(0, Math.floor(full.length / 2));
    expect(parseStudyPlanResponse(cut, TODAY)).toBeNull();
    expect(extractJsonValue(cut).truncated).toBe(true);
  });

  it('rejects prose with no JSON at all', () => {
    expect(parseStudyPlanResponse('I am sorry, I cannot help with that.', TODAY)).toBeNull();
    expect(extractJsonValue('no braces here').truncated).toBe(false);
  });

  it('filters bad days but keeps the good ones', () => {
    const raw = JSON.stringify({
      days: [
        day(),
        day({ date: '2026-09-01' }), // past
        day({ date: 'next Friday' }), // not a date
        day({ title: '' }), // no title
        day({ type: 'Party', date: '2026-09-22' }), // unknown type -> Revision
      ],
    });
    const entries = parseStudyPlanResponse(raw, TODAY);
    expect(entries).toHaveLength(2);
    expect(entries![1].type).toBe('Revision');
  });

  it('ignores braces inside strings and trailing prose with braces', () => {
    const raw = `${JSON.stringify({ days: [day({ title: 'Learn {a} and } brace' })] })} hope this { helps }`;
    const entries = parseStudyPlanResponse(raw, TODAY);
    expect(entries).toHaveLength(1);
    expect(entries![0].title).toContain('{a}');
  });

  it('caps an overlong tip instead of dropping the day', () => {
    const entries = parseStudyPlanResponse(
      JSON.stringify({ days: [day({ tip: 'x'.repeat(2000) })] }),
      TODAY
    );
    expect(entries).toHaveLength(1);
    expect(entries![0].notes.length).toBeLessThanOrEqual(500);
  });

  it('returns null when every day is filtered out', () => {
    const raw = JSON.stringify({ days: [day({ date: '2020-01-01' })] });
    expect(parseStudyPlanResponse(raw, TODAY)).toBeNull();
  });
});
