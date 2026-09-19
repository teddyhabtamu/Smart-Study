import express from 'express';
import { body, query } from 'express-validator';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { dbAdmin, query as dbQuery } from '../database/config';
import { authenticateToken, requireRole, validateRequest } from '../middleware/auth';
import { config } from '../config';
import { ApiResponse, User, Document, Video, ForumPost } from '../types';
import { EmailService } from '../services/emailService';
import { NotificationService } from '../services/notificationService';
import { logAdminActivity } from '../services/adminAuditLog';
import { supabaseAdmin } from '../database/config';
import { CONTENT_SUBJECTS } from '../constants';

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

// Most routes require ADMIN or MODERATOR
// Some sensitive routes will have additional ADMIN-only restrictions

// Helper function to convert Google Drive sharing links to direct URLs
const convertGoogleDriveUrl = (url: string): string => {
  if (!url || !url.includes('drive.google.com')) {
    return url;
  }

  // Extract file ID from various Google Drive URL formats:
  // - https://drive.google.com/file/d/FILE_ID/view
  // - https://drive.google.com/open?id=FILE_ID
  // - https://drive.google.com/d/FILE_ID/
  // - https://drive.google.com/uc?id=FILE_ID
  let fileId: string | null = null;
  
  // Try different patterns
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9-_]+)/,           // /file/d/FILE_ID
    /\/d\/([a-zA-Z0-9-_]+)/,                  // /d/FILE_ID
    /[?&]id=([a-zA-Z0-9-_]+)/,                // ?id=FILE_ID or &id=FILE_ID
    /\/uc\?id=([a-zA-Z0-9-_]+)/               // /uc?id=FILE_ID
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      fileId = match[1];
      break;
    }
  }

  if (fileId) {
    // Convert to direct image URL that works in <img> tags
    // This format works for publicly shared images
    return `https://drive.google.com/uc?export=view&id=${fileId}`;
  }

  return url;
};

// Get recent activity
const getRecentActivity = async () => {
  // Bounded SQL throughout (was: three FULL-table fetches filtered in JS —
  // every admin dashboard view moved megabytes). Shapes below are
  // byte-identical to the old output.
  try {
    const [recentUsers, recentPremium, recentDocs, recentVids] = await Promise.all([
      dbQuery(
        `SELECT id, name, email, created_at FROM users
         WHERE created_at >= NOW() - INTERVAL '7 days'
         ORDER BY created_at DESC LIMIT 5`
      ),
      dbQuery(
        `SELECT id, name, email, COALESCE(premium_since, created_at) AS ts FROM users
         WHERE is_premium IS TRUE AND COALESCE(premium_since, created_at) >= NOW() - INTERVAL '7 days'
         ORDER BY ts DESC LIMIT 3`
      ),
      dbQuery(
        `SELECT id, title, created_at FROM documents
         WHERE created_at >= NOW() - INTERVAL '7 days'
         ORDER BY created_at DESC LIMIT 3`
      ),
      dbQuery(
        `SELECT id, title, created_at FROM videos
         WHERE created_at >= NOW() - INTERVAL '7 days'
         ORDER BY created_at DESC LIMIT 3`
      ),
    ]);

    const activities = [
      ...recentUsers.rows.map((u: any) => ({
        type: 'user_registration',
        message: `New user "${u.name || u.email}" joined`,
        timestamp: u.created_at,
        user: { id: u.id, name: u.name, email: u.email },
      })),
      ...recentPremium.rows.map((u: any) => ({
        type: 'premium_subscription',
        message: `User "${u.name || u.email}" upgraded to Premium`,
        timestamp: u.ts,
        user: { id: u.id, name: u.name, email: u.email },
      })),
      ...recentDocs.rows.map((d: any) => ({
        type: 'content_upload',
        message: `Document "${d.title}" was uploaded`,
        timestamp: d.created_at,
        content: { id: d.id, title: d.title, type: 'document' },
      })),
      ...recentVids.rows.map((v: any) => ({
        type: 'content_upload',
        message: `Video "${v.title}" was uploaded`,
        timestamp: v.created_at,
        content: { id: v.id, title: v.title, type: 'video' },
      })),
    ];

    // Sort by timestamp (most recent first)
    activities.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return activities.slice(0, 10); // Return top 10 most recent activities

  } catch (error) {
    console.error('Error fetching recent activity:', error);
    return [];
  }
};

// Get admin dashboard statistics (ADMIN and MODERATOR)
router.get('/stats', requireRole(['ADMIN', 'MODERATOR']), async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    // Single aggregate round trip (was: four FULL-table fetches counted in
    // JS — every admin dashboard view moved the whole users/documents/
    // videos/forum tables over the wire). Shape unchanged (COUNT arrives
    // as text — parsed, like the old .length numbers).
    const toCount = (v: any): number => parseInt(v ?? '0', 10) || 0;
    const counts = await dbQuery(
      `SELECT (SELECT COUNT(*) FROM users) AS total_users,
              (SELECT COUNT(*) FROM users WHERE is_premium IS TRUE) AS premium_users,
              (SELECT COUNT(*) FROM documents) AS total_documents,
              (SELECT COUNT(*) FROM documents WHERE is_premium IS TRUE) AS premium_documents,
              (SELECT COUNT(*) FROM videos) AS total_videos,
              (SELECT COUNT(*) FROM videos WHERE is_premium IS TRUE) AS premium_videos,
              (SELECT COUNT(*) FROM forum_posts) AS total_forum_posts`
    );
    const c = counts.rows[0] || {};

    // Get recent activity
    const recentActivity = await getRecentActivity();

    // AI usage, last 7 EAT days (shared-key visibility). Soft-fail: a missing
    // ai_usage table (migration not run yet) must not break the whole panel.
    let aiUsage7d: any[] = [];
    try {
      const aiRows = await dbQuery(
        `SELECT route,
                COUNT(*) AS calls,
                COUNT(*) FILTER (WHERE ok IS NOT TRUE) AS failures,
                COUNT(*) FILTER (WHERE error_code = 'AI_QUOTA_EXCEEDED') AS quota_errors,
                ROUND(AVG(latency_ms)) AS avg_ms
         FROM ai_usage
         WHERE created_at >= (now() AT TIME ZONE 'Africa/Addis_Ababa')::date - INTERVAL '6 days'
         GROUP BY route ORDER BY calls DESC`
      );
      aiUsage7d = aiRows.rows;
    } catch (aiErr) {
      console.error('AI usage aggregate failed (non-fatal, table may predate migration):', (aiErr as any)?.message || aiErr);
    }

    const stats = {
      total_users: toCount(c.total_users),
      premium_users: toCount(c.premium_users),
      total_documents: toCount(c.total_documents),
      premium_documents: toCount(c.premium_documents),
      total_videos: toCount(c.total_videos),
      premium_videos: toCount(c.premium_videos),
      total_forum_posts: toCount(c.total_forum_posts),
      recent_activity: recentActivity,
      ai_usage_7d: aiUsage7d
    };

    res.json({
      success: true,
      data: stats
    } as ApiResponse);
  } catch (error) {
    console.error('Get admin stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get admin statistics'
    } as ApiResponse);
  }
});

