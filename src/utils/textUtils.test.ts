import { describe, it, expect } from 'vitest';
import { sameText, stripForSpeech } from './textUtils';

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

describe('stripForSpeech (community TTS)', () => {
  it('replaces display math with a spoken placeholder', () => {
    expect(stripForSpeech('Solve\n$$\\frac{a}{b}$$\nnow')).toBe('Solve mathematical expression now');
  });

  it('keeps inline math words while dropping $ delimiters', () => {
    const out = stripForSpeech('area $x^2$ ok');
    expect(out).not.toContain('$');
    expect(out).toContain('x2');
  });

  it('leaves plain prose untouched', () => {
    expect(stripForSpeech('Why is the sky blue?')).toBe('Why is the sky blue?');
  });

  it('tolerates nullish input', () => {
    expect(stripForSpeech(null as any)).toBe('');
    expect(stripForSpeech(undefined as any)).toBe('');
  });
});
