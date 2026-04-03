import { createClient } from '@supabase/supabase-js';
import { config } from '../src/config';

async function migrate() {
    console.log('Connecting to Supabase...');
    const supabaseAdmin = createClient(config.supabase.url, config.supabase.serviceRoleKey!);
    try {
        console.log('Wiping out old generic videos...');
        // Delete all records using standard client to bypass query parser
        await supabaseAdmin.from('videos').delete().neq('id', '00000000-0000-0000-0000-000000000000');

        console.log('Adding chapter column...');
        await supabaseAdmin.rpc('exec_sql', { sql: 'ALTER TABLE videos ADD COLUMN IF NOT EXISTS chapter VARCHAR(255);' });
        console.log('Migration successful.');
    } catch (error) {
        console.error('Migration failed:', error);
    }
}

migrate();