// --- Per-student AI usage: Top consumers (admin dashboard) ----------------
// Who burns the shared Gemini quota, over a sliding window (default 7d).
// Powers Overview → Top AI consumers: abuse spotting and support ("why is
// the AI slow for me?"). Guests log with user_id NULL and are excluded —
// they cannot be attributed. Soft-fails to [] on old databases (missing
// ai_usage table) so the panel never 500s over metering.
router.get('/ai-usage/top-users', requireRole(['ADMIN']), [
  query('days').optional().isInt({ min: 1, max: 90 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const days = Number(req.query.days) || 7;
    const limit = Number(req.query.limit) || 10;
    let rows: any[] = [];
    try {
      const r = await dbQuery(
        `SELECT u.id AS user_id, u.name, u.email,
                COUNT(a.*) AS calls,
                COUNT(*) FILTER (WHERE a.ok IS NOT TRUE) AS failures,
                COUNT(*) FILTER (WHERE a.error_code = 'AI_QUOTA_EXCEEDED') AS quota_errors,
                MAX(a.created_at) AS last_used_at
         FROM ai_usage a
         JOIN users u ON u.id = a.user_id
         WHERE a.created_at >= NOW() - make_interval(days => $1::int)
           AND a.user_id IS NOT NULL
         GROUP BY u.id, u.name, u.email
         ORDER BY calls DESC
         LIMIT $2`,
        [days, limit]
      );
      rows = r.rows;
    } catch (usageErr) {
      console.error('Top AI users aggregate failed (non-fatal, table may predate migration):', (usageErr as any)?.message || usageErr);
    }
    res.json({ success: true, data: rows } as ApiResponse);
  } catch (error) {
    console.error('Get top AI users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get top AI users'
    } as ApiResponse);
  }
});

// --- Error log (admin Errors card) ---------------------------------------
// Grouped failures over a sliding window, most frequent first, resolved
// last. Soft-fails to [] on old databases (missing error_log table).
router.get('/errors', requireRole(['ADMIN']), [
  query('days').optional().isInt({ min: 1, max: 90 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { getErrorSummary } = await import('../services/errorLog');
    const data = await getErrorSummary(Number(req.query.days) || 7, Number(req.query.limit) || 20);
    res.json({ success: true, data } as ApiResponse);
  } catch (err) {
    console.error('Get error summary error:', err);
    res.status(500).json({ success: false, message: 'Failed to get error summary' } as ApiResponse);
  }
});

// Mark one fingerprint resolved. A repeat occurrence reopens it — silence
// must be earned by fixing the cause, not by clicking.
router.post('/errors/resolve', requireRole(['ADMIN']), [
  body('fingerprint').isString().trim().isLength({ min: 1, max: 64 }),
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { resolveError } = await import('../services/errorLog');
    const ok = await resolveError(String(req.body.fingerprint));
    res.json({ success: true, data: { resolved: ok } } as ApiResponse);
  } catch (err) {
    console.error('Resolve error fingerprint error:', err);
    res.status(500).json({ success: false, message: 'Failed to resolve error' } as ApiResponse);
  }
});

// User management endpoints
router.get('/users', requireRole(['ADMIN']), [
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('offset').optional().isInt({ min: 0 }).toInt(),
  query('search').optional().isString(),
  query('plan').optional().isIn(['all', 'free', 'premium']).withMessage('Plan must be all, free, or premium'),
  query('status').optional().isIn(['all', 'Active', 'Banned']).withMessage('Status must be all, Active, or Banned'),
  query('role').optional().isIn(['STUDENT', 'MODERATOR']).withMessage('Role must be STUDENT or MODERATOR')
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const limit = Number(req.query.limit) || 50;
    const offset = Number(req.query.offset) || 0;
    const search = req.query.search;
    const plan = req.query.plan as string | undefined;
    const status = req.query.status as string | undefined;
    const role = req.query.role as string | undefined;

    // Explicit safe projection IN SQL: the old code fetched every user row
    // (SELECT *) and returned it, leaking bcrypt password_hash (plus avatar
    // blobs and preferences) to any admin token holder. New columns are
    // excluded by default — allowlist, not blocklist.
    const userConditions = [`role <> 'ADMIN'`];
    const userParams: any[] = [];
    if (role) {
      userConditions.push(`role = $${userParams.length + 1}`);
      userParams.push(role);
    }
    if (search) {
      userConditions.push(`(name ILIKE $${userParams.length + 1} OR email ILIKE $${userParams.length + 1})`);
      userParams.push(`%${String(search).replace(/[\\%_]/g, (m) => `\\${m}`)}%`);
    }
    // Plan filter: premium = is_premium true; free = anything else (false/NULL).
    if (plan === 'premium') {
      userConditions.push(`is_premium IS TRUE`);
    } else if (plan === 'free') {
      userConditions.push(`is_premium IS NOT TRUE`);
    }
    // Status filter: legacy rows may carry NULL, which the UI treats as
    // Active — mirror that here so "Active" + "Banned" partition the table.
    if (status === 'Active') {
      userConditions.push(`(status = 'Active' OR status IS NULL)`);
    } else if (status === 'Banned') {
      userConditions.push(`status = 'Banned'`);
    }
    const userWhere = `WHERE ${userConditions.join(' AND ')}`;
    const SAFE_USER_COLS = 'id, name, email, role, status, is_premium, xp, level, streak, grade, premium_since, created_at, updated_at';

    const [countResult, usersResult] = await Promise.all([
      dbQuery(`SELECT COUNT(*) as total FROM users ${userWhere}`, userParams),
      dbQuery(
        `SELECT ${SAFE_USER_COLS} FROM users ${userWhere} ORDER BY created_at DESC LIMIT $${userParams.length + 1} OFFSET $${userParams.length + 2}`,
        [...userParams, limit, offset]
      )
    ]);
    const total = parseInt(countResult.rows[0]?.total || '0', 10);
    const paginatedUsers = usersResult.rows;

    res.json({
      success: true,
      data: {
        users: paginatedUsers,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + limit < total
        }
      }
    } as ApiResponse);
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get users'
    } as ApiResponse);
  }
});

