import { describe, it, expect } from 'vitest';

// textMatch builds the tsquery/ILIKE fragments for every search endpoint.
// Contract: multi-word terms use OR (AND returned zero too often), lexemes
// are capped so pasted paragraphs can't build giant queries, and odd input
// (pure punctuation) falls back to ILIKE instead of breaking.
import { textMatch } from './search';

describe('textMatch (search ranking fragments)', () => {
  it('joins words with OR for forgiving multi-word search', () => {
    const m = textMatch('search_vector', ['title'], 'biology textbook');
    expect(m.param).toBe('biology | textbook');
    expect(m.where).toContain('@@ to_tsquery');
    expect(m.order).toContain('ts_rank');
  });

  it('caps lexemes at 20 for pasted-paragraph input', () => {
    const long = Array.from({ length: 60 }, (_, i) => `word${i}`).join(' ');
    const m = textMatch('search_vector', ['title'], long);
    expect(m.param!.split(' | ')).toHaveLength(20);
  });

  it('falls back to ILIKE with zero rank when there are no lexemes', () => {
    const m = textMatch('search_vector', ['title', 'description'], '!!!');
    expect(m.where).toContain('ILIKE');
    expect(m.select).toBe('0 AS rank');
    expect(m.param).toBe('%!!!%');
  });

  it('strips tsquery operators so terms cannot break the query', () => {
    const m = textMatch('search_vector', ['title'], 'a & b | c!');
    expect(m.param).toBe('a | b | c');
    expect(m.param).not.toMatch(/[&!]/);
  });
});
