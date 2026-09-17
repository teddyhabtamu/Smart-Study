import { describe, it, expect } from 'vitest';
import { sameText } from './textUtils';

describe('sameText (excerpt-title duplicate detection)', () => {
  it('matches despite case and punctuation differences', () => {
    expect(sameText('Newton first law', 'Newton first law')).toBe(true);
    expect(sameText('  Newton FIRST Law!! ', 'newton first law')).toBe(true);
  });

  it('does not match a longer paraphrase', () => {
    expect(
      sameText(
        'What is a mistake you made today?',
        'What is a mistake you made today, and what can you learn?'
      )
    ).toBe(false);
  });

  it('rejects distinct texts and blanks', () => {
    expect(sameText('Tricky math question', 'If 1=3, 2=3, 3=5?')).toBe(false);
    expect(sameText('', 'Something')).toBe(false);
    expect(sameText(null, undefined)).toBe(false);
  });
});
