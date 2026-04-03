import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { dbAdmin, supabaseAdmin } from '../database/config';
import { config } from '../config';

const YOUTUBE_API_URL = 'https://www.googleapis.com/youtube/v3';

// Subjects we currently support
export const SUBJECTS = [
    'Mathematics',
    'English',
    'History',
    'Chemistry',
    'Physics',
    'Biology',
    'Civics',
    'Geography',
    'Economics',
    'Business',
    'Amharic',
    'Afaan Oromoo',
    'Tigrigna',
    'Information Technology'
];

export const GRADES = [9, 10, 11, 12];

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
     * Run a full sync of all grades and subjects
     */
    static async syncAllGradesAndSubjects(adminUserId: string): Promise<{ added: number; errors: number }> {
        let totalAdded = 0;
        let totalErrors = 0;

        for (const grade of GRADES) {
            for (const subject of SUBJECTS) {
                try {
                    console.log(`Syncing YouTube for Grade ${grade} ${subject}...`);
                    const result = await this.syncVideosForGradeAndSubject(grade, subject, adminUserId);
                    totalAdded += result.added;
                } catch (error) {
                    console.error(`Failed to sync Grade ${grade} ${subject}:`, error);
                    totalErrors++;
                }
            }
        }

        return { added: totalAdded, errors: totalErrors };
    }

    /**
     * Search and sync videos for a specific grade and subject, using Topics if available.
     */
    static async syncVideosForGradeAndSubject(grade: number, subject: string, adminUserId: string): Promise<{ added: number }> {
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

                let addedCount = 0;

                // 2. Process each video found
                for (const item of items) {
                    const videoId = item.id.videoId;
                    const snippet = item.snippet;

                    if (!videoId || !snippet) continue;

                    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
                    const title = snippet.title;
                    const description = snippet.description;
                    const channelTitle = snippet.channelTitle;
                    const thumbnail = snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url;

                    // 3. Check for duplicates
                    const { data: existing, error: err } = await supabaseAdmin
                        .from('videos')
                        .select('id')
                        .eq('video_url', videoUrl)
                        .limit(1)
                        .maybeSingle();

                    if (err) {
                        console.error('Error checking for duplicate video:', err);
                        continue;
                    }

                    if (existing) continue;

                    // 4. Insert new video
                    const cleanTitle = title.substring(0, 500);

                    // If chapter column wasn't added successfully and this throws, you must migrate
                    await dbAdmin.insert('videos', {
                        title: cleanTitle,
                        description: description,
                        subject: subject,
                        grade: grade,
                        chapter: topic, // This maps to the topic found from JSON
                        video_url: videoUrl,
                        thumbnail: thumbnail,
                        instructor: channelTitle,
                        is_premium: false,
                        uploaded_by: adminUserId
                    });

                    addedCount++;
                }

                totalAddedForSubject += addedCount;
            } catch (error) {
                console.error(`YouTube API Error for query [${searchQuery}]:`, error);
                // Intentionally let it map to other topics instead of totally failing the subject
            }
        }

        return { added: totalAddedForSubject };
    }
}
