// Shared chat-input behavior (AITutor + video chat share one component).
//
// Enter sends, Shift+Enter inserts a newline — the chat-app convention.
// Purity matters here: this helper is unit-tested, and the component calls
// it from onKeyDown.
export const shouldSendOnKey = (
  key: string,
  shiftKey: boolean,
  isComposing: boolean
): boolean => {
  if (key !== 'Enter') return false;
  if (shiftKey) return false;
  // IME composition (Amharic, CJK, …): Enter confirms the composition, it
  // must not send a half-typed message.
  if (isComposing) return false;
  return true;
};

// Phone photos are routinely 12MP+: tesseract on the raw file stalls low-end
// devices and can OOM the tab. Anything over this is rejected with a
// friendly message before OCR starts (plus downscaling in ocrService).
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

// OCR text lands as an explicit block so the model sees what came from the
// image — never silently merged into the student's own words.
export const formatImageBlock = (text: string): string =>
  `[Image with text]\n\n${text.trim()}`;

// Append (never clobber): pasting/attaching over a typed question used to
// wipe it.
export const appendImageBlock = (current: string, text: string): string => {
  const block = formatImageBlock(text);
  return current.trim() ? `${current.trimEnd()}\n\n${block}` : block;
};
