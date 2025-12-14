import express from 'express';
import { body, query } from 'express-validator';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { dbAdmin, query as dbQuery } from '../database/config';
import { authenticateToken, requireRole, validateRequest } from '../middleware/auth';
import { config } from '../config';
import { ApiResponse, User, Document, Video, ForumPost } from '../types';
import { EmailService } from '../services/emailService';

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
router.delete('/users/:userId', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const targetUserId = userId;

    const user = dbAdmin.findOne('users', (u: any) => u.id === targetUserId);
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      } as ApiResponse);
    }

    // Mark user as inactive (you could add an 'active' field to the schema)
    dbAdmin.update('users', targetUserId, {
      role: 'INACTIVE', // Change role to indicate inactive
      updated_at: new Date().toISOString()
    });

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

    // Notify users about new document (non-blocking)
    if (inserted && inserted.id) {
      console.log('📧 Triggering new document notification for users');
      EmailService.notifyUsersAboutNewDocument(
        inserted.id,
        title,
        subject,
        grade,
        description,
        is_premium
      ).catch(error => {
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

    // Notify users about new video (non-blocking)
    if (inserted && inserted.id) {
      console.log('📧 Triggering new video notification for users');
      EmailService.notifyUsersAboutNewVideo(
        inserted.id,
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
    const id = parseInt(postId || '0');

    const post = dbAdmin.findOne('forum_posts', (p: any) => p.id === id);
    if (!post) {
      res.status(404).json({
        success: false,
        message: 'Forum post not found'
      } as ApiResponse);
    }

    dbAdmin.delete('forum_posts', id);

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

    const user = dbAdmin.findOne('users', (u: any) => u.id === targetUserId);
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      } as ApiResponse);
    }

    // Don't allow removing the last admin
    const admins = (await dbAdmin.get('users')).filter((u: any) => u.role === 'ADMIN');
    if (admins.length <= 1) {
      res.status(400).json({
        success: false,
        message: 'Cannot remove the last admin'
      } as ApiResponse);
    }

    dbAdmin.update('users', targetUserId, {
      role: 'STUDENT',
      updated_at: new Date().toISOString()
    });

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

export default router;
