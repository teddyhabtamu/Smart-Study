import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { dbAdmin, supabaseAdmin } from '../database/config';
import { config } from '../config';
import { CONTENT_SUBJECTS } from '../constants';

const YOUTUBE_API_URL = 'https://www.googleapis.com/youtube/v3';

// Import allowlist = the canonical content taxonomy (see constants.ts), so
// synced videos always carry subjects the API accepts and the filters offer.
// Previously this was a third hand-copied list ('Information Technology'
// vs the DB's 'ICT'), which is how unfilterable subjects got imported.
export const SUBJECTS = CONTENT_SUBJECTS;

export const GRADES = [9, 10, 11, 12];

// YouTube's Education category. The search endpoint accepts it as a filter
// (videoCategoryId=27) and the scorer re-verifies it per video: without it,
// trivia gameshows and entertainment slip in (observed: "10 toughest
// General | trivia 10 #GK | quiz time" imported as a Biology video).
export const EDUCATION_CATEGORY_ID = '27';

// Import gate tuning. Scores are calibrated so a genuine tutorial
// (topic + subject match) lands well above the bar, while keyword-stuffed
// trivia and exam dumps fall below it. Reasons log per decision.
export const MIN_ACCEPT_SCORE = 2;
export const ACCEPT_TOP_N = 5;
export const REJECT_UNDER_SECS = 240;

// YouTube search snippets arrive HTML-escaped (Bernoulli&#39;s Principle,
// Tom &amp; Jerry). Decode once at import so escaped text is never stored.
// &amp; decodes LAST: `&amp;lt;` means literal "&lt;", and decoding & first
// would wrongly cascade it into "<".
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

// YouTube API quota errors (403 quotaExceeded / rateLimitExceeded). When the
// daily 10k-unit budget is gone, EVERY further search fails identically —
// callers must stop early instead of burning the serverless time budget on
// 60 guaranteed-fail calls.
export const isQuotaExceededError = (err: any): boolean => {
    const status = err?.response?.status;
    if (status !== 403 && status !== 429) return false;
    try {
        const details = JSON.stringify(err?.response?.data?.error?.errors || err?.response?.data || '');
        return /quotaExceeded|rateLimitExceeded|quota/i.test(details);
    } catch {
        return status === 403;
    }
};

// --- Grade-claim extraction (single source of truth) ------------------------
// Reads the grades a video CLAIMS (title + description) so the sync gate can
// reject explicit mismatches and the library audit can flag old rows. The
// sync loop's grade is an assumption; this is the verification.
// Covered forms: "grade 10", "grade-10", "class 10", "10th (grade)",
// ranges ("grades 9-12", "grade 9 to 12"), and East-African Forms
// (Form 1-4 ≈ Grades 9-12 — Kenyan/Tanzanian creators teach the same
// syllabus and routinely show up in "Ethiopia"-biased searches).
// Deliberately NOT covered: bare numbers ("10" alone is usually a count),
// "top 10" (no ordinal), SS1-SS3 (West-African system, out of scope).
const FORM_TO_GRADE: Record<number, number> = { 1: 9, 2: 10, 3: 11, 4: 12 };

