import { describe, it, expect } from 'vitest';
import {
  buildSearchQuery,
  parseDurationSecs,
  scoreCandidateVideo,
  MIN_ACCEPT_SCORE,
  isQuotaExceededError,
  toVideoRow,
  type VideoSignals,
} from './youtubeService';

// (Restored quota + entity tests below — they guard the syncAll early-abort
// and snippet-unescaping contracts. They predate the quality gate.)

// The import gate: unquoted topical query inside the Education category,
// then score every candidate. Fixtures below are REAL rows from the library
// audit (Sep 2026) — the left column is what used to get imported blind.
const base = (over: Partial<VideoSignals> = {}): VideoSignals => ({
  title: 'Quadratic Equations - Full Chapter',
  description: 'Learn quadratic equations step by step with practice problems.',
  channelTitle: 'Math Academy',
  subject: 'Mathematics',
  topic: 'quadratic equations',
  grade: 10,
  durationSecs: 900,
  categoryId: '27',
  embeddable: true,
  viewCount: 50000,
  likeCount: 2000,
  ...over,
});

describe('buildSearchQuery (unquoted topical search)', () => {
  it('quotes only the topic, leaves subject loose for recall', () => {
    expect(buildSearchQuery('Physics', 'newton laws of motion')).toBe(
      '"newton laws of motion" Physics tutorial lesson Ethiopia'
    );
  });

  it('degrades gracefully without a topic', () => {
    expect(buildSearchQuery('Biology', null)).toBe('Biology tutorial lesson Ethiopia');
  });

  it('never quotes locale terms (the old quoted version excluded educators)', () => {
    const q = buildSearchQuery('Mathematics', 'quadratic equations');
    expect(q).not.toMatch(/"Ethiopia"|"grade/i);
    expect(q).not.toContain('-shorts');
  });
});

describe('parseDurationSecs (ISO 8601)', () => {
  it('parses standard durations, null on live/unknown', () => {
    expect(parseDurationSecs('PT15M33S')).toBe(933);
    expect(parseDurationSecs('PT1H2M3S')).toBe(3723);
    expect(parseDurationSecs('PT45S')).toBe(45);
    expect(parseDurationSecs('P0D')).toBe(0);
    expect(parseDurationSecs(null)).toBeNull();
    expect(parseDurationSecs('garbage')).toBeNull();
  });
});

describe('scoreCandidateVideo (import gate)', () => {
  it('accepts a genuine tutorial well above the bar', () => {
    const v = scoreCandidateVideo(base());
    expect(v.accept).toBe(true);
    expect(v.score).toBeGreaterThan(MIN_ACCEPT_SCORE);
  });

  it('rejects trivia gameshows (observed: "10 toughest General | trivia 10 #GK")', () => {
    const v = scoreCandidateVideo(
      base({
        title: '10 toughest General | trivia 10 #GK | quiz time | #quizgame',
        description: 'Fun quiz challenge!',
        channelTitle: 'Faith With Mekdes',
        subject: 'Biology',
        topic: 'cells',
        grade: 10,
        durationSecs: 600,
        viewCount: 500,
        likeCount: 10,
      })
    );
    expect(v.accept).toBe(false);
    expect(v.reasons.join(' ')).toContain('trivia-gameshow');
  });

  it('rejects hashtag-stuffed keyword spam below the bar', () => {
    const v = scoreCandidateVideo(
      base({
        title: 'biology Question #Grade10 #biology #Questionsbiology Ethiopi',
        description: 'questions',
        channelTitle: 'Faith With Mekdes',
        subject: 'Biology',
        topic: 'cells',
        grade: 10,
        durationSecs: 300,
        viewCount: 200,
        likeCount: 2,
      })
    );
    expect(v.accept).toBe(false);
    expect(v.reasons.join(' ')).toContain('hashtag-stuffing');
  });

  it('rejects exam answer keys and Shorts regardless of topic match', () => {
    const leak = scoreCandidateVideo(
      base({ title: 'Grade 12 exam LEAKED answers 2024', description: 'full answer key' })
    );
    expect(leak.accept).toBe(false);
    const shorts = scoreCandidateVideo(
      base({ title: 'Quadratic equations #shorts', durationSecs: 45 })
    );
    expect(shorts.accept).toBe(false);
    expect(shorts.reasons.join(' ')).toMatch(/short/);
  });

  it('rejects non-embeddable and non-education categories (music, gaming)', () => {
    expect(scoreCandidateVideo(base({ embeddable: false })).accept).toBe(false);
    expect(scoreCandidateVideo(base({ categoryId: '10' })).accept).toBe(false);
    expect(scoreCandidateVideo(base({ categoryId: '20' })).accept).toBe(false);
  });

  it('tolerates miscategorized local lessons (People & Blogs is not a reject)', () => {
    const v = scoreCandidateVideo(
      base({
        title: 'Grade 10 Math Introduction to polynomial functions 8, in Amharic',
        description: 'Polynomial functions full lesson in Amharic',
        channelTitle: 'Tilet Academy',
        topic: 'polynomial functions',
        categoryId: '22',
        viewCount: 5000,
        likeCount: 200,
      })
    );
    expect(v.accept).toBe(true);
  });

  it('treats "Maths" as Mathematics (synonym map)', () => {
    const v = scoreCandidateVideo(
      base({ title: 'Maths revision: algebra basics', description: 'maths practice', topic: null })
    );
    expect(v.reasons.join(' ')).toContain('subject');
  });

  it('does not gate on grade mentions (Khan-style titles lack them)', () => {
    const v = scoreCandidateVideo(
      base({
        title: 'Quadratic Equations - Full Chapter',
        description: 'A complete lesson with examples.',
        channelTitle: 'Khan Academy',
        topic: 'quadratic equations',
      })
    );
    // No "grade 9/10" anywhere, still comfortably accepted.
    expect(v.accept).toBe(true);
    expect(v.reasons.join(' ')).not.toContain('grade');
  });

  it('ranks Ethiopian educators up without letting local spam through', () => {
    // Real Tilet Academy lesson: topic + subject + Amharic script.
    const local = scoreCandidateVideo(
      base({
        title: 'Grade 10 Math Introduction to polynomial functions 8, in Amharic',
        description: 'Polynomial functions full lesson in Amharic',
        channelTitle: 'Tilet Academy - ጥለት አካዳሚ',
        topic: 'polynomial functions',
        categoryId: '22',
        viewCount: 5000,
        likeCount: 200,
      })
    );
    expect(local.accept).toBe(true);
    const reasons = local.reasons.join(' ');
    expect(reasons).toMatch(/amharic-script|ethiopian/);

    // Same Ethiopian signals on trivia bait must NOT save it: hard gates
    // run before any bonus is even considered.
    const localSpam = scoreCandidateVideo(
      base({
        title: 'Ethiopia Grade 10 trivia quiz answers!',
        description: 'Join telegram for more',
        channelTitle: 'Ethio Quiz Time',
        topic: 'quadratic equations',
      })
    );
    expect(localSpam.accept).toBe(false);
  });
});

describe('isQuotaExceededError (sync early-abort contract)', () => {
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
    expect(decodeHtmlEntities('Tigrigna &#x27E;')).toBe('Tigrigna \u027E');
  });

  it('does not double-decode and passes clean text through', async () => {
    const { decodeHtmlEntities } = await import('./youtubeService');
    expect(decodeHtmlEntities('&amp;lt;')).toBe('&lt;');
    expect(decodeHtmlEntities('Plain title')).toBe('Plain title');
    expect(decodeHtmlEntities('')).toBe('');
  });
});