// Update user premium status
router.put('/users/:userId/premium', requireRole(['ADMIN']), [
  body('isPremium').isBoolean().withMessage('isPremium must be boolean')
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { isPremium } = req.body;
    const targetUserId = userId;

    const user = await dbAdmin.findOne('users', (u: any) => u.id === targetUserId);
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      } as ApiResponse);
      return;
    }

    // Check if user was previously premium (for downgrade detection)
    const wasPremium = user.is_premium === true || user.is_premium === 'true';

    // Idempotent: re-applying the same state must not re-stamp tenure or
    // re-fire upgrade/downgrade emails (admin double-clicks did exactly that).
    if (wasPremium === isPremium) {
      res.json({
        success: true,
        message: `User is already ${isPremium ? 'premium' : 'non-premium'} — no changes made`
      } as ApiResponse);
      return;
    }

    await dbAdmin.update('users', targetUserId, {
      is_premium: isPremium,
      // Membership tenure: stamp activation time, clear on deactivation.
      // (Re-activations re-stamp — tenure reflects the current membership.)
      premium_since: isPremium ? new Date().toISOString() : null,
      updated_at: new Date().toISOString()
    });

    // Create notification for the user
    await dbAdmin.insert('notifications', {
      user_id: targetUserId,
      title: isPremium ? 'Premium Activated!' : 'Premium Deactivated',
      message: isPremium
        ? 'Your premium subscription has been activated. Enjoy full access to Pro features!'
        : 'Your premium subscription has been deactivated.',
      type: isPremium ? 'SUCCESS' : 'INFO',
      is_read: false
    });

    // Send premium email notifications (non-blocking)
    if (user.email && user.name) {
      if (isPremium) {
        console.log('📧 Triggering premium upgrade email for user:', { email: user.email, name: user.name });
        EmailService.sendPremiumUpgradeEmail(user.email, user.name).catch(error => {
          console.error('❌ Failed to send premium upgrade email:', error);
          // Don't fail the request if email fails
        });
      } else if (wasPremium) {
        // Only notify on a real downgrade (was premium, now isn't)
        console.log('📧 Triggering premium downgrade email for user:', { email: user.email, name: user.name });
        EmailService.sendPremiumDowngradeEmail(user.email, user.name).catch(error => {
          console.error('❌ Failed to send premium downgrade email:', error);
          // Don't fail the request if email fails
        });
      }
    }

    // Audit log (non-blocking)
    logAdminActivity(req, {
      action: 'user.premium.update',
      target_type: 'user',
      target_id: String(targetUserId),
      summary: `Set premium=${isPremium} for user ${user.email}`,
      before: { id: user.id, email: user.email, name: user.name, role: user.role, is_premium: wasPremium },
      after: { id: user.id, email: user.email, name: user.name, role: user.role, is_premium: isPremium },
    }).catch(() => {});

    res.json({
      success: true,
      message: `User ${isPremium ? 'upgraded to' : 'downgraded from'} premium`
    } as ApiResponse);
  } catch (error) {
    console.error('Update user premium error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user premium status'
    } as ApiResponse);
  }
});

// Update user status (active/banned)
router.put('/users/:userId/status', requireRole(['ADMIN']), [
  body('status').isIn(['Active', 'Banned']).withMessage('Status must be Active or Banned'),
  body('reason').optional().isString().isLength({ max: 500 }).withMessage('Reason must be at most 500 characters')
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { status, reason } = req.body;
    const targetUserId = userId;

    const user = await dbAdmin.findOne('users', (u: any) => u.id === targetUserId);
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      } as ApiResponse);
      return;
    }

    // Idempotent: re-applying the same status must not re-fire suspension/
    // reactivation emails and notifications.
    if (user.status === status) {
      res.json({
        success: true,
        message: `User status is already ${status} — no changes made`
      } as ApiResponse);
      return;
    }

    // Never ban yourself (mirrors the self-demotion guard on team removal):
    // a self-ban locks the actor out with no one left to undo it.
    if (targetUserId === req.user!.id && status !== 'Active') {
      res.status(403).json({
        success: false,
        code: 'SELF_ACTION',
        message: 'You cannot suspend your own account — ask another admin'
      } as ApiResponse);
      return;
    }

    const beforeStatus = user.status;
    await dbAdmin.update('users', targetUserId, {
      status,
      updated_at: new Date().toISOString()
    });

    // Create notification for the user
    const notificationMessage = status === 'Active'
      ? 'Your account has been reactivated. You can now access all features.'
      : reason 
        ? `Your account has been suspended. Reason: ${reason}`
        : 'Your account has been suspended. Please contact support for more information.';

    await dbAdmin.insert('notifications', {
      user_id: targetUserId,
      title: status === 'Active' ? 'Account Reactivated' : 'Account Suspended',
      message: notificationMessage,
      type: status === 'Active' ? 'SUCCESS' : 'WARNING',
      is_read: false
    });

    // Send email notification for account status change (non-blocking)
    if (user.email && user.name) {
      if (status === 'Banned') {
        const suspensionReason = reason || 'Violation of Terms of Service';
        console.log('📧 Triggering account suspended email for user:', { email: user.email, name: user.name });
        EmailService.sendAccountSuspendedEmail(user.email, user.name, suspensionReason).catch(error => {
          console.error('❌ Failed to send account suspended email:', error);
          // Don't fail the request if email fails
        });
      } else if (status === 'Active') {
        console.log('📧 Triggering account reactivated email for user:', { email: user.email, name: user.name });
        EmailService.sendAccountReactivatedEmail(user.email, user.name).catch(error => {
          console.error('❌ Failed to send account reactivated email:', error);
          // Don't fail the request if email fails
        });
      }
    }

    // Audit log (non-blocking)
    logAdminActivity(req, {
      action: 'user.status.update',
      target_type: 'user',
      target_id: String(targetUserId),
      summary: `Set status=${status} for user ${user.email}`,
      before: { id: user.id, email: user.email, name: user.name, role: user.role, status: beforeStatus },
      after: { id: user.id, email: user.email, name: user.name, role: user.role, status },
      meta: reason ? { reason } : undefined,
    }).catch(() => {});

    res.json({
      success: true,
      message: `User status updated to ${status}`
    } as ApiResponse);
  } catch (error) {
    console.error('Update user status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user status'
    } as ApiResponse);
  }
});

// Delete user (soft delete by marking as inactive)
router.delete('/users/:userId', requireRole(['ADMIN']), async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const targetUserId = userId;

    const user = await dbAdmin.findOne('users', (u: any) => u.id === targetUserId);
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      } as ApiResponse);
      return;
    }

    const before = { id: user.id, email: user.email, name: user.name, role: user.role, status: user.status, is_premium: user.is_premium };

    // Idempotent: deactivating an already-inactive account is a no-op, not
    // a second audit event.
    if (user.status === 'Inactive') {
      res.json({
        success: true,
        message: 'User is already deactivated — no changes made'
      } as ApiResponse);
      return;
    }

    // Mark user as inactive using the `status` column (role is an enum; do not set role to INACTIVE)
    await dbAdmin.update('users', targetUserId, {
      status: 'Inactive',
      updated_at: new Date().toISOString()
    });

    // Audit log (non-blocking)
    logAdminActivity(req, {
      action: 'user.deactivate',
      target_type: 'user',
      target_id: String(targetUserId),
      summary: `Deactivated user ${user.email}`,
      before,
      after: { ...before, status: 'Inactive' }
    }).catch(() => {});

    res.json({
      success: true,
      message: 'User deactivated successfully'
    } as ApiResponse);
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to deactivate user'
    } as ApiResponse);
  }
});

