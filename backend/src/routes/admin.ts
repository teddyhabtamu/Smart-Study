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
  const activities = [];
  const now = new Date();

  try {
    // Get recent user registrations (last 7 days)
    const users = await dbAdmin.get('users');
    const recentUsers = users
      .filter((u: any) => {
        const userDate = new Date(u.created_at);
        const diffTime = now.getTime() - userDate.getTime();
        const diffDays = diffTime / (1000 * 3600 * 24);
        return diffDays <= 7;
      })
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5)
      .map((u: any) => ({
        type: 'user_registration',
        message: `New user "${u.name || u.email}" joined`,
        timestamp: u.created_at,
        user: { id: u.id, name: u.name, email: u.email }
      }));

    activities.push(...recentUsers);

    // Get recent premium subscriptions (last 7 days)
    const premiumUsers = users
      .filter((u: any) => {
        if (!u.is_premium) return false;
        // Assuming we have a premium_since field, otherwise we'll use created_at
        const premiumDate = u.premium_since ? new Date(u.premium_since) : new Date(u.created_at);
        const diffTime = now.getTime() - premiumDate.getTime();
        const diffDays = diffTime / (1000 * 3600 * 24);
        return diffDays <= 7;
      })
      .slice(0, 3)
      .map((u: any) => ({
        type: 'premium_subscription',
        message: `User "${u.name || u.email}" upgraded to Premium`,
        timestamp: u.premium_since || u.created_at,
        user: { id: u.id, name: u.name, email: u.email }
      }));

    activities.push(...premiumUsers);

    // Get recent content uploads (last 7 days)
    const documents = await dbAdmin.get('documents');
    const videos = await dbAdmin.get('videos');

    const recentDocuments = documents
      .filter((d: any) => {
        const docDate = new Date(d.created_at);
        const diffTime = now.getTime() - docDate.getTime();
        const diffDays = diffTime / (1000 * 3600 * 24);
        return diffDays <= 7;
      })
      .slice(0, 3)
      .map((d: any) => ({
        type: 'content_upload',
        message: `Document "${d.title}" was uploaded`,
        timestamp: d.created_at,
        content: { id: d.id, title: d.title, type: 'document' }
      }));

    const recentVideos = videos
      .filter((v: any) => {
        const vidDate = new Date(v.created_at);
        const diffTime = now.getTime() - vidDate.getTime();
        const diffDays = diffTime / (1000 * 3600 * 24);
        return diffDays <= 7;
      })
      .slice(0, 3)
      .map((v: any) => ({
        type: 'content_upload',
        message: `Video "${v.title}" was uploaded`,
        timestamp: v.created_at,
        content: { id: v.id, title: v.title, type: 'video' }
      }));

    activities.push(...recentDocuments, ...recentVideos);

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
    const users = await dbAdmin.get('users');
    const documents = await dbAdmin.get('documents');
    const videos = await dbAdmin.get('videos');
    const forumPosts = await dbAdmin.get('forum_posts');

    // Get recent activity
    const recentActivity = await getRecentActivity();

    const stats = {
      total_users: users.length,
      premium_users: users.filter((u: any) => u.is_premium).length,
      total_documents: documents.length,
      premium_documents: documents.filter((d: any) => d.is_premium).length,
      total_videos: videos.length,
      premium_videos: videos.filter((v: any) => v.is_premium).length,
      total_forum_posts: forumPosts.length,
      recent_activity: recentActivity
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

// User management endpoints
router.get('/users', requireRole(['ADMIN']), [
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('offset').optional().isInt({ min: 0 }).toInt(),
  query('search').optional().isString()
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const limit = Number(req.query.limit) || 50;
    const offset = Number(req.query.offset) || 0;
    const search = req.query.search;

    let users = await dbAdmin.get('users');

    // Filter out admin users (students management endpoint)
    users = users.filter((u: any) => u.role !== 'ADMIN');

    // Apply search filter
    if (search) {
      const searchTerm = search.toString().toLowerCase();
      users = users.filter((u: any) =>
        u.name.toLowerCase().includes(searchTerm) ||
        u.email.toLowerCase().includes(searchTerm)
      );
    }

    // Sort by creation date (newest first)
    users.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // Apply pagination
    const paginatedUsers = users.slice(offset, offset + limit);

    res.json({
      success: true,
      data: {
        users: paginatedUsers,
        pagination: {
          total: users.length,
          limit,
          offset,
          hasMore: offset + limit < users.length
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

    await dbAdmin.update('users', targetUserId, {
      is_premium: isPremium,
      updated_at: new Date().toISOString()
    });

    // Create notification for the user
    await dbAdmin.insert('notifications', {
      user_id: targetUserId,
      title: isPremium ? 'Premium Activated!' : 'Premium Deactivated',
      message: isPremium
        ? 'Your premium subscription has been activated. Enjoy unlimited access!'
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
      } else {
        // Check if user was previously premium (downgrade scenario)
        const wasPremium = user.is_premium === true || user.is_premium === 'true';
        if (wasPremium) {
          console.log('📧 Triggering premium downgrade email for user:', { email: user.email, name: user.name });
          EmailService.sendPremiumDowngradeEmail(user.email, user.name).catch(error => {
            console.error('❌ Failed to send premium downgrade email:', error);
            // Don't fail the request if email fails
          });
        }
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
  body('reason').optional().isString().withMessage('Reason must be a string')
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
  body('subject').isIn(['Mathematics', 'English', 'History', 'Chemistry', 'Physics', 'Biology', 'Aptitude']).withMessage('Valid subject required'),
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
  body('subject').isIn(['Mathematics', 'English', 'History', 'Chemistry', 'Physics', 'Biology', 'Aptitude']).withMessage('Valid subject required'),
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

// System maintenance endpoints
router.post('/maintenance/cleanup', requireRole(['ADMIN']), async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    // In a real implementation, you might clean up old logs, temporary files, etc.
    // For now, just return success
    res.json({
      success: true,
      message: 'System maintenance completed successfully'
    } as ApiResponse);
  } catch (error) {
    console.error('Maintenance error:', error);
    res.status(500).json({
      success: false,
      message: 'Maintenance failed'
    } as ApiResponse);
  }
});

// Get admin team members (admins and moderators)
router.get('/admins', requireRole(['ADMIN']), async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const users = await dbAdmin.get('users');
    // Get both admins and moderators
    const teamMembers = users.filter((u: any) => u.role === 'ADMIN' || u.role === 'MODERATOR');
    
    // Map users to include status (Active if status is 'Active', Inactive otherwise)
    const membersWithStatus = teamMembers.map((member: any) => ({
      ...member,
      status: member.status === 'Active' ? 'Active' : 'Inactive'
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

    // Check if user already exists
    const existingUser = await dbAdmin.findOne('users', (u: any) => u.email === email);
    if (existingUser) {
      res.status(400).json({
        success: false,
        message: 'User already exists'
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
    
    // Verify the role was saved correctly
    console.log('🔐 Admin invitation - User created:', {
      userId: inserted.id,
      email: inserted.email,
      role: inserted.role,
      expectedRole: role,
      roleMatch: inserted.role === role
    });

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

    // Send admin invitation email (non-blocking)
    console.log('📧 Triggering admin invitation email:', { email, name, role });
    EmailService.sendAdminInvitationEmail(email, name, role, invitationLink).catch(error => {
      console.error('❌ Failed to send admin invitation email:', error);
      // Don't fail the request if email fails
    });

    // Audit log (non-blocking)
    logAdminActivity(req, {
      action: 'admin.invite',
      target_type: 'admin_team',
      target_id: String(inserted?.id || ''),
      summary: `Invited ${email} as ${role}`,
      after: { id: inserted?.id, email, name, role, status: 'Inactive' },
      meta: { invited_email: email, invited_role: role },
    }).catch(() => {});

    res.status(201).json({
      success: true,
      message: 'Admin invitation sent successfully. They will receive an email with instructions to accept the invitation.',
      data: {
        userId: inserted.id,
        email,
        name,
        role
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

// Remove admin privileges
router.delete('/admins/:userId', requireRole(['ADMIN']), async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const targetUserId = userId;

    console.log('Attempting to remove admin with ID:', targetUserId);

    const user = await dbAdmin.findOne('users', (u: any) => u.id === targetUserId);
    if (!user) {
      console.log('User not found:', targetUserId);
      res.status(404).json({
        success: false,
        message: 'User not found'
      } as ApiResponse);
      return;
    }

    console.log('Found user:', { id: user.id, name: user.name, role: user.role });

    // Check if user is actually an admin or moderator
    if (user.role !== 'ADMIN' && user.role !== 'MODERATOR') {
      console.log('User is not an admin or moderator:', user.role);
      res.status(400).json({
        success: false,
        message: 'User is not an admin or moderator'
      } as ApiResponse);
      return;
    }

    // Don't allow removing the last admin (but allow removing moderators)
    const allUsers = await dbAdmin.get('users');
    const admins = allUsers.filter((u: any) => u.role === 'ADMIN');
    console.log('Total admins found:', admins.length);
    
    if (user.role === 'ADMIN' && admins.length <= 1) {
      console.log('Cannot remove the last admin');
      res.status(400).json({
        success: false,
        message: 'Cannot remove the last admin'
      } as ApiResponse);
      return;
    }

    const beforeRole = user.role;
    const updateResult = await dbAdmin.update('users', targetUserId, {
      role: 'STUDENT',
      updated_at: new Date().toISOString()
    });

    if (!updateResult) {
      console.log('Update failed - user may not exist');
      res.status(404).json({
        success: false,
        message: 'User not found or update failed'
      } as ApiResponse);
      return;
    }

    console.log('Admin privileges removed successfully for user:', targetUserId);

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

// Get system logs (mock implementation)
router.get('/logs', requireRole(['ADMIN']), async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    // In a real implementation, you would read from log files
    const mockLogs = [
      { timestamp: new Date().toISOString(), level: 'info', message: 'Server started successfully' },
      { timestamp: new Date(Date.now() - 3600000).toISOString(), level: 'info', message: 'User authentication successful' },
      { timestamp: new Date(Date.now() - 7200000).toISOString(), level: 'warn', message: 'High memory usage detected' }
    ];

    res.json({
      success: true,
      data: mockLogs
    } as ApiResponse);
  } catch (error) {
    console.error('Get logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get system logs'
    } as ApiResponse);
  }
});

// Privacy Policy Management
router.get('/privacy-policy', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const fs = require('fs');
    const path = require('path');

    const privacyPolicyPath = path.join(__dirname, '../../data/privacy-policy.json');

    let privacyPolicy;
    if (fs.existsSync(privacyPolicyPath)) {
      const data = fs.readFileSync(privacyPolicyPath, 'utf8');
      privacyPolicy = JSON.parse(data);
    } else {
      // Return default privacy policy
      privacyPolicy = {
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
Platform: SmartStudy
        `,
        lastUpdated: 'December 2025'
      };

      // Save the default policy
      fs.writeFileSync(privacyPolicyPath, JSON.stringify(privacyPolicy, null, 2));
    }

    res.json({
      success: true,
      data: privacyPolicy
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
    const fs = require('fs');
    const path = require('path');

    const privacyPolicyPath = path.join(__dirname, '../../data/privacy-policy.json');

    const privacyPolicyData = {
      content,
      lastUpdated: lastUpdated || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
    };

    // Save to file
    fs.writeFileSync(privacyPolicyPath, JSON.stringify(privacyPolicyData, null, 2));

    // Audit log (non-blocking)
    logAdminActivity(req, {
      action: 'privacy_policy.update',
      target_type: 'platform_settings',
      target_id: 'privacy_policy',
      summary: 'Updated privacy policy',
      after: privacyPolicyData
    }).catch(() => {});

    res.json({
      success: true,
      message: 'Privacy policy updated successfully',
      data: privacyPolicyData
    } as ApiResponse);
  } catch (error) {
    console.error('Update privacy policy error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update privacy policy'
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

export default router;
