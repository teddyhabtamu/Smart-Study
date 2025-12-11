# Database Migrations

This directory contains SQL migration files for the SmartStudy database schema.

## Running Migrations

1. Connect to your Supabase project
2. Open the SQL Editor
3. Copy and paste the contents of the migration file
4. Execute the SQL

## Migration Files

### `add_tracking_tables.sql`
**Created:** 2025-12-11  
**Description:** Adds tracking tables for XP history, document views, and badge unlock dates.

**Tables Created:**
- `xp_history` - Tracks all XP gains with source information
- `document_views` - Tracks document views per user
- `badge_unlocks` - Tracks when badges were unlocked

**Purpose:** Enables accurate weekly digest email statistics by tracking:
- Weekly XP earned
- Documents viewed in the past week
- Achievements unlocked in the past week

**Indexes:** All tables include appropriate indexes for efficient querying by user_id and date ranges.

### `add_moderator_role.sql`
**Created:** 2025-12-11  
**Description:** Adds MODERATOR as a valid value to the user_role enum type.

**Purpose:** Enables the system to support MODERATOR role for admin invitations, allowing for different permission levels (ADMIN vs MODERATOR).

**Note:** This migration uses `ALTER TYPE ... ADD VALUE IF NOT EXISTS` which may need to be run outside of a transaction block in some PostgreSQL versions. If you encounter issues, run it directly in the Supabase SQL Editor.
