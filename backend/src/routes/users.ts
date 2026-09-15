import express from 'express';
import { body } from 'express-validator';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import multer from 'multer';
import { query, dbAdmin, supabaseAdmin } from '../database/config';
import { authenticateToken, validateRequest } from '../middleware/auth';
import { OAUTH_PASSWORD_PLACEHOLDER } from '../middleware/googleAuth';
import { ApiResponse, User } from '../types';
import { NotificationService } from '../services/notificationService';
import { EmailService } from '../services/emailService';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();

// ---------------------------------------------------------------------------
// Account-deletion re-auth: a bare session token must not be enough to
// irreversibly delete an account (stolen-token / unattended-device risk).
// - Password accounts: must supply the current password (bcrypt-verified).
// - OAuth-only accounts (no usable password): must enter a 6-digit code
//   emailed to their inbox — typed-email was dropped because the address is
//   visible in-app, so it proved intent but not ownership.
// Pure + injected compare so it unit-tests without bcrypt or a database.
// ---------------------------------------------------------------------------
export interface DeletionPrincipal {
  email: string;
  password_hash: string | null;
}

/** OAuth sign-ups store OAUTH_PASSWORD_PLACEHOLDER, not a real hash. */
export const hasUsablePassword = (hash: string | null): boolean =>
  !!hash && hash !== OAUTH_PASSWORD_PLACEHOLDER;

export type DeletionVerdict =
  | { allowed: true }
  | { allowed: false; status: number; code: string; message: string };

export async function authorizePasswordDeletion(
  user: DeletionPrincipal | null,
  body: { password?: unknown },
  compare: (password: string, hash: string) => Promise<boolean>,
): Promise<DeletionVerdict> {
  if (!user) {
    return { allowed: false, status: 404, code: 'USER_NOT_FOUND', message: 'User not found' };
  }
  if (typeof body.password !== 'string' || body.password.length === 0) {
    return { allowed: false, status: 400, code: 'PASSWORD_REQUIRED', message: 'Please enter your password to delete your account' };
  }
  const ok = await compare(body.password, user.password_hash as string);
  if (!ok) {
    return { allowed: false, status: 401, code: 'INCORRECT_PASSWORD', message: 'Incorrect password' };
  }
  return { allowed: true };
}

// --- Deletion-code helpers (OAuth path). Hashes only on disk: 6 digits is
// a 1M space, so raw codes must never be stored and guesses are capped. ---
export const DELETION_CODE_TTL_MINUTES = 10;
export const DELETION_CODE_MAX_ATTEMPTS = 5;
export const DELETION_CODE_ISSUE_LIMIT = 3; // codes per user per 15 min (email-bomb guard)

export const generateDeletionCode = (): string =>
  String(crypto.randomInt(0, 1000000)).padStart(6, '0');

export const hashDeletionCode = (code: string): string =>
  crypto.createHash('sha256').update(code, 'utf8').digest('hex');

