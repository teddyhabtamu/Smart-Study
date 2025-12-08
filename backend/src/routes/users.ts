import express from 'express';
import { body } from 'express-validator';
import bcrypt from 'bcryptjs';
import { query, dbAdmin } from '../database/config';
import { authenticateToken, requireRole, validateRequest } from '../middleware/auth';
import { ApiResponse, User } from '../types';

const router = express.Router();

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

    // Update user XP and level
    const updatedUser = await dbAdmin.update('users', userId, {
      xp: newXp,
      level: newLevel
    });

    // Create level up notification if leveled up
    if (leveledUp) {
      await dbAdmin.insert('notifications', {
        user_id: userId,
        title: 'Level Up!',
        message: `Congratulations! You reached Level ${newLevel}.`,
        type: 'SUCCESS',
        is_read: false
      });
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
router.put('/notifications/read', authenticateToken, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    await query(
      'UPDATE notifications SET is_read = true WHERE user_id = $1',
      [userId]
    );

    res.json({
      success: true,
      message: 'All notifications marked as read'
    } as ApiResponse);
  } catch (error) {
    console.error('Mark notifications read error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark notifications as read'
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

    // Create success notification using Supabase directly
    const { error: notificationError } = await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        title: 'Welcome to Student Pro!',
        message: 'Congratulations! You now have access to premium features including unlimited AI tutoring and exclusive content.',
        type: 'SUCCESS',
        is_read: false
      });

    if (notificationError) {
      console.error('Notification creation error:', notificationError);
      // Don't fail the whole request for notification error
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

export default router;