// Content management endpoints
router.get('/content', requireRole(['ADMIN', 'MODERATOR']), async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const documents = await dbAdmin.get('documents');
    const videos = await dbAdmin.get('videos');
    const forumPosts = await dbAdmin.get('forum_posts');

    const contentStats = {
      documents: {
        total: documents.length,
        premium: documents.filter((d: any) => d.is_premium).length,
        by_subject: {} as Record<string, number>
      },
      videos: {
        total: videos.length,
        premium: videos.filter((v: any) => v.is_premium).length,
        by_subject: {} as Record<string, number>
      },
      forum: {
        total_posts: forumPosts.length,
        solved_posts: forumPosts.filter((p: any) => p.is_solved).length,
        by_subject: {} as Record<string, number>
      }
    };

    // Count by subject for documents
    documents.forEach((doc: any) => {
      contentStats.documents.by_subject[doc.subject] = (contentStats.documents.by_subject[doc.subject] || 0) + 1;
    });

    // Count by subject for videos
    videos.forEach((video: any) => {
      contentStats.videos.by_subject[video.subject] = (contentStats.videos.by_subject[video.subject] || 0) + 1;
    });

    // Count by subject for forum posts
    forumPosts.forEach((post: any) => {
      contentStats.forum.by_subject[post.subject] = (contentStats.forum.by_subject[post.subject] || 0) + 1;
    });

    res.json({
      success: true,
      data: contentStats
    } as ApiResponse);
  } catch (error) {
    console.error('Get content stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get content statistics'
    } as ApiResponse);
  }
});

// Create document (admin)
router.post('/documents', requireRole(['ADMIN', 'MODERATOR']), [
  body('title').trim().isLength({ min: 1, max: 500 }).withMessage('Title is required'),
  body('description').optional().trim().isLength({ max: 2000 }),
  body('subject').isIn(CONTENT_SUBJECTS).withMessage('Valid subject required'),
  body('grade').custom((value) => {
    const grade = parseInt(value);
    if (grade === 0 || (grade >= 9 && grade <= 12)) {
      return true;
    }
    throw new Error('Grade must be 0 (General), 9, 10, 11, or 12');
  }),
  body('file_type').isIn(['PDF', 'DOCX', 'PPT']).withMessage('Valid file type required'),
  body('file_url').optional().isURL().withMessage('File URL must be a valid URL'),
  body('preview_image').optional().isURL().withMessage('Thumbnail URL must be a valid URL'),
  body('is_premium').optional().isBoolean(),
  body('author').optional().trim().isLength({ max: 255 }),
  body('tags').optional().isArray()
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { title, description, subject, grade, file_type, file_url, preview_image, is_premium = false, author, tags = [] } = req.body;
    const uploaded_by = req.user!.id;

    const documentData = {
      title,
      description,
      subject,
      grade,
      file_type,
      file_url,
      preview_image: preview_image ? convertGoogleDriveUrl(preview_image) : null,
      is_premium,
      downloads: 0,
      author,
      tags,
      uploaded_by
    };

    const inserted = await dbAdmin.insert('documents', documentData);

    // Audit log (non-blocking)
    logAdminActivity(req, {
      action: 'document.create',
      target_type: 'document',
      target_id: String(inserted?.id || ''),
      summary: `Created document "${inserted?.title}"`,
      after: {
        id: inserted?.id,
        title: inserted?.title,
        subject: inserted?.subject,
        grade: inserted?.grade,
        is_premium: inserted?.is_premium,
        uploaded_by
      }
    }).catch(() => {});

    // Notify users about new document (in-app notification only, no emails)
    if (inserted && inserted.id) {
      console.log('🔔 Triggering new document notification for users (in-app only)');
      NotificationService.notifyUsersAboutNewResources(is_premium).catch(error => {
        console.error('❌ Failed to notify users about new document:', error);
        // Don't fail the request if notification fails
      });
    }

    res.status(201).json({
      success: true,
      data: inserted,
      message: 'Document created successfully'
    } as ApiResponse<Document>);
  } catch (error) {
    console.error('Create document error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create document'
    } as ApiResponse);
  }
});

// Create video (admin)
router.post('/videos', requireRole(['ADMIN', 'MODERATOR']), [
  body('title').trim().isLength({ min: 1, max: 500 }).withMessage('Title is required'),
  body('description').optional().trim().isLength({ max: 2000 }),
  body('subject').isIn(CONTENT_SUBJECTS).withMessage('Valid subject required'),
  body('grade').custom((value) => {
    const grade = parseInt(value);
    if (grade === 0 || (grade >= 9 && grade <= 12)) {
      return true;
    }
    throw new Error('Grade must be 0 (General), 9, 10, 11, or 12');
  }),
  body('video_url').isURL().withMessage('Valid video URL required'),
  body('duration').optional().matches(/^(\d{1,2}:)?\d{1,2}:\d{2}$/).withMessage('Duration must be in format MM:SS or HH:MM:SS'),
  body('instructor').optional().trim().isLength({ max: 255 }),
  body('thumbnail').optional().isURL(),
  body('is_premium').optional().isBoolean()
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { title, description, subject, grade, video_url, instructor, thumbnail, is_premium = false } = req.body;
    const uploaded_by = req.user!.id;

    const videoData = {
      title,
      description,
      subject,
      grade,
      video_url,
      instructor,
      thumbnail: thumbnail ? convertGoogleDriveUrl(thumbnail) : null,
      views: 0,
      likes: 0,
      is_premium,
      uploaded_by
    };

    const inserted = await dbAdmin.insert('videos', videoData);

    // Audit log (non-blocking)
    logAdminActivity(req, {
      action: 'video.create',
      target_type: 'video',
      target_id: String(inserted?.id || ''),
      summary: `Created video "${inserted?.title}"`,
      after: {
        id: inserted?.id,
        title: inserted?.title,
        subject: inserted?.subject,
        grade: inserted?.grade,
        is_premium: inserted?.is_premium,
        uploaded_by
      }
    }).catch(() => {});

    // Notify users about new video (in-app notification only, no emails)
    if (inserted && inserted.id) {
      console.log('🔔 Triggering new video notification for users (in-app only)');
      NotificationService.notifyUsersAboutNewResources(is_premium).catch(error => {
        console.error('❌ Failed to notify users about new video:', error);
        // Don't fail the request if notification fails
      });
    }

    res.status(201).json({
      success: true,
      data: inserted,
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

// Moderate forum content
router.delete('/forum/posts/:postId', requireRole(['ADMIN', 'MODERATOR']), async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { postId } = req.params;
    const id = postId;

    const post = await dbAdmin.findOne('forum_posts', (p: any) => String(p.id) === String(id));
    if (!post) {
      res.status(404).json({
        success: false,
        message: 'Forum post not found'
      } as ApiResponse);
      return;
    }

    await dbAdmin.delete('forum_posts', id);

    // Audit log (non-blocking)
    logAdminActivity(req, {
      action: 'forum.post.delete',
      target_type: 'forum_post',
      target_id: String(id),
      summary: `Deleted forum post "${post.title || id}"`,
      before: {
        id: post.id,
        title: post.title,
        subject: post.subject,
        grade: post.grade,
        author_id: post.author_id
      }
    }).catch(() => {});

    res.json({
      success: true,
      message: 'Forum post deleted successfully'
    } as ApiResponse);
  } catch (error) {
    console.error('Delete forum post error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete forum post'
    } as ApiResponse);
  }
});

// NOTE: there is intentionally NO GET /logs or POST /maintenance/cleanup on
// this router. A previous /logs served hardcoded mock entries ("Server started
// successfully", "High memory usage detected") as if they were real system
// data, and /maintenance/cleanup returned success while doing nothing. Both
// were uncalled by the frontend and have been removed rather than faked.

// Get admin team members (admins and moderators)
router.get('/admins', requireRole(['ADMIN']), async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const users = await dbAdmin.get('users');
    // Get both admins and moderators
    const teamMembers = users.filter((u: any) => u.role === 'ADMIN' || u.role === 'MODERATOR');

    // Return safe fields only. A previous version spread the whole row,
    // shipping password_hash and recovery tokens to the admin panel.
    // Pending invites also carry their latest unused invitation expiry so
    // the UI can show "Expires <date>" / "Expired" and offer resend. Token
    // VALUES never leave the server — only the expiry timestamp.
    const pendingIds = teamMembers
      .filter((u: any) => u.status !== 'Active')
      .map((u: any) => u.id);
    let expiryByUser = new Map<string, string | null>();
    if (pendingIds.length > 0) {
      try {
        const expRows = await dbQuery(
          `SELECT user_id, MAX(expires_at) AS exp FROM tokens
           WHERE type = 'admin-invitation' AND used_at IS NULL AND user_id = ANY($1)
           GROUP BY user_id`,
          [pendingIds]
        );
        for (const row of expRows.rows) {
          expiryByUser.set(String(row.user_id), row.exp ? new Date(row.exp).toISOString() : null);
        }
      } catch (expErr) {
        console.error('Failed to load invitation expiries:', expErr);
      }
    }
    const membersWithStatus = teamMembers.map((member: any) => ({
      id: member.id,
      name: member.name,
      email: member.email,
      role: member.role,
      avatar: member.avatar,
      is_premium: member.is_premium,
      created_at: member.created_at,
      updated_at: member.updated_at,
      status: member.status === 'Active' ? 'Active' : 'Inactive',
      invitation_expires_at: member.status === 'Active'
        ? null
        : (expiryByUser.has(String(member.id)) ? expiryByUser.get(String(member.id)) ?? null : null)
    }));

    res.json({
      success: true,
      data: membersWithStatus
    } as ApiResponse);
  } catch (error) {
    console.error('Get admins error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get admin team'
    } as ApiResponse);
  }
});

