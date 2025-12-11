import express from 'express';
import { body } from 'express-validator';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { query, dbAdmin, supabaseAdmin } from '../database/config';
import { authenticateToken, requireRole, validateRequest } from '../middleware/auth';
import { ApiResponse, User } from '../types';
import { NotificationService } from '../services/notificationService';
import { EmailService } from '../services/emailService';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// Configure multer for memory storage (we'll upload directly to Supabase)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

// Get top learners leaderboard (public endpoint) - only students, exclude admins
router.get('/leaderboard', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const limit = Number(req.query.limit) || 10;

    const result = await query(`
      SELECT id, name, xp, level, avatar
      FROM users
      WHERE role != 'ADMIN'
      ORDER BY xp DESC, level DESC
      LIMIT $1
    `, [limit]);

    // Transform data for frontend (hide sensitive info, add initials)
    const leaderboard = result.rows.map((user: any, index: number) => ({
      id: user.id,
      name: user.name,
      xp: user.xp || 0,
      level: user.level || 1,
      initial: user.name ? user.name.charAt(0).toUpperCase() : '?',
      avatar: user.avatar,
      rank: index + 1
    }));

    res.json({
      success: true,
      data: leaderboard
    } as ApiResponse);
  } catch (error) {
    console.error('Get leaderboard error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get leaderboard'
    } as ApiResponse);
  }
});

