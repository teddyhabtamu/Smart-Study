import { describe, it, expect } from 'vitest';

// voteTransition is the shared counter math for post/comment votes.
// Contract: toggle-off removes (-current), side-changes swing by the
// difference, and downvotes at zero stay honest (delta -1, no flooring —
// the old Math.max(..., 0) clamp dropped them and inflated later removals).
import { voteTransition, aiAnswerPreview, canReadFullAiAnswer } from './forum';

describe('voteTransition (forum vote counter math)', () => {
  it('first-time upvote adds one', () => {
    expect(voteTransition(null, 1).delta).toBe(1);
  });

  it('first-time downvote subtracts one (no zero floor)', () => {
    expect(voteTransition(null, -1).delta).toBe(-1);
  });

  it('repeat vote toggles off by removing the current vote', () => {
    expect(voteTransition(1, 1).delta).toBe(-1);
    expect(voteTransition(-1, -1).delta).toBe(1);
  });

  it('changing sides swings by the difference', () => {
    expect(voteTransition(-1, 1).delta).toBe(2);
    expect(voteTransition(1, -1).delta).toBe(-2);
  });
});

// aiAnswerPreview is the paywall teaser: ~25% of the answer as plain text.
// Contract: markdown never survives (a mid-syntax cut renders broken
// fences), tiny answers pass through whole, and long ones stay gated.
describe('aiAnswerPreview (paywall teaser)', () => {
  it('returns empty for empty input', () => {
    expect(aiAnswerPreview('')).toBe('');
    expect(aiAnswerPreview('   ')).toBe('');
  });

  it('passes short answers through whole (floor never pads)', () => {
    const short = 'The answer is x = 5 because 2 + 3 = 5.';
    expect(aiAnswerPreview(short)).toBe(short);
  });

  it('keeps roughly a quarter of a long answer, cut at a word', () => {
    const long = Array(40).fill('photosynthesis converts light energy into chemical energy').join(' ');
    const preview = aiAnswerPreview(long);
    expect(preview.length).toBeLessThanOrEqual(400);
    expect(preview.endsWith('…')).toBe(true);
    expect(preview).not.toMatch(/\s$/);
  });

  it('strips markdown so the teaser is honest plain text', () => {
    const md = '## Solution\n**Step 1:** solve `x + 2 = 5` using [this rule](https://example.com).\n' +
      Array(20).fill('Then carry the remainder forward carefully.').join(' ');
    const preview = aiAnswerPreview(md);
    expect(preview).not.toContain('##');
    expect(preview).not.toContain('**');
    expect(preview).not.toContain('](');
  });

  it('never leaks fenced code blocks into the teaser', () => {
    const md = 'Intro. ```const secret = 42;\nconsole.log(secret);``` ' +
      Array(30).fill('Explanation sentence here.').join(' ');
    expect(aiAnswerPreview(md)).not.toContain('secret');
  });
});

// canReadFullAiAnswer: Pro members and staff read full answers; free users
// and guests (no req.user) get the teaser.
describe('canReadFullAiAnswer (paywall entitlement)', () => {
  const req = (user: any) => ({ user } as any);

  it('denies guests', () => {
    expect(canReadFullAiAnswer(req(undefined))).toBe(false);
    expect(canReadFullAiAnswer({} as any)).toBe(false);
  });

  it('denies free members', () => {
    expect(canReadFullAiAnswer(req({ is_premium: false, role: 'STUDENT' }))).toBe(false);
  });

  it('allows Pro members', () => {
    expect(canReadFullAiAnswer(req({ is_premium: true, role: 'STUDENT' }))).toBe(true);
  });

  it('allows staff regardless of premium (moderation needs the text)', () => {
    expect(canReadFullAiAnswer(req({ is_premium: false, role: 'ADMIN' }))).toBe(true);
    expect(canReadFullAiAnswer(req({ is_premium: false, role: 'MODERATOR' }))).toBe(true);
  });
});