// Invite new admin (creates a pending invitation)
router.post('/admins/invite', requireRole(['ADMIN']), [
  body('email').isEmail().withMessage('Valid email required'),
  body('name').trim().isLength({ min: 2 }).withMessage('Name is required'),
  body('role').optional().isIn(['ADMIN', 'MODERATOR']).withMessage('Invalid role')
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { email, name, role = 'ADMIN' } = req.body;

    // Check if user already exists — return their safe profile with a
    // machine-readable code so the UI can offer promotion instead of a
    // dead-end "User already exists".
    const existingUser = await dbAdmin.findOne('users', (u: any) => u.email === email);
    if (existingUser) {
      res.status(400).json({
        success: false,
        code: 'USER_EXISTS',
        message: `${email} already has an account (${existingUser.name || 'no name'}, role ${existingUser.role}). You can promote them to the team instead of inviting.`,
        data: {
          id: existingUser.id,
          name: existingUser.name,
          email: existingUser.email,
          role: existingUser.role,
          status: existingUser.status || 'Active'
        }
      } as ApiResponse);
      return;
    }

    // Create a temporary user account with a placeholder password
    // The user will set their actual password when accepting the invitation
    // We generate a cryptographically secure random password that is never exposed
    const bcrypt = await import('bcryptjs');
    // Generate a secure random password (never exposed, will be replaced on invitation acceptance)
    const placeholderPassword = crypto.randomBytes(32).toString('hex');
    const hashedPassword = await bcrypt.hash(placeholderPassword, 10);

    const userData = {
      name,
      email,
      password_hash: hashedPassword,
      role,
      is_premium: true,
      xp: 0,
      level: 1,
      streak: 0,
      status: 'Inactive', // Set to inactive until they accept invitation
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const inserted = await dbAdmin.insert('users', userData);

    // Generate short opaque token (32 bytes = 64 hex characters)
    const invitationToken = crypto.randomBytes(32).toString('hex');
    
    // Calculate expiration time (7 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Store token in database
    await dbQuery(
      'INSERT INTO tokens (token, user_id, type, expires_at) VALUES ($1, $2, $3, $4)',
      [invitationToken, inserted.id, 'admin-invitation', expiresAt.toISOString()]
    );

    // Create invitation link (short token, no encoding needed)
    const frontendUrl = config.server.frontendUrl || 'http://localhost:5173';
    const invitationLink = `${frontendUrl}/accept-invitation?token=${invitationToken}`;

    // Send admin invitation email — AWAITED, not fire-and-forget. The old
    // code toasted "Invitation sent" while logging SMTP failures to the
    // server console, leaving the invitee with nothing and the admin unaware.
    // The invitation is created regardless; emailSent tells the UI whether
    // to show the copy-link fallback.
    console.log('📧 Triggering admin invitation email:', { email, name, role });
    let emailSent = false;
    try {
      emailSent = await EmailService.sendAdminInvitationEmail(email, name, role, invitationLink);
    } catch (error) {
      console.error('❌ Failed to send admin invitation email:', error);
      emailSent = false;
    }

    // Audit log (non-blocking)
    logAdminActivity(req, {
      action: 'admin.invite',
      target_type: 'admin_team',
      target_id: String(inserted?.id || ''),
      summary: `Invited ${email} as ${role}${emailSent ? '' : ' (email failed — link shared manually)'}`,
      after: { id: inserted?.id, email, name, role, status: 'Inactive' },
      meta: { invited_email: email, invited_role: role, emailSent },
    }).catch(() => {});

    res.status(201).json({
      success: true,
      message: emailSent
        ? 'Admin invitation sent successfully. They will receive an email with instructions to accept the invitation.'
        : 'Invitation created, but the email failed to send. Copy the invitation link below and share it manually, or resend it from the team list.',
      data: {
        userId: inserted.id,
        email,
        name,
        role,
        emailSent,
        invitationLink,
        expiresAt: expiresAt.toISOString()
      }
    } as ApiResponse);
  } catch (error) {
    console.error('Invite admin error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send invitation'
    } as ApiResponse);
  }
});

