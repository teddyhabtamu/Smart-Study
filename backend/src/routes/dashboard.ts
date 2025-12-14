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



    // Use bookmarks from user profile and get details
    const recentBookmarks = [];
    if (user.bookmarks && user.bookmarks.length > 0) {
      // For each bookmark, try to find it as a document first, then as a video
      // Show up to 12 most recent bookmarks
      for (const bookmarkId of user.bookmarks.slice(0, 12)) {
        let itemResult = null;
        let itemType = null;

        // Try to find as document first
        const docResult = await query(`
          SELECT id, title, subject, grade, preview_image as "previewImage", is_premium as "isPremium"
          FROM documents
          WHERE id = $1
        `, [bookmarkId]);

        if (docResult.rows.length > 0) {
          itemResult = docResult;
          itemType = 'document';
        } else {
          // Try to find as video
          const videoResult = await query(`
            SELECT id, title, subject, grade, thumbnail as "previewImage", is_premium as "isPremium"
            FROM videos
            WHERE id = $1
          `, [bookmarkId]);

          if (videoResult.rows.length > 0) {
            itemResult = videoResult;
            itemType = 'video';
          }
        }

        if (itemResult && itemType) {
          const item = itemResult.rows[0];
          recentBookmarks.push({
            id: bookmarkId,
            type: itemType,
            title: item.title,
            subject: item.subject,
            grade: item.grade,
            previewImage: item.previewImage,
            isPremium: item.isPremium
          });
        }
      }
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
