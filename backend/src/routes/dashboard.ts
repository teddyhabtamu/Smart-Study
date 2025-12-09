import express from 'express';
import { query } from '../database/config';
import { authenticateToken } from '../middleware/auth';
import { ApiResponse, User } from '../types';

const router = express.Router();

// Get dashboard data for authenticated user
router.get('/', authenticateToken, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    // Get today's date in YYYY-MM-DD format (UTC to avoid timezone issues)
    const today = new Date();
    const todayStr = today.getUTCFullYear() + '-' +
      String(today.getUTCMonth() + 1).padStart(2, '0') + '-' +
      String(today.getUTCDate()).padStart(2, '0');

    // Get user profile with bookmarks
    const userResult = await query(`
      SELECT u.id, u.name, u.xp, u.level, u.streak, u.is_premium,
             COALESCE(array_agg(b.item_id) FILTER (WHERE b.item_id IS NOT NULL), ARRAY[]::text[]) as bookmarks
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
      SELECT id, title, subject, event_type as type, is_completed as "isCompleted", notes, event_date
      FROM study_events
      WHERE user_id = $1 AND event_date = $2
      ORDER BY created_at ASC
    `, [userId, todayStr]);



    // Get recent bookmarks with item details (documents and videos)
    const bookmarksResult = await query(`
      SELECT
        b.item_id,
        b.item_type,
        CASE
          WHEN b.item_type = 'document' THEN
            json_build_object(
              'id', d.id,
              'title', d.title,
              'subject', d.subject,
              'grade', d.grade,
              'previewImage', d.preview_image,
              'isPremium', d.is_premium
            )
          WHEN b.item_type = 'video' THEN
            json_build_object(
              'id', v.id,
              'title', v.title,
              'subject', v.subject,
              'grade', v.grade,
              'thumbnail', v.thumbnail,
              'isPremium', v.is_premium
            )
        END as item
      FROM bookmarks b
      LEFT JOIN documents d ON b.item_type = 'document' AND b.item_id = d.id::text
      LEFT JOIN videos v ON b.item_type = 'video' AND b.item_id = v.id::text
      WHERE b.user_id = $1
      ORDER BY b.created_at DESC
      LIMIT 6
    `, [userId]);

    // Transform bookmarks data
    const recentBookmarks = bookmarksResult.rows.map(row => ({
      id: row.item_id,
      type: row.item_type,
      title: row.item?.title,
      subject: row.item?.subject,
      grade: row.item?.grade,
      previewImage: row.item_type === 'document' ? row.item?.previewImage : row.item?.thumbnail,
      isPremium: row.item?.isPremium
    })).filter(item => item.title); // Filter out any null items

    // Calculate today's progress
    const todaysEvents = todaysEventsResult.rows;
    const completedToday = todaysEvents.filter((e: any) => e.isCompleted).length;
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
