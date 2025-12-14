import express from 'express';
import { body, query } from 'express-validator';
import { query as dbQuery, dbAdmin } from '../database/config';
import { authenticateToken, requirePremium, validateRequest, optionalAuth } from '../middleware/auth';
import { ApiResponse, Video, User } from '../types';
import { EmailService } from '../services/emailService';

const router = express.Router();

// Get all videos with optional filtering
router.get('/', optionalAuth, [
  query('subject').optional().isString(),
  query('grade').optional().custom((value) => {
    if (value === undefined || value === null) return true;
    const grade = parseInt(value);
    if (grade === 0 || (grade >= 9 && grade <= 12)) {
      return true;
    }
    throw new Error('Grade must be 0 (General), 9, 10, 11, or 12');
  }),
  query('search').optional().isString(),
  query('bookmarked').optional().isBoolean(),
  query('sort').optional().isIn(['newest', 'popular', 'title']).withMessage('Sort must be newest, popular, or title'),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('offset').optional().isInt({ min: 0 }).toInt()
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const subject = req.query.subject as string;
    const grade = req.query.grade as string;
    const search = req.query.search as string;
    const bookmarked = req.query.bookmarked as string;
    const sort = req.query.sort as string || 'newest';
    const limit = Number(req.query.limit) || 20;
    const offset = Number(req.query.offset) || 0;

    // User info is optional (for authenticated users)
    const userId = req.user?.id;
    const isPremium = req.user?.is_premium || false;

    // Build query conditions
    let conditions = [];
    let params: any[] = [];
    let paramCount = 1;

    // Only show premium content to premium users
    if (!isPremium) {
      conditions.push(`is_premium = $${paramCount++}`);
      params.push(false);
    }

    if (subject) {
      conditions.push(`subject = $${paramCount++}`);
      params.push(subject);
    }

    if (grade) {
      conditions.push(`grade = $${paramCount++}`);
      params.push(parseInt(grade as string));
    }

    if (search) {
      conditions.push(`(title ILIKE $${paramCount++} OR description ILIKE $${paramCount++} OR instructor ILIKE $${paramCount++})`);
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Handle bookmarked filter separately (client-side filtering since it's user-specific)
    let bookmarkedVideoIds: string[] = [];
    if (bookmarked === 'true') {
      if (!userId) {
        // Unauthenticated users can't have bookmarks
        bookmarkedVideoIds = [];
      } else {
        // Get user's bookmarks
        const userResult = await dbQuery('SELECT bookmarks FROM users WHERE id = $1', [userId]);
        if (userResult.rows.length > 0) {
          bookmarkedVideoIds = userResult.rows[0].bookmarks || [];
        }
      }
    }

    // Determine sort order
    let orderBy = 'created_at DESC'; // default: newest
    if (sort === 'popular') {
      orderBy = 'views DESC';
    } else if (sort === 'title') {
      orderBy = 'title ASC';
    }

    // Get videos
    const videosResult = await dbQuery(`
      SELECT id, title, description, subject, grade, thumbnail, video_url,
             instructor, views, likes, is_premium, uploaded_by, created_at, updated_at
      FROM videos
      ${whereClause}
      ORDER BY ${orderBy}
    `, params);

    let videos = videosResult.rows;

    // Apply bookmarked filter if requested
    if (bookmarked === 'true') {
      videos = videos.filter(video => bookmarkedVideoIds.includes(video.id));
    }

    // Apply pagination after filtering
    const startIndex = Number(offset) || 0;
    const limitNum = Number(limit) || 20;
    const paginatedVideos = videos.slice(startIndex, startIndex + limitNum);

    // Get total count for pagination (after filtering)
    const total = videos.length;

    res.json({
      success: true,
      data: {
        videos: paginatedVideos,
        pagination: {
          total,
          limit: Number(limit),
          offset: Number(offset),
          hasMore: offset + paginatedVideos.length < total
        }
      }
    } as ApiResponse);
  } catch (error) {
    console.error('Get videos error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get videos'
    } as ApiResponse);
  }
});

