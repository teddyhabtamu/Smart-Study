import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables before doing anything else
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { YouTubeService } from '../src/services/youtubeService';
import { dbAdmin } from '../src/database/config';

async function main() {
    console.log('--- Starting YouTube Video Sync ---');

    if (!process.env.YOUTUBE_API_KEY) {
        console.error('YOUTUBE_API_KEY is not defined. You must add it to the .env file!');
        process.exit(1);
    }

    try {
        // 1. Get an admin user to attach the videos to
        const users = await dbAdmin.get('users');
        const admin = users.find((u: any) => u.role === 'ADMIN');

        let adminIdToUse = admin ? admin.id : null;
        if (!adminIdToUse && users.length > 0) adminIdToUse = users[0].id;

        if (!adminIdToUse) {
            console.warn('⚠️ Warning: No users found in database to act as the uploader. Some database rows may fail if `uploaded_by` enforces NOT NULL.');
        } else {
            console.log(`Using user ID ${adminIdToUse} as the video uploader.`);
        }

        // 2. Perform global sync
        console.log('Syncing all grades and subjects this could take a moment depending on the YouTube API quota...');
        const results = await YouTubeService.syncAllGradesAndSubjects(adminIdToUse);

        console.log('\n--- Sync Complete ---');
        console.log(`Total New Videos Added: ${results.added}`);
        console.log(`Total Errors Encountered: ${results.errors}`);

        process.exit(0);

    } catch (error) {
        console.error('Crash running the sync', error);
        process.exit(1);
    }
}

main();
