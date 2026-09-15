// Text helpers for speech / plain-text consumption of AI content.

// Stored content (mostly YouTube-synced titles) can carry HTML-escaped text
// (Bernoulli&#39;s, Tom &amp; Jerry) from rows written before sync-time
// decoding landed. Decode at render so old rows read correctly; harmless on
// clean strings. &amp; decodes last so `&amp;lt;` stays literal "&lt;".
export const decodeHtmlEntities = (text: string): string => {
  if (!text) return text;
  return String(text)
    .replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
};

// Make raw markdown/LaTeX speakable: TTS would otherwise read "$", "^", "_"
// aloud. Keeps the readable words, drops the notation.
export const stripForSpeech = (text: string): string =>
  String(text ?? '')
    .replace(/\$\$[\s\S]*?\$\$/g, ' mathematical expression ')
    .replace(/\$([^$]+)\$/g, '$1')
    .replace(/\\(frac|sqrt|times|cdot|leq|geq|neq|pm|alpha|beta|gamma|theta|pi|infty|sum|int)\b/g, '')
    .replace(/[\\{}$^_]/g, '')
    .replace(/[*_#>`|-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
