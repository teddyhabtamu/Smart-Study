-- SmartStudy Database Schema for Supabase
-- Run this SQL in your Supabase SQL Editor

-- Enable Row Level Security
-- Note: JWT secret is managed by Supabase, no need to set it manually

-- Create custom types (skip if they already exist)
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('STUDENT', 'ADMIN');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE notification_type AS ENUM ('INFO', 'WARNING', 'SUCCESS', 'ERROR');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE item_type AS ENUM ('document', 'video');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role user_role DEFAULT 'STUDENT',
    is_premium BOOLEAN DEFAULT FALSE,
    avatar TEXT,
    preferences JSONB DEFAULT '{"emailNotifications": true, "studyReminders": true}',
    xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    streak INTEGER DEFAULT 0,
    last_active_date DATE,
    unlocked_badges TEXT[] DEFAULT ARRAY['b1'],
    practice_attempts INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Badges table
CREATE TABLE IF NOT EXISTS badges (
    id VARCHAR(10) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    icon_name VARCHAR(100),
    required_level INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Documents table
CREATE TABLE IF NOT EXISTS documents (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    subject VARCHAR(100) NOT NULL,
    grade INTEGER NOT NULL,
    file_type VARCHAR(10),
    file_size BIGINT,
    file_url TEXT,
    is_premium BOOLEAN DEFAULT FALSE,
    downloads INTEGER DEFAULT 0,
    preview_image TEXT,
    tags TEXT[] DEFAULT '{}',
    author VARCHAR(255),
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Videos table
CREATE TABLE IF NOT EXISTS videos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    description TEXT,
    subject VARCHAR(100) NOT NULL,
    grade INTEGER NOT NULL,
    thumbnail TEXT,
    video_url TEXT NOT NULL,
    instructor VARCHAR(255),
    views INTEGER DEFAULT 0,
    likes INTEGER DEFAULT 0,
    is_premium BOOLEAN DEFAULT FALSE,
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Video likes table (tracks which users have liked which videos)
CREATE TABLE IF NOT EXISTS video_likes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, video_id)
);

-- Video completions table (tracks which users have completed which video lessons)
CREATE TABLE IF NOT EXISTS video_completions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    xp_awarded INTEGER DEFAULT 100,
    UNIQUE(user_id, video_id)
);

-- Forum posts table
CREATE TABLE IF NOT EXISTS forum_posts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    subject VARCHAR(100),
    grade INTEGER,
    votes INTEGER DEFAULT 0,
    views INTEGER DEFAULT 0,
    tags TEXT[] DEFAULT '{}',
    is_solved BOOLEAN DEFAULT FALSE,
    is_edited BOOLEAN DEFAULT FALSE,
    ai_answer TEXT,
    author_id UUID REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Forum comments table
CREATE TABLE IF NOT EXISTS forum_comments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    post_id UUID REFERENCES forum_posts(id) ON DELETE CASCADE,
    author_id UUID REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    votes INTEGER DEFAULT 0,
    is_accepted BOOLEAN DEFAULT FALSE,
    is_edited BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Bookmarks table
CREATE TABLE IF NOT EXISTS bookmarks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    item_id TEXT NOT NULL,
    item_type item_type NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, item_id, item_type)
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT,
    type notification_type DEFAULT 'INFO',
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Study plans table (for planner feature)
CREATE TABLE IF NOT EXISTS study_plans (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    subject VARCHAR(100),
    grade INTEGER,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    is_completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Study plan items table
CREATE TABLE IF NOT EXISTS study_plan_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    plan_id UUID REFERENCES study_plans(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    due_date DATE,
    is_completed BOOLEAN DEFAULT FALSE,
    priority INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Chat sessions table (AI tutor conversations)
CREATE TABLE IF NOT EXISTS chat_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    messages JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Study events table (calendar events like exams, revisions, assignments)
CREATE TABLE IF NOT EXISTS study_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    subject VARCHAR(100),
    event_date DATE NOT NULL,
    event_type VARCHAR(50) NOT NULL CHECK (event_type IN ('Exam', 'Revision', 'Assignment')),
    is_completed BOOLEAN DEFAULT FALSE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Votes table (tracks user votes on posts and comments)
CREATE TABLE IF NOT EXISTS forum_votes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('post', 'comment')),
    target_id UUID NOT NULL,
    vote_value INTEGER NOT NULL CHECK (vote_value IN (1, -1)),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, target_type, target_id)
);

