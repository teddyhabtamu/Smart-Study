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
// topic phrase, but then still face the scorer below.
export const buildSearchQuery = (subject: string, topic: string | null): string =>
    topic && topic.trim()
        ? `"${topic.trim()}" ${subject} tutorial lesson`
        : `${subject} tutorial lesson`;

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
    if (/trivia|quiz\s*(game|time|show)|#quizgame|\biq\s*test|brain\s*test/i.test(lowerTitle)) return reject('trivia-gameshow');
    const letters = title.replace(/[^A-Za-z]/g, '');
    if (letters.length > 10 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.7) {
        return reject('all-caps');
    }
    if (countEmojis(title) > 3) return reject('emoji-spam');
    if (/[!?]{3,}/.test(title)) return reject('clickbait-punctuation');

    // Topic: the curriculum term must actually appear (half credit for partial).
    if (s.topic && s.topic.trim()) {
        const topicTokens = tokenize(s.topic);
        const blobTokens = new Set(tokenize(blob));
        const hits = topicTokens.filter((t) => blobTokens.has(t)).length;
        const ratio = topicTokens.length > 0 ? hits / topicTokens.length : 0;
        if (ratio >= 1) { score += 3; reasons.push(`topic ${hits}/${topicTokens.length}`); }
        else if (ratio >= 0.5) { score += 1; reasons.push(`topic-partial ${hits}/${topicTokens.length}`); }
    }
    // Subject (with synonyms: "Maths" counts for Mathematics).
    const blobLower = blob.toLowerCase();
    if (subjectTokens(s.subject).some((t) => blobLower.includes(t))) {
        score += 2;
        reasons.push('subject');
    }
    // Grade mention is a bonus, never a gate: great educators (Khan Academy
    // et al) don't write "grade 9" in titles, and gating on it would repeat
    // the old query's mistake of selecting for keyword-stuffers.
    if (new RegExp(`\\bgrade\\s*0?${s.grade}\\b|\\bclass\\s*0?${s.grade}\\b|\\b${s.grade}th\\b`, 'i').test(blob)) {
        score += 1;
        reasons.push('grade');
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
    static async syncAllGradesAndSubjects(adminUserId: string | null, opts?: { deadline?: number }): Promise<{ added: number; errors: number; stoppedEarly: boolean; quotaExceeded: boolean }> {
        if (!process.env.YOUTUBE_API_KEY) {
            console.log('YouTube sync skipped: YOUTUBE_API_KEY not configured');
            return { added: 0, errors: 0, stoppedEarly: false, quotaExceeded: false };
        }

        let totalAdded = 0;
        let totalErrors = 0;
        let stoppedEarly = false;
        let quotaExceeded = false;

        for (const grade of GRADES) {
            for (const subject of SUBJECTS) {
                if (opts?.deadline && Date.now() > opts.deadline) {
                    stoppedEarly = true;
                    break;
                }
                try {
                    console.log(`Syncing YouTube for Grade ${grade} ${subject}...`);
                    // uploaded_by stays NULL when no admin exists: inventing an
                    // id ('system', a random user) would violate the UUID FK.
                    const result = await this.syncVideosForGradeAndSubject(grade, subject, adminUserId);
                    totalAdded += result.added;
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

        return { added: totalAdded, errors: totalErrors, stoppedEarly, quotaExceeded };
    }

    /**
     * Search and sync videos for a specific grade and subject, using Topics if available.
     */
    static async syncVideosForGradeAndSubject(grade: number, subject: string, adminUserId: string | null): Promise<{ added: number }> {
        const apiKey = this.getApiKey();
        const topics = this.getTopicsForGradeAndSubject(grade, subject);

        // If we have topics mapped, randomly pick exactly ONE topic per scheduled sync to protect the 10,000 API quota
        // Over successive weeks, the library will organically populate without hitting quota walls.
        let searchQueries: string[] = [];
        let chosenTopics: (string | null)[] = [];

        if (topics.length > 0) {
            const randomTopic = topics[Math.floor(Math.random() * topics.length)] as string;
            searchQueries.push(buildSearchQuery(subject, randomTopic));
            chosenTopics.push(randomTopic);
        } else {
            searchQueries.push(buildSearchQuery(subject, null));
            chosenTopics.push(null);
        }

        let totalAddedForSubject = 0;

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
                console.log(
                    `YouTube gate Grade ${grade} ${subject}: ${winners.length} accepted, ${rejected} rejected` +
                    (top ? ` (top: "${top.c.title.slice(0, 60)}" +${top.score} [${top.reasons.join(', ')}])` : '')
                );
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
                    await dbAdmin.insert('videos', {
                        title: c.title,
                        description: c.description,
                        subject: subject,
                        grade: grade,
                        chapter: topic, // This maps to the topic found from JSON
                        video_url: c.videoUrl,
                        thumbnail: c.thumbnail,
                        instructor: c.channelTitle,
                        channel_id: c.channelId,
                        duration_secs: c.durationSecs,
                        views: c.viewCount,
                        likes: c.likeCount,
                        is_premium: false,
                        uploaded_by: adminUserId
                    });

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

        return { added: totalAddedForSubject };
    }
}
