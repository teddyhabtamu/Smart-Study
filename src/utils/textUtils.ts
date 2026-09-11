// Text helpers for speech / plain-text consumption of AI content.

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
