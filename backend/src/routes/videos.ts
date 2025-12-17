import express from 'express';
import { body, query } from 'express-validator';
import { query as dbQuery, dbAdmin, supabaseAdmin } from '../database/config';
import { authenticateToken, requirePremium, validateRequest, optionalAuth } from '../middleware/auth';
import { ApiResponse, Video, User } from '../types';
import { EmailService } from '../services/emailService';
import { NotificationService } from '../services/notificationService';
import { createHash } from 'crypto';

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
    let orderByField = 'created_at';
    let orderByAsc = false;
    if (sort === 'popular') {
      orderByField = 'views';
      orderByAsc = false;
    } else if (sort === 'title') {
      orderByField = 'title';
      orderByAsc = true;
    }

    // Use Supabase directly for better search support
    let query = supabaseAdmin
      .from('videos')
      .select('id, title, description, subject, grade, thumbnail, video_url, instructor, views, likes, is_premium, uploaded_by, created_at, updated_at');

    // Apply filters
    if (!isPremium) {
      query = query.eq('is_premium', false);
    }

    if (subject) {
      query = query.eq('subject', subject);
    }

    if (grade) {
      query = query.eq('grade', parseInt(grade));
    }

    // Apply search filter using OR logic
    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%,instructor.ilike.%${search}%`);
    }

    // Apply sorting
    query = query.order(orderByField, { ascending: orderByAsc });

    // Execute query
    const { data: videosData, error: videosError } = await query;

    if (videosError) {
      console.error('Error fetching videos:', videosError);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch videos'
      } as ApiResponse);
      return;
    }

    let videos = (videosData || []).map((v: any) => ({
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
      // Return both shapes for backward/forward compatibility across clients
      isPremium: v.is_premium,
      is_premium: v.is_premium,
      uploaded_by: v.uploaded_by,
      created_at: v.created_at,
      updated_at: v.updated_at
    }));

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

    // IMPORTANT:
    // Use the Supabase *admin* client for video fetches. In production, Row Level Security (RLS)
    // can prevent the anon client from selecting premium rows, which would incorrectly return 404
    // even for authenticated premium users.
    if (!supabaseAdmin) {
      res.status(500).json({
        success: false,
        message: 'Server misconfiguration: Supabase admin client not available'
      } as ApiResponse);
      return;
    }

    const { data: videoRow, error: videoErr } = await supabaseAdmin
      .from('videos')
      .select('id, title, description, subject, grade, thumbnail, video_url, instructor, views, likes, is_premium, uploaded_by, created_at, updated_at')
      .eq('id', id)
      .maybeSingle();

    if (videoErr) {
      console.error('Get video error: failed to load video:', videoErr);
      res.status(500).json({
        success: false,
        message: 'Failed to get video'
      } as ApiResponse);
      return;
    }

    if (!videoRow) {
      res.status(404).json({
        success: false,
        message: 'Video not found'
      } as ApiResponse);
      return;
    }

    // Normalize the response shape for the watch page (expects snake_case `is_premium`)
    let video: any = {
      ...videoRow,
      views: videoRow.views || 0,
      likes: videoRow.likes || 0,
      uploadedAt: videoRow.created_at,
      // Include camelCase too for compatibility with any consumers that expect it
      isPremium: videoRow.is_premium
    };

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
      // Use admin client to avoid RLS issues in server-side context
      const [{ data: likeRow, error: likeErr }, { data: completionRow, error: completionErr }] = await Promise.all([
        supabaseAdmin
          .from('video_likes')
          .select('id')
          .eq('user_id', userId)
          .eq('video_id', id)
          .limit(1)
          .maybeSingle(),
        supabaseAdmin
          .from('video_completions')
          .select('id')
          .eq('user_id', userId)
          .eq('video_id', id)
          .limit(1)
          .maybeSingle()
      ]);

      if (likeErr) console.warn('Get video: failed to check like status:', likeErr);
      if (completionErr) console.warn('Get video: failed to check completion status:', completionErr);

      video = {
        ...video,
        user_has_liked: !!likeRow,
        user_has_completed: !!completionRow
      };
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
router.post('/:id/view', optionalAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const isPremiumUser = req.user?.is_premium || false;

    if (!supabaseAdmin) {
      res.status(500).json({
        success: false,
        message: 'Server misconfiguration: Supabase admin client not available'
      } as ApiResponse);
      return;
    }

    // Check if video exists and user has access
    const { data: videoRow, error: videoErr } = await supabaseAdmin
      .from('videos')
      .select('id, is_premium, views')
      .eq('id', id)
      .maybeSingle();

    if (videoErr) {
      console.error('Record view: failed to load video:', videoErr);
      res.status(500).json({
        success: false,
        message: 'Failed to record view'
      } as ApiResponse);
      return;
    }

    if (!videoRow) {
      res.status(404).json({
        success: false,
        message: 'Video not found'
      } as ApiResponse);
      return;
    }

    const video = videoRow;

    // Check premium access
    if (video.is_premium && !isPremiumUser) {
      res.status(403).json({
        success: false,
        message: 'Premium subscription required'
      } as ApiResponse);
      return;
    }

    // Count at most 1 view per viewer per video.
    // - Authenticated: 1 view per (user_id, video_id)
    // - Guest: 1 view per (viewer_hash, video_id) where viewer_hash is based on IP + User-Agent
    // If the video_views table is missing (migration not run), we gracefully fall back to counting normally.
    let shouldIncrement = true;

    try {
      // Ensure we have admin client for tracking insert/select
      if (!supabaseAdmin) {
        throw new Error('Supabase admin client not configured');
      }

      if (userId) {
        const { data: existing, error: existingErr } = await supabaseAdmin
          .from('video_views')
          .select('id')
          .eq('video_id', id)
          .eq('user_id', userId)
          .limit(1);

        if (existingErr) throw existingErr;

        if (existing && existing.length > 0) {
          shouldIncrement = false;
        } else {
          const { error: insertErr } = await supabaseAdmin
            .from('video_views')
            .insert({ video_id: id, user_id: userId });
          if (insertErr) {
            // If a duplicate slips through due to race conditions, treat as already-viewed
            const msg = String((insertErr as any)?.message || insertErr);
            if (msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('unique')) {
              shouldIncrement = false;
            } else {
              throw insertErr;
            }
          }
        }
      } else {
        const forwardedFor = req.headers['x-forwarded-for'];
        const ip = (() => {
          if (typeof forwardedFor === 'string') {
            const first = forwardedFor.split(',').shift();
            return (first ?? '').trim() || req.ip || 'unknown';
          }
          return req.ip || 'unknown';
        })();
        const ua = String(req.headers['user-agent'] || 'unknown');
        const viewerHash = createHash('sha256').update(`${ip}|${ua}`).digest('hex');

        const { data: existing, error: existingErr } = await supabaseAdmin
          .from('video_views')
          .select('id')
          .eq('video_id', id)
          .eq('viewer_hash', viewerHash)
          .limit(1);

        if (existingErr) throw existingErr;

        if (existing && existing.length > 0) {
          shouldIncrement = false;
        } else {
          const { error: insertErr } = await supabaseAdmin
            .from('video_views')
            .insert({ video_id: id, viewer_hash: viewerHash });
          if (insertErr) {
            const msg = String((insertErr as any)?.message || insertErr);
            if (msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('unique')) {
              shouldIncrement = false;
            } else {
              throw insertErr;
            }
          }
        }
      }
    } catch (trackErr: any) {
      // If tracking fails (e.g., table doesn't exist), fall back to normal increment.
      console.warn('View tracking unavailable; falling back to normal counting:', trackErr?.message || trackErr);
      shouldIncrement = true;
    }

    // IMPORTANT: keep `videos.views` consistent with unique views.
    // We compute the unique view count from `video_views` and store it in `videos.views`.
    // This also fixes older inconsistent data where `video_views` had rows but `videos.views` stayed 0/null.
    const { count: uniqueCount, error: countErr } = await supabaseAdmin
      .from('video_views')
      .select('*', { count: 'exact', head: true })
      .eq('video_id', id);

    if (countErr) {
      console.error('Record view: failed to count unique views:', countErr);
      res.status(500).json({
        success: false,
        message: 'Failed to record view'
      } as ApiResponse);
      return;
    }

    const updatedViews = uniqueCount ?? (video.views ?? 0);

    // Sync the denormalized counter for fast listing
    const { error: syncErr } = await supabaseAdmin
      .from('videos')
      .update({ views: updatedViews })
      .eq('id', id);

    if (syncErr) {
      console.error('Record view: failed to sync views:', syncErr);
      // Do not fail the request; the count we return is still correct.
    }

    res.json({
      success: true,
      message: 'View recorded',
      data: { views: updatedViews }
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

    if (!supabaseAdmin) {
      res.status(500).json({
        success: false,
        message: 'Server misconfiguration: Supabase admin client not available'
      } as ApiResponse);
      return;
    }

    // Check if video exists and user has access (RLS-safe)
    const { data: videoRow, error: videoErr } = await supabaseAdmin
      .from('videos')
      .select('id, is_premium')
      .eq('id', id)
      .maybeSingle();

    if (videoErr) {
      console.error('Complete lesson: failed to load video:', videoErr);
      res.status(500).json({
        success: false,
        message: 'Failed to update lesson completion'
      } as ApiResponse);
      return;
    }

    if (!videoRow) {
      res.status(404).json({
        success: false,
        message: 'Video not found'
      } as ApiResponse);
      return;
    }

    // Premium gating (server-side)
    if (videoRow.is_premium && !req.user!.is_premium) {
      res.status(403).json({
        success: false,
        message: 'Premium subscription required'
      } as ApiResponse);
      return;
    }

    if (completed) {
      // Check if already completed to avoid duplicate XP
      const { data: existingCompletion, error: existingErr } = await supabaseAdmin
        .from('video_completions')
        .select('id')
        .eq('user_id', userId)
        .eq('video_id', id)
        .limit(1);

      if (existingErr) {
        console.error('Complete lesson: failed to check existing completion:', existingErr);
        res.status(500).json({
          success: false,
          message: 'Failed to update lesson completion'
        } as ApiResponse);
        return;
      }

      const isNewCompletion = !existingCompletion || existingCompletion.length === 0;

      // Mark as complete (idempotent)
      const { error: upsertErr } = await supabaseAdmin
        .from('video_completions')
        .upsert({ user_id: userId, video_id: id, xp_awarded: 100 }, { onConflict: 'user_id,video_id' });

      if (upsertErr) {
        console.error('Complete lesson: failed to upsert completion:', upsertErr);
        res.status(500).json({
          success: false,
          message: 'Failed to update lesson completion'
        } as ApiResponse);
        return;
      }
      
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
      const { error: delErr } = await supabaseAdmin
        .from('video_completions')
        .delete()
        .eq('user_id', userId)
        .eq('video_id', id);
      if (delErr) {
        console.error('Complete lesson: failed to delete completion:', delErr);
        res.status(500).json({
          success: false,
          message: 'Failed to update lesson completion'
        } as ApiResponse);
        return;
      }
    }

    // Get updated video with completion status
    const { data: updatedVideoRow, error: updatedErr } = await supabaseAdmin
      .from('videos')
      .select('id, title, description, subject, grade, thumbnail, video_url, instructor, views, likes, is_premium, uploaded_by, created_at, updated_at')
      .eq('id', id)
      .single();

    if (updatedErr) {
      console.error('Complete lesson: failed to load updated video:', updatedErr);
      res.status(500).json({
        success: false,
        message: 'Failed to update lesson completion'
      } as ApiResponse);
      return;
    }

    const { data: completionRow, error: completionErr } = await supabaseAdmin
      .from('video_completions')
      .select('id')
      .eq('user_id', userId)
      .eq('video_id', id)
      .limit(1)
      .maybeSingle();

    if (completionErr) {
      console.warn('Complete lesson: failed to check completion status:', completionErr);
    }

    const videoWithStatus: any = {
      ...updatedVideoRow,
      views: updatedVideoRow.views || 0,
      likes: updatedVideoRow.likes || 0,
      uploadedAt: updatedVideoRow.created_at,
      isPremium: updatedVideoRow.is_premium,
      user_has_completed: !!completionRow
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

    if (!supabaseAdmin) {
      res.status(500).json({
        success: false,
        message: 'Server misconfiguration: Supabase admin client not available'
      } as ApiResponse);
      return;
    }

    // Check if video exists and user has access (RLS-safe)
    const { data: videoRow, error: videoErr } = await supabaseAdmin
      .from('videos')
      .select('id, is_premium')
      .eq('id', id)
      .maybeSingle();

    if (videoErr) {
      console.error('Like video: failed to load video:', videoErr);
      res.status(500).json({
        success: false,
        message: 'Failed to like video'
      } as ApiResponse);
      return;
    }

    if (!videoRow) {
      res.status(404).json({
        success: false,
        message: 'Video not found'
      } as ApiResponse);
      return;
    }

    // Premium gating (server-side)
    if (videoRow.is_premium && !req.user!.is_premium) {
      res.status(403).json({
        success: false,
        message: 'Premium subscription required'
      } as ApiResponse);
      return;
    }

    if (liked) {
      // Add like (ignore if already exists due to unique constraint)
      const { error: likeErr } = await supabaseAdmin
        .from('video_likes')
        .upsert({ user_id: userId, video_id: id }, { onConflict: 'user_id,video_id' });
      if (likeErr) {
        console.error('Like video: failed to upsert like:', likeErr);
        res.status(500).json({
          success: false,
          message: 'Failed to like video'
        } as ApiResponse);
        return;
      }
    } else {
      // Remove like
      const { error: delErr } = await supabaseAdmin
        .from('video_likes')
        .delete()
        .eq('user_id', userId)
        .eq('video_id', id);
      if (delErr) {
        console.error('Like video: failed to delete like:', delErr);
        res.status(500).json({
          success: false,
          message: 'Failed to like video'
        } as ApiResponse);
        return;
      }
    }

    // Get updated like count
    const { count: likeCount, error: countErr } = await supabaseAdmin
      .from('video_likes')
      .select('*', { count: 'exact', head: true })
      .eq('video_id', id);

    if (countErr) {
      console.error('Like video: failed to count likes:', countErr);
      res.status(500).json({
        success: false,
        message: 'Failed to like video'
      } as ApiResponse);
      return;
    }

    const safeLikeCount = likeCount ?? 0;

    // Update video likes count
    const { error: updErr } = await supabaseAdmin
      .from('videos')
      .update({ likes: safeLikeCount, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (updErr) {
      console.error('Like video: failed to update likes counter:', updErr);
      res.status(500).json({
        success: false,
        message: 'Failed to like video'
      } as ApiResponse);
      return;
    }

    // Get updated video
    const { data: updatedVideoRow, error: loadErr } = await supabaseAdmin
      .from('videos')
      .select('id, title, description, subject, grade, thumbnail, video_url, instructor, views, likes, is_premium, uploaded_by, created_at, updated_at')
      .eq('id', id)
      .single();

    if (loadErr) {
      console.error('Like video: failed to load updated video:', loadErr);
      res.status(500).json({
        success: false,
        message: 'Failed to like video'
      } as ApiResponse);
      return;
    }

    res.json({
      success: true,
      data: {
        ...updatedVideoRow,
        views: updatedVideoRow.views || 0,
        likes: updatedVideoRow.likes || 0,
        uploadedAt: updatedVideoRow.created_at,
        isPremium: updatedVideoRow.is_premium
      },
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

    // Notify users about new video (in-app notification only, no emails)
    if (newVideo && newVideo.id) {
      console.log('🔔 Triggering new video notification for users (in-app only)');
      NotificationService.notifyUsersAboutNewResources(is_premium).catch(error => {
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
