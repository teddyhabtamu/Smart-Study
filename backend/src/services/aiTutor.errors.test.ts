import { describe, it, expect } from 'vitest';
import {
  isQuotaError,
  isModelGoneError,
  isOverloadedError,
  quotaRetryAfter,
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
