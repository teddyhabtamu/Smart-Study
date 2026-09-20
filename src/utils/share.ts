// Telegram-first sharing helpers (growth loop).
//
// Why Telegram, not just the Web Share API: on Ethiopian student phones the
// share sheet buries the channel that matters, while a t.me/share/url link
// drops the message straight into Telegram with the text pre-filled — one tap
// to forward to a class group. Every brag/invite message links back to a real
// SmartStudy page so shares recruit users instead of just screenshots.

export const SITE_URL = 'https://smartstudy.pro.et';

/** Absolute share target for a path (works off-origin in tests too). */
export const shareUrl = (path: string): string => {
  const base =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : SITE_URL;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
};

/** t.me share link with pre-filled text + URL (Telegram splits the params). */
export const telegramShareUrl = (text: string, url: string): string =>
  `https://t.me/share/url?${new URLSearchParams({ url, text }).toString()}`;

/** Open the Telegram share sheet in a new tab (returns false when blocked). */
export const openTelegramShare = (text: string, url: string): boolean => {
  try {
    const win = window.open(telegramShareUrl(text, url), '_blank', 'noopener,noreferrer');
    return !!win;
  } catch {
    return false;
  }
};

/** Copy a link; false when the clipboard API is unavailable/denied. */
export const copyShareLink = async (url: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
};

/** "Can you beat me?" brag for a finished practice quiz. */
export const quizBragText = (opts: {
  score: number;
  total: number;
  subject: string;
  grade: string;
}): string => {
  const pct = opts.total > 0 ? Math.round((opts.score / opts.total) * 100) : 0;
  const gradeLabel = opts.grade ? `Grade ${opts.grade} ` : '';
  return (
    `I scored ${opts.score}/${opts.total} (${pct}%) in ${gradeLabel}${opts.subject} ` +
    `practice on SmartStudy — can you beat me? Try it free:`
  );
};

/** Buddy-invite for the study planner. */
export const plannerInviteText = (): string =>
  `I'm planning my exam prep on SmartStudy — join me, it's free:`;
