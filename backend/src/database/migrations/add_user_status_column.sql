-- Migration: Add status column to users table
-- Run this SQL in your Supabase SQL Editor
-- After running, refresh the schema cache in Supabase Dashboard > Settings > API > Reload Schema

-- Add status column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'status'
    ) THEN
        -- Add the column
        ALTER TABLE users 
        ADD COLUMN status VARCHAR(20) DEFAULT 'Active';
        
        -- Add the check constraint
        ALTER TABLE users 
        ADD CONSTRAINT users_status_check 
        CHECK (status IN ('Active', 'Banned', 'Inactive'));
        
        -- Update existing users to have 'Active' status
        UPDATE users SET status = 'Active' WHERE status IS NULL;
        
        RAISE NOTICE 'Status column added successfully';
    ELSE
        RAISE NOTICE 'Status column already exists';
    END IF;
END $$;

-- Refresh Supabase schema cache (this is important!)
-- Note: You may need to manually refresh in Supabase Dashboard > Settings > API > Reload Schema
NOTIFY pgrst, 'reload schema';