// Get video by ID
router.get('/:id', optionalAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const isPremium = req.user?.is_premium || false;

    const result = await dbQuery(`
      SELECT id, title, description, subject, grade, thumbnail, video_url,
             instructor, views, likes, is_premium, uploaded_by, created_at, updated_at
      FROM videos WHERE id::text = $1
    `, [id]);

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Video not found'
      } as ApiResponse);
      return;
    }

    let video = result.rows[0];

    // Check premium access
    if (video.is_premium && !isPremium) {
      res.status(403).json({
        success: false,
        message: 'Premium subscription required'
      } as ApiResponse);
      return;
    }

    // Check if user has liked this video and completed it
    if (userId) {
      const likeResult = await dbQuery(
        'SELECT id FROM video_likes WHERE user_id = $1 AND video_id = $2',
        [userId, id]
      );
      video = { ...video, user_has_liked: likeResult.rows.length > 0 };

      const completionResult = await dbQuery(
        'SELECT id FROM video_completions WHERE user_id = $1 AND video_id = $2',
        [userId, id]
      );
      video = { ...video, user_has_completed: completionResult.rows.length > 0 };
    } else {
      video = { ...video, user_has_liked: false, user_has_completed: false };
    }

    res.json({
      success: true,
      data: video
    } as ApiResponse<Video>);
  } catch (error) {
    console.error('Get video error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get video'
    } as ApiResponse);
  }
});

// Increment video views
router.post('/:id/view', authenticateToken, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const isPremium = req.user!.is_premium;

    // Check if video exists and user has access
    const videoResult = await dbQuery(
      'SELECT is_premium FROM videos WHERE id = $1',
      [id]
    );

    if (videoResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Video not found'
      } as ApiResponse);
      return;
    }

    const video = videoResult.rows[0];

    // Check premium access
    if (video.is_premium && !isPremium) {
      res.status(403).json({
        success: false,
        message: 'Premium subscription required'
      } as ApiResponse);
      return;
    }

    // Increment view count
    await dbQuery(
      'UPDATE videos SET views = views + 1 WHERE id = $1',
      [id]
    );

    res.json({
      success: true,
      message: 'View recorded'
    } as ApiResponse);
  } catch (error) {
    console.error('Record view error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record view'
    } as ApiResponse);
  }
});

// Mark video lesson as complete/incomplete
router.post('/:id/complete', authenticateToken, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const { completed } = req.body; // true to complete, false to mark incomplete

    // Check if video exists
    const videoCheck = await dbQuery('SELECT id FROM videos WHERE id = $1', [id]);
    if (videoCheck.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Video not found'
      } as ApiResponse);
      return;
    }

    if (completed) {
      // Check if already completed to avoid duplicate XP
      const existingCompletion = await dbQuery(
        'SELECT id FROM video_completions WHERE user_id = $1 AND video_id = $2',
        [userId, id]
      );
      
      const isNewCompletion = existingCompletion.rows.length === 0;
      
      // Mark as complete (ignore if already exists due to unique constraint)
      await dbQuery(
        'INSERT INTO video_completions (user_id, video_id, xp_awarded) VALUES ($1, $2, $3) ON CONFLICT (user_id, video_id) DO NOTHING',
        [userId, id, 100]
      );
      
      // Record XP history only if this is a new completion
      // Note: XP is also awarded via frontend gainXP call, but we record it here too for tracking
      if (isNewCompletion) {
        try {
          await dbAdmin.insert('xp_history', {
            user_id: userId,
            amount: 100,
            source: 'video',
            source_id: id,
            description: 'Completed video lesson'
          });
        } catch (xpError) {
          console.error('Failed to record video completion XP history:', xpError);
          // Don't fail the request if XP history recording fails
        }
      }
    } else {
      // Mark as incomplete (remove completion)
      await dbQuery(
        'DELETE FROM video_completions WHERE user_id = $1 AND video_id = $2',
        [userId, id]
      );
    }

    // Get updated video with completion status
    const updatedVideo = await dbQuery(
      'SELECT id, title, description, subject, grade, thumbnail, video_url, instructor, views, likes, is_premium, uploaded_by, created_at, updated_at FROM videos WHERE id = $1',
      [id]
    );

    // Check completion status
    const completionCheck = await dbQuery(
      'SELECT id FROM video_completions WHERE user_id = $1 AND video_id = $2',
      [userId, id]
    );

    const videoWithStatus = {
      ...updatedVideo.rows[0],
      user_has_completed: completionCheck.rows.length > 0
    };

    res.json({
      success: true,
      data: videoWithStatus,
      message: completed ? 'Lesson marked as complete' : 'Lesson marked as incomplete'
    } as ApiResponse<Video>);
  } catch (error) {
    console.error('Complete lesson error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update lesson completion'
    } as ApiResponse);
  }
});

