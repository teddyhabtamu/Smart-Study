import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadAskDraft, saveAskDraft, clearAskDraft,
  loadReplyDraft, saveReplyDraft, clearReplyDraft,
} from './communityDraft';

// In-memory Storage double (vitest node env has no localStorage).
const memStore = () => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
  };
};

describe('ask draft', () => {
  it('round-trips a draft', () => {
    const s = memStore();
    saveAskDraft({ title: 'Q?', content: 'Why $x^2$?', subject: 'Mathematics', grade: '9' }, s);
    expect(loadAskDraft(s)).toEqual({ title: 'Q?', content: 'Why $x^2$?', subject: 'Mathematics', grade: '9' });
  });

  it('treats empty and corrupt payloads as absent', () => {
    const s = memStore();
    expect(loadAskDraft(s)).toBeNull();
    saveAskDraft({ title: '', content: '', subject: '', grade: '' }, s);
    expect(loadAskDraft(s)).toBeNull();
    s.setItem('community:ask-draft', '{nope');
    expect(loadAskDraft(s)).toBeNull();
    s.setItem('community:ask-draft', JSON.stringify({ title: 42 }));
    expect(loadAskDraft(s)).toBeNull();
  });

  it('clears explicitly', () => {
    const s = memStore();
    saveAskDraft({ title: 'Q?', content: 'C', subject: 'S', grade: '9' }, s);
    clearAskDraft(s);
    expect(loadAskDraft(s)).toBeNull();
  });

  it('no-ops without storage (SSR/private mode)', () => {
    saveAskDraft({ title: 'Q?', content: 'C', subject: 'S', grade: '9' }, undefined);
    expect(loadAskDraft(undefined)).toBeNull();
  });
});

describe('reply draft (per post)', () => {
  it('round-trips per post id and clears', () => {
    const s = memStore();
    saveReplyDraft('p-1', 'try $x$', s);
    saveReplyDraft('p-2', 'other', s);
    expect(loadReplyDraft('p-1', s)).toBe('try $x$');
    expect(loadReplyDraft('p-2', s)).toBe('other');
    expect(loadReplyDraft('p-9', s)).toBe('');
    clearReplyDraft('p-1', s);
    expect(loadReplyDraft('p-1', s)).toBe('');
    expect(loadReplyDraft('p-2', s)).toBe('other');
  });

  it('empty text clears instead of storing', () => {
    const s = memStore();
    saveReplyDraft('p-1', 'x', s);
    saveReplyDraft('p-1', '', s);
    expect(loadReplyDraft('p-1', s)).toBe('');
  });

  it('ignores blank post ids', () => {
    const s = memStore();
    saveReplyDraft('', 'x', s);
    expect(loadReplyDraft('', s)).toBe('');
  });
});
