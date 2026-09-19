import { describe, it, expect } from 'vitest';
import { shouldSendOnKey, appendImageBlock, formatImageBlock, MAX_IMAGE_BYTES } from './chatInput';

describe('shouldSendOnKey (chat send convention)', () => {
  it('sends on plain Enter', () => {
    expect(shouldSendOnKey('Enter', false, false)).toBe(true);
  });

  it('never sends on Shift+Enter (newline instead)', () => {
    expect(shouldSendOnKey('Enter', true, false)).toBe(false);
  });

  it('never sends while IME is composing (Amharic/CJK confirm)', () => {
    expect(shouldSendOnKey('Enter', false, true)).toBe(false);
  });

  it('ignores every other key', () => {
    expect(shouldSendOnKey('a', false, false)).toBe(false);
    expect(shouldSendOnKey('Escape', false, false)).toBe(false);
  });
});

describe('image block insertion', () => {
  it('formats the OCR block explicitly', () => {
    expect(formatImageBlock('  hello  ')).toBe('[Image with text]\n\nhello');
  });

  it('appends instead of clobbering typed text', () => {
    expect(appendImageBlock('What is this?', 'E = mc2')).toBe(
      'What is this?\n\n[Image with text]\n\nE = mc2'
    );
    expect(appendImageBlock('   ', 'E = mc2')).toBe('[Image with text]\n\nE = mc2');
  });

  it('caps uploads at 8MB', () => {
    expect(MAX_IMAGE_BYTES).toBe(8 * 1024 * 1024);
  });
});