export const extractGradeClaims = (text: string): number[] => {
    const claimed = new Set<number>();
    const blob = String(text || '');
    const grab = (s: string, re: RegExp): void => {
        let m: RegExpExecArray | null;
        re.lastIndex = 0;
        while ((m = re.exec(s)) !== null) {
            const n = parseInt(m[1] ?? '', 10);
            if (Number.isFinite(n)) claimed.add(n);
            // Guard against zero-length-match loops on global regexes.
            if (m[0].length === 0) re.lastIndex++;
        }
    };
    // grade 10 / grade-10 / grade: 10
    grab(blob, /\bgrades?\s*[:\-]?\s*0?(\d{1,2})\b/gi);
    // "grade 10 & 11", "grade 10 and 11", "class 9, 10" — lists after one keyword.
    const lists = (s: string, re: RegExp): void => {
        let m: RegExpExecArray | null;
        re.lastIndex = 0;
        while ((m = re.exec(s)) !== null) {
            for (const num of (m[1] || '').match(/0?\d{1,2}/g) || []) {
                const n = parseInt(num, 10);
                if (Number.isFinite(n)) claimed.add(n);
            }
            if (m[0].length === 0) re.lastIndex++;
        }
    };
    lists(blob, /\bgrades?\s*((?:0?\d{1,2})\s*(?:[,/&]|\band\b)\s*0?\d{1,2}(?:\s*(?:[,/&]|\band\b)\s*0?\d{1,2})*)/gi);
    lists(blob, /\bclass\s*((?:0?\d{1,2})\s*(?:[,/&]|\band\b)\s*0?\d{1,2}(?:\s*(?:[,/&]|\band\b)\s*0?\d{1,2})*)/gi);
    // class 10 (Indian/Pakistani creators' equivalent)
    grab(blob, /\bclass\s*0?(\d{1,2})\b/gi);
    // 10th (grade) — ordinal; "top 10" has no suffix so it never matches.
    grab(blob, /\b0?(\d{1,2})(?:st|nd|rd|th)\b/gi);
    // form 2 / form-2 (East Africa) → mapped to grades.
    const forms = new Set<number>();
    grab(blob, /\bforms?\s*[:\-]?\s*0?(\d)\b/gi);
    // NOTE: grab() above added raw form numbers 1-4 to `claimed`; move them
    // through the mapping instead (a bare "2" must never read as Grade 2).
    for (const n of [...claimed]) {
        if (n >= 1 && n <= 4 && /\bforms?\s*[:\-]?\s*0?\d\b/i.test(blob)) {
            claimed.delete(n);
            forms.add(n);
        }
    }
    for (const f of forms) {
        if (FORM_TO_GRADE[f] !== undefined) claimed.add(FORM_TO_GRADE[f]);
    }
    // Ranges expand: "grades 9-12", "grade 9 to 12", "class 9–12".
    const range = (s: string, re: RegExp): void => {
        let m: RegExpExecArray | null;
        re.lastIndex = 0;
        while ((m = re.exec(s)) !== null) {
            const a = parseInt(m[1] ?? '', 10);
            const b = parseInt(m[2] ?? '', 10);
            if (Number.isFinite(a) && Number.isFinite(b)) {
                const [lo, hi] = a <= b ? [a, b] : [b, a];
                for (let g = lo; g <= hi; g++) claimed.add(g);
            }
            if (m[0].length === 0) re.lastIndex++;
        }
    };
    range(blob, /\bgrades?\s*0?(\d{1,2})\s*(?:-|–|—|to)\s*0?(\d{1,2})\b/gi);
    range(blob, /\bclass\s*0?(\d{1,2})\s*(?:-|–|—|to)\s*0?(\d{1,2})\b/gi);
    range(blob, /\bforms?\s*0?(\d)\s*(?:-|–|—|to)\s*0?(\d)\b/gi);
    // Form ranges arrive as raw 1-4 above; remap any stragglers.
    for (const n of [...claimed]) {
        if (n >= 1 && n <= 4 && /\bforms?\s*0?\d\s*(?:-|–|—|to)\s*0?\d\b/i.test(blob)) {
            claimed.delete(n);
            for (let f = n; f <= 4; f++) {
                const g = FORM_TO_GRADE[f];
                if (g !== undefined) claimed.add(g);
            }
        }
    }
    return [...claimed].filter((g) => g >= 1 && g <= 12).sort((a, b) => a - b);
};

// Verdict of a stored grade against claimed grades: 'match' (target claimed
// or covered by a claimed range), 'mismatch' (other grades claimed, target
// absent), or 'silent' (no claim at all — Khan-style titles).
export const verifyVideoGrade = (storedGrade: number, title: string, description?: string | null): { status: 'match' | 'mismatch' | 'silent'; claimed: number[] } => {
    const claimed = extractGradeClaims(`${title || ''}\n${description || ''}`);
    if (claimed.length === 0) return { status: 'silent', claimed };
    if (claimed.includes(storedGrade)) return { status: 'match', claimed };
    return { status: 'mismatch', claimed };
};
// Deterministic topic rotation: ISO-week % topics.length. The old
// Math.random() pick re-searched repeats (wasting quota on duplicates the
// dedupe then discarded) while some topics waited months. Week rotation
// covers every topic evenly with zero state and zero extra quota — the same
// week always syncs the same topic, the next week moves on. Exported pure
// for unit tests (pass `now` to freeze time).
export const isoWeekNumber = (now: Date = new Date()): number => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const day = (d.getUTCDay() + 6) % 7; // Mon=0..Sun=6
    d.setUTCDate(d.getUTCDate() - day + 3); // Thursday of this week
    const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    const firstDay = (firstThursday.getUTCDay() + 6) % 7;
    firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
    return 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
};

