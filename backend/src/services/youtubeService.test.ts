import { describe, it, expect } from 'vitest';
import {
  buildSearchQuery,
  parseDurationSecs,
  scoreCandidateVideo,
  MIN_ACCEPT_SCORE,
  isQuotaExceededError,
  toVideoRow,
  extractGradeClaims,
  verifyVideoGrade,
  rotationIndex,
  isoWeekNumber,
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

describe('extractGradeClaims (grade verification source of truth)', () => {
  it('reads grade/class/ordinal claims', () => {
    expect(extractGradeClaims('Grade 10 Biology full lesson')).toEqual([10]);
    expect(extractGradeClaims('grade-12 physics revision')).toEqual([12]);
    expect(extractGradeClaims('Class 10 Maths polynomials')).toEqual([10]);
    expect(extractGradeClaims('10th grade chemistry')).toEqual([10]);
  });

  it('expands ranges and conjunctions', () => {
    expect(extractGradeClaims('Physics grades 9-12 complete course')).toEqual([9, 10, 11, 12]);
    expect(extractGradeClaims('Grade 10 & 11 revision')).toEqual([10, 11]);
    expect(extractGradeClaims('for class 9 to 12 students')).toEqual([9, 10, 11, 12]);
  });

  it('maps East-African Forms to grades', () => {
    expect(extractGradeClaims('Form 2 Biology: cells')).toEqual([10]);
    expect(extractGradeClaims('Form 1-4 mathematics papers')).toEqual([9, 10, 11, 12]);
  });

  it('never fires on bare numbers, top-10s, or uniform-like words', () => {
    expect(extractGradeClaims('10 toughest questions solved')).toEqual([]);
    expect(extractGradeClaims('Top 10 exam tips')).toEqual([]);
    expect(extractGradeClaims('Uniform circular motion')).toEqual([]);
    expect(extractGradeClaims('Quadratic Equations - Full Chapter')).toEqual([]);
  });
});

describe('verifyVideoGrade (match/mismatch/silent)', () => {
  it('matches claimed and range-covered grades', () => {
    expect(verifyVideoGrade(10, 'Grade 10 Biology', '').status).toBe('match');
    expect(verifyVideoGrade(12, 'Physics grades 9-12', '').status).toBe('match');
    expect(verifyVideoGrade(10, 'Form 2 lesson', '').status).toBe('match');
  });

  it('flags explicit mismatches with the claimed grades', () => {
    const r = verifyVideoGrade(12, 'Grade 10 Biology full lesson', '');
    expect(r.status).toBe('mismatch');
    expect(r.claimed).toEqual([10]);
  });

  it('stays silent on claim-free titles (Khan-style)', () => {
    expect(verifyVideoGrade(10, 'Quadratic Equations - Full Chapter', '').status).toBe('silent');
  });
});

describe('scoreCandidateVideo (grade-mismatch gate)', () => {
  it('rejects the reported symptom: "Grade 10" title in a Grade-12 sync', () => {
    const v = scoreCandidateVideo(
      base({
        title: 'Grade 10 Biology: cells full lesson in Amharic',
        description: 'Grade 10 cells explained',
        channelTitle: 'Tilet Academy',
        subject: 'Biology',
        topic: 'cells',
        grade: 12,
        durationSecs: 900,
        viewCount: 50000,
        likeCount: 2000,
      })
    );
    expect(v.accept).toBe(false);
    expect(v.reasons.join(' ')).toMatch(/grade-mismatch-claims-10/);
  });

  it('still bonuses a matching grade claim', () => {
    const v = scoreCandidateVideo(
      base({ title: 'Grade 10 Math: polynomial functions', topic: 'polynomial functions' })
    );
    expect(v.accept).toBe(true);
    expect(v.reasons.join(' ')).toContain('grade');
  });

  it('rejects subject-missing videos on topic-less searches', () => {
    const v = scoreCandidateVideo(
      base({ title: 'Amazing science experiments compilation', description: 'fun videos', topic: null })
    );
    expect(v.accept).toBe(false);
    expect(v.reasons.join(' ')).toContain('subject-missing');
  });

  it('keeps topic-anchored scoring when the subject word is absent', () => {
    // Topic terms are subject-specific: "quadratic equations" needs no
    // literal "Mathematics" to prove its subject.
    const v = scoreCandidateVideo(base({ title: 'Quadratic equations trick', description: 'solve fast' }));
    expect(v.accept).toBe(true);
  });
});

describe('rotationIndex (deterministic weekly rotation)', () => {
  it('is stable within a week and cycles without state', () => {
    const monday = new Date(Date.UTC(2026, 8, 21)); // a Monday
    const sunday = new Date(Date.UTC(2026, 8, 27)); // same week Sunday
    expect(isoWeekNumber(monday)).toBe(isoWeekNumber(sunday));
    expect(rotationIndex(7, monday)).toBe(rotationIndex(7, sunday));
    const seen = new Set<number>();
    for (let w = 0; w < 7; w++) {
      seen.add(rotationIndex(7, new Date(Date.UTC(2026, 8, 21 + w * 7))));
    }
    expect(seen.size).toBe(7); // full coverage, no repeats until cycled
  });

  it('guards empty topic lists', () => {
    expect(rotationIndex(0)).toBe(0);
  });
});