// Resend a pending team invitation (fresh 7-day token, old links die).
router.post('/admins/:userId/resend-invitation', requireRole(['ADMIN']), async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const user = await dbAdmin.findOne('users', (u: any) => u.id === userId);
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' } as ApiResponse);
      return;
    }
    if (user.role !== 'ADMIN' && user.role !== 'MODERATOR') {
      res.status(400).json({ success: false, message: 'User is not a team member' } as ApiResponse);
      return;
    }
    if (user.status === 'Active') {
      res.status(400).json({ success: false, message: 'Invitation already accepted — nothing to resend' } as ApiResponse);
      return;
    }

    // Invalidate previous unused links, then issue a fresh 7-day token.
    await dbQuery(
      `UPDATE tokens SET used_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND type = 'admin-invitation' AND used_at IS NULL`,
      [userId]
    );
    const invitationToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    await dbQuery(
      'INSERT INTO tokens (token, user_id, type, expires_at) VALUES ($1, $2, $3, $4)',
      [invitationToken, userId, 'admin-invitation', expiresAt.toISOString()]
    );
    const frontendUrl = config.server.frontendUrl || 'http://localhost:5173';
    const invitationLink = `${frontendUrl}/accept-invitation?token=${invitationToken}`;

    let emailSent = false;
    try {
      emailSent = await EmailService.sendAdminInvitationEmail(user.email, user.name, user.role, invitationLink);
    } catch (error) {
      console.error('❌ Failed to resend admin invitation email:', error);
      emailSent = false;
    }

    logAdminActivity(req, {
      action: 'admin.invite.resend',
      target_type: 'admin_team',
      target_id: String(userId),
      summary: `Resent invitation to ${user.email}${emailSent ? '' : ' (email failed — link shared manually)'}`,
      after: { id: user.id, email: user.email, name: user.name, role: user.role },
      meta: { emailSent },
    }).catch(() => {});

    res.json({
      success: true,
      message: emailSent
        ? `Invitation resent to ${user.email}`
        : 'Invitation renewed, but the email failed to send. Copy the invitation link below and share it manually.',
      data: { userId, email: user.email, emailSent, invitationLink, expiresAt: expiresAt.toISOString() }
    } as ApiResponse);
  } catch (error) {
    console.error('Resend invitation error:', error);
    res.status(500).json({ success: false, message: 'Failed to resend invitation' } as ApiResponse);
  }
});

// Revoke a pending team invitation (deletes the placeholder account + links).
// Active members go through team removal instead — deleting them here would
// destroy a real account with history.
router.delete('/admins/:userId/invitation', requireRole(['ADMIN']), async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const user = await dbAdmin.findOne('users', (u: any) => u.id === userId);
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' } as ApiResponse);
      return;
    }
    if (user.role !== 'ADMIN' && user.role !== 'MODERATOR') {
      res.status(400).json({ success: false, message: 'User is not a team member' } as ApiResponse);
      return;
    }
    if (user.status === 'Active') {
      res.status(400).json({ success: false, message: 'Invitation already accepted — remove them from the team instead' } as ApiResponse);
      return;
    }
    if (userId === req.user!.id) {
      res.status(403).json({
        success: false,
        code: 'SELF_ACTION',
        message: 'You cannot revoke your own invitation — ask another admin'
      } as ApiResponse);
      return;
    }

    await dbQuery(`DELETE FROM tokens WHERE user_id = $1 AND type = 'admin-invitation'`, [userId]);
    await dbAdmin.delete('users', userId);

    logAdminActivity(req, {
      action: 'admin.invite.revoke',
      target_type: 'admin_team',
      target_id: String(userId),
      summary: `Revoked pending invitation for ${user.email} (${user.role})`,
      before: { id: user.id, email: user.email, name: user.name, role: user.role },
    }).catch(() => {});

    res.json({
      success: true,
      message: `Invitation for ${user.email} revoked`
    } as ApiResponse);
  } catch (error) {
    console.error('Revoke invitation error:', error);
    res.status(500).json({ success: false, message: 'Failed to revoke invitation' } as ApiResponse);
  }
});

// Change a user's team role — promotion (STUDENT -> team) and ADMIN <->
// MODERATOR moves. Carries the same self/last-admin guards as removal.
router.put('/admins/:userId/role', requireRole(['ADMIN']), [
  body('role').isIn(['ADMIN', 'MODERATOR']).withMessage('Role must be ADMIN or MODERATOR')
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { role } = req.body;
    const user = await dbAdmin.findOne('users', (u: any) => u.id === userId);
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' } as ApiResponse);
      return;
    }

    if (user.role === role) {
      res.json({
        success: true,
        message: `${user.email} is already ${role === 'ADMIN' ? 'a Super Admin' : 'a Content Manager'} — no changes made`
      } as ApiResponse);
      return;
    }

    if (userId === req.user!.id) {
      res.status(403).json({
        success: false,
        code: 'SELF_ACTION',
        message: 'You cannot change your own team role — ask another admin'
      } as ApiResponse);
      return;
    }

    if ((user.status || 'Active') === 'Banned') {
      res.status(400).json({
        success: false,
        message: 'Unban this account before adding them to the team'
      } as ApiResponse);
      return;
    }

    if (user.role === 'ADMIN' && role !== 'ADMIN') {
      const allUsers = await dbAdmin.get('users');
      const admins = allUsers.filter((u: any) => u.role === 'ADMIN');
      if (admins.length <= 1) {
        res.status(400).json({ success: false, message: 'Cannot demote the last admin' } as ApiResponse);
        return;
      }
    }

    const beforeRole = user.role;
    const updated = await dbAdmin.update('users', userId, {
      role,
      updated_at: new Date().toISOString()
    });
    if (!updated) {
      res.status(404).json({ success: false, message: 'User not found or update failed' } as ApiResponse);
      return;
    }

    logAdminActivity(req, {
      action: 'admin.role.update',
      target_type: 'admin_team',
      target_id: String(userId),
      summary: `Changed ${user.email} role ${beforeRole} -> ${role}`,
      before: { id: user.id, email: user.email, name: user.name, role: beforeRole },
      after: { id: user.id, email: user.email, name: user.name, role },
    }).catch(() => {});

    res.json({
      success: true,
      message: `${user.email} is now ${role === 'ADMIN' ? 'a Super Admin' : 'a Content Manager'}`,
      data: { id: user.id, email: user.email, name: user.name, role }
    } as ApiResponse);
  } catch (error) {
    console.error('Update admin role error:', error);
    res.status(500).json({ success: false, message: 'Failed to update team role' } as ApiResponse);
  }
});

// Remove admin privileges
router.delete('/admins/:userId', requireRole(['ADMIN']), async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const targetUserId = userId;

    const user = await dbAdmin.findOne('users', (u: any) => u.id === targetUserId);
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      } as ApiResponse);
      return;
    }

    // Check if user is actually an admin or moderator
    if (user.role !== 'ADMIN' && user.role !== 'MODERATOR') {
      res.status(400).json({
        success: false,
        message: 'User is not an admin or moderator'
      } as ApiResponse);
      return;
    }

    // Don't allow removing the last admin (but allow removing moderators)
    const allUsers = await dbAdmin.get('users');
    const admins = allUsers.filter((u: any) => u.role === 'ADMIN');

    if (user.role === 'ADMIN' && admins.length <= 1) {
      res.status(400).json({
        success: false,
        message: 'Cannot remove the last admin'
      } as ApiResponse);
      return;
    }

    // Never demote yourself: the JWT still decodes as ADMIN until refetch,
    // so the panel looks fine briefly — then access is gone with no recourse
    // except another admin. Direct-API calls are blocked here too, not just
    // the UI button.
    if (targetUserId === req.user!.id) {
      res.status(403).json({
        success: false,
        code: 'SELF_ACTION',
        message: 'You cannot remove your own admin privileges — ask another admin'
      } as ApiResponse);
      return;
    }

    const beforeRole = user.role;
    const updateResult = await dbAdmin.update('users', targetUserId, {
      role: 'STUDENT',
      updated_at: new Date().toISOString()
    });

    if (!updateResult) {
      res.status(404).json({
        success: false,
        message: 'User not found or update failed'
      } as ApiResponse);
      return;
    }

    // Audit log (non-blocking)
    logAdminActivity(req, {
      action: 'admin.remove',
      target_type: 'admin_team',
      target_id: String(targetUserId),
      summary: `Removed admin privileges from ${user.email} (role ${beforeRole} -> STUDENT)`,
      before: { id: user.id, email: user.email, name: user.name, role: beforeRole },
      after: { id: user.id, email: user.email, name: user.name, role: 'STUDENT' },
    }).catch(() => {});

    res.json({
      success: true,
      message: 'Admin privileges removed successfully'
    } as ApiResponse);
  } catch (error) {
    console.error('Remove admin error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove admin privileges'
    } as ApiResponse);
  }
});