export const rotationIndex = (length: number, now: Date = new Date()): number => {
    if (length <= 0) return 0;
    return isoWeekNumber(now) % length;
};

// --- Import quality gate (pure, unit-tested) -------------------------------
// Why this exists: the old query (`"Ethiopia" "grade 9" "Physics" ...` with
// every term quoted) SELECTED FOR keyword-stuffers — genuine educators never
// write "Ethiopia grade 9" in titles — and every top-6 result went straight
// into the student library with zero checks. Now: an unquoted topical query
// inside the Education category, then every candidate is scored and only the
// best few cross the bar.

const SUBJECT_SYNONYMS: Record<string, string[]> = {
    mathematics: ['mathematics', 'math', 'maths'],
    ict: ['ict', 'information technology', 'computer'],
    civics: ['civics', 'civic', 'citizenship'],
    'afaan oromoo': ['afaan oromoo', 'oromoo', 'oromo', 'afan oromo'],
    tigrigna: ['tigrigna', 'tigrinya'],
};

// Quoted topic (precision) + loose subject (recall): spammers can stuff the
// topic phrase, but then still face the scorer below. A bare `Ethiopia`
// biases relevance ranking toward local creators WITHOUT excluding global
// ones (unquoted = soft signal, not a requirement — the old quoted version
// is what systematically excluded every quality educator).
export const buildSearchQuery = (subject: string, topic: string | null): string => {
    const core = topic && topic.trim()
        ? `"${topic.trim()}" ${subject} tutorial lesson`
        : `${subject} tutorial lesson`;
    return `${core} Ethiopia`;
};

// Ethiopian-context signals: channel names, titles and descriptions
// referencing the local ecosystem, plus Ge'ez script itself (Amharic,
// Tigrigna, Afaan Oromoo titles). Bonuses only — global quality still
// passes on its own merits; this just ranks locals up.
const ETHIO_SIGNALS = /ethiop|ethio|amhar|afaan|oromo|oromoo|tigr|habesha|addis|egsece|euee/i;
const ETHIOPIC_SCRIPT = /[\u1200-\u137F]/;

const tokenize = (text: string): string[] =>
    String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

export const subjectTokens = (subject: string): string[] => {
    const lower = String(subject || '').toLowerCase().trim();
    return SUBJECT_SYNONYMS[lower] || [lower];
};

// ISO 8601 durations (PT15M33S, PT1H2M, P0D for live/upcoming). Null when
// unparseable — callers treat unknown duration as unscorable, not as short.
export const parseDurationSecs = (iso: string | null | undefined): number | null => {
    if (!iso) return null;
    const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(String(iso).trim());
    if (!m) return null;
    const days = parseInt(m[1] || '0', 10);
    const hours = parseInt(m[2] || '0', 10);
    const mins = parseInt(m[3] || '0', 10);
    const secs = parseInt(m[4] || '0', 10);
    if (!m[1] && !m[2] && !m[3] && !m[4]) return null;
    return days * 86400 + hours * 3600 + mins * 60 + secs;
};

export interface VideoSignals {
    title: string;
    description: string;
    channelTitle: string;
    subject: string;
    topic: string | null;
    grade: number;
    durationSecs: number | null;
    categoryId: string | null;
    embeddable: boolean | null;
    viewCount: number | null;
    likeCount: number | null;
}

export interface VideoVerdict {
    accept: boolean;
    score: number;
    reasons: string[];
}

const countEmojis = (text: string): number =>
    (String(text || '').match(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/gu) || []).length;

// Categories that can never be curriculum lessons (film, music, sports,
// travel, gaming, comedy). Everything else passes through to scoring:
// local uploaders routinely file real lessons under People & Blogs (22),
// and spammers file trivia as Education (27) — so the category only ever
// rejects, never vouches.
const REJECT_CATEGORIES = new Set(['1', '10', '17', '19', '20', '23']);

// Subjects taught IN a local language: their videos legitimately carry no
// English (Afaan Oromoo lessons are in Oromo). Every other subject is
// taught in English, so its videos must read as English or Ge'ez.
const LANGUAGE_SUBJECTS = new Set(['amharic', 'afaan oromoo', 'tigrigna', 'english']);

// Lesson-English markers: genuine tutorials (any country) use these words;
// "Waa Maxay ICT?" (Somali) uses none. Checked only when nothing else
// anchors the video (no topic match, no Ge'ez script) — a terse but
// on-topic title never reaches this gate.
const LESSON_ENGLISH = /\b(the|and|for|with|lesson|tutorial|class|grade|course|school|teacher|learn|learning|basics|introduction|intro|chapter|part|unit|explained|explanation|questions|revision|notes|full|complete|video|exam)\b/i;

