import express from 'express';
import { query } from '../database/config';
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



    // Get bookmarks with their item details — batched, not N+1.
    // Previously this looped up to 10 sequential REST calls (one per item);
    // now it's 1 ID lookup + 2 parallel IN queries.
    const recentBookmarks = [];

    try {
      const bmResult = await query(
        'SELECT item_id, item_type FROM bookmarks WHERE user_id = $1 ORDER BY created_at DESC LIMIT 10',
        [userId]
      );
      const bookmarks = bmResult.rows || [];

      const seenItemIds = new Set();
      const docIds: string[] = [];
      const videoIds: string[] = [];
      for (const b of bookmarks) {
        if (seenItemIds.has(b.item_id)) continue;
        seenItemIds.add(b.item_id);
        if (b.item_type === 'document') docIds.push(b.item_id);
        else if (b.item_type === 'video') videoIds.push(b.item_id);
      }

      const [docsResult, vidsResult] = await Promise.all([
        docIds.length > 0
          ? query('SELECT id, title, subject, grade, preview_image, is_premium FROM documents WHERE id = ANY($1)', [docIds])
          : Promise.resolve({ rows: [] }),
        videoIds.length > 0
          ? query('SELECT id, title, subject, grade, thumbnail, is_premium FROM videos WHERE id = ANY($1)', [videoIds])
          : Promise.resolve({ rows: [] }),
      ]);

      const docsById = new Map((docsResult.rows || []).map((d: any) => [String(d.id), d]));
      const vidsById = new Map((vidsResult.rows || []).map((v: any) => [String(v.id), v]));

      // Preserve recency order, max 5 existing items
      const emitted = new Set();
      for (const b of bookmarks) {
        if (recentBookmarks.length >= 5) break;
        const key = String(b.item_id);
        if (emitted.has(key)) continue;
        if (b.item_type === 'document' && docsById.has(key)) {
          const doc: any = docsById.get(key);
          emitted.add(key);
          recentBookmarks.push({
            id: doc.id,
            type: 'document',
            title: doc.title,
            subject: doc.subject,
            grade: doc.grade,
            previewImage: doc.preview_image,
            isPremium: doc.is_premium
          });
        } else if (b.item_type === 'video' && vidsById.has(key)) {
          const video: any = vidsById.get(key);
          emitted.add(key);
          recentBookmarks.push({
            id: video.id,
            type: 'video',
            title: video.title,
            subject: video.subject,
            grade: video.grade,
            previewImage: video.thumbnail,
            isPremium: video.is_premium
          });
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
      isArchived: e.is_archived || false,
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
