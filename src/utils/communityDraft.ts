// Community draft persistence: an accidental modal close or navigation
// must not vaporize a half-written question. Drafts live in localStorage
// (per-browser, best-effort — storage failures silently no-op so writing
// never breaks). The storage parameter exists for tests; callers omit it.

export interface AskDraft {
  title: string;
  content: string;
  subject: string;
  grade: string;
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const ASK_KEY = 'community:ask-draft';
const replyKey = (postId: string): string => `community:reply-draft:${postId}`;

const store = (s?: Store): Store | null => {
  try {
    if (s) return s;
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null;
  }
};

const read = (key: string, s?: Store): string | null => {
  const st = store(s);
  if (!st) return null;
  try {
    return st.getItem(key);
  } catch {
    return null;
  }
};

const write = (key: string, value: string, s?: Store): void => {
  const st = store(s);
  if (!st) return;
  try {
    st.setItem(key, value);
  } catch {
    // Quota/private-mode: writing is advisory, never fatal.
  }
};

const clearKey = (key: string, s?: Store): void => {
  const st = store(s);
  if (!st) return;
  try {
    st.removeItem(key);
  } catch {
    // Ignore.
  }
};

const isAskDraft = (v: any): v is AskDraft =>
  !!v && typeof v === 'object' &&
  typeof v.title === 'string' && typeof v.content === 'string' &&
  typeof v.subject === 'string' && typeof v.grade === 'string';

export const loadAskDraft = (s?: Store): AskDraft | null => {
  const raw = read(ASK_KEY, s);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!isAskDraft(parsed)) return null;
    // Empty drafts are noise — treat as absent so the form opens clean.
    if (!parsed.title && !parsed.content) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const saveAskDraft = (draft: AskDraft, s?: Store): void => {
  if (!draft.title && !draft.content) {
    clearKey(ASK_KEY, s);
    return;
  }
  write(ASK_KEY, JSON.stringify(draft), s);
};

export const clearAskDraft = (s?: Store): void => clearKey(ASK_KEY, s);

export const loadReplyDraft = (postId: string, s?: Store): string => {
  if (!postId) return '';
  return read(replyKey(postId), s) || '';
};

export const saveReplyDraft = (postId: string, text: string, s?: Store): void => {
  if (!postId) return;
  if (!text) {
    clearKey(replyKey(postId), s);
    return;
  }
  write(replyKey(postId), text, s);
};

export const clearReplyDraft = (postId: string, s?: Store): void => {
  if (!postId) return;
  clearKey(replyKey(postId), s);
};