// Like/unlike video
router.post('/:id/like', authenticateToken, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const { liked } = req.body; // true to like, false to unlike

    // Check if video exists
    const videoCheck = await dbQuery('SELECT id FROM videos WHERE id = $1', [id]);
    if (videoCheck.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Video not found'
      } as ApiResponse);
      return;
    }

    if (liked) {
      // Add like (ignore if already exists due to unique constraint)
      await dbQuery(
        'INSERT INTO video_likes (user_id, video_id) VALUES ($1, $2) ON CONFLICT (user_id, video_id) DO NOTHING',
        [userId, id]
      );
    } else {
      // Remove like
      await dbQuery(
        'DELETE FROM video_likes WHERE user_id = $1 AND video_id = $2',
        [userId, id]
      );
    }

    // Get updated like count
    const likeCountResult = await dbQuery(
      'SELECT COUNT(*) as like_count FROM video_likes WHERE video_id = $1',
      [id]
    );

    const likeCount = likeCountResult.rows.length > 0 ? parseInt(likeCountResult.rows[0].like_count) : 0;

    // Update video likes count
    await dbQuery(
      'UPDATE videos SET likes = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [likeCount, id]
    );

    // Get updated video
    const updatedVideo = await dbQuery(
      'SELECT id, title, description, subject, grade, thumbnail, video_url, instructor, views, likes, is_premium, uploaded_by, created_at, updated_at FROM videos WHERE id = $1',
      [id]
    );

    res.json({
      success: true,
      data: updatedVideo.rows[0],
      message: liked ? 'Video liked' : 'Video unliked'
    } as ApiResponse<Video>);
  } catch (error) {
    console.error('Like video error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to like video'
    } as ApiResponse);
  }
});

// Create video (Admin only)
router.post('/', [
  authenticateToken,
  requirePremium,
  body('title').trim().isLength({ min: 1, max: 500 }).withMessage('Title is required'),
  body('description').optional().trim().isLength({ max: 2000 }),
  body('subject').isIn(['Mathematics', 'English', 'History', 'Chemistry', 'Physics', 'Biology', 'Aptitude']).withMessage('Valid subject required'),
  body('grade').isInt({ min: 9, max: 12 }).withMessage('Grade must be between 9 and 12'),
  body('video_url').isURL().withMessage('Valid video URL required'),
  body('duration').optional().matches(/^(\d{1,2}:)?\d{1,2}:\d{2}$/).withMessage('Duration must be in format MM:SS or HH:MM:SS'),
  body('instructor').optional().trim().isLength({ max: 255 }),
  body('thumbnail').optional().isURL(),
  body('is_premium').optional().isBoolean()
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { title, description, subject, grade, video_url, instructor, thumbnail, is_premium = false } = req.body;
    const uploaded_by = req.user!.id;

    const result = await dbQuery(`
      INSERT INTO videos (title, description, subject, grade, video_url, instructor, thumbnail, is_premium, uploaded_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, title, description, subject, grade, thumbnail, video_url, instructor, views, likes, is_premium, uploaded_by, created_at, updated_at
    `, [title, description, subject, grade, video_url, instructor, thumbnail, is_premium, uploaded_by]);

    const newVideo = result.rows[0];

    // Notify users about new video (non-blocking)
    if (newVideo && newVideo.id) {
      console.log('📧 Triggering new video notification for users');
      EmailService.notifyUsersAboutNewVideo(
        newVideo.id,
        title,
        subject,
        grade,
        instructor,
        description,
        is_premium
      ).catch(error => {
        console.error('❌ Failed to notify users about new video:', error);
        // Don't fail the request if notification fails
      });
    }

    res.status(201).json({
      success: true,
      data: newVideo,
      message: 'Video created successfully'
    } as ApiResponse<Video>);
  } catch (error) {
    console.error('Create video error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create video'
    } as ApiResponse);
  }
});