/** Constant-time comparison of two hex digests (equal length by construction). */
export const deletionCodeMatches = (code: string, storedHash: string): boolean => {
  const a = Buffer.from(hashDeletionCode(code), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

/** Mask an address for UI display (g***@example.com). Pure display helper. */
export const maskEmail = (email: string): string => {
  const [local, domain] = email.split('@');
  if (!domain) return 'your email';
  return `${(local || '').slice(0, 1)}***@${domain}`;
};

// --- Single-use emailed-code attempts, shared by deletion + password-setup.
// Pure decision table over the live code row; the handler owns the UPDATEs.
// attempts arrives as number (INT col) but string-safe just in case. ---
export interface LiveCodeRow {
  id: string;
  code_hash: string;
  attempts: number | string;
}

export type CodeVerdict =
  | { status: 'ok'; id: string }
  | { status: 'missing' }
  | { status: 'locked'; id: string }
  | { status: 'invalid'; id: string; attemptsLeft: number };

export const resolveCodeAttempt = (row: LiveCodeRow | undefined, code: string): CodeVerdict => {
  if (!row) return { status: 'missing' };
  const attempts = typeof row.attempts === 'string' ? parseInt(row.attempts, 10) || 0 : row.attempts;
  if (attempts >= DELETION_CODE_MAX_ATTEMPTS) return { status: 'locked', id: row.id };
  if (!deletionCodeMatches(code, row.code_hash)) {
    return { status: 'invalid', id: row.id, attemptsLeft: DELETION_CODE_MAX_ATTEMPTS - attempts - 1 };
  }
  return { status: 'ok', id: row.id };
};

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

// Get top learners leaderboard (public endpoint) - students only, staff excluded
router.get('/leaderboard', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    // Clamp: an unbounded ?limit= would dump the whole user table
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);

    const result = await query(`
      SELECT id, name, xp, level, avatar
      FROM users
      WHERE role NOT IN ('ADMIN', 'MODERATOR')
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

    // Get user with notifications and bookmarks.
    // Notifications are capped at the latest 50: the bell dropdown only
    // shows recent items, and an uncapped json_agg grew the profile payload
    // (fetched on every bell open) without bound on old accounts.
    // unread_count is computed over ALL rows so the badge stays exact even
    // when unread items fall outside the 50-item window.
    const userResult = await query(`
      SELECT u.id, u.name, u.email, u.role, u.is_premium, u.avatar, u.preferences,
             u.xp, u.level, u.streak, u.last_active_date, u.unlocked_badges,
             u.practice_attempts, u.grade, u.premium_since, u.created_at, u.updated_at,
             (u.password_hash IS NOT NULL AND u.password_hash != $2) AS has_password,
             COALESCE(array_agg(b.item_id) FILTER (WHERE b.item_id IS NOT NULL), ARRAY[]::text[]) as bookmarks,
             COALESCE(nagg.notifications, '[]') as notifications,
             COALESCE((SELECT COUNT(*) FROM notifications WHERE user_id = u.id AND is_read IS NOT TRUE), 0)::int as unread_count
      FROM users u
      LEFT JOIN bookmarks b ON u.id = b.user_id
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object(
                 'id', n.id,
                 'title', n.title,
                 'message', n.message,
                 'type', n.type,
                 'isRead', n.is_read,
                 'date', n.created_at
               ) ORDER BY n.created_at DESC) as notifications
        FROM (SELECT id, title, message, type, is_read, created_at
              FROM notifications WHERE user_id = u.id
              ORDER BY created_at DESC LIMIT 50) n
      ) nagg ON true
      WHERE u.id = $1
      GROUP BY u.id, nagg.notifications
    `, [userId, OAUTH_PASSWORD_PLACEHOLDER]);

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
  body('grade').optional({ nullable: true }).custom((v) => v === null || (Number.isInteger(Number(v)) && Number(v) >= 9 && Number(v) <= 12)).withMessage('Grade must be between 9 and 12'),
  body('preferences.emailNotifications').optional().isBoolean().withMessage('Email notifications must be boolean'),
  body('preferences.studyReminders').optional().isBoolean().withMessage('Study reminders must be boolean')
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { name, avatar, preferences, grade } = req.body;

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

    if (grade !== undefined) {
      updates.push(`grade = $${paramCount++}`);
      values.push(grade === null || grade === '' ? null : Number(grade));
    }

    if (preferences !== undefined) {
      updates.push(`preferences = $${paramCount++}`);
      values.push(JSON.stringify(preferences));
    }

    if (updates.length === 0) {
      // If no valid fields to update, just return the current user data
      const currentUserResult = await query(
        'SELECT id, name, email, role, is_premium, avatar, preferences, xp, level, streak, last_active_date, unlocked_badges, practice_attempts, grade, premium_since, created_at, updated_at FROM users WHERE id = $1',
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
      RETURNING id, name, email, role, is_premium, avatar, preferences, xp, level, streak, last_active_date, unlocked_badges, practice_attempts, grade, premium_since, created_at, updated_at
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

    // Generate unique filename. Extension comes from the verified mimetype,
    // never the client-supplied originalname (which can lack an extension or
    // smuggle path separators into the storage key).
    const extByMime: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp'
    };
    const fileExt = extByMime[file.mimetype] || 'jpg';
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

    // Idempotent: the table has UNIQUE(user_id, item_id, item_type), so a
    // blind INSERT 500s on double-clicks/retries. Return the existing row.
    const existing = await query(
      'SELECT id, item_id, item_type, created_at FROM bookmarks WHERE user_id = $1 AND item_id = $2 AND item_type = $3',
      [userId, itemId, itemType]
    );
    if (existing.rows.length > 0) {
      res.json({
        success: true,
        data: existing.rows[0],
        message: 'Bookmark already exists'
      } as ApiResponse);
      return;
    }

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

// NOTE: there is deliberately NO generic gain-XP endpoint. A previous
// POST /gain-xp accepted any client-chosen amount (1-1000, unlimited calls),
// so max level was one curl loop away. XP is now credited only inside the
// action endpoints via the shared awardXP() helper (services/xpService.ts),
// which keeps level math, badge unlocks, history, and notifications identical
// everywhere.

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

// NOTE: there is intentionally NO premium-toggle route on this router. The
// canonical endpoint is PUT /api/admin/users/:userId/premium (routes/admin.ts,
// ADMIN-only, stamps premium_since) and it is the only caller the frontend
// uses. A duplicate lived here that skipped premium_since, so "Member since"
// dates never populated for anyone upgraded through it — removed to end the
// drift.

// Upgrade to premium (subscription)
// NOTE: there is intentionally NO self-service premium upgrade endpoint.
// Premium may only be granted through the admin route (PUT /admin/users/:id/premium)
// after manual Telebirr receipt verification. A previous /upgrade-premium
// endpoint allowed any authenticated user to self-activate Pro and was removed.

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
// Issue an emailed deletion code (OAuth-only accounts). Password accounts
// must use their password instead — a code would downgrade their proof.
router.post('/account/deletion-code', authenticateToken, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const userResult = await query('SELECT id, name, email, password_hash FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];
    if (!user) {
      res.status(404).json({ success: false, code: 'USER_NOT_FOUND', message: 'User not found' } as ApiResponse);
      return;
    }
    if (hasUsablePassword(user.password_hash)) {
      res.status(400).json({ success: false, code: 'PASSWORD_FLOW', message: 'This account has a password — enter it to delete your account' } as ApiResponse);
      return;
    }
    // Email-bomb guard: few codes per user per window (single active code
    // invariant is enforced below by retiring older ones).
    const recent = await query(
      `SELECT COUNT(*) AS n FROM account_deletion_codes
       WHERE user_id = $1 AND created_at > NOW() - INTERVAL '15 minutes'`,
      [userId],
    );
    if (parseInt(recent.rows[0]?.n || '0', 10) >= DELETION_CODE_ISSUE_LIMIT) {
      res.status(429).json({ success: false, code: 'TOO_MANY_CODES', message: 'Too many codes requested. Please try again in 15 minutes.' } as ApiResponse);
      return;
    }
    await query('UPDATE account_deletion_codes SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL', [userId]);
    const code = generateDeletionCode();
    await query(
      `INSERT INTO account_deletion_codes (user_id, code_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '10 minutes')`,
      [userId, hashDeletionCode(code)],
    );
    // Awaited on purpose (fail closed): a code the inbox never got is worse
    // than a slow response on this rare action.
    const sent = await EmailService.sendAccountDeletionCodeEmail(user.email, user.name, code);
    if (!sent) {
      res.status(503).json({ success: false, code: 'EMAIL_SEND_FAILED', message: 'Could not send the code. Please try again later.' } as ApiResponse);
      return;
    }
    res.json({ success: true, data: { email: maskEmail(user.email) } } as ApiResponse);
  } catch (error) {
    console.error('Deletion code issue error:', error);
    res.status(500).json({ success: false, message: 'Failed to send verification code' } as ApiResponse);
  }
});

router.delete('/account', authenticateToken, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    // Verify user exists (id + email + hash only — never the full row).
    const userResult = await query('SELECT id, email, password_hash FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0] as DeletionPrincipal | undefined;
    if (!user) {
      res.status(404).json({
        success: false,
        code: 'USER_NOT_FOUND',
        message: 'User not found'
      } as ApiResponse);
      return;
    }

    if (hasUsablePassword(user.password_hash)) {
      // Fresh password re-auth before anything irreversible.
      const verdict = await authorizePasswordDeletion(user, req.body || {}, bcrypt.compare);
      if (!verdict.allowed) {
        res.status(verdict.status).json({
          success: false,
          code: verdict.code,
          message: verdict.message
        } as ApiResponse);
        return;
      }
    } else {
      // OAuth-only: emailed-code proof of inbox control (see POST above).
      const code = (req.body || {}).code;
      if (typeof code !== 'string' || !/^\d{6}$/.test(code)) {
        res.status(400).json({ success: false, code: 'CODE_REQUIRED', message: 'Enter the 6-digit code sent to your email' } as ApiResponse);
        return;
      }
      const codeRow = await query(
        `SELECT id, code_hash, attempts FROM account_deletion_codes
         WHERE user_id = $1 AND used_at IS NULL AND expires_at > NOW()
         ORDER BY created_at DESC LIMIT 1`,
        [userId],
      );
      const attempt = resolveCodeAttempt(codeRow.rows[0], code);
      if (attempt.status === 'missing') {
        res.status(400).json({ success: false, code: 'NO_ACTIVE_CODE', message: 'Code expired or missing — request a new one' } as ApiResponse);
        return;
      }
      if (attempt.status === 'locked') {
        await query('UPDATE account_deletion_codes SET used_at = NOW() WHERE id = $1', [attempt.id]);
        res.status(429).json({ success: false, code: 'CODE_LOCKED', message: 'Too many wrong attempts — request a new code' } as ApiResponse);
        return;
      }
      if (attempt.status === 'invalid') {
        const n = attempt.attemptsLeft;
        await query('UPDATE account_deletion_codes SET attempts = attempts + 1 WHERE id = $1', [attempt.id]);
        res.status(401).json({ success: false, code: 'INVALID_CODE', message: `Incorrect code${n > 0 ? ` — ${n} attempt${n === 1 ? '' : 's'} left` : ''}`, data: { attemptsLeft: n } } as ApiResponse);
        return;
      }
      await query('UPDATE account_deletion_codes SET used_at = NOW() WHERE id = $1', [attempt.id]);
    }

    // Delete user account (this will cascade delete related data due to ON DELETE CASCADE)
    // Note: In production, you might want to soft delete instead
    await dbAdmin.delete('users', userId);

    // Log the ID only — never the email (PII doesn't belong in server logs).
    console.log(`✅ Account deleted successfully for user id: ${userId}`);

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

// Issue a password-setup code (OAuth-only accounts setting their first
// password). Without inbox proof, a stolen session could set a password and
// take over the account — hence the code, mirroring deletion codes.
router.post('/account/password-code', authenticateToken, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const userResult = await query('SELECT id, name, email, password_hash FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];
    if (!user) {
      res.status(404).json({ success: false, code: 'USER_NOT_FOUND', message: 'User not found' } as ApiResponse);
      return;
    }
    if (hasUsablePassword(user.password_hash)) {
      res.status(400).json({ success: false, code: 'HAS_PASSWORD', message: 'This account already has a password — use change password instead' } as ApiResponse);
      return;
    }
    const recent = await query(
      `SELECT COUNT(*) AS n FROM password_setup_codes
       WHERE user_id = $1 AND created_at > NOW() - INTERVAL '15 minutes'`,
      [userId],
    );
    if (parseInt(recent.rows[0]?.n || '0', 10) >= DELETION_CODE_ISSUE_LIMIT) {
      res.status(429).json({ success: false, code: 'TOO_MANY_CODES', message: 'Too many codes requested. Please try again in 15 minutes.' } as ApiResponse);
      return;
    }
    await query('UPDATE password_setup_codes SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL', [userId]);
    const code = generateDeletionCode();
    await query(
      `INSERT INTO password_setup_codes (user_id, code_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '10 minutes')`,
      [userId, hashDeletionCode(code)],
    );
    // Awaited (fail closed): a code the inbox never got is unusable.
    const sent = await EmailService.sendPasswordSetupCodeEmail(user.email, user.name, code);
    if (!sent) {
      res.status(503).json({ success: false, code: 'EMAIL_SEND_FAILED', message: 'Could not send the code. Please try again later.' } as ApiResponse);
      return;
    }
    res.json({ success: true, data: { email: maskEmail(user.email) } } as ApiResponse);
  } catch (error) {
    console.error('Setup code issue error:', error);
    res.status(500).json({ success: false, message: 'Failed to send verification code' } as ApiResponse);
  }
});

// Set the first password on an OAuth-only account (code-verified).
router.put('/account/password', [
  authenticateToken,
  body('code').matches(/^\d{6}$/).withMessage('A 6-digit code is required'),
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
    const { code, newPassword } = req.body;
    const userResult = await query('SELECT id, name, email, password_hash FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];
    if (!user) {
      res.status(404).json({ success: false, code: 'USER_NOT_FOUND', message: 'User not found' } as ApiResponse);
      return;
    }
    if (hasUsablePassword(user.password_hash)) {
      res.status(400).json({ success: false, code: 'HAS_PASSWORD', message: 'This account already has a password — use change password instead' } as ApiResponse);
      return;
    }
    const codeRow = await query(
      `SELECT id, code_hash, attempts FROM password_setup_codes
       WHERE user_id = $1 AND used_at IS NULL AND expires_at > NOW()
       ORDER BY created_at DESC LIMIT 1`,
      [userId],
    );
    const attempt = resolveCodeAttempt(codeRow.rows[0], code);
    if (attempt.status === 'missing') {
      res.status(400).json({ success: false, code: 'NO_ACTIVE_CODE', message: 'Code expired or missing — request a new one' } as ApiResponse);
      return;
    }
    if (attempt.status === 'locked') {
      await query('UPDATE password_setup_codes SET used_at = NOW() WHERE id = $1', [attempt.id]);
      res.status(429).json({ success: false, code: 'CODE_LOCKED', message: 'Too many wrong attempts — request a new code' } as ApiResponse);
      return;
    }
    if (attempt.status === 'invalid') {
      const n = attempt.attemptsLeft;
      await query('UPDATE password_setup_codes SET attempts = attempts + 1 WHERE id = $1', [attempt.id]);
      res.status(401).json({ success: false, code: 'INVALID_CODE', message: `Incorrect code${n > 0 ? ` — ${n} attempt${n === 1 ? '' : 's'} left` : ''}` } as ApiResponse);
      return;
    }
    const newPasswordHash = await bcrypt.hash(newPassword, 12);
    await query('UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [newPasswordHash, userId]);
    await query('UPDATE password_setup_codes SET used_at = NOW() WHERE id = $1', [attempt.id]);

    // Credential-change notification (non-blocking, mirrors change-password).
    const changeTime = new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
    const userAgent = (req.headers['user-agent'] || 'Unknown device').slice(0, 100);
    EmailService.sendPasswordResetSuccessEmail(user.email, user.name, changeTime, userAgent).catch((error) => {
      console.error('❌ Failed to send password-set confirmation email:', error);
    });

    res.json({ success: true, message: 'Password set successfully' } as ApiResponse);
  } catch (error) {
    console.error('Set password error:', error);
    res.status(500).json({ success: false, message: 'Failed to set password' } as ApiResponse);
  }
});

export default router;
