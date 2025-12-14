import express from 'express';
import { query, supabaseAdmin } from '../database/config';
import { authenticateToken } from '../middleware/auth';
import { ApiResponse, User } from '../types';

const router = express.Router();

// Get dashboard data for authenticated user
router.get('/', authenticateToken, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    // Get today's date - use client's date if provided (to handle timezone differences),
    // otherwise fall back to server's UTC date
    let todayStr: string;
    if (req.query.date && typeof req.query.date === 'string') {
      // Validate date format (YYYY-MM-DD)
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (dateRegex.test(req.query.date)) {
        todayStr = req.query.date;
      } else {
        // Invalid date format, use server date
        const today = new Date();
        todayStr = today.getFullYear() + '-' +
          String(today.getMonth() + 1).padStart(2, '0') + '-' +
          String(today.getDate()).padStart(2, '0');
      }
    } else {
      // No date provided, use server's UTC date
      const today = new Date();
      todayStr = today.getUTCFullYear() + '-' +
        String(today.getUTCMonth() + 1).padStart(2, '0') + '-' +
        String(today.getUTCDate()).padStart(2, '0');
    }

    // Get user profile with bookmarks (ordered by most recent first)
    const userResult = await query(`
      SELECT u.id, u.name, u.xp, u.level, u.streak, u.is_premium,
             COALESCE(array_agg(b.item_id ORDER BY b.created_at DESC) FILTER (WHERE b.item_id IS NOT NULL), ARRAY[]::text[]) as bookmarks
      FROM users u
      LEFT JOIN bookmarks b ON u.id = b.user_id
      WHERE u.id = $1
      GROUP BY u.id
    `, [userId]);

    if (userResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      } as ApiResponse);
      return;
    }

    const user = userResult.rows[0];

    // Get today's study events
    const todaysEventsResult = await query(`
      SELECT id, title, subject, event_type as type, is_completed, notes, event_date
      FROM study_events
      WHERE user_id = $1 AND event_date = $2
      ORDER BY created_at ASC
    `, [userId, todayStr]);



    // Get bookmarks with their item details - use Supabase directly for reliable ordering
    const recentBookmarks = [];
    const seenItemIds = new Set(); // Track which item IDs we've added to avoid duplicates
    
    try {
      // Get bookmarks directly from Supabase with proper ordering
      // Use admin client to bypass RLS if needed
      const { data: bookmarks, error: bookmarksError } = await supabaseAdmin
        .from('bookmarks')
        .select('item_id, item_type')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(10); // Get more than 5 to ensure we find 5 that exist
      
      if (bookmarksError) throw bookmarksError;
      
      if (bookmarks && bookmarks.length > 0) {
        // Process bookmarks in order (most recent first) until we have 5 unique items
        for (const bookmark of bookmarks) {
          if (recentBookmarks.length >= 5) break;
          
          const { item_id, item_type } = bookmark;
          
          // Skip if we've already added this item
          if (seenItemIds.has(item_id)) continue;
          
          let itemData = null;

          // Query the appropriate table based on item_type using Supabase directly
          if (item_type === 'document') {
            try {
              const { data: docs, error: docError } = await supabaseAdmin
                .from('documents')
                .select('id, title, subject, grade, preview_image, is_premium')
                .eq('id', item_id)
                .limit(1);
              
              if (!docError && docs && docs.length > 0) {
                const doc = docs[0];
                if (doc) {
                  itemData = {
                    id: doc.id,
                    type: 'document',
                    title: doc.title,
                    subject: doc.subject,
                    grade: doc.grade,
                    previewImage: doc.preview_image,
                    isPremium: doc.is_premium
                  };
                }
              }
            } catch (docError) {
              // Document not found, skip
            }
          } else if (item_type === 'video') {
            try {
              const { data: videos, error: videoError } = await supabaseAdmin
                .from('videos')
                .select('id, title, subject, grade, thumbnail, is_premium')
                .eq('id', item_id)
                .limit(1);
              
              if (!videoError && videos && videos.length > 0) {
                const video = videos[0];
                if (video) {
                  itemData = {
                    id: video.id,
                    type: 'video',
                    title: video.title,
                    subject: video.subject,
                    grade: video.grade,
                    previewImage: video.thumbnail,
                    isPremium: video.is_premium
                  };
                }
              }
            } catch (videoError) {
              // Video not found, skip
            }
          }

          // Add the item if found and unique
          if (itemData) {
            seenItemIds.add(itemData.id);
            recentBookmarks.push(itemData);
          }
        }
      }
    } catch (bookmarkError) {
      console.error('Error fetching bookmarks for dashboard:', bookmarkError);
      // Continue without bookmarks if there's an error
    }

    // Calculate today's progress
    // Transform events to match frontend format (is_completed -> isCompleted)
    const todaysEvents = todaysEventsResult.rows.map((e: any) => ({
      id: e.id,
      title: e.title,
      subject: e.subject,
      type: e.type || e.event_type,
      isCompleted: e.is_completed === true || e.is_completed === 'true',
      notes: e.notes,
      date: e.event_date
    }));
    
    const completedToday = todaysEvents.filter((e: any) => e.isCompleted === true).length;
    const totalToday = todaysEvents.length;
    const progressPercentage = totalToday === 0 ? 0 : Math.round((completedToday / totalToday) * 100);

    // Calculate level progress
    const currentLevelXP = (user.level - 1) * 1000;
    const nextLevelXP = user.level * 1000;
    const progressToNextLevel = Math.min(100, Math.round(((user.xp - currentLevelXP) / 1000) * 100));

    const dashboardData = {
      user: {
        id: user.id,
        name: user.name,
        xp: user.xp,
        level: user.level,
        streak: user.streak,
        isPremium: user.is_premium,
        bookmarks: user.bookmarks || []
      },
      todaysEvents: todaysEvents,
      recentBookmarks: recentBookmarks,
      progress: {
        todayCompleted: completedToday,
        todayTotal: totalToday,
        todayPercentage: progressPercentage,
        levelProgress: progressToNextLevel,
        xpToNextLevel: nextLevelXP - user.xp
      }
    };

    res.json({
      success: true,
      data: dashboardData
    } as ApiResponse);
  } catch (error) {
    console.error('Get dashboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get dashboard data'
    } as ApiResponse);
  }
});

export default router;
