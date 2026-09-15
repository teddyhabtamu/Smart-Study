import { describe, it, expect } from 'vitest';

// Quota detection drives the syncAll early-abort: a 403 quotaExceeded must
// stop the whole run, while generic 500s stay per-subject. These shape
// checks guard that contract against YouTube API error-shape drift.
import { isQuotaExceededError } from './youtubeService';

const quotaErr = () => ({
  response: {
    status: 403,
    data: {
      error: {
        errors: [{ reason: 'quotaExceeded', message: 'The request cannot be completed because you have exceeded your quota.' }],
      },
    },
  },
});

describe('isQuotaExceededError', () => {
  it('detects quotaExceeded 403s', () => {
    expect(isQuotaExceededError(quotaErr())).toBe(true);
  });

  it('detects rate-limit 429s mentioning quota', () => {
    expect(
      isQuotaExceededError({ response: { status: 429, data: 'Rate limit exceeded, quota reset daily' } })
    ).toBe(true);
  });

  it('ignores generic server errors and non-errors', () => {
    expect(isQuotaExceededError({ response: { status: 500, data: 'Backend Error' } })).toBe(false);
    expect(isQuotaExceededError({ response: { status: 403, data: 'forbidden' } })).toBe(false);
    expect(isQuotaExceededError(null)).toBe(false);
    expect(isQuotaExceededError(undefined)).toBe(false);
  });
});

describe('decodeHtmlEntities (YouTube snippet unescaping)', () => {
  it('decodes decimal, hex and named entities', async () => {
    const { decodeHtmlEntities } = await import('./youtubeService');
    expect(decodeHtmlEntities('Bernoulli&#39;s Principle')).toBe("Bernoulli's Principle");
    expect(decodeHtmlEntities('Tom &amp; Jerry')).toBe('Tom & Jerry');
    expect(decodeHtmlEntities('&quot;Quoted&quot; &lt;tag&gt;')).toBe('"Quoted" <tag>');
    expect(decodeHtmlEntities('Tigrigna &#x27E;')).toBe('Tigrigna \u027E')
  });

  it('does not double-decode and passes clean text through', async () => {
    const { decodeHtmlEntities } = await import('./youtubeService');
    expect(decodeHtmlEntities('&amp;lt;')).toBe('&lt;');
    expect(decodeHtmlEntities('Plain title')).toBe('Plain title');
    expect(decodeHtmlEntities('')).toBe('');
  });
});