// Privacy Policy Management
router.get('/privacy-policy', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { data: privacyPolicy, error } = await supabaseAdmin
      .from('privacy_policy')
      .select('content, last_updated')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows returned"
      throw error;
    }

    let result;
    if (!privacyPolicy) {
      // Return default privacy policy if none exists in database
      result = {
        content: `
Privacy Policy

Last updated: December 2025

Welcome to SmartStudy. Your privacy is important to us, and this Privacy Policy explains how we collect, use, protect, and handle your information when you use our platform.

1. Information We Collect

We may collect the following types of information:

Personal Information:
Name, email address, and account details when you sign up or log in.

Usage Information:
How you interact with the platform, such as pages visited, features used, and study activity.

Device & Technical Data:
Browser type, device type, IP address, and general location (non-precise).

User Content:
Study notes, questions, or inputs you provide while using SmartStudy.

2. How We Use Your Information

We use your information to:

• Provide and improve SmartStudy services
• Personalize learning experiences
• Enable AI-powered features
• Maintain platform security
• Communicate important updates or support responses

We do not sell or rent your personal data to third parties.

3. AI & Data Usage

SmartStudy uses AI technologies to assist learning. User inputs may be processed to generate helpful responses, summaries, or recommendations.

• Your data is used only to improve your learning experience
• We do not use your private data to train public AI models without consent

4. Cookies and Tracking Technologies

We may use cookies and similar technologies to:

• Keep you logged in
• Improve performance and usability
• Understand platform usage

You can control cookies through your browser settings.

5. Data Security

We take reasonable technical and organizational measures to protect your data from unauthorized access, loss, or misuse. However, no system is 100% secure, and we cannot guarantee absolute security.

6. Third-Party Services

SmartStudy may use trusted third-party services (such as hosting, analytics, or authentication providers) to operate the platform. These services are required to protect your data and use it only for intended purposes.

7. Children's Privacy

SmartStudy is designed for students. We do not knowingly collect personal data from children without appropriate consent where required. If you believe a child's data has been collected improperly, please contact us.

8. Your Rights

You have the right to:

• Access your personal data
• Request correction or deletion of your data
• Control account settings and privacy preferences

You can do this by contacting us or through your account settings.

9. Changes to This Policy

We may update this Privacy Policy from time to time. Any changes will be posted on this page with an updated date.

10. Contact Us

If you have any questions or concerns about this Privacy Policy, please contact us:

Email: smartstudy.ethio@gmail.com
Platform: SmartStudy.
        `,
        lastUpdated: 'December 2025'
      };
    } else {
      result = {
        content: privacyPolicy.content,
        lastUpdated: new Date(privacyPolicy.last_updated).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
      };
    }

    res.json({
      success: true,
      message: 'Privacy policy retrieved successfully',
      data: result
    } as ApiResponse);
  } catch (error) {
    console.error('Get privacy policy error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get privacy policy'
    } as ApiResponse);
  }
});

// Update Privacy Policy
router.put('/privacy-policy', requireRole(['ADMIN']), [
  body('content').isString().isLength({ min: 1 }).withMessage('Content is required'),
  body('lastUpdated').optional().isString().withMessage('Last updated must be a string')
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { content, lastUpdated } = req.body;
    const userId = (req as any).user?.id;

    const privacyPolicyData = {
      content,
      last_updated: lastUpdated ? new Date(lastUpdated).toISOString() : new Date().toISOString(),
      updated_by: userId || null
    };

    // Insert new version (we keep history by not updating existing records)
    const { data, error } = await supabaseAdmin
      .from('privacy_policy')
      .insert(privacyPolicyData)
      .select('content, last_updated')
      .single();

    if (error) {
      throw error;
    }

    const result = {
      content: data.content,
      lastUpdated: new Date(data.last_updated).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
    };

    // Audit log (non-blocking)
    logAdminActivity(req, {
      action: 'privacy_policy.update',
      target_type: 'platform_settings',
      target_id: 'privacy_policy',
      summary: 'Updated privacy policy',
      after: result
    }).catch(() => {});

    res.json({
      success: true,
      message: 'Privacy policy updated successfully',
      data: result
    } as ApiResponse);
  } catch (error) {
    console.error('Update privacy policy error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update privacy policy'
    } as ApiResponse);
  }
});

// Get Terms of Service
router.get('/terms-of-service', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { data: termsOfService, error } = await supabaseAdmin
      .from('terms_of_service')
      .select('content, last_updated')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows returned"
      throw error;
    }

    let result;
    if (!termsOfService) {
      // Return default terms of service if none exists in database
      result = {
        content: `Terms of Service

Last updated: December 2025

Welcome to SmartStudy. By accessing or using our platform, you agree to be bound by these Terms of Service. Please read them carefully.

1. Acceptance of Terms

By creating an account, accessing, or using SmartStudy, you agree to comply with and be legally bound by these Terms. If you do not agree, please do not use the platform.

2. Description of Service

SmartStudy is an educational platform designed to help students learn more effectively through structured content, study tools, and AI-powered assistance.

We may update, improve, or modify features at any time to enhance user experience.

3. User Accounts

• You are responsible for maintaining the confidentiality of your account credentials
• You agree to provide accurate and complete information
• You are responsible for all activities that occur under your account
• SmartStudy reserves the right to suspend or terminate accounts that violate these Terms.

4. Acceptable Use

You agree not to:

• Use the platform for unlawful or harmful purposes
• Attempt to hack, disrupt, or misuse the system
• Upload malicious code or harmful content
• Impersonate others or provide false information
• SmartStudy is intended for educational use only.

5. User Content

You may submit content such as questions, notes, or study materials.

By submitting content:

• You retain ownership of your content
• You grant SmartStudy permission to use it only to provide and improve services
• You agree not to upload content that is illegal, offensive, or violates others' rights

6. AI Features Disclaimer

SmartStudy uses AI to assist learning. While we strive for accuracy:

• AI-generated content is for educational support only
• It should not be considered professional, academic, or legal advice
• Users should verify important information independently

7. Intellectual Property

All platform content, branding, logos, design, and software belong to SmartStudy unless otherwise stated.

You may not copy, distribute, or reproduce any part of the platform without permission.

8. Third-Party Services

SmartStudy may integrate third-party tools or services. We are not responsible for the content or practices of third-party platforms.

9. Termination

We reserve the right to suspend or terminate access to SmartStudy at any time if these Terms are violated or if misuse is detected.

Users may stop using the platform at any time.

10. Limitation of Liability

SmartStudy is provided on an "as-is" basis. We are not liable for:

• Data loss
• Academic outcomes
• Service interruptions
• Errors or inaccuracies in content
• Use of the platform is at your own risk.

11. Changes to These Terms

We may update these Terms from time to time. Continued use of SmartStudy after changes means you accept the updated Terms.

12. Governing Law

These Terms are governed by applicable laws. Any disputes will be handled under relevant legal jurisdictions.

13. Contact Us

If you have questions about these Terms of Service, please contact us:

Email: smartstudy.ethio@gmail.com
Platform: SmartStudy.`,
        lastUpdated: 'December 2025'
      };
    } else {
      result = {
        content: termsOfService.content,
        lastUpdated: new Date(termsOfService.last_updated).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
      };
    }

    res.json({
      success: true,
      message: 'Terms of service retrieved successfully',
      data: result
    } as ApiResponse);
  } catch (error) {
    console.error('Get terms of service error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get terms of service'
    } as ApiResponse);
  }
});