// Get user profile
router.get('/profile', authenticateToken, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    // Get user with notifications and bookmarks
    const userResult = await query(`
      SELECT u.id, u.name, u.email, u.role, u.is_premium, u.avatar, u.preferences,
             u.xp, u.level, u.streak, u.last_active_date, u.unlocked_badges,
             u.practice_attempts, u.created_at, u.updated_at,
             COALESCE(array_agg(b.item_id) FILTER (WHERE b.item_id IS NOT NULL), ARRAY[]::text[]) as bookmarks,
             json_agg(
               json_build_object(
                 'id', n.id,
                 'title', n.title,
                 'message', n.message,
                 'type', n.type,
                 'isRead', n.is_read,
                 'date', n.created_at
               ) ORDER BY n.created_at DESC
             ) as notifications
      FROM users u
      LEFT JOIN notifications n ON u.id = n.user_id
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

    // If notifications is null (no notifications), set it to empty array
    if (!user.notifications || user.notifications[0] === null) {
      user.notifications = [];
    }

    res.json({
      success: true,
      data: user
    } as ApiResponse<User>);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user profile'
    } as ApiResponse);
  }
});

// Update user profile
router.put('/profile', [
  authenticateToken,
  body('name').optional().trim().isLength({ min: 2, max: 255 }).withMessage('Name must be between 2 and 255 characters'),
  body('avatar').optional().isURL().withMessage('Avatar must be a valid URL'),
  body('preferences.emailNotifications').optional().isBoolean().withMessage('Email notifications must be boolean'),
  body('preferences.studyReminders').optional().isBoolean().withMessage('Study reminders must be boolean')
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { name, avatar, preferences } = req.body;

    const updates: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }

    if (avatar !== undefined) {
      updates.push(`avatar = $${paramCount++}`);
      values.push(avatar);
    }

    if (preferences !== undefined) {
      updates.push(`preferences = $${paramCount++}`);
      values.push(JSON.stringify(preferences));
    }

    if (updates.length === 0) {
      // If no valid fields to update, just return the current user data
      const currentUserResult = await query(
        'SELECT id, name, email, role, is_premium, avatar, preferences, xp, level, streak, last_active_date, unlocked_badges, practice_attempts, created_at, updated_at FROM users WHERE id = $1',
        [userId]
      );

      if (currentUserResult.rows.length === 0) {
        res.status(404).json({
          success: false,
          message: 'User not found'
        } as ApiResponse);
        return;
      }

      res.json({
        success: true,
        data: currentUserResult.rows[0],
        message: 'No changes made'
      } as ApiResponse<User>);
      return;
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(userId);

    const result = await query(`
      UPDATE users
      SET ${updates.join(', ')}
      WHERE id = $${paramCount}
      RETURNING id, name, email, role, is_premium, avatar, preferences, xp, level, streak, last_active_date, unlocked_badges, practice_attempts, created_at, updated_at
    `, values);

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Profile updated successfully'
    } as ApiResponse<User>);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    } as ApiResponse);
  }
});

// Upload avatar image
router.post('/avatar', authenticateToken, upload.single('avatar'), async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const file = req.file;

    if (!file) {
      res.status(400).json({
        success: false,
        message: 'No file uploaded'
      } as ApiResponse);
      return;
    }

    // Generate unique filename
    const fileExt = file.originalname.split('.').pop() || 'jpg';
    const fileName = `${userId}/${uuidv4()}.${fileExt}`;

    // Ensure the avatars bucket exists and check if it's public
    const { data: buckets, error: bucketsError } = await supabaseAdmin
      .storage
      .listBuckets();

    let isBucketPublic = false;
    if (!bucketsError && buckets) {
      const avatarsBucket = buckets.find(b => b.name === 'avatars');
      if (!avatarsBucket) {
        // Try to create the bucket as public (may fail if no permissions, but that's ok)
        const { error: createError } = await supabaseAdmin.storage.createBucket('avatars', {
          public: true,
          fileSizeLimit: 2097152, // 2MB
          allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
        });
        if (!createError) {
          isBucketPublic = true;
        }
      } else {
        isBucketPublic = avatarsBucket.public === true;
      }
    }

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabaseAdmin
      .storage
      .from('avatars')
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
        upsert: false, // Don't overwrite existing files
      });

    if (uploadError) {
      console.error('Supabase storage upload error:', uploadError);
      res.status(500).json({
        success: false,
        message: 'Failed to upload avatar'
      } as ApiResponse);
      return;
    }

    if (!uploadData || !uploadData.path) {
      console.error('Upload succeeded but no path returned:', uploadData);
      res.status(500).json({
        success: false,
        message: 'Failed to upload avatar: no path returned'
      } as ApiResponse);
      return;
    }

    // Use the actual path from the upload response (Supabase may normalize it)
    const filePath = uploadData.path;

    // Verify the file exists by trying to download it with admin client
    const { data: verifyData, error: verifyError } = await supabaseAdmin
      .storage
      .from('avatars')
      .download(filePath);

    if (verifyError || !verifyData) {
      console.error('File verification failed after upload:', verifyError);
      res.status(500).json({
        success: false,
        message: 'File uploaded but verification failed'
      } as ApiResponse);
      return;
    }

    // Generate URL based on bucket public status
    let avatarUrl: string;

    if (isBucketPublic) {
      // Use public URL if bucket is public
      const { data: urlData } = supabaseAdmin
        .storage
        .from('avatars')
        .getPublicUrl(filePath);

      if (urlData && urlData.publicUrl) {
        avatarUrl = urlData.publicUrl;
      } else {
        // Fallback to signed URL if public URL generation fails
        const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin
          .storage
          .from('avatars')
          .createSignedUrl(filePath, 31536000); // 1 year expiry

        if (signedUrlError || !signedUrlData?.signedUrl) {
          console.error('Failed to generate URL:', signedUrlError);
          res.status(500).json({
            success: false,
            message: 'Failed to generate avatar URL'
          } as ApiResponse);
          return;
        }

        avatarUrl = signedUrlData.signedUrl;
      }
    } else {
      // Use signed URL if bucket is not public
      const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin
        .storage
        .from('avatars')
        .createSignedUrl(filePath, 31536000); // 1 year expiry

      if (signedUrlError || !signedUrlData?.signedUrl) {
        console.error('Failed to generate signed URL:', signedUrlError);
        res.status(500).json({
          success: false,
          message: 'Failed to generate avatar URL. Please ensure the avatars bucket exists and is accessible.'
        } as ApiResponse);
        return;
      }

      avatarUrl = signedUrlData.signedUrl;
      console.warn('Bucket is not public. Using signed URL. To use public URLs, make the avatars bucket public in Supabase dashboard.');
    }

    // Log for debugging
    console.log('Avatar uploaded successfully:', {
      originalFileName: fileName,
      actualPath: filePath,
      avatarUrl,
      isSignedUrl: avatarUrl.includes('token=')
    });

    // Update user's avatar in database
    const result = await query(
      'UPDATE users SET avatar = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING avatar',
      [avatarUrl, userId]
    );

    res.json({
      success: true,
      data: {
        avatar: avatarUrl
      },
      message: 'Avatar uploaded successfully'
    } as ApiResponse);
  } catch (error) {
    console.error('Avatar upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload avatar'
    } as ApiResponse);
  }
});

// Get user bookmarks
router.get('/bookmarks', authenticateToken, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    const result = await query(`
      SELECT b.id, b.item_id, b.item_type, b.created_at,
             CASE
               WHEN b.item_type = 'document' THEN
                 json_build_object(
                   'id', d.id,
                   'title', d.title,
                   'subject', d.subject,
                   'grade', d.grade,
                   'file_type', d.file_type,
                   'is_premium', d.is_premium,
                   'preview_image', d.preview_image,
                   'author', d.author
                 )
               WHEN b.item_type = 'video' THEN
                 json_build_object(
                   'id', v.id,
                   'title', v.title,
                   'subject', v.subject,
                   'grade', v.grade,
                   'thumbnail', v.thumbnail,
                   'duration', v.duration,
                   'instructor', v.instructor,
                   'is_premium', v.is_premium
                 )
             END as item
      FROM bookmarks b
      LEFT JOIN documents d ON b.item_type = 'document' AND b.item_id = d.id::text
      LEFT JOIN videos v ON b.item_type = 'video' AND b.item_id = v.id::text
      WHERE b.user_id = $1
      ORDER BY b.created_at DESC
    `, [userId]);

    res.json({
      success: true,
      data: result.rows
    } as ApiResponse);
  } catch (error) {
    console.error('Get bookmarks error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get bookmarks'
    } as ApiResponse);
  }
});

// Add bookmark
router.post('/bookmarks', [
  authenticateToken,
  body('itemId').notEmpty().withMessage('Item ID is required'),
  body('itemType').isIn(['document', 'video']).withMessage('Item type must be document or video')
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { itemId, itemType } = req.body;

    const result = await query(`
      INSERT INTO bookmarks (user_id, item_id, item_type)
      VALUES ($1, $2, $3)
      RETURNING id, item_id, item_type, created_at
    `, [userId, itemId, itemType]);

    res.status(201).json({
      success: true,
      data: result.rows[0],
      message: 'Bookmark added successfully'
    } as ApiResponse);
  } catch (error) {
    console.error('Add bookmark error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add bookmark'
    } as ApiResponse);
  }
});

// Remove bookmark
router.delete('/bookmarks/:itemId/:itemType', authenticateToken, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { itemId, itemType } = req.params;

    const result = await query(
      'DELETE FROM bookmarks WHERE user_id = $1 AND item_id = $2 AND item_type = $3',
      [userId, itemId, itemType]
    );

    if (result.rowCount === 0) {
      res.status(404).json({
        success: false,
        message: 'Bookmark not found'
      } as ApiResponse);
      return;
    }

    res.json({
      success: true,
      message: 'Bookmark removed successfully'
    } as ApiResponse);
  } catch (error) {
    console.error('Remove bookmark error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove bookmark'
    } as ApiResponse);
  }
});

// Gain XP (gamification)
router.post('/gain-xp', [
  authenticateToken,
  body('amount').isInt({ min: 1, max: 1000 }).withMessage('XP amount must be between 1 and 1000')
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { amount } = req.body;

    // Get current user data to calculate new XP and level
    const currentUser = await dbAdmin.findOne('users', (u: any) => u.id === userId);
    if (!currentUser) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      } as ApiResponse);
      return;
    }

    const currentXp = currentUser.xp || 0;
    const newXp = currentXp + amount;
    const newLevel = Math.floor(newXp / 1000) + 1;
    const previousLevel = Math.floor(currentXp / 1000) + 1;
    const leveledUp = newLevel > previousLevel;

    // Check for newly unlocked badges based on level
    const currentUnlockedBadges = currentUser.unlocked_badges || ['b1'];
    const newUnlockedBadges: string[] = [];
    
    // Badge requirements (matching frontend constants)
    const badgeRequirements = [
      { id: 'b1', requiredLevel: 1 },
      { id: 'b2', requiredLevel: 5 },
      { id: 'b3', requiredLevel: 10 },
      { id: 'b5', requiredLevel: 2 },
      { id: 'b6', requiredLevel: 20 }
    ];

    // Check which badges should be unlocked based on new level
    for (const badge of badgeRequirements) {
      if (!currentUnlockedBadges.includes(badge.id) && newLevel >= badge.requiredLevel) {
        newUnlockedBadges.push(badge.id);
      }
    }

    // Update unlocked badges if any new ones were unlocked
    const allUnlockedBadges = [...new Set([...currentUnlockedBadges, ...newUnlockedBadges])];

    // Record XP history
    await dbAdmin.insert('xp_history', {
      user_id: userId,
      amount: amount,
      source: req.body.source || 'manual', // Allow source to be passed in request
      source_id: req.body.source_id || null,
      description: req.body.description || `Gained ${amount} XP`
    });

    // Record badge unlocks
    for (const badgeId of newUnlockedBadges) {
      // Check if badge unlock already exists
      const existingUnlock = await dbAdmin.findOne('badge_unlocks', (b: any) => 
        b.user_id === userId && b.badge_id === badgeId
      );
      
      if (!existingUnlock) {
        await dbAdmin.insert('badge_unlocks', {
          user_id: userId,
          badge_id: badgeId,
          unlocked_at: new Date().toISOString()
        });
      }
    }

    // Update user XP, level, and badges
    const updatedUser = await dbAdmin.update('users', userId, {
      xp: newXp,
      level: newLevel,
      unlocked_badges: allUnlockedBadges
    });

    // Create level up notification if leveled up
    if (leveledUp) {
      await NotificationService.createLevelUpNotification(userId, newLevel);
    }

    // Send achievement unlocked emails for newly unlocked badges (non-blocking)
    if (newUnlockedBadges.length > 0 && currentUser.email && currentUser.name) {
      const badgeNames: Record<string, { name: string; description: string }> = {
        'b1': { name: 'First Steps', description: 'Create your account and start learning.' },
        'b2': { name: 'Dedicated Student', description: 'Reach Level 5 by earning XP.' },
        'b3': { name: 'Scholar', description: 'Reach Level 10 and master your subjects.' },
        'b5': { name: 'Community Pillar', description: 'Contribute helpful answers in the forum.' },
        'b6': { name: 'Top of the Class', description: 'Reach Level 20. You are an expert!' }
      };

      for (const badgeId of newUnlockedBadges) {
        const badge = badgeNames[badgeId];
        if (badge) {
          console.log('📧 Triggering achievement unlocked email for badge:', { badgeId, badgeName: badge.name });
          EmailService.sendAchievementUnlockedEmail(
            currentUser.email,
            currentUser.name,
            badge.name,
            badge.description,
            leveledUp, // Include level up info if they leveled up
            leveledUp ? newLevel : undefined
          ).catch(error => {
            console.error(`❌ Failed to send achievement unlocked email for badge ${badgeId}:`, error);
            // Don't fail the request if email fails
          });
        }
      }
    }

    res.json({
      success: true,
      data: { xp: newXp, level: newLevel, leveledUp },
      message: `Gained ${amount} XP${leveledUp ? ` and reached level ${newLevel}!` : ''}`
    } as ApiResponse);
  } catch (error) {
    console.error('Gain XP error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to gain XP'
    } as ApiResponse);
  }
});

// Mark notifications as read
router.put('/notifications/read', [
  authenticateToken,
  body('notificationIds').optional().isArray().withMessage('notificationIds must be an array'),
  body('notificationIds.*').optional().isUUID().withMessage('Each notification ID must be a valid UUID')
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { notificationIds } = req.body;

    if (notificationIds && Array.isArray(notificationIds) && notificationIds.length > 0) {
      // Mark specific notifications as read
      await NotificationService.markAsRead(userId, notificationIds);
      res.json({
        success: true,
        message: 'Notifications marked as read'
      } as ApiResponse);
    } else {
      // Mark all notifications as read
      await NotificationService.markAsRead(userId);
      res.json({
        success: true,
        message: 'All notifications marked as read'
      } as ApiResponse);
    }
  } catch (error) {
    console.error('Mark notifications read error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark notifications as read'
    } as ApiResponse);
  }
});

// Delete a specific notification
router.delete('/notifications/:id', authenticateToken, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const notificationId = req.params.id;

    if (!notificationId) {
      res.status(400).json({
        success: false,
        message: 'Notification ID is required'
      } as ApiResponse);
      return;
    }

    const deleted = await NotificationService.delete(notificationId, userId);

    if (!deleted) {
      res.status(404).json({
        success: false,
        message: 'Notification not found'
      } as ApiResponse);
      return;
    }

    res.json({
      success: true,
      message: 'Notification deleted successfully'
    } as ApiResponse);
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete notification'
    } as ApiResponse);
  }
});

// Admin: Upgrade user to premium
router.put('/:userId/premium', [
  authenticateToken,
  requireRole(['ADMIN']),
  body('isPremium').isBoolean().withMessage('isPremium must be boolean')
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { isPremium } = req.body;

    // Import supabase for direct API calls
    const { supabase } = await import('../database/config');

    // Get current user state before update to check if it's a downgrade
    const { data: currentUser } = await supabase
      .from('users')
      .select('is_premium')
      .eq('id', userId)
      .single();
    
    const wasPremium = currentUser?.is_premium === true;

    const { data: userData, error } = await supabase
      .from('users')
      .update({
        is_premium: isPremium,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .select('id, name, email, is_premium')
      .single();

    if (error) {
      console.error('Admin premium update error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update premium status'
      } as ApiResponse);
      return;
    }

    if (!userData) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      } as ApiResponse);
      return;
    }

    // Create notification for the user
    if (userId) {
      try {
        await NotificationService.create({
          user_id: userId,
          title: isPremium ? 'Premium Activated!' : 'Premium Deactivated',
          message: isPremium
            ? 'Your premium subscription has been activated. Enjoy unlimited access!'
            : 'Your premium subscription has been deactivated.',
          type: isPremium ? 'SUCCESS' : 'INFO',
          is_read: false
        });
        console.log(`✅ Created notification for user ${userId}: Premium ${isPremium ? 'activated' : 'deactivated'}`);
      } catch (notificationError) {
        console.error('Failed to create notification:', notificationError);
        // Don't fail the whole request for notification error
      }
    }

    // Send premium email notifications (non-blocking)
    if (userData.email && userData.name) {
      if (isPremium) {
        console.log('📧 Triggering premium upgrade email for user:', { email: userData.email, name: userData.name });
        EmailService.sendPremiumUpgradeEmail(userData.email, userData.name).catch(error => {
          console.error('❌ Failed to send premium upgrade email:', error);
          // Don't fail the request if email fails
        });
      } else if (wasPremium) {
        // Only send downgrade email if user was previously premium
        console.log('📧 Triggering premium downgrade email for user:', { email: userData.email, name: userData.name });
        EmailService.sendPremiumDowngradeEmail(userData.email, userData.name).catch(error => {
          console.error('❌ Failed to send premium downgrade email:', error);
          // Don't fail the request if email fails
        });
      }
    }

    res.json({
      success: true,
      data: userData,
      message: `User ${isPremium ? 'upgraded to' : 'downgraded from'} premium`
    } as ApiResponse);
  } catch (error) {
    console.error('Update premium status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update premium status'
    } as ApiResponse);
  }
});

// Upgrade to premium (subscription)
router.post('/upgrade-premium', authenticateToken, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    // Import supabase for direct API calls
    const { supabase } = await import('../database/config');

    // Update user to premium using Supabase directly
    const { data: userData, error: userError } = await supabase
      .from('users')
      .update({
        is_premium: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', userId)
      .select('id, name, email, is_premium')
      .single();

    if (userError) {
      console.error('User update error:', userError);
      res.status(500).json({
        success: false,
        message: 'Failed to upgrade to premium'
      } as ApiResponse);
      return;
    }

    if (!userData) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      } as ApiResponse);
      return;
    }

    // Create premium upgrade notification
    try {
      await NotificationService.createPremiumUpgradeNotification(userId);
    } catch (notificationError) {
      console.error('Notification creation error:', notificationError);
      // Don't fail the whole request for notification error
    }

    // Send premium upgrade email (non-blocking)
    if (userData.email && userData.name) {
      console.log('📧 Triggering premium upgrade email for user:', { email: userData.email, name: userData.name });
      EmailService.sendPremiumUpgradeEmail(userData.email, userData.name).catch(error => {
        console.error('❌ Failed to send premium upgrade email:', error);
        // Don't fail the request if email fails
      });
    }

    res.json({
      success: true,
      data: userData,
      message: 'Successfully upgraded to premium!'
    } as ApiResponse);
  } catch (error) {
    console.error('Premium upgrade error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upgrade to premium'
    } as ApiResponse);
  }
});

// Change password
router.put('/password', [
  authenticateToken,
  body('currentPassword').exists().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters long'),
  body('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.newPassword) {
      throw new Error('Password confirmation does not match new password');
    }
    return true;
  })
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { currentPassword, newPassword } = req.body;

    // Get current user data including password hash
    const userResult = await query('SELECT password_hash FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      } as ApiResponse);
      return;
    }

    const user = userResult.rows[0];

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValidPassword) {
      res.status(400).json({
        success: false,
        message: 'Current password is incorrect'
      } as ApiResponse);
      return;
    }

    // Hash new password
    const saltRounds = 12;
    const newPasswordHash = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    await query('UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [newPasswordHash, userId]);

    // Get user info for email
    const userInfoResult = await query('SELECT name, email FROM users WHERE id = $1', [userId]);
    if (userInfoResult.rows.length > 0) {
      const user = userInfoResult.rows[0];
      
      // Send password reset success email (non-blocking, security notification)
      const changeTime = new Date().toLocaleString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short'
      });
      
      // Get device info from User-Agent header
      const userAgent = req.headers['user-agent'] || 'Unknown device';
      const deviceInfo = userAgent.length > 100 ? userAgent.substring(0, 100) + '...' : userAgent;
      
      console.log('📧 Triggering password change success email for user:', { email: user.email, name: user.name });
      EmailService.sendPasswordResetSuccessEmail(user.email, user.name, changeTime, deviceInfo).catch(error => {
        console.error('❌ Failed to send password change success email:', error);
        // Don't fail password change if email fails
      });
    }

    res.json({
      success: true,
      message: 'Password updated successfully'
    } as ApiResponse);
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change password'
    } as ApiResponse);
  }
});

// Delete account endpoint - allows users to delete their own account
router.delete('/account', authenticateToken, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    // Verify user exists
    const user = await dbAdmin.findOne('users', (u: any) => u.id === userId);
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      } as ApiResponse);
      return;
    }

    // Delete user account (this will cascade delete related data due to ON DELETE CASCADE)
    // Note: In production, you might want to soft delete instead
    await dbAdmin.delete('users', userId);

    console.log(`✅ Account deleted successfully for user: ${user.email}`);

    res.json({
      success: true,
      message: 'Account deleted successfully'
    } as ApiResponse);
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete account'
    } as ApiResponse);
  }
});

export default router;