export const scoreCandidateVideo = (s: VideoSignals): VideoVerdict => {
    const reasons: string[] = [];
    let score = 0;
    const reject = (reason: string): VideoVerdict => ({ accept: false, score: -100, reasons: [...reasons, reason] });
    const title = String(s.title || '');
    const blob = `${title}\n${s.description || ''}`;
    const lowerTitle = title.toLowerCase();

    // Hard gates: format-level disqualifiers, no scoring needed.
    if (/#shorts?\b|\(shorts\)|\bshorts\b/i.test(title)) return reject('short-form');
    if (s.durationSecs !== null && s.durationSecs < REJECT_UNDER_SECS) return reject(`too-short-${s.durationSecs}s`);
    if (s.categoryId !== null) {
        // Local curriculum uploaders routinely miscategorize lessons as
        // People & Blogs (22) or Entertainment (24) — verified against the
        // library audit — so only patently incompatible categories reject.
        if (REJECT_CATEGORIES.has(s.categoryId)) return reject(`category-${s.categoryId}`);
    }
    if (s.embeddable === false) return reject('not-embeddable');
    if (/answer\s*key|exam\s*leak|leaked\s*(exam|paper)/i.test(blob)) return reject('answer-key-or-leak');
    // Exam Q&A dumps ("Entrance exam questions and answers part 1") wear
    // the subject as camouflage; real lessons teach, they don't recite.
    if (/questions?\s*(and|&)\s*answers?/i.test(blob)) return reject('exam-qa-dump');
    if (/trivia|quiz\s*(game|time|show)|#quizgame|\biq\s*test|brain\s*test/i.test(lowerTitle)) return reject('trivia-gameshow');
    const letters = title.replace(/[^A-Za-z]/g, '');
    if (letters.length > 10 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.7) {
        return reject('all-caps');
    }
    if (countEmojis(title) > 3) return reject('emoji-spam');
    if (/[!?]{3,}/.test(title)) return reject('clickbait-punctuation');

    // Topic: the curriculum term must actually appear (half credit for partial).
    // The ratio doubles as the language-gate bypass below: a strong topic
    // match proves curriculum relevance in any wording.
    let topicRatio = 0;
    if (s.topic && s.topic.trim()) {
        const topicTokens = tokenize(s.topic);
        const blobTokens = new Set(tokenize(blob));
        const hits = topicTokens.filter((t) => blobTokens.has(t)).length;
        topicRatio = topicTokens.length > 0 ? hits / topicTokens.length : 0;
        if (topicRatio >= 1) { score += 3; reasons.push(`topic ${hits}/${topicTokens.length}`); }
        else if (topicRatio >= 0.5) { score += 1; reasons.push(`topic-partial ${hits}/${topicTokens.length}`); }
    }
    // Subject (with synonyms: "Maths" counts for Mathematics).
    const blobLower = blob.toLowerCase();
    const hasSubject = subjectTokens(s.subject).some((t) => blobLower.includes(t));
    if (hasSubject) {
        score += 2;
        reasons.push('subject');
    } else if (!s.topic || !s.topic.trim()) {
        // Topic-less (subject-only) searches have no other anchor: a video
        // that never names the subject is a mistarget, not a find.
        return reject('subject-missing');
    }
    // Grade verification (not a bonus anymore): the sync loop's grade used
    // to be stamped blindly, so a "Grade 10" video sailed into Grade 12 on
    // topic+subject points alone. An explicit claim of another grade now
    // rejects; a matching claim (or covering range) keeps the +1; silence
    // stays neutral (Khan-style titles carry no grade and still pass).
    const gradeCheck = verifyVideoGrade(s.grade, title, s.description);
    if (gradeCheck.status === 'mismatch') {
        return reject(`grade-mismatch-claims-${gradeCheck.claimed.join('+')}`);
    }
    if (gradeCheck.status === 'match') {
        score += 1;
        reasons.push('grade');
    }
    // Language gate (last hard check before soft bonuses): non-language
    // subjects are taught in English, so a video with no topic match, no
    // Ge'ez script, and no English lesson-words is a wrong-language import
    // (observed: Somali "Waa Maxay ICT?" filed as Grade 10 ICT). Language
    // subjects (Amharic, Afaan Oromoo, Tigrigna) are exempt — their lessons
    // legitimately carry no English.
    if (!LANGUAGE_SUBJECTS.has(s.subject.toLowerCase()) && topicRatio < 0.5 &&
        !ETHIOPIC_SCRIPT.test(`${title}\n${s.description || ''}\n${s.channelTitle || ''}`) &&
        !LESSON_ENGLISH.test(blob)) {
        return reject('language-mismatch');
    }
    // Duration sweet spot for a lesson; shorts already rejected above.
    if (s.durationSecs !== null && s.durationSecs >= 480 && s.durationSecs <= 1800) {
        score += 1;
        reasons.push(`duration ${Math.round(s.durationSecs / 60)}m`);
    }
    // Engagement milestones (bonuses only — new quality has few views).
    if (s.viewCount !== null && s.viewCount >= 1000) { score += 1; reasons.push('views-1k+'); }
    if (s.viewCount !== null && s.viewCount >= 100000) { score += 1; reasons.push('views-100k+'); }
    if (s.viewCount !== null && s.viewCount >= 100 && (s.likeCount || 0) / s.viewCount >= 0.01) {
        score += 1;
        reasons.push('liked');
    }
    // Educator-channel name bonus (weak signal, hence +1, never decisive).
    if (/academy|school|tutor|professor|education|learning|class|institute|college|university|science|math/i.test(s.channelTitle || '')) {
        score += 1;
        reasons.push('educator-channel');
    }
    // Ethiopian priority: local creators first, global quality as the floor.
    // A local lesson matching topic+subject outranks an equivalent US one;
    // a local spammer still dies on the gates above (trivia, answer keys).
    // Only the CHANNEL counts as identity here — title/description text is
    // cheap talk (spammers stuff "Ethiopia" too), except Ge'ez script,
    // which impersonators essentially never produce.
    if (ETHIO_SIGNALS.test(s.channelTitle || '')) {
        score += 2;
        reasons.push('ethiopian-educator');
    }
    if (ETHIOPIC_SCRIPT.test(`${title}\n${s.description || ''}\n${s.channelTitle || ''}`)) {
        score += 1;
        reasons.push('amharic-script');
    }
    // Soft penalties (suspicious, not disqualifying — local academies
    // legitimately use Telegram and hashtags, so these only weigh down).
    // Hashtag-stuffing weighs most: spammers match cheap subject/grade
    // tokens but never the topic, so they live exactly at the bar — -3
    // drops them while real lessons (topic match) stay comfortably above.
    const hashtags = (title.match(/#/g) || []).length;
    if (hashtags >= 3) { score -= 3; reasons.push('hashtag-stuffing'); }
    if (/telegram|whatsapp/i.test(blob)) { score -= 2; reasons.push('messenger-bait'); }
    if (/\b(19|20)\d{2}\b.*(exam|entrance|euee)|egsece.*\b(19|20)\d{2}\b/i.test(blob)) { score -= 2; reasons.push('dated-exam-dump'); }
    if (/\bpdf\b.*download|download.*\bpdf\b|free\s+pdf/i.test(blob)) { score -= 2; reasons.push('pdf-bait'); }

    if (score < MIN_ACCEPT_SCORE) {
        return { accept: false, score, reasons: [...reasons, `below-bar-${score}`] };
    }
    return { accept: true, score, reasons };
};

// Collapse verdict reason tails into stable counters for sync reports
// ('grade-mismatch-claims-10' → 'grade-mismatch-claims', 'below-bar-1' →
// 'below-bar', 'too-short-212s' → 'too-short'). Per-second/per-grade tails
// would fragment the report into noise (observed: 9 distinct too-short
// codes in one run). The admin sees WHY a thin sync rejected, instead of
// reading "0 new videos" as a failure.
export const rejectCode = (verdict: VideoVerdict): string => {
    const tail = verdict.reasons[verdict.reasons.length - 1] || 'unknown';
    return tail
        .replace(/-claims-.*$/, '-claims')
        .replace(/below-bar-.*$/, 'below-bar')
        .replace(/^too-short-.*$/, 'too-short');
};

// Row mapper: videos.views/likes are IN-APP counters (start at 0, owned by
// the watch/like recounts) — platform stats live in youtube_* and must
// never touch the in-app columns, or the first watch visibly destroys them
// (observed: 11M -> 1). Unit-tested below: this mapping is the contract.
export interface GatedVideoCandidate {
    videoUrl: string;
    title: string;
    description: string | null | undefined;
    channelTitle: string;
    channelId: string | null;
    thumbnail: string | null | undefined;
    durationSecs: number | null;
    viewCount: number;
    likeCount: number;
}

export const toVideoRow = (
    c: GatedVideoCandidate,
    subject: string,
    grade: number,
    topic: string | null,
    adminUserId: string | null
): Record<string, any> => ({
    title: c.title,
    description: c.description,
    subject,
    grade,
    chapter: topic, // This maps to the topic found from JSON
    video_url: c.videoUrl,
    thumbnail: c.thumbnail,
    instructor: c.channelTitle,
    channel_id: c.channelId,
    duration_secs: c.durationSecs,
    views: 0,
    likes: 0,
    youtube_views: c.viewCount,
    youtube_likes: c.likeCount,
    is_premium: false,
    uploaded_by: adminUserId,
});

export class YouTubeService {
    private static getApiKey(): string {
        const apiKey = process.env.YOUTUBE_API_KEY;
        if (!apiKey) {
            throw new Error('YOUTUBE_API_KEY is not defined in environment variables');
        }
        return apiKey;
    }

    /**
     * Reads topics for a specific grade and subject from the backend/data JSON files.
     * Returns an array of topics, or empty array if not found.
     */
    static getTopicsForGradeAndSubject(grade: number, subject: string): string[] {
        try {
            const isCompiled = __filename.endsWith('.js');
            // If compiled to dist/services/, go up three levels to backend/. otherwise two levels from src/services/
            const dataDir = isCompiled ? path.resolve(__dirname, '../../../data') : path.resolve(__dirname, '../../data');

            // Account for variations in folder name spacing (e.g. "Grade 12 " vs "Grade 9")
            let folderPath = path.join(dataDir, `Grade ${grade}`);
            if (!fs.existsSync(folderPath) && fs.existsSync(folderPath + ' ')) {
                folderPath = folderPath + ' ';
            }

            if (!fs.existsSync(folderPath)) return [];

            const files = fs.readdirSync(folderPath);
            for (const file of files) {
                if (file.toLowerCase().includes('natural science')) {
                    const filePath = path.join(folderPath, file);
                    const content = fs.readFileSync(filePath, 'utf8');
                    const data = JSON.parse(content);

                    const entry = data.find((d: any) => d.grade === grade && d.subject === subject);
                    if (entry && entry.topics && Array.isArray(entry.topics)) {
                        return entry.topics;
                    }
                }
            }
        } catch (err) {
            console.warn(`Could not read curriculum file for Grade ${grade}:`, err);
        }
        return [];
    }

    /**
     * Run a full sync of all grades and subjects.
     * - Skips fast (no per-subject errors) when no API key is configured.
     * - Honors an optional deadline: serverless functions die hard at their
     *   time limit, so cron callers pass one and get honest partial counts
     *   instead of a killed run that looks like a failure.
     */
    static async syncAllGradesAndSubjects(adminUserId: string | null, opts?: { deadline?: number }): Promise<{ added: number; errors: number; rejected: number; rejectReasons: Record<string, number>; skippedNoTopics: number; stoppedEarly: boolean; quotaExceeded: boolean }> {
        if (!process.env.YOUTUBE_API_KEY) {
            console.log('YouTube sync skipped: YOUTUBE_API_KEY not configured');
            return { added: 0, errors: 0, rejected: 0, rejectReasons: {}, skippedNoTopics: 0, stoppedEarly: false, quotaExceeded: false };
        }

        let totalAdded = 0;
        let totalErrors = 0;
        let totalRejected = 0;
        let skippedNoTopics = 0;
        const totalReasons: Record<string, number> = {};
        let stoppedEarly = false;
        let quotaExceeded = false;

        for (const grade of GRADES) {
            for (const subject of SUBJECTS) {
                if (opts?.deadline && Date.now() > opts.deadline) {
                    stoppedEarly = true;
                    break;
                }
                // Curriculum-void combos (e.g. Grade 9 Business — not taught
                // at that level) have no topic anchor, so a search would be
                // broad soup the gate rejects wholesale. Skip BEFORE spending
                // ~100 quota units to learn that. Explicit single-syncs still
                // run on admin intent; this skips only the blind bulk loop.
                if (this.getTopicsForGradeAndSubject(grade, subject).length === 0) {
                    skippedNoTopics++;
                    continue;
                }
                try {
                    console.log(`Syncing YouTube for Grade ${grade} ${subject}...`);
                    // uploaded_by stays NULL when no admin exists: inventing an
                    // id ('system', a random user) would violate the UUID FK.
                    const result = await this.syncVideosForGradeAndSubject(grade, subject, adminUserId);
                    totalAdded += result.added;
                    totalRejected += result.rejected;
                    for (const [code, n] of Object.entries(result.rejectReasons || {})) {
                        totalReasons[code] = (totalReasons[code] || 0) + n;
                    }
                } catch (error) {
                    // Quota gone: every remaining subject would fail identically.
                    // Stop now and say so honestly instead of burning the whole
                    // time budget on ~60 failing API calls.
                    if (isQuotaExceededError(error)) {
                        console.error('YouTube API quota exhausted — stopping global sync early');
                        quotaExceeded = true;
                        stoppedEarly = true;
                        break;
                    }
                    console.error(`Failed to sync Grade ${grade} ${subject}:`, error);
                    totalErrors++;
                }
            }
            if (stoppedEarly) break;
        }

        return { added: totalAdded, errors: totalErrors, rejected: totalRejected, rejectReasons: totalReasons, skippedNoTopics, stoppedEarly, quotaExceeded };
    }

    /**
     * Search and sync videos for a specific grade and subject, using Topics if available.
     */
    static async syncVideosForGradeAndSubject(grade: number, subject: string, adminUserId: string | null): Promise<{ added: number; rejected: number; rejectReasons: Record<string, number> }> {
        const apiKey = this.getApiKey();
        const topics = this.getTopicsForGradeAndSubject(grade, subject);

        // One topic per scheduled sync to protect the 10,000-unit quota.
        // Deterministic weekly rotation (not random): even coverage over
        // successive weeks, no quota burned re-searching repeats.
        const searchQueries: string[] = [];
        const chosenTopics: (string | null)[] = [];
        if (topics.length > 0) {
            const weeklyTopic = topics[rotationIndex(topics.length)] as string;
            searchQueries.push(buildSearchQuery(subject, weeklyTopic));
            chosenTopics.push(weeklyTopic);
        } else {
            searchQueries.push(buildSearchQuery(subject, null));
            chosenTopics.push(null);
        }

        let totalAddedForSubject = 0;
        let totalRejectedForSubject = 0;
        const rejectReasons: Record<string, number> = {};
        const tallyReject = (verdict: VideoVerdict): void => {
            const code = rejectCode(verdict);
            rejectReasons[code] = (rejectReasons[code] || 0) + 1;
        };

        for (let index = 0; index < searchQueries.length; index++) {
            const searchQuery = searchQueries[index];
            const topic = chosenTopics[index] || null;

            try {
                // 1. Search for videos via YouTube API. One search costs 100
                // quota units regardless of maxResults, so fetch 10 and let
                // the scorer below pick the best few — same price, far better
                // selection than the old top-6-blind-insert.
                const response = await axios.get(`${YOUTUBE_API_URL}/search`, {
                    params: {
                        part: 'snippet',
                        q: searchQuery,
                        type: 'video',
                        videoCategoryId: EDUCATION_CATEGORY_ID,
                        videoEmbeddable: 'true',
                        maxResults: 10,
                        relevanceLanguage: 'en',
                        key: apiKey,
                    },
                });

                const items = response.data?.items;
                if (!items || items.length === 0) continue;

                // 2. One batched statistics call (1 quota unit for up to 50
                // videos) for the signals search.snippet lacks: real
                // duration, category confirmation, embeddability, and
                // view/like counts. A failure here skips the subject rather
                // than importing blind — blind imports caused this mess.
                const ids = items
                    .map((item: any) => item?.id?.videoId)
                    .filter((id: any): id is string => typeof id === 'string' && id.length > 0);
                if (ids.length === 0) continue;
                let detailsById: Record<string, any> = {};
                try {
                    const detailsRes = await axios.get(`${YOUTUBE_API_URL}/videos`, {
                        params: {
                            part: 'snippet,statistics,contentDetails,status',
                            id: ids.join(','),
                            key: apiKey,
                        },
                    });
                    for (const v of detailsRes.data?.items || []) {
                        if (v?.id) detailsById[v.id] = v;
                    }
                } catch (detailErr) {
                    if (isQuotaExceededError(detailErr)) throw detailErr;
                    console.error(`YouTube details lookup failed for Grade ${grade} ${subject}, skipping subject:`, (detailErr as any)?.message || detailErr);
                    continue;
                }

                // 3. Score every candidate; keep the best few above the bar.
                const scored: Array<{ c: any; score: number; reasons: string[] }> = [];
                let rejected = 0;
                for (const item of items) {
                    const videoId = item?.id?.videoId;
                    const snippet = item?.snippet;
                    const d = videoId ? detailsById[videoId] : undefined;
                    if (!videoId || !snippet || !d) {
                        rejected++;
                        continue;
                    }
                    const toInt = (v: any): number | null => {
                        const n = parseInt(String(v ?? ''), 10);
                        return Number.isFinite(n) ? n : null;
                    };
                    const verdict = scoreCandidateVideo({
                        title: decodeHtmlEntities(String(snippet.title || '')),
                        description: decodeHtmlEntities(String(snippet.description || '')),
                        channelTitle: decodeHtmlEntities(String(snippet.channelTitle || d?.snippet?.channelTitle || '')),
                        subject,
                        topic,
                        grade,
                        durationSecs: parseDurationSecs(d?.contentDetails?.duration),
                        categoryId: d?.snippet?.categoryId ?? null,
                        embeddable: typeof d?.status?.embeddable === 'boolean' ? d.status.embeddable : null,
                        viewCount: toInt(d?.statistics?.viewCount),
                        likeCount: toInt(d?.statistics?.likeCount),
                    });
                    if (!verdict.accept) {
                        rejected++;
                        tallyReject(verdict);
                        continue;
                    }
                    scored.push({
                        c: {
                            videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
                            videoId,
                            title: decodeHtmlEntities(String(snippet.title || '')).substring(0, 500),
                            description: snippet.description ? decodeHtmlEntities(snippet.description) : snippet.description,
                            channelTitle: decodeHtmlEntities(String(snippet.channelTitle || d?.snippet?.channelTitle || '')),
                            channelId: d?.snippet?.channelId ?? null,
                            thumbnail: d?.snippet?.thumbnails?.high?.url || d?.snippet?.thumbnails?.medium?.url || snippet.thumbnails?.high?.url,
                            durationSecs: parseDurationSecs(d?.contentDetails?.duration),
                            viewCount: toInt(d?.statistics?.viewCount) || 0,
                            likeCount: toInt(d?.statistics?.likeCount) || 0,
                        },
                        score: verdict.score,
                        reasons: verdict.reasons,
                    });
                }
                scored.sort((a, b) => b.score - a.score);
                const winners = scored.slice(0, ACCEPT_TOP_N);
                const top = winners[0];
                const topRejects = Object.entries(rejectReasons)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3)
                    .map(([code, n]) => `${code}×${n}`)
                    .join(', ');
                console.log(
                    `YouTube gate Grade ${grade} ${subject}: ${winners.length} accepted, ${rejected} rejected` +
                    (topRejects ? ` [${topRejects}]` : '') +
                    (top ? ` (top: "${top.c.title.slice(0, 60)}" +${top.score} [${top.reasons.join(', ')}])` : '')
                );
                // Count rejects even when nothing was accepted (a fully
                // rejected query is the most informative outcome of all).
                totalRejectedForSubject += rejected;
                if (winners.length === 0) continue;
                const candidates = winners.map((w) => w.c);

                let existingUrls = new Set<string>();
                try {
                    const { data: existing, error: err } = await supabaseAdmin
                        .from('videos')
                        .select('video_url')
                        .in('video_url', candidates.map((c) => c.videoUrl));
                    if (err) {
                        console.error('Error checking for duplicate videos:', err);
                    } else {
                        existingUrls = new Set((existing || []).map((e: any) => e.video_url));
                    }
                } catch (dupErr) {
                    console.error('Error checking for duplicate videos:', dupErr);
                }

                // 4. Insert each video not already in the library
                let addedCount = 0;
                for (const c of candidates) {
                    if (existingUrls.has(c.videoUrl)) continue;

                    // If chapter column wasn't added successfully and this throws, you must migrate
                    await dbAdmin.insert('videos', toVideoRow(c, subject, grade, topic, adminUserId));

                    addedCount++;
                }

                totalAddedForSubject += addedCount;
            } catch (error) {
                // Quota exhaustion must propagate: syncAll aborts the whole run
                // on it, and single-sync reports 429 instead of a misleading
                // "0 new videos" success. Other errors stay per-query (one bad
                // query must not fail the subject).
                if (isQuotaExceededError(error)) throw error;
                console.error(`YouTube API Error for query [${searchQuery}]:`, error);
                // Intentionally let it map to other topics instead of totally failing the subject
            }
        }

        return { added: totalAddedForSubject, rejected: totalRejectedForSubject, rejectReasons };
    }
}