// Update Terms of Service
router.put('/terms-of-service', requireRole(['ADMIN']), [
  body('content').isString().isLength({ min: 1 }).withMessage('Content is required'),
  body('lastUpdated').optional().isString().withMessage('Last updated must be a string')
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { content, lastUpdated } = req.body;
    const userId = (req as any).user?.id;

    const termsOfServiceData = {
      content,
      last_updated: lastUpdated ? new Date(lastUpdated).toISOString() : new Date().toISOString(),
      updated_by: userId || null
    };

    // Insert new version (we keep history by not updating existing records)
    const { data, error } = await supabaseAdmin
      .from('terms_of_service')
      .insert(termsOfServiceData)
      .select('content, last_updated')
      .single();

    if (error) {
      throw error;
    }

    const result = {
      content: data.content,
      lastUpdated: new Date(data.last_updated).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
    };

    // Audit log (non-blocking)
    logAdminActivity(req, {
      action: 'terms_of_service.update',
      target_type: 'platform_settings',
      target_id: 'terms_of_service',
      summary: 'Updated terms of service',
      after: result
    }).catch(() => {});

    res.json({
      success: true,
      message: 'Terms of service updated successfully',
      data: result
    } as ApiResponse);
  } catch (error) {
    console.error('Update terms of service error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update terms of service'
    } as ApiResponse);
  }
});

// Admin audit logs (who changed what)
router.get('/audit-logs', requireRole(['ADMIN', 'MODERATOR']), [
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('offset').optional().isInt({ min: 0 }).toInt(),
  query('actor').optional().isUUID(),
  query('action').optional().isString(),
  query('targetType').optional().isString(),
  query('targetId').optional().isString(),
  query('search').optional().isString()
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    if (!supabaseAdmin) {
      res.status(500).json({ success: false, message: 'Server misconfiguration: Supabase admin client not available' } as ApiResponse);
      return;
    }

    const limit = Number(req.query.limit) || 50;
    const offset = Number(req.query.offset) || 0;
    const actor = req.query.actor as string | undefined;
    const action = req.query.action as string | undefined;
    const targetType = req.query.targetType as string | undefined;
    const targetId = req.query.targetId as string | undefined;
    const search = req.query.search as string | undefined;

    let q = supabaseAdmin
      .from('admin_activity_logs')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (actor) q = q.eq('actor_user_id', actor);
    if (action) q = q.eq('action', action);
    if (targetType) q = q.eq('target_type', targetType);
    if (targetId) q = q.eq('target_id', targetId);
    if (search && search.trim()) {
      const s = search.trim();
      q = q.or(`summary.ilike.%${s}%,action.ilike.%${s}%,actor_email.ilike.%${s}%,target_id.ilike.%${s}%`);
    }

    q = q.range(offset, offset + limit - 1);

    const { data, error, count } = await q;
    if (error) {
      res.status(500).json({ success: false, message: 'Failed to fetch audit logs' } as ApiResponse);
      return;
    }

    const total = count ?? 0;
    const rows = data || [];

    res.json({
      success: true,
      data: {
        logs: rows,
        pagination: {
          total,
          limit,
          offset,
          hasMore: offset + rows.length < total
        }
      }
    } as ApiResponse);
  } catch (err) {
    console.error('Get audit logs error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch audit logs' } as ApiResponse);
  }
});

// --- Gemini key-ring observability (admin AI-keys tab) ----------------------
// Live rotation state (which key serves next, cooling/retired) comes from
// in-memory ring state; COUNTERS are durable aggregates from ai_key_usage
// (90-day window) so the tab survives restarts and serverless cold starts.
// When the durable store is unavailable (old DB, missing migration) the
// endpoint soft-falls back to in-memory session counters instead of 500ing.
// ADMIN-only, and the payload carries key fingerprints (last 4 chars) —
// never key material.
router.get('/ai-keys', requireRole(['ADMIN']), async (_req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { getKeyRingStatus } = await import('../services/aiTutor');
    const ring = getKeyRingStatus();
    let totals: Map<string, {
      served: number; quotaHits: number; invalidHits: number; otherErrors: number;
      lastOkAt: string | null; lastErrorAt: string | null;
      lastErrorKind: 'quota' | 'invalid' | 'other' | null;
    }> | null = null;
    try {
      const { getKeyUsageTotals } = await import('../services/aiKeyUsage');
      totals = await getKeyUsageTotals();
    } catch (totalsErr) {
      console.error('AI key durable totals failed (non-fatal, falling back to session counters):',
        (totalsErr as any)?.message || totalsErr);
    }
    const merged = {
      ...ring,
      keys: ring.keys.map((k) => {
        const d = totals?.get(k.fingerprint);
        // Durable row wins when present; otherwise the live session counter
        // keeps the tab useful on old databases / empty history.
        if (!d) return k;
        return {
          ...k,
          served: d.served,
          quotaHits: d.quotaHits,
          invalidHits: d.invalidHits,
          otherErrors: (k as any).otherErrors !== undefined ? d.otherErrors : (k as any).otherErrors,
          lastOkAt: d.lastOkAt ?? k.lastOkAt,
          lastErrorAt: d.lastErrorAt ?? k.lastErrorAt,
          lastErrorKind: d.lastErrorKind ?? k.lastErrorKind,
        };
      }),
    };
    res.json({ success: true, data: merged } as ApiResponse);
  } catch (err) {
    console.error('Get AI key status error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch AI key status' } as ApiResponse);
  }
});

// Zero-spend credential check for one ring key (models.list burns no
// tokens). Let an admin confirm a newly added key without spending quota.
router.post('/ai-keys/:index/validate', requireRole(['ADMIN']), async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const raw = req.params.index;
    const index = typeof raw === 'string' ? parseInt(raw, 10) : NaN;
    if (!Number.isInteger(index) || index < 0) {
      res.status(400).json({ success: false, message: 'Key index must be a non-negative integer' } as ApiResponse);
      return;
    }
    const { validateRingKey } = await import('../services/aiTutor');
    const result = await validateRingKey(index);
    res.json({ success: true, data: result } as ApiResponse);
  } catch (err) {
    console.error('Validate AI key error:', err);
    res.status(500).json({ success: false, message: 'Failed to validate AI key' } as ApiResponse);
  }
});

export default router;