-- Views table (tracks unique post views per user)
CREATE TABLE IF NOT EXISTS forum_views (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    post_id UUID REFERENCES forum_posts(id) ON DELETE CASCADE,
    viewed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, post_id)
);

-- Practice sessions table
CREATE TABLE IF NOT EXISTS practice_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    subject VARCHAR(100),
    grade INTEGER,
    score INTEGER,
    total_questions INTEGER,
    time_spent INTEGER, -- in seconds
    completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_documents_subject_grade ON documents(subject, grade);
CREATE INDEX IF NOT EXISTS idx_documents_is_premium ON documents(is_premium);
CREATE INDEX IF NOT EXISTS idx_videos_subject_grade ON videos(subject, grade);
CREATE INDEX IF NOT EXISTS idx_videos_is_premium ON videos(is_premium);
CREATE INDEX IF NOT EXISTS idx_forum_posts_subject_grade ON forum_posts(subject, grade);
CREATE INDEX IF NOT EXISTS idx_forum_posts_author ON forum_posts(author_id);
CREATE INDEX IF NOT EXISTS idx_forum_comments_post ON forum_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_forum_votes_user_target ON forum_votes(user_id, target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_forum_views_user_post ON forum_views(user_id, post_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_study_plans_user ON study_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_study_events_user ON study_events(user_id);
CREATE INDEX IF NOT EXISTS idx_study_events_date ON study_events(event_date);
CREATE INDEX IF NOT EXISTS idx_study_events_type ON study_events(event_type);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at (drop if exists first)
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
DROP TRIGGER IF EXISTS update_documents_updated_at ON documents;
DROP TRIGGER IF EXISTS update_videos_updated_at ON videos;
DROP TRIGGER IF EXISTS update_forum_posts_updated_at ON forum_posts;
DROP TRIGGER IF EXISTS update_forum_comments_updated_at ON forum_comments;
DROP TRIGGER IF EXISTS update_study_plans_updated_at ON study_plans;
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
DROP TRIGGER IF EXISTS update_documents_updated_at ON documents;
DROP TRIGGER IF EXISTS update_videos_updated_at ON videos;
DROP TRIGGER IF EXISTS update_forum_posts_updated_at ON forum_posts;
DROP TRIGGER IF EXISTS update_forum_comments_updated_at ON forum_comments;
DROP TRIGGER IF EXISTS update_study_plans_updated_at ON study_plans;
DROP TRIGGER IF EXISTS update_study_plan_items_updated_at ON study_plan_items;
DROP TRIGGER IF EXISTS update_chat_sessions_updated_at ON chat_sessions;
DROP TRIGGER IF EXISTS update_study_events_updated_at ON study_events;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_videos_updated_at BEFORE UPDATE ON videos FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_forum_posts_updated_at BEFORE UPDATE ON forum_posts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_forum_comments_updated_at BEFORE UPDATE ON forum_comments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_study_plans_updated_at BEFORE UPDATE ON study_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_study_plan_items_updated_at BEFORE UPDATE ON study_plan_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_chat_sessions_updated_at BEFORE UPDATE ON chat_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_study_events_updated_at BEFORE UPDATE ON study_events FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create helper functions for increment operations
CREATE OR REPLACE FUNCTION increment_document_downloads(document_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE documents SET downloads = downloads + 1 WHERE id = document_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_video_views(video_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE videos SET views = views + 1 WHERE id = video_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_video_likes(video_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE videos SET likes = likes + 1 WHERE id = video_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION decrement_video_likes(video_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE videos SET likes = GREATEST(likes - 1, 0) WHERE id = video_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_post_views(post_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE forum_posts SET views = views + 1 WHERE id = post_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_post_votes(post_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE forum_posts SET votes = votes + 1 WHERE id = post_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION decrement_post_votes(post_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE forum_posts SET votes = GREATEST(votes - 1, 0) WHERE id = post_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_comment_votes(comment_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE forum_comments SET votes = votes + 1 WHERE id = comment_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION decrement_comment_votes(comment_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE forum_comments SET votes = GREATEST(votes - 1, 0) WHERE id = comment_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION accept_comment(comment_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE forum_comments SET is_accepted = true WHERE id = comment_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION unaccept_comments(post_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE forum_comments SET is_accepted = false WHERE post_id = post_id;
END;
$$ LANGUAGE plpgsql;

-- Enable Row Level Security (RLS) on all tables (skip if already enabled)
DO $$ BEGIN
    ALTER TABLE users ENABLE ROW LEVEL SECURITY;
EXCEPTION
    WHEN others THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE badges ENABLE ROW LEVEL SECURITY;
EXCEPTION
    WHEN others THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
EXCEPTION
    WHEN others THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
EXCEPTION
    WHEN others THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE forum_posts ENABLE ROW LEVEL SECURITY;
EXCEPTION
    WHEN others THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE forum_comments ENABLE ROW LEVEL SECURITY;
EXCEPTION
    WHEN others THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;
EXCEPTION
    WHEN others THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
EXCEPTION
    WHEN others THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE study_plans ENABLE ROW LEVEL SECURITY;
EXCEPTION
    WHEN others THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE study_plan_items ENABLE ROW LEVEL SECURITY;
EXCEPTION
    WHEN others THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE practice_sessions ENABLE ROW LEVEL SECURITY;
EXCEPTION
    WHEN others THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
EXCEPTION
    WHEN others THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE study_events ENABLE ROW LEVEL SECURITY;
EXCEPTION
    WHEN others THEN null;
END $$;

-- Disable RLS for forum_votes and forum_views since we use service role with proper auth checks
ALTER TABLE forum_votes DISABLE ROW LEVEL SECURITY;
ALTER TABLE forum_views DISABLE ROW LEVEL SECURITY;

-- Disable RLS for study_events during development (user-specific data)
ALTER TABLE study_events DISABLE ROW LEVEL SECURITY;

-- Create RLS policies (basic policies - you may want to customize these)
-- For development/testing, disable RLS on users table to avoid recursion issues
-- In production, you may want to enable RLS with proper policies
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone can view badges" ON badges;
DROP POLICY IF EXISTS "Anyone can view non-premium documents" ON documents;
DROP POLICY IF EXISTS "Premium users can view all documents" ON documents;
DROP POLICY IF EXISTS "Anyone can view non-premium videos" ON videos;
DROP POLICY IF EXISTS "Premium users can view all videos" ON videos;
DROP POLICY IF EXISTS "Users can manage own bookmarks" ON bookmarks;
DROP POLICY IF EXISTS "Users can manage own forum posts" ON forum_posts;
DROP POLICY IF EXISTS "Users can manage own forum comments" ON forum_comments;
DROP POLICY IF EXISTS "Anyone can view forum posts" ON forum_posts;
DROP POLICY IF EXISTS "Anyone can view forum comments" ON forum_comments;
DROP POLICY IF EXISTS "Users can manage own notifications" ON notifications;
DROP POLICY IF EXISTS "Users can manage own study plans" ON study_plans;
DROP POLICY IF EXISTS "Users can manage own practice sessions" ON practice_sessions;
DROP POLICY IF EXISTS "Users can manage own study events" ON study_events;
DROP POLICY IF EXISTS "Users can manage own chat sessions" ON chat_sessions;
DROP POLICY IF EXISTS "Users can manage own notifications" ON notifications;

-- Public read access for documents and videos (with premium filtering)
CREATE POLICY "Anyone can view non-premium documents" ON documents FOR SELECT USING (is_premium = false);
CREATE POLICY "Premium users can view all documents" ON documents FOR SELECT USING (
    is_premium = true AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_premium = true)
);

CREATE POLICY "Anyone can view non-premium videos" ON videos FOR SELECT USING (is_premium = false);
CREATE POLICY "Premium users can view all videos" ON videos FOR SELECT USING (
    is_premium = true AND EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_premium = true)
);

-- Users can manage their own bookmarks
CREATE POLICY "Users can manage own bookmarks" ON bookmarks FOR ALL USING (auth.uid() = user_id);

-- Users can manage their own forum posts and comments
CREATE POLICY "Users can manage own forum posts" ON forum_posts FOR ALL USING (auth.uid() = author_id);
CREATE POLICY "Users can manage own forum comments" ON forum_comments FOR ALL USING (auth.uid() = author_id);

-- Users can view all forum content
CREATE POLICY "Anyone can view forum posts" ON forum_posts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Anyone can view forum comments" ON forum_comments FOR SELECT TO authenticated USING (true);

-- Users can manage their own notifications and study plans
-- Temporarily disable RLS for notifications during development
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own study plans" ON study_plans FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own practice sessions" ON practice_sessions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own study events" ON study_events FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own chat sessions" ON chat_sessions FOR ALL USING (auth.uid() = user_id);

-- RLS disabled for forum_votes and forum_views - using service role with route-level auth

-- Badges are readable by all authenticated users
CREATE POLICY "Anyone can view badges" ON badges FOR SELECT TO authenticated USING (true);