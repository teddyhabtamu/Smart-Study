# Database Migrations

## Adding the status column to users table

If you're getting the error: `Could not find the 'status' column of 'users' in the schema cache`

### Step 1: Run the migration SQL

1. Go to your Supabase Dashboard
2. Navigate to **SQL Editor**
3. Copy and paste the contents of `add_user_status_column.sql`
4. Click **Run**

### Step 2: Refresh Supabase Schema Cache

After running the migration, you **MUST** refresh Supabase's schema cache:

1. Go to **Settings** in your Supabase Dashboard
2. Click on **API** in the left sidebar
3. Scroll down to find **Reload Schema** button
4. Click **Reload Schema**

This is critical! Supabase caches the schema, and without refreshing, it won't recognize the new column.

### Alternative: Manual Refresh via SQL

If the dashboard button doesn't work, you can also try:

```sql
NOTIFY pgrst, 'reload schema';
```

Then wait a few seconds and try your API call again.

### Verify the Column Exists

Run this query to verify the column was added:

```sql
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'users' AND column_name = 'status';
```

You should see a row with:
- column_name: status
- data_type: character varying
- column_default: 'Active'

