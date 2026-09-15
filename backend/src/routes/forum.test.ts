import { describe, it, expect } from 'vitest';

// voteTransition is the shared counter math for post/comment votes.
// Contract: toggle-off removes (-current), side-changes swing by the
// difference, and downvotes at zero stay honest (delta -1, no flooring —
// the old Math.max(..., 0) clamp dropped them and inflated later removals).
import { voteTransition } from './forum';

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