describe('toVideoRow (counter-separation contract)', () => {
  const candidate = {
    videoUrl: 'https://www.youtube.com/watch?v=abc123DEF45',
    title: 'Quadratic Equations - Full Chapter',
    description: 'A complete lesson.',
    channelTitle: 'Math Academy',
    channelId: 'UCxxxx',
    thumbnail: 'https://i.ytimg.com/vi/abc/hqdefault.jpg',
    durationSecs: 900,
    viewCount: 11320701,
    likeCount: 163631,
  };

  it('starts in-app counters at zero while preserving platform stats aside', () => {
    const row = toVideoRow(candidate, 'Mathematics', 10, 'quadratic equations', 'admin-1');
    // THE contract that broke in prod (11M -> 1 on first watch): in-app
    // columns must never carry platform stats.
    expect(row.views).toBe(0);
    expect(row.likes).toBe(0);
    expect(row.youtube_views).toBe(11320701);
    expect(row.youtube_likes).toBe(163631);
  });

  it('carries identity, taxonomy and attribution through', () => {
    const row = toVideoRow(candidate, 'Mathematics', 10, 'quadratic equations', 'admin-1');
    expect(row).toMatchObject({
      title: candidate.title,
      subject: 'Mathematics',
      grade: 10,
      chapter: 'quadratic equations',
      video_url: candidate.videoUrl,
      instructor: 'Math Academy',
      channel_id: 'UCxxxx',
      duration_secs: 900,
      is_premium: false,
      uploaded_by: 'admin-1',
    });
  });
});
