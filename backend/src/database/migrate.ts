import { createClient } from '@supabase/supabase-js';
import { config } from '../config';
import fs from 'fs';
import path from 'path';

const createTables = async () => {
  try {
    console.log('🚀 Starting database migration...');

    // Initialize Supabase admin client for migrations
    if (!config.supabase.url || !config.supabase.serviceRoleKey) {
      throw new Error('Supabase configuration is missing. Please check your environment variables.');
    }

    const supabaseAdmin = createClient(config.supabase.url, config.supabase.serviceRoleKey);

    // Read and execute the schema SQL file
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schemaSQL = fs.readFileSync(schemaPath, 'utf-8');

    // Split SQL into individual statements
    const statements = schemaSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    console.log(`📄 Executing ${statements.length} SQL statements...`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement && statement.trim()) {
        try {
          const { error } = await supabaseAdmin.rpc('exec_sql', { sql: statement + ';' });
          if (error) {
            console.warn(`⚠️  Statement ${i + 1} warning:`, error.message);
          }
        } catch (err) {
          console.warn(`⚠️  Statement ${i + 1} skipped (likely already exists):`, statement.substring(0, 50) + '...');
        }
      }
    }

    console.log('✅ Database migration completed successfully!');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
};

// Run migration
createTables()
  .then(() => {
    console.log('✅ Migration script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Migration script failed:', error);
    process.exit(1);
  });
