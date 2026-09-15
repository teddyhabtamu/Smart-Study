import { describe, it, expect } from 'vitest';

// Pure daily-cap math for farmable XP sources (chat messages, plan/quiz
// generations are unlimited for Pro — the cap is what keeps "hi" x200 from
// minting a level). DB-backed awarding itself isn't unit-tested; the clamp
// deciding every award's size is.
import {
  clampToDailyCap,
  AI_GENERATION_XP_SOURCES,
  DAILY_AI_GENERATION_XP_CAP,
} from './xpService';

describe('clampToDailyCap', () => {
  it('passes the full amount when the pool is untouched', () => {
    expect(clampToDailyCap(0, 50, 5)).toBe(5);
  });

  it('trims a partial award at the pool edge', () => {
    expect(clampToDailyCap(48, 50, 5)).toBe(2);
  });

  it('zeroes the award once the pool is exhausted', () => {
    expect(clampToDailyCap(50, 50, 5)).toBe(0);
    expect(clampToDailyCap(999, 50, 5)).toBe(0);
  });

  it('floors fractional amounts like the awarder does', () => {
    expect(clampToDailyCap(0, 50, 4.9)).toBe(4);
  });

  it('never goes negative', () => {
    expect(clampToDailyCap(0, 50, -5)).toBe(0);
  });
});

describe('AI generation pool config', () => {
  it('pools every farmable AI source under one cap', () => {
    expect(AI_GENERATION_XP_SOURCES).toEqual(
      expect.arrayContaining(['ai_tutor', 'ai_plan', 'practice_generation'])
    );
    expect(DAILY_AI_GENERATION_XP_CAP).toBe(50);
  });
});
