import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables before doing anything else
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { YouTubeService, GRADES, SUBJECTS } from '../src/services/youtubeService';
import { dbAdmin } from '../src/database/config';

async function resume() {
    console.log('--- Resuming YouTube Video Sync from Grade 10 Civics ---');

    if (!process.env.YOUTUBE_API_KEY) {
        console.error('YOUTUBE_API_KEY is not defined. You must add it to the .env file!');
        process.exit(1);
    }

    let startSyncing = false;
    let totalAdded = 0;
    let totalErrors = 0;

    try {
        const users = await dbAdmin.get('users');
        const admin = users.find((u: any) => u.role === 'ADMIN');
        let adminIdToUse = admin ? admin.id : (users.length > 0 ? users[0].id : null);

        for (const grade of GRADES) {
            for (const subject of SUBJECTS) {
                if (grade === 10 && subject === 'Civics') {
                    startSyncing = true;
                }

                if (!startSyncing) continue;

                try {
                    console.log(`Syncing YouTube for Grade ${grade} ${subject}...`);
                    const result = await YouTubeService.syncVideosForGradeAndSubject(grade, subject, adminIdToUse);
                    totalAdded += result.added;
                } catch (error) {
                    console.error(`Failed to sync Grade ${grade} ${subject}:`, error);
                    totalErrors++;
                }
            }
        }

        console.log('\n--- Sync Complete ---');
        console.log(`Total New Videos Added: ${totalAdded}`);
        console.log(`Total Errors Encountered: ${totalErrors}`);
        process.exit(0);
    } catch (error) {
        console.error('Crash running the sync', error);
        process.exit(1);
    }
}

resume();
