import { describe, it, expect } from 'vitest';
import { formatCompact } from './format';

describe('formatCompact (count display)', () => {
  it('compacts thousands and millions', () => {
    expect(formatCompact(11320701)).toBe('11M');
    expect(formatCompact(163631)).toBe('164K');
    expect(formatCompact(999)).toBe('999');
    expect(formatCompact(0)).toBe('0');
  });

  it('tolerates numeric strings, null, and garbage', () => {
    expect(formatCompact('260165')).toBe('260K');
    expect(formatCompact(null)).toBe('0');
    expect(formatCompact(undefined)).toBe('0');
    expect(formatCompact(NaN)).toBe('0');
  });
});
