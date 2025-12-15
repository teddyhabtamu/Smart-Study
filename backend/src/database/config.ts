import dotenv from 'dotenv';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';

// Load environment variables at the top of this module
dotenv.config();

// Initialize Supabase client
let supabase: SupabaseClient;

if (config.supabase.url && config.supabase.anonKey) {
  supabase = createClient(config.supabase.url, config.supabase.anonKey);
  console.log('🔗 Connected to Supabase');
} else {
  throw new Error('Supabase configuration is missing. Please check your environment variables.');
}

// For server-side operations that require service role (admin operations)
let supabaseAdmin: SupabaseClient;

if (config.supabase.url && config.supabase.serviceRoleKey) {
  supabaseAdmin = createClient(config.supabase.url, config.supabase.serviceRoleKey);
} else {
  console.warn('⚠️  Supabase service role key not configured. Some admin operations may not work.');
}

// Legacy SimpleDB class for backward compatibility during migration
class SupabaseDB {
  private supabaseClient: SupabaseClient;

  constructor(useAdmin = false) {
    this.supabaseClient = useAdmin && supabaseAdmin ? supabaseAdmin : supabase;
  }

  async get(table: string): Promise<any[]> {
    const { data, error } = await this.supabaseClient
      .from(table)
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  async insert(table: string, record: any): Promise<any> {
    const { data, error } = await this.supabaseClient
      .from(table)
      .insert(record)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async update(table: string, id: any, updates: any): Promise<any | null> {
    // Only add updated_at if the table has that column
    // Note: notifications table doesn't have updated_at column in Supabase
    const tablesWithUpdatedAt = ['users', 'documents', 'videos', 'forum_posts', 'forum_comments', 'study_events', 'practice_sessions', 'ai_tutor_sessions', 'job_positions', 'job_applications'];
    const updateData = tablesWithUpdatedAt.includes(table) 
      ? { ...updates, updated_at: new Date().toISOString() }
      : updates;

    const { data, error } = await this.supabaseClient
      .from(table)
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    // PGRST116 means no rows found - return null instead of throwing
    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }
    return data;
  }

  async delete(table: string, id: any): Promise<boolean> {
    const { error } = await this.supabaseClient
      .from(table)
      .delete()
      .eq('id', id);

    if (error) throw error;
    return true;
  }

  async find(table: string, predicate: (record: any) => boolean): Promise<any[]> {
    const records = await this.get(table);
    return records.filter(predicate);
  }

  async findOne(table: string, predicate: (record: any) => boolean): Promise<any | null> {
    const records = await this.get(table);
    return records.find(predicate) || null;
  }
}

// Create database instances
export const db = new SupabaseDB();
export const dbAdmin = new SupabaseDB(true);

// Export Supabase clients for direct use
export { supabase, supabaseAdmin };

// PostgreSQL-compatible query interface using Supabase
export const query = async (text: string, params: any[] = []): Promise<{ rows: any[]; rowCount: number }> => {
  try {
    const sql = text.toLowerCase().trim();

    // Use Supabase RPC for complex queries or direct table access for simple ones
    if (sql.includes('select') && sql.includes('from users')) {
      let query = supabase.from('users').select('*');

      // Parse WHERE conditions
      if (sql.includes('where email = $1')) {
        query = query.eq('email', params[0]);
      } else if (sql.includes('where id = $1')) {
        query = query.eq('id', params[0]);
      }

      // Handle bookmarks aggregation if requested
      if (sql.includes('bookmarks')) {
        const { data: users, error: usersError } = await query;
        if (usersError) throw usersError;

        // Get bookmarks for all users
        const { data: bookmarks, error: bookmarksError } = await supabaseAdmin
          .from('bookmarks')
          .select('*');

        if (bookmarksError) throw bookmarksError;

        // Get notifications for all users
        const { data: notifications, error: notificationsError } = await supabaseAdmin
          .from('notifications')
          .select('*')
          .order('created_at', { ascending: false });

        if (notificationsError) throw notificationsError;

        const selectedUsers = users.map(u => {
          const userBookmarks = bookmarks
            .filter(b => b.user_id === u.id)
            .map(b => b.item_id);

          const userNotifications = notifications
            .filter(n => n.user_id === u.id)
            .map(n => ({
              id: n.id,
              title: n.title,
              message: n.message,
              type: n.type,
              isRead: n.is_read,
              date: n.created_at
            }));

          return {
            id: u.id,
            name: u.name,
            email: u.email,
            password_hash: u.password_hash,
            role: u.role,
            is_premium: u.is_premium,
            avatar: u.avatar,
            preferences: u.preferences,
            xp: u.xp,
            level: u.level,
            streak: u.streak,
            last_active_date: u.last_active_date,
            unlocked_badges: u.unlocked_badges,
            practice_attempts: u.practice_attempts,
            created_at: u.created_at,
            updated_at: u.updated_at,
            bookmarks: userBookmarks,
            notifications: userNotifications
          };
        });

        // Filter by specific user ID if requested
        if (sql.includes('where u.id = $1')) {
          const targetUserId = params[0];
          const filteredUsers = selectedUsers.filter(u => u.id === targetUserId);
          return { rows: filteredUsers, rowCount: filteredUsers.length };
        }

        return { rows: selectedUsers, rowCount: selectedUsers.length };
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { rows: data || [], rowCount: count || 0 };
    }

    if (sql.includes('insert into users')) {
      const userData: any = {
        name: params[0],
        email: params[1],
        password_hash: params[2],
        role: 'STUDENT',
        preferences: { emailNotifications: true, studyReminders: true },
        unlocked_badges: ['b1'],
        is_premium: false,
        xp: 0,
        level: 1,
        streak: 0,
        practice_attempts: 0
      };

      // Handle OAuth registration with additional fields
      if (params[3]) userData.google_id = params[3]; // google_id
      if (params[4]) userData.avatar = params[4]; // avatar

      const { data, error } = await supabase
        .from('users')
        .insert(userData)
        .select()
        .single();

      if (error) throw error;
      return { rows: [data], rowCount: 1 };
    }

    // Handle password updates specifically (only password_hash, no status)
    if (sql.includes('update users') && sql.includes('password_hash = $1') && !sql.includes('status = $')) {
      const updates: any = {
        password_hash: params[0],
        updated_at: new Date().toISOString()
      };

      const userId = params[1];

      const { data, error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();

      if (error) throw error;
      return { rows: data ? [data] : [], rowCount: data ? 1 : 0 };
    }

    if (sql.includes('update users')) {
      const updates: any = {};

      // Parse SET clause - handle multiple assignments
      const setMatch = sql.match(/set\s+(.*?)\s+where/i);
      if (setMatch && setMatch[1]) {
        const assignments = setMatch[1].split(',').map(a => a.trim());
        assignments.forEach((assignment) => {
          const [column, value] = assignment.split('=').map(s => s.trim());
          if (column) {
            // Check if this is a parameter placeholder (e.g., $1, $2)
            if (value && value.match(/^\$\d+$/)) {
              const placeholderIndex = parseInt(value.substring(1)) - 1;
              if (params[placeholderIndex] !== undefined) {
                updates[column] = params[placeholderIndex];
              }
            } else if (value === 'true') {
              // Handle boolean true
              updates[column] = true;
            } else if (value === 'false') {
              // Handle boolean false
              updates[column] = false;
            } else if (value === 'CURRENT_TIMESTAMP' || value === 'NOW()') {
              // Handle SQL functions
              updates[column] = new Date().toISOString();
            }
          }
        });
      }

      // Extract the parameter number from WHERE id = $X
      const whereMatch = sql.match(/where\s+id\s*=\s*\$(\d+)/i);
      if (whereMatch && whereMatch[1]) {
        const whereParamIndex = parseInt(whereMatch[1]) - 1;
        const id = params[whereParamIndex];

        // Check if query has RETURNING clause - if not, don't use .single()
        const hasReturning = sql.includes('RETURNING');
        
        if (hasReturning) {
          // Query expects to return data
          const { data, error } = await supabase
            .from('users')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

          if (error) throw error;
          return { rows: data ? [data] : [], rowCount: data ? 1 : 0 };
        } else {
          // Query doesn't return data, just update
          const { data, error, count } = await supabase
            .from('users')
            .update(updates)
            .eq('id', id)
            .select();

          if (error) throw error;
          // Return empty rows but indicate success if count > 0
          return { rows: data || [], rowCount: count || 0 };
        }
      }
    }

    // Handle notifications queries
    if (sql.includes('insert into notifications')) {
      const notification = {
        user_id: params[0],
        title: params[1],
        message: params[2],
        type: params[3],
        is_read: params[4] || false
      };

      const { data, error } = await supabase
        .from('notifications')
        .insert(notification)
        .select()
        .single();

      if (error) throw error;
      return { rows: [data], rowCount: 1 };
    }

    // Handle documents queries
    if (sql.includes('select') && sql.includes('from documents')) {
      let query = supabase.from('documents').select('*');

      if (sql.includes('where id = $1')) {
        query = query.eq('id', params[0]);
      } else {
        // Handle complex filtering (similar to videos)
        // Premium filtering - only show premium content to premium users
        if (sql.includes('is_premium = $1')) {
          query = query.eq('is_premium', params[0]);
        }
        if (sql.includes('subject = $')) {
          const subjectIndex = sql.indexOf('subject = $') + 11;
          const paramIndex = parseInt(sql.charAt(subjectIndex)) - 1;
          query = query.eq('subject', params[paramIndex]);
        }
        if (sql.includes('grade = $')) {
          const gradeIndex = sql.indexOf('grade = $') + 9;
          const paramIndex = parseInt(sql.charAt(gradeIndex)) - 1;
          query = query.eq('grade', params[paramIndex]);
        }
        if (sql.includes('ILIKE')) {
          const searchIndex = sql.indexOf('ILIKE $') + 7;
          const paramIndex = parseInt(sql.charAt(searchIndex)) - 1;
          const searchTerm = params[paramIndex].replace(/%/g, '');
          query = query.or(`title.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%,author.ilike.%${searchTerm}%`);
        }
        // Handle tag filtering - include documents with specific tag
        // Check for pattern: $X = ANY(tags) where X is the parameter number
        // Match can be anywhere in the WHERE clause, not just at the start
        const tagMatch = sql.match(/\$(\d+)\s*=\s*ANY\(tags\)/);
        if (tagMatch && tagMatch[1] && !sql.includes('NOT')) {
          const tagParamIndex = parseInt(tagMatch[1]) - 1;
          if (params[tagParamIndex] !== undefined) {
            const tagValue = params[tagParamIndex];
            // Supabase: use filter with cs (contains) operator for array contains check
            // The value must be in Postgres array format: '{"value"}'
            query = query.filter('tags', 'cs', `{"${tagValue}"}`);
          }
        }
        // Handle excludeTag filtering - exclude documents with specific tag
        // Check for pattern: NOT ($X = ANY(tags)) - can appear anywhere in WHERE clause
        const excludeTagMatch = sql.match(/NOT\s*\(\s*\$(\d+)\s*=\s*ANY\(tags\)\s*\)/);
        if (excludeTagMatch && excludeTagMatch[1]) {
          const excludeTagParamIndex = parseInt(excludeTagMatch[1]) - 1;
          if (params[excludeTagParamIndex] !== undefined) {
            const excludeTagValue = params[excludeTagParamIndex];
            // Supabase: use .not() method with 'cs' operator to exclude documents containing the tag
            // The value must be in Postgres array format: '{"value"}'
            query = query.not('tags', 'cs', `{"${excludeTagValue}"}`);
          }
        }
        // Handle IN clause for bookmarks
        if (sql.includes('id IN (')) {
          // Extract parameter indices for IN clause
          const inMatch = sql.match(/id IN \(([^)]+)\)/);
          if (inMatch && inMatch[1]) {
            const placeholders = inMatch[1].split(',').map((p: string) => p.trim());
            const ids = placeholders.map((p: string) => {
              const paramMatch = p.match(/\$(\d+)/);
              if (paramMatch && paramMatch[1]) {
                return params[parseInt(paramMatch[1]) - 1];
              }
              return null;
            }).filter((id: any) => id !== null);
            if (ids.length > 0) {
              query = query.in('id', ids);
            }
          }
        }
        // Handle WHERE 1 = 0 (no results condition)
        if (sql.includes('WHERE 1 = 0')) {
          query = query.eq('id', '00000000-0000-0000-0000-000000000000'); // Non-existent ID to return empty
        }
      }

      // Handle ORDER BY
      if (sql.includes('order by')) {
        if (sql.includes('order by created_at desc')) {
          query = query.order('created_at', { ascending: false });
        } else if (sql.includes('order by downloads desc')) {
          query = query.order('downloads', { ascending: false });
        } else if (sql.includes('order by title asc')) {
          query = query.order('title', { ascending: true });
        }
      }

      // Handle LIMIT and OFFSET
      if (sql.includes('LIMIT $')) {
        const limitMatch = sql.match(/LIMIT \$(\d+)/);
        if (limitMatch && limitMatch[1]) {
          const limitParamIndex = parseInt(limitMatch[1]) - 1;
          query = query.limit(params[limitParamIndex]);
        }
      }
      if (sql.includes('OFFSET $')) {
        const offsetMatch = sql.match(/OFFSET \$(\d+)/);
        if (offsetMatch && offsetMatch[1]) {
          const offsetParamIndex = parseInt(offsetMatch[1]) - 1;
          const limitMatch = sql.match(/LIMIT \$(\d+)/);
          const limitValue = limitMatch && limitMatch[1] ? params[parseInt(limitMatch[1]) - 1] || 20 : 20;
          query = query.range(params[offsetParamIndex], params[offsetParamIndex] + limitValue - 1);
        }
      }

      const { data, error } = await query;
      if (error) throw error;
      
      // Client-side filtering fallback for excludeTag (in case Supabase filter doesn't work)
      let filteredData = data || [];
      const excludeTagMatch = sql.match(/NOT\s*\(\s*\$(\d+)\s*=\s*ANY\(tags\)\s*\)/);
      if (excludeTagMatch && excludeTagMatch[1]) {
        const excludeTagParamIndex = parseInt(excludeTagMatch[1]) - 1;
        if (params[excludeTagParamIndex] !== undefined) {
          const excludeTagValue = params[excludeTagParamIndex];
          // Filter out documents that contain the excluded tag
          filteredData = filteredData.filter((doc: any) => {
            if (!doc.tags || !Array.isArray(doc.tags)) return true; // Include docs with no tags
            return !doc.tags.includes(excludeTagValue);
          });
        }
      }
      
      return { rows: filteredData, rowCount: filteredData.length };
    }

    if (sql.includes('insert into documents')) {
      const documentData = {
        title: params[0],
        description: params[1],
        subject: params[2],
        grade: params[3],
        file_type: params[4],
        is_premium: params[5],
        author: params[6],
        tags: params[7] || [],
        uploaded_by: params[8],
        preview_image: params[9] || null
      };

      const { data, error } = await supabase
        .from('documents')
        .insert(documentData)
        .select()
        .single();

      if (error) throw error;
      return { rows: [data], rowCount: 1 };
    }

    if (sql.includes('update documents')) {
      if (sql.includes('downloads = downloads + 1')) {
        const { data, error } = await supabase.rpc('increment_document_downloads', {
          document_id: params[0]
        });
        if (error) throw error;
        return { rows: [], rowCount: 1 };
      }

      const id = params[params.length - 1];
      const updates: any = {};

      const setMatch = sql.match(/SET\s+(.*?)\s+WHERE/i);
      if (setMatch && setMatch[1]) {
        const assignments = setMatch[1].split(',').map(a => a.trim());
        assignments.forEach((assignment, index) => {
          const [field] = assignment.split('=').map(s => s.trim());
          if (field && index < params.length - 1) {
            updates[field] = params[index];
          }
        });
      }

      const { data, error } = await supabaseAdmin
        .from('documents')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      // PGRST116 means no rows found - return empty result instead of throwing
      if (error) {
        if (error.code === 'PGRST116') {
          return { rows: [], rowCount: 0 };
        }
        throw error;
      }

      if (data) {
        return {
          rows: [{
            id: data.id,
            title: data.title,
            description: data.description,
            subject: data.subject,
            grade: data.grade,
            file_type: data.file_type,
            file_size: data.file_size,
            file_url: data.file_url,
            is_premium: data.is_premium,
            downloads: data.downloads || 0,
            preview_image: data.preview_image,
            tags: data.tags,
            author: data.author,
            created_at: data.created_at,
            updated_at: data.updated_at
          }],
          rowCount: 1
        };
      }
      return { rows: [], rowCount: 0 };
    }

    if (sql.includes('delete from documents')) {
      const { data, error } = await supabaseAdmin
        .from('documents')
        .delete()
        .eq('id', params[0])
        .select();

      if (error) throw error;
      return { rows: [], rowCount: data && data.length > 0 ? data.length : 0 };
    }

    // Handle COUNT queries first (before specific table handlers)
    if (sql.includes('select count(*)') || sql.includes('select COUNT(*)')) {
      const tableMatch = sql.match(/from\s+(\w+)/i);
      if (tableMatch && tableMatch[1]) {
        const tableName = tableMatch[1];

        let query = supabase.from(tableName).select('*', { count: 'exact', head: true });

        // Handle WHERE conditions for COUNT queries
        if (sql.includes('where video_id = $1') && tableName === 'video_likes') {
          query = supabase.from(tableName).select('*', { count: 'exact', head: true }).eq('video_id', params[0]);
        }

        // Handle documents table COUNT queries with tag filtering
        if (tableName === 'documents') {
          // Premium filtering
          if (sql.includes('is_premium = $1')) {
            query = query.eq('is_premium', params[0]);
          }
          // Subject filtering
          if (sql.includes('subject = $')) {
            const subjectIndex = sql.indexOf('subject = $') + 11;
            const paramIndex = parseInt(sql.charAt(subjectIndex)) - 1;
            if (params[paramIndex] !== undefined) {
              query = query.eq('subject', params[paramIndex]);
            }
          }
          // Grade filtering
          if (sql.includes('grade = $')) {
            const gradeIndex = sql.indexOf('grade = $') + 9;
            const paramIndex = parseInt(sql.charAt(gradeIndex)) - 1;
            if (params[paramIndex] !== undefined) {
              query = query.eq('grade', params[paramIndex]);
            }
          }
          // Search filtering
          if (sql.includes('ILIKE')) {
            const searchIndex = sql.indexOf('ILIKE $') + 7;
            const paramIndex = parseInt(sql.charAt(searchIndex)) - 1;
            if (params[paramIndex] !== undefined) {
              const searchTerm = params[paramIndex].replace(/%/g, '');
              query = query.or(`title.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%,author.ilike.%${searchTerm}%`);
            }
          }
          // Tag filtering - include documents with specific tag
          const tagMatch = sql.match(/\$(\d+)\s*=\s*ANY\(tags\)/);
          if (tagMatch && tagMatch[1] && !sql.includes('NOT')) {
            const tagParamIndex = parseInt(tagMatch[1]) - 1;
            if (params[tagParamIndex] !== undefined) {
              const tagValue = params[tagParamIndex];
              // Supabase: use filter with cs (contains) operator for array contains check
              // The value must be in Postgres array format: '{"value"}'
              query = query.filter('tags', 'cs', `{"${tagValue}"}`);
            }
          }
          // ExcludeTag filtering - exclude documents with specific tag
          const excludeTagMatch = sql.match(/NOT\s*\(\s*\$(\d+)\s*=\s*ANY\(tags\)\s*\)/);
          if (excludeTagMatch && excludeTagMatch[1]) {
            const excludeTagParamIndex = parseInt(excludeTagMatch[1]) - 1;
            if (params[excludeTagParamIndex] !== undefined) {
              const excludeTagValue = params[excludeTagParamIndex];
              // Supabase: use .not() method with 'cs' operator to exclude documents containing the tag
              // The value must be in Postgres array format: '{"value"}'
              query = query.not('tags', 'cs', `{"${excludeTagValue}"}`);
            }
          }
          // Handle IN clause for bookmarks
          if (sql.includes('id IN (')) {
            const inMatch = sql.match(/id IN \(([^)]+)\)/);
            if (inMatch && inMatch[1]) {
              const placeholders = inMatch[1].split(',').map((p: string) => p.trim());
              const ids = placeholders.map((p: string) => {
                const paramMatch = p.match(/\$(\d+)/);
                if (paramMatch && paramMatch[1]) {
                  return params[parseInt(paramMatch[1]) - 1];
                }
                return null;
              }).filter((id: any) => id !== null);
              if (ids.length > 0) {
                query = query.in('id', ids);
              }
            }
          }
          // Handle WHERE 1 = 0 (no results condition)
          if (sql.includes('WHERE 1 = 0')) {
            query = query.eq('id', '00000000-0000-0000-0000-000000000000'); // Non-existent ID to return empty
          }
        }

        const { count, error } = await query;
        if (error) throw error;

        // Return count result in expected format - COUNT always returns 1 row
        const totalCount = typeof count === 'number' ? count : 0;
        // For documents table, return as 'total', for others return as 'like_count'
        if (tableName === 'documents') {
          return { rows: [{ total: totalCount.toString() }], rowCount: 1 };
        }
        return { rows: [{ like_count: totalCount }], rowCount: 1 };
      }
    }

    // Handle video_likes queries
    if (sql.includes('select') && sql.includes('from video_likes')) {
      let query = supabase.from('video_likes').select('*');

      if (sql.includes('where user_id = $1') && sql.includes('video_id = $2')) {
        query = query.eq('user_id', params[0]).eq('video_id', params[1]);
      }
      if (sql.includes('where video_id = $1')) {
        query = query.eq('video_id', params[0]);
      }

      const { data, error } = await query;
      if (error) throw error;
      return { rows: data || [], rowCount: data?.length || 0 };
    }

    if (sql.includes('insert into video_likes')) {
      const likeData = {
        user_id: params[0],
        video_id: params[1]
      };

      const { data, error } = await supabase
        .from('video_likes')
        .upsert(likeData, { onConflict: 'user_id,video_id' })
        .select()
        .single();

      if (error) throw error;
      return { rows: [data], rowCount: 1 };
    }

    if (sql.includes('delete from video_likes')) {
      let query = supabase.from('video_likes').delete();

      if (sql.includes('user_id = $1') && sql.includes('video_id = $2')) {
        query = query.eq('user_id', params[0]).eq('video_id', params[1]);
      }

      const { error } = await query;
      if (error) throw error;
      return { rows: [], rowCount: 1 };
    }

    // Handle video_completions queries
    if (sql.includes('select') && sql.includes('from video_completions')) {
      let query = supabase.from('video_completions').select('*');

      if (sql.includes('where user_id = $1') && sql.includes('video_id = $2')) {
        query = query.eq('user_id', params[0]).eq('video_id', params[1]);
      }

      const { data, error } = await query;
      if (error) throw error;
      return { rows: data || [], rowCount: data?.length || 0 };
    }

    if (sql.includes('insert into video_completions')) {
      const completionData = {
        user_id: params[0],
        video_id: params[1],
        xp_awarded: params[2]
      };

      const { data, error } = await supabase
        .from('video_completions')
        .upsert(completionData, { onConflict: 'user_id,video_id' })
        .select()
        .single();

      if (error) throw error;
      return { rows: [data], rowCount: 1 };
    }

    if (sql.includes('delete from video_completions')) {
      let query = supabase.from('video_completions').delete();

      if (sql.includes('user_id = $1') && sql.includes('video_id = $2')) {
        query = query.eq('user_id', params[0]).eq('video_id', params[1]);
      }

      const { error } = await query;
      if (error) throw error;
      return { rows: [], rowCount: 1 };
    }

    // Handle videos queries
    if (sql.includes('select') && sql.includes('from videos')) {
      let query = supabase.from('videos').select('*');

      if (sql.includes('where id = $1')) {
        query = query.eq('id', params[0]);
      } else {
        // Handle complex filtering
        // Extract all parameter indices first to understand the structure
        const paramMap = new Map<string, number>();
        
        // Premium filtering - only show premium content to premium users
        if (sql.includes('is_premium = $1')) {
          query = query.eq('is_premium', params[0]);
          paramMap.set('is_premium', 0);
        }
        
        // Subject filter
        const subjectMatch = sql.match(/subject\s*=\s*\$(\d+)/);
        if (subjectMatch && subjectMatch[1]) {
          const paramIndex = parseInt(subjectMatch[1]) - 1;
          if (params[paramIndex] !== undefined) {
            query = query.eq('subject', params[paramIndex]);
          }
        }
        
        // Grade filter
        const gradeMatch = sql.match(/grade\s*=\s*\$(\d+)/);
        if (gradeMatch && gradeMatch[1]) {
          const paramIndex = parseInt(gradeMatch[1]) - 1;
          if (params[paramIndex] !== undefined) {
            query = query.eq('grade', params[paramIndex]);
          }
        }
        
        // Search filter - find first ILIKE parameter and extract search term
        if (sql.includes('ILIKE')) {
          const ilikePattern = /ILIKE\s+\$(\d+)/;
          const firstMatch = sql.match(ilikePattern);
          if (firstMatch && firstMatch[1]) {
            const paramIndex = parseInt(firstMatch[1]) - 1;
            if (params[paramIndex] !== undefined) {
              const rawTerm = String(params[paramIndex]);
              const searchTerm = rawTerm.replace(/%/g, '').trim();
              if (searchTerm) {
                // Use PostgREST syntax for OR with ILIKE
                // Format: column.operator.value,column2.operator.value
                // The .or() method combines with previous .eq() filters using AND logic
                const orFilter = `title.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%,instructor.ilike.%${searchTerm}%`;
                query = query.or(orFilter);
              }
            }
          }
        }
      }

      // Handle ORDER BY
      if (sql.includes('order by')) {
        if (sql.includes('order by created_at desc')) {
          query = query.order('created_at', { ascending: false });
        } else if (sql.includes('order by views desc')) {
          query = query.order('views', { ascending: false });
        } else if (sql.includes('order by title asc')) {
          query = query.order('title', { ascending: true });
        }
      }

      const { data, error } = await query;
      if (error) throw error;

      const selectedVideos = data.map(v => ({
        id: v.id,
        title: v.title,
        description: v.description,
        subject: v.subject,
        grade: v.grade,
        thumbnail: v.thumbnail,
        video_url: v.video_url,
        instructor: v.instructor,
        views: v.views || 0,
        likes: v.likes || 0,
        uploadedAt: v.created_at,
        isPremium: v.is_premium,
        uploaded_by: v.uploaded_by,
        created_at: v.created_at,
        updated_at: v.updated_at
      }));

      return { rows: selectedVideos, rowCount: selectedVideos.length };
    }

    if (sql.includes('insert into videos')) {
      const videoData = {
        title: params[0],
        description: params[1],
        subject: params[2],
        grade: params[3],
        video_url: params[4],
        instructor: params[5],
        thumbnail: params[6],
        is_premium: params[7],
        uploaded_by: params[8]
      };

      const { data, error } = await supabaseAdmin
        .from('videos')
        .insert(videoData)
        .select()
        .single();

      if (error) throw error;
      return { rows: [data], rowCount: 1 };
    }

    if (sql.includes('update videos')) {
      if (sql.includes('views = views + 1')) {
        const { data, error } = await supabase.rpc('increment_video_views', {
          video_id: params[0]
        });
        if (error) throw error;
        return { rows: [], rowCount: 1 };
      }

      if (sql.includes('likes = likes + 1')) {
        const { data, error } = await supabase.rpc('increment_video_likes', {
          video_id: params[0]
        });
        if (error) throw error;
        return { rows: [], rowCount: 1 };
      }

      if (sql.includes('likes = GREATEST(likes - 1, 0)')) {
        const { data, error } = await supabase.rpc('decrement_video_likes', {
          video_id: params[0]
        });
        if (error) throw error;
        return { rows: [], rowCount: 1 };
      }

      const id = params[params.length - 1];
      const updates: any = {};

      const setMatch = sql.match(/SET\s+(.*?)\s+WHERE/i);
      if (setMatch && setMatch[1]) {
        const assignments = setMatch[1].split(',').map(a => a.trim());
        assignments.forEach((assignment, index) => {
          const [field] = assignment.split('=').map(s => s.trim());
          if (field && index < params.length - 1) {
            updates[field] = params[index];
          }
        });
      }

      const { data, error } = await supabaseAdmin
        .from('videos')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      if (data) {
        return {
          rows: [{
            id: data.id,
            title: data.title,
            description: data.description,
            subject: data.subject,
            grade: data.grade,
            thumbnail: data.thumbnail,
            video_url: data.video_url,
            instructor: data.instructor,
            views: data.views || 0,
            likes: data.likes || 0,
            is_premium: data.is_premium,
            uploaded_by: data.uploaded_by,
            created_at: data.created_at,
            updated_at: data.updated_at
          }],
          rowCount: 1
        };
      }
      return { rows: [], rowCount: 0 };
    }

    if (sql.includes('delete from videos')) {
      const { data, error } = await supabaseAdmin
        .from('videos')
        .delete()
        .eq('id', params[0])
        .select();

      if (error) throw error;
      return { rows: [], rowCount: data && data.length > 0 ? data.length : 0 };
    }

    // Handle forum posts queries
    if (sql.includes('select') && sql.includes('from forum_posts')) {
      let query = supabase.from('forum_posts').select('*');

      if (sql.includes('where id = $1')) {
        query = query.eq('id', params[0]);
      }

      const { data: posts, error: postsError } = await query;
      if (postsError) throw postsError;

      // Handle JOIN with users for author info
      if (sql.includes('join users')) {
        const { data: users, error: usersError } = await supabase
          .from('users')
          .select('id, name, role, avatar');

        if (usersError) throw usersError;

        const { data: comments, error: commentsError } = await supabase
          .from('forum_comments')
          .select('post_id');

        if (commentsError) throw commentsError;

        const postsWithAuthors = posts.map(post => {
          const author = users.find(u => u.id === post.author_id);
          const commentCount = comments.filter(c => c.post_id === post.id).length;

          return {
            ...post,
            author: author?.name,
            author_role: author?.role,
            author_avatar: author?.avatar,
            comment_count: commentCount
          };
        });

        return { rows: postsWithAuthors, rowCount: postsWithAuthors.length };
      }

      return { rows: posts || [], rowCount: posts?.length || 0 };
    }

    if (sql.includes('insert into forum_posts')) {
      const postData = {
        title: params[0],
        content: params[1],
        author_id: params[2],
        subject: params[3],
        grade: params[4],
        tags: params[5]
      };

      const { data, error } = await supabase
        .from('forum_posts')
        .insert(postData)
        .select()
        .single();

      if (error) throw error;
      return { rows: [data], rowCount: 1 };
    }

    if (sql.includes('update forum_posts')) {
      if (sql.includes('views = views + 1')) {
        const { data, error } = await supabase.rpc('increment_post_views', {
          post_id: params[0]
        });
        if (error) throw error;
        return { rows: [], rowCount: 1 };
      }

      if (sql.includes('votes = votes + 1')) {
        const { data, error } = await supabase.rpc('increment_post_votes', {
          post_id: params[0]
        });
        if (error) throw error;
        return { rows: [], rowCount: 1 };
      }

      if (sql.includes('votes = GREATEST(votes - 1, 0)')) {
        const { data, error } = await supabase.rpc('decrement_post_votes', {
          post_id: params[0]
        });
        if (error) throw error;
        return { rows: [], rowCount: 1 };
      }

      const id = params[params.length - 1];
      const updates: any = {};

      const setMatch = sql.match(/set\s+(.*?)\s+where/i);
      if (setMatch && setMatch[1]) {
        const setClause = setMatch[1];
        const assignments = setClause.split(',').map(a => a.trim());

        assignments.forEach((assignment, index) => {
          const [column, value] = assignment.split('=').map(s => s.trim());
          if (column && params[index] !== undefined) {
            if (value === '$' + (index + 1)) {
              updates[column] = params[index];
            }
          }
        });

        if (sql.includes('is_solved = $1')) {
          updates.is_solved = params[0];
        }
        if (sql.includes('updated_at = CURRENT_TIMESTAMP')) {
          updates.updated_at = new Date().toISOString();
        }
      }

      const { data, error } = await supabase
        .from('forum_posts')
        .update(updates)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return { rows: data ? [data] : [], rowCount: data ? 1 : 0 };
    }

    if (sql.includes('delete from forum_posts')) {
      const { error } = await supabase
        .from('forum_posts')
        .delete()
        .eq('id', params[0]);

      if (error) throw error;
      return { rows: [], rowCount: 1 };
    }

    // Handle users update queries
    if (sql.includes('update users')) {
      const updates: any = {};

      if (sql.includes('is_premium = $1')) {
        updates.is_premium = params[0];
      }
      if (sql.includes('is_premium = true')) {
        updates.is_premium = true;
      }
      if (sql.includes('password_hash = $1')) {
        updates.password_hash = params[0];
      }
      if (sql.includes('updated_at = CURRENT_TIMESTAMP')) {
        updates.updated_at = new Date().toISOString();
      }

      const userId = params[params.length - 1]; // Last parameter is usually the WHERE id

      const { data, error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();

      if (error) throw error;
      return { rows: data ? [data] : [], rowCount: data ? 1 : 0 };
    }

    // Handle forum comments queries
    if (sql.includes('select') && sql.includes('from forum_comments')) {
      let query = supabase.from('forum_comments').select('*');

      if (sql.includes('where id = $1')) {
        query = query.eq('id', params[0]);
      }
      if (sql.includes('where post_id = $1')) {
        query = query.eq('post_id', params[0]);
      }

      const { data: comments, error: commentsError } = await query;
      if (commentsError) throw commentsError;

      if (sql.includes('join users')) {
        const { data: users, error: usersError } = await supabase
          .from('users')
          .select('id, name, role, avatar');

        if (usersError) throw usersError;

        const commentsWithAuthors = comments.map(comment => {
          const author = users.find(u => u.id === comment.author_id);
          return {
            ...comment,
            author: author?.name,
            author_role: author?.role,
            author_avatar: author?.avatar
          };
        });

        return { rows: commentsWithAuthors, rowCount: commentsWithAuthors.length };
      }

      return { rows: comments || [], rowCount: comments?.length || 0 };
    }

    if (sql.includes('insert into forum_comments')) {
      const commentData = {
        post_id: params[0],
        author_id: params[1],
        content: params[2]
      };

      const { data, error } = await supabase
        .from('forum_comments')
        .insert(commentData)
        .select()
        .single();

      if (error) throw error;
      return { rows: [data], rowCount: 1 };
    }

    // Handle users update queries
    if (sql.includes('update users')) {
      const updates: any = {};

      if (sql.includes('last_active_date = $1')) {
        updates.last_active_date = params[0];
      }
      if (sql.includes('streak = $2')) {
        updates.streak = params[1];
      }
      if (sql.includes('updated_at = CURRENT_TIMESTAMP')) {
        updates.updated_at = new Date().toISOString();
      }

      const userId = params[2]; // WHERE id = $3

      const { data, error } = await supabase
        .from('users')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();

      if (error) throw error;
      return { rows: data ? [data] : [], rowCount: data ? 1 : 0 };
    }

    if (sql.includes('update forum_comments')) {
      if (sql.includes('votes = votes + 1')) {
        const { data, error } = await supabase.rpc('increment_comment_votes', {
          comment_id: params[0]
        });
        if (error) throw error;
        return { rows: [], rowCount: 1 };
      }

      if (sql.includes('votes = GREATEST(votes - 1, 0)')) {
        const { data, error } = await supabase.rpc('decrement_comment_votes', {
          comment_id: params[0]
        });
        if (error) throw error;
        return { rows: [], rowCount: 1 };
      }

      if (sql.includes('is_accepted = true')) {
        const { data, error } = await supabase.rpc('accept_comment', {
          comment_id: params[0]
        });
        if (error) throw error;
        return { rows: [], rowCount: 1 };
      }

      if (sql.includes('is_accepted = false')) {
        const { data, error } = await supabase.rpc('unaccept_comments', {
          post_id: params[0]
        });
        if (error) throw error;
        return { rows: [], rowCount: data?.length || 0 };
      }

      const id = params[1];
      const content = params[0];
      const { data, error } = await supabase
        .from('forum_comments')
        .update({
          content,
          is_edited: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return { rows: data ? [data] : [], rowCount: data ? 1 : 0 };
    }

    // Handle forum votes queries
    if (sql.includes('select') && sql.includes('from forum_votes')) {
      let query = supabase.from('forum_votes').select('*');

      if (sql.includes('where user_id = $1') && sql.includes('target_type = $2') && sql.includes('target_id = $3')) {
        query = query.eq('user_id', params[0]).eq('target_type', params[1]).eq('target_id', params[2]);
      }

      const { data, error } = await query;
      if (error) throw error;
      return { rows: data || [], rowCount: data?.length || 0 };
    }

    if (sql.includes('insert into forum_votes')) {
      const voteData = {
        user_id: params[0],
        target_type: params[1],
        target_id: params[2],
        vote_value: params[3]
      };

      const { data, error } = await supabase
        .from('forum_votes')
        .upsert(voteData, { onConflict: 'user_id,target_type,target_id' })
        .select()
        .single();

      if (error) throw error;
      return { rows: [data], rowCount: 1 };
    }

    if (sql.includes('delete from forum_votes')) {
      const { error } = await supabase
        .from('forum_votes')
        .delete()
        .eq('user_id', params[0])
        .eq('target_type', params[1])
        .eq('target_id', params[2]);

      if (error) throw error;
      return { rows: [], rowCount: 1 };
    }

    // Handle forum views queries
    if (sql.includes('select') && sql.includes('from forum_views')) {
      let query = supabase.from('forum_views').select('*');

      if (sql.includes('where user_id = $1') && sql.includes('post_id = $2')) {
        query = query.eq('user_id', params[0]).eq('post_id', params[1]);
      }

      const { data, error } = await query;
      if (error) throw error;
      return { rows: data || [], rowCount: data?.length || 0 };
    }

    if (sql.includes('insert into forum_views')) {
      const viewData = {
        user_id: params[0],
        post_id: params[1]
      };

      const { data, error } = await supabase
        .from('forum_views')
        .upsert(viewData, { onConflict: 'user_id,post_id' })
        .select()
        .single();

      if (error) throw error;
      return { rows: [data], rowCount: 1 };
    }

    if (sql.includes('delete from forum_comments')) {
      const { error } = await supabase
        .from('forum_comments')
        .delete()
        .eq('id', params[0]);

      if (error) throw error;
      return { rows: [], rowCount: 1 };
    }

    // Handle study_events queries
    if (sql.includes('select') && sql.includes('from study_events')) {
      let query = supabase.from('study_events').select('*');

      if (sql.includes('where user_id = $1')) {
        query = query.eq('user_id', params[0]);

        if (sql.includes('event_date = $2')) {
          query = query.eq('event_date', params[1]);
        }
      }

      const { data, error } = await query;
      if (error) throw error;

      return { rows: data || [], rowCount: data?.length || 0 };
    }

    if (sql.includes('insert into study_events')) {
      const eventData = {
        user_id: params[0],
        title: params[1],
        subject: params[2],
        event_date: params[3],
        event_type: params[4],
        is_completed: params[5] || false,
        notes: params[6] || ''
      };

      const { data, error } = await supabase
        .from('study_events')
        .insert(eventData)
        .select()
        .single();

      if (error) throw error;
      return { rows: [data], rowCount: 1 };
    }

    if (sql.includes('update study_events')) {
      const updates: any = {};

      if (sql.includes('is_completed = $1')) {
        updates.is_completed = params[0];
      }
      if (sql.includes('notes = $2')) {
        updates.notes = params[1];
      }
      if (sql.includes('title = $3')) {
        updates.title = params[2];
      }
      if (sql.includes('subject = $4')) {
        updates.subject = params[3];
      }
      if (sql.includes('event_type = $5')) {
        updates.event_type = params[4];
      }

      const eventId = params[params.length - 1];

      const { data, error } = await supabase
        .from('study_events')
        .update(updates)
        .eq('id', eventId)
        .select()
        .single();

      if (error) throw error;
      return { rows: data ? [data] : [], rowCount: data ? 1 : 0 };
    }

    if (sql.includes('delete from study_events')) {
      const { error } = await supabase
        .from('study_events')
        .delete()
        .eq('id', params[0]);

      if (error) throw error;
      return { rows: [], rowCount: 1 };
    }

    // Handle bookmarks queries
    if (sql.includes('select') && sql.includes('from bookmarks')) {
      let query = supabase.from('bookmarks').select('*');

      if (sql.includes('where user_id = $1')) {
        query = query.eq('user_id', params[0]);

        if (sql.includes('item_id = $2') && sql.includes('item_type = $3')) {
          query = query.eq('item_id', params[1]).eq('item_type', params[2]);
        }
      }

      const { data: bookmarks, error: bookmarksError } = await query;
      if (bookmarksError) throw bookmarksError;

      if (sql.includes('left join documents') || sql.includes('left join videos')) {
        const { data: documents, error: docsError } = await supabase
          .from('documents')
          .select('*');

        const { data: videos, error: videosError } = await supabase
          .from('videos')
          .select('*');

        if (docsError) throw docsError;
        if (videosError) throw videosError;

        const bookmarksWithItems = bookmarks.map(bookmark => {
          let item = null;

          if (bookmark.item_type === 'document') {
            item = documents.find(d => d.id.toString() === bookmark.item_id);
            if (item) {
              item = {
                id: item.id,
                title: item.title,
                subject: item.subject,
                grade: item.grade,
                file_type: item.file_type,
                is_premium: item.is_premium,
                preview_image: item.preview_image,
                author: item.author
              };
            }
          } else if (bookmark.item_type === 'video') {
            item = videos.find(v => v.id.toString() === bookmark.item_id);
            if (item) {
              item = {
                id: item.id,
                title: item.title,
                subject: item.subject,
                grade: item.grade,
                thumbnail: item.thumbnail,
                instructor: item.instructor,
                is_premium: item.is_premium
              };
            }
          }

          return {
            id: bookmark.id,
            item_id: bookmark.item_id,
            item_type: bookmark.item_type,
            created_at: bookmark.created_at,
            item: item
          };
        });

        return { rows: bookmarksWithItems, rowCount: bookmarksWithItems.length };
      }

      return { rows: bookmarks || [], rowCount: bookmarks?.length || 0 };
    }

    if (sql.includes('insert into bookmarks')) {
      const bookmarkData = {
        user_id: params[0],
        item_id: params[1],
        item_type: params[2]
      };

      const { data, error } = await supabaseAdmin
        .from('bookmarks')
        .upsert(bookmarkData, { onConflict: 'user_id,item_id,item_type' })
        .select()
        .single();

      if (error) throw error;
      return { rows: [data], rowCount: 1 };
    }

    if (sql.includes('delete from bookmarks')) {
      const { error } = await supabaseAdmin
        .from('bookmarks')
        .delete()
        .eq('user_id', params[0])
        .eq('item_id', params[1])
        .eq('item_type', params[2]);

      if (error) throw error;
      return { rows: [], rowCount: 1 };
    }

    // Handle tokens table queries
    if (sql.includes('insert into tokens')) {
      const tokenData = {
        token: params[0],
        user_id: params[1],
        type: params[2],
        expires_at: params[3]
      };

      const { data, error } = await supabaseAdmin
        .from('tokens')
        .insert(tokenData)
        .select()
        .single();

      if (error) throw error;
      return { rows: [data], rowCount: 1 };
    }

    if (sql.includes('select') && sql.includes('from tokens')) {
      let query = supabaseAdmin.from('tokens').select('*');

      // Handle WHERE token = $1
      if (sql.includes('where token = $1')) {
        query = query.eq('token', params[0]);
      }

      // Handle WHERE token = $1 AND type = $2
      if (sql.includes('where token = $1') && sql.includes('type = $2')) {
        query = query.eq('token', params[0]).eq('type', params[1]);
      }

      const { data, error } = await query;
      if (error) throw error;
      return { rows: data || [], rowCount: data?.length || 0 };
    }

    if (sql.includes('update tokens')) {
      const updates: any = {};

      // Handle SET used_at = CURRENT_TIMESTAMP WHERE token = $1
      if (sql.includes('used_at = CURRENT_TIMESTAMP')) {
        updates.used_at = new Date().toISOString();
      }

      // Extract token from WHERE clause
      const whereMatch = sql.match(/where\s+token\s*=\s*\$(\d+)/i);
      if (whereMatch && whereMatch[1]) {
        const tokenParamIndex = parseInt(whereMatch[1]) - 1;
        const token = params[tokenParamIndex];

        // Update without .single() since we don't need to return the row
        const { error, count } = await supabaseAdmin
          .from('tokens')
          .update(updates)
          .eq('token', token);

        if (error) throw error;
        // Return empty rows but indicate success if count > 0
        return { rows: [], rowCount: count || 0 };
      }
    }

    // Default response for unsupported queries
    console.log('Supabase query executed:', text, params);
    return { rows: [], rowCount: 0 };
  } catch (error) {
    console.error('Query error:', error, text, params);
    throw error;
  }
};

export const getClient = async () => {
  // Return a Supabase-compatible client for transactions
  return {
    query: query,
    release: () => {}
  };
};

console.log('📊 Using Supabase for development');