// Update video (Admin, Moderator, or Premium)
router.put('/:id', [
  authenticateToken,
  body('title').optional().trim().isLength({ min: 1, max: 500 }),
  body('description').optional().trim().isLength({ max: 2000 }),
  body('subject').optional().isIn(['Mathematics', 'English', 'History', 'Chemistry', 'Physics', 'Biology', 'Aptitude']),
  body('grade').optional().custom((value) => {
    if (value === undefined || value === null) return true;
    const grade = parseInt(value);
    if (grade === 0 || (grade >= 9 && grade <= 12)) {
      return true;
    }
    throw new Error('Grade must be 0 (General), 9, 10, 11, or 12');
  }),
  body('video_url').optional().isURL(),
  body('duration').optional().matches(/^(\d{1,2}:)?\d{1,2}:\d{2}$/),
  body('instructor').optional().trim().isLength({ max: 255 }),
  body('thumbnail').optional().isURL(),
  body('is_premium').optional().isBoolean()
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    // Check if user is admin, moderator, or premium
    if (req.user!.role !== 'ADMIN' && req.user!.role !== 'MODERATOR' && !req.user!.is_premium) {
      res.status(403).json({
        success: false,
        message: 'Admin, moderator, or premium subscription required to update videos'
      } as ApiResponse);
      return;
    }

    const { id } = req.params;
    const updates = req.body;

    // Build update query dynamically
    const updateFields: string[] = [];
    const params: any[] = [];
    let paramCount = 1;

    Object.keys(updates).forEach(key => {
      if (updates[key] !== undefined) {
        updateFields.push(`${key} = $${paramCount++}`);
        params.push(updates[key]);
      }
    });

    if (updateFields.length === 0) {
      res.status(400).json({
        success: false,
        message: 'No valid fields to update'
      } as ApiResponse);
      return;
    }

    params.push(id);

    const result = await dbQuery(`
      UPDATE videos
      SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount}
      RETURNING id, title, description, subject, grade, thumbnail, video_url, instructor, views, likes, is_premium, uploaded_by, created_at, updated_at
    `, params);

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Video not found'
      } as ApiResponse);
      return;
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Video updated successfully'
    } as ApiResponse<Video>);
  } catch (error) {
    console.error('Update video error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update video'
    } as ApiResponse);
  }
});

// Delete video (Admin or Moderator only)
router.delete('/:id', authenticateToken, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    // Check if user is admin or moderator
    if (req.user!.role !== 'ADMIN' && req.user!.role !== 'MODERATOR') {
      res.status(403).json({
        success: false,
        message: 'Admin or moderator access required to delete videos'
      } as ApiResponse);
      return;
    }
    const { id } = req.params;

    const result = await dbQuery('DELETE FROM videos WHERE id = $1', [id]);

    if (result.rowCount === 0) {
      res.status(404).json({
        success: false,
        message: 'Video not found'
      } as ApiResponse);
      return;
    }

    res.json({
      success: true,
      message: 'Video deleted successfully'
    } as ApiResponse);
  } catch (error) {
    console.error('Delete video error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete video'
    } as ApiResponse);
  }
});

export default router;
