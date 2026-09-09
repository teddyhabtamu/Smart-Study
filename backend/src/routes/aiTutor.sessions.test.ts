import { describe, it, expect } from 'vitest';

// extractMessages guards every session read path: legacy rows stored
// messages as {} (object) instead of [] — a single such row used to crash
// the whole sessions list (.map on a non-array).
import { extractMessages } from './ai-tutor';

describe('extractMessages (session messages normalizer)', () => {
  it('passes arrays through', () => {
    const msgs = [{ role: 'user', text: 'hi' }];
    expect(extractMessages({ messages: msgs })).toEqual(msgs);
  });

  it('returns [] for empty objects (legacy rows)', () => {
    expect(extractMessages({ messages: {} })).toEqual([]);
  });

  it('recovers object-shaped legacy messages with role fields', () => {
    const raw = {
      '0': { role: 'user', text: 'hi' },
      '1': { role: 'assistant', text: 'hello' },
    };
    const out = extractMessages({ messages: raw });
    expect(out).toHaveLength(2);
    expect(out[0].role).toBe('user');
  });

  it('returns [] for null, undefined, strings, and missing sessions', () => {
    expect(extractMessages({ messages: null })).toEqual([]);
    expect(extractMessages({})).toEqual([]);
    expect(extractMessages(null)).toEqual([]);
    expect(extractMessages(undefined)).toEqual([]);
    expect(extractMessages({ messages: 'garbage' })).toEqual([]);
  });
});
