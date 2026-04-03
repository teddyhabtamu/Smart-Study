import { supabaseAdmin } from '../src/database/config';
import * as dotenv from 'dotenv';

dotenv.config();

async function removeShorts() {
    console.log("Searching for imported YouTube Shorts via title/description patterns...");
    const { data, error } = await supabaseAdmin
        .from('videos')
        .delete()
        .in('id', [
            '80f7bcb2-b88e-4fee-8efc-375df9113f2b',
            '03a70e89-54be-4e36-8bdd-eb65bca099f6',
            '31b0a13b-0476-48ab-9d5a-39f12b210c18',
            '613ef8a6-5c99-4488-aa83-a140b636a972'
        ])
        .select('title');

    if (error) {
        console.error("Error deleting shorts:", error);
    } else {
        console.log(`Successfully removed ${data?.length || 0} Shorts from the database.`);
        if (data && data.length > 0) {
            data.forEach((v: any) => console.log(`Deleted: ${v.title}`));
        }
    }
    process.exit(0);
}

removeShorts();
