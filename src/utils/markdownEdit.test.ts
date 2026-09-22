import { describe, it, expect } from 'vitest';
import { wrapOrInsert, insertMath, toggleList, insertLink } from './markdownEdit';

describe('wrapOrInsert (bold/code)', () => {
  it('wraps a selection', () => {
    const r = wrapOrInsert('solve this', 6, 10, '**');
    expect(r.text).toBe('solve **this**');
    expect([r.cursorStart, r.cursorEnd]).toEqual([8, 12]);
  });

  it('toggles off an already-wrapped selection', () => {
    const r = wrapOrInsert('solve **this**', 6, 14, '**');
    expect(r.text).toBe('solve this');
  });

  it('inserts mark + selected placeholder at a bare cursor', () => {
    const r = wrapOrInsert('solve ', 6, 6, '`', 'code');
    expect(r.text).toBe('solve `code`');
    expect(r.text.slice(r.cursorStart, r.cursorEnd)).toBe('code');
  });

  it('clamps out-of-range selections instead of throwing', () => {
    const r = wrapOrInsert('hi', -5, 99, '**');
    expect(r.text).toBe('**hi**');
  });
});

describe('insertMath', () => {
  it('wraps a selection inline', () => {
    const r = insertMath('area = x^2 ok', 7, 10, false);
    expect(r.text).toBe('area = $x^2$ ok');
  });

  it('drops an inline starter with the body selected at a cursor', () => {
    const r = insertMath('', 0, 0, false);
    expect(r.text).toBe('$x^2$');
    expect(r.text.slice(r.cursorStart, r.cursorEnd)).toBe('x^2');
  });

  it('puts display math on its own lines with breaks as needed', () => {
    const r = insertMath('before after', 7, 7, true);
    expect(r.text).toBe('before \n$$\n\\frac{a}{b}\n$$\nafter');
    expect(r.text.slice(r.cursorStart, r.cursorEnd)).toBe('\\frac{a}{b}');
  });

  it('uses the selection as the display body', () => {
    const r = insertMath('E = mc^2', 0, 8, true);
    expect(r.text).toBe('$$\nE = mc^2\n$$');
  });
});

describe('toggleList', () => {
  it('bullets each touched line', () => {
    const r = toggleList('one\ntwo', 0, 7);
    expect(r.text).toBe('- one\n- two');
  });

  it('removes bullets when all touched lines have them', () => {
    const r = toggleList('- one\n- two', 0, 11);
    expect(r.text).toBe('one\ntwo');
  });

  it('bullets only the touched line of a larger text', () => {
    const r = toggleList('a\nb\nc', 2, 3);
    expect(r.text).toBe('a\n- b\nc');
  });
});

describe('insertLink', () => {
  it('uses the selection as the label and selects the URL', () => {
    const r = insertLink('see notes', 4, 9);
    expect(r.text).toBe('see [notes](https://)');
    expect(r.text.slice(r.cursorStart, r.cursorEnd)).toBe('https://');
  });

  it('falls back to a label placeholder at a cursor', () => {
    const r = insertLink('', 0, 0);
    expect(r.text).toBe('[label](https://)');
  });
});
