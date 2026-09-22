// Pure text operations behind MarkdownComposer's toolbar (no DOM here, so
// every behavior is unit-testable under the utils-only vitest setup).
// All functions treat (start, end) as the textarea selection; cursor
// placement of the result lets the component restore focus precisely.

export interface EditResult {
  /** New full text. */
  text: string;
  /** Where to put the selection/cursor afterwards. */
  cursorStart: number;
  cursorEnd: number;
}

const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));

/**
 * Wrap the selection in a mark pair (or insert mark + placeholder when
 * nothing is selected). Bold toggles: an already-wrapped selection is
 * unwrapped instead of double-wrapped.
 */
export const wrapOrInsert = (
  value: string,
  start: number,
  end: number,
  mark: string,
  placeholder = 'text'
): EditResult => {
  const s = clamp(start, 0, value.length);
  const e = clamp(end, 0, value.length);
  const [from, to] = s <= e ? [s, e] : [e, s];
  const selected = value.slice(from, to);

  if (selected.length > 0) {
    const wrapped = selected.startsWith(mark) &&
      selected.endsWith(mark) &&
      selected.length >= mark.length * 2;
    if (wrapped) {
      const inner = selected.slice(mark.length, selected.length - mark.length);
      const text = value.slice(0, from) + inner + value.slice(to);
      return { text, cursorStart: from, cursorEnd: from + inner.length };
    }
    const text = value.slice(0, from) + mark + selected + mark + value.slice(to);
    return { text, cursorStart: from + mark.length, cursorEnd: to + mark.length };
  }

  const text = value.slice(0, from) + mark + placeholder + mark + value.slice(to);
  return { text, cursorStart: from + mark.length, cursorEnd: from + mark.length + placeholder.length };
};

/**
 * Insert a math snippet. Inline ($…$) wraps the selection (or drops a
 * starter at the cursor); display ($$…$$) always goes on its own lines so
 * KaTeX picks it up as a block.
 */
export const insertMath = (
  value: string,
  start: number,
  end: number,
  display: boolean
): EditResult => {
  const s = clamp(start, 0, value.length);
  const e = clamp(end, 0, value.length);
  const [from, to] = s <= e ? [s, e] : [e, s];
  const selected = value.slice(from, to);

  if (!display) {
    if (selected.length > 0) {
      const text = value.slice(0, from) + `$${selected}$` + value.slice(to);
      return { text, cursorStart: from + 1, cursorEnd: to + 1 };
    }
    const snippet = '$x^2$';
    const text = value.slice(0, from) + snippet + value.slice(to);
    return { text, cursorStart: from + 1, cursorEnd: from + snippet.length - 1 };
  }

  const body = selected.length > 0 ? selected : '\\frac{a}{b}';
  const before = value.slice(0, from);
  const after = value.slice(to);
  const needsLeadBreak = before.length > 0 && !before.endsWith('\n');
  const needsTrailBreak = after.length > 0 && !after.startsWith('\n');
  const snippet = `${needsLeadBreak ? '\n' : ''}$$\n${body}\n$$${needsTrailBreak ? '\n' : ''}`;
  const text = before + snippet + after;
  const bodyStart = before.length + (needsLeadBreak ? 1 : 0) + 3;
  return { text, cursorStart: bodyStart, cursorEnd: bodyStart + body.length };
};

/**
 * Toggle a "- " bullet on every line the selection touches. All-prefixed
 * removes; otherwise adds to the unprefixed ones.
 */
export const toggleList = (value: string, start: number, end: number): EditResult => {
  const s = clamp(start, 0, value.length);
  const e = clamp(end, 0, value.length);
  const [from, to] = s <= e ? [s, e] : [e, s];
  const lineStart = value.lastIndexOf('\n', from - 1) + 1;
  const lineEndIdx = value.indexOf('\n', to);
  const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
  const block = value.slice(lineStart, lineEnd);
  const lines = block.split('\n');
  const allBulleted = lines.length > 0 && lines.every((l) => /^\s*-\s/.test(l));
  const next = allBulleted
    ? lines.map((l) => l.replace(/^(\s*)-\s/, '$1')).join('\n')
    : lines.map((l) => (/^\s*-\s/.test(l) ? l : `- ${l}`)).join('\n');
  const text = value.slice(0, lineStart) + next + value.slice(lineEnd);
  return { text, cursorStart: lineStart, cursorEnd: lineStart + next.length };
};

/** Insert a [text](url) link (selection becomes the label when present). */
export const insertLink = (value: string, start: number, end: number): EditResult => {
  const s = clamp(start, 0, value.length);
  const e = clamp(end, 0, value.length);
  const [from, to] = s <= e ? [s, e] : [e, s];
  const label = value.slice(from, to) || 'label';
  const snippet = `[${label}](https://)`;
  const text = value.slice(0, from) + snippet + value.slice(to);
  const urlStart = from + label.length + 3;
  return { text, cursorStart: urlStart, cursorEnd: urlStart + 'https://'.length };
};
