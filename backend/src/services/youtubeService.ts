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
            // Appending -shorts -#shorts to drastically reduce YouTube Shorts returning in the mix
            searchQueries.push(`"Ethiopia" "grade ${grade}" "${subject}" "${randomTopic}" tutorial -shorts -#shorts`);
            chosenTopics.push(randomTopic);
        } else {
            searchQueries.push(`"Ethiopia" "grade ${grade}" "${subject}" tutorial -shorts -#shorts`);
            chosenTopics.push(null);
        }

        let totalAddedForSubject = 0;

        for (let index = 0; index < searchQueries.length; index++) {
            const searchQuery = searchQueries[index];
            const topic = chosenTopics[index] || null;

            try {
                // 1. Search for videos via YouTube API
                const response = await axios.get(`${YOUTUBE_API_URL}/search`, {
                    params: {
                        part: 'snippet',
                        q: searchQuery,
                        type: 'video',
                        videoDuration: 'medium', // Restrict to > 4 minutes to guarantee tutorials and kill Shorts
                        maxResults: 6, // Reduced from 10 to further protect quota limits and db bloat
                        relevanceLanguage: 'en',
                        key: apiKey,
                    },
                });

                const items = response.data?.items;
                if (!items || items.length === 0) continue;

                // Batch the duplicate check: one .in() query per subject
                // instead of one query per video (6 round-trips per subject,
                // ~360 for a full run — a big slice of the 25s cron budget).
                const candidates = [];
                for (const item of items) {
                    const videoId = item.id.videoId;
                    const snippet = item.snippet;
                    if (!videoId || !snippet) continue;
                    candidates.push({
                        videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
                        title: String(snippet.title || '').substring(0, 500),
                        description: snippet.description,
                        channelTitle: snippet.channelTitle,
                        thumbnail: snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url,
                    });
                }
                if (candidates.length === 0) continue;

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

                // 2. Insert each video not already in the library
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
