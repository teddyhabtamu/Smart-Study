import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { body } from 'express-validator';
import { query, supabase } from '../database/config';
import { config } from '../config';
import { authenticateToken, generateToken, validateRequest } from '../middleware/auth';
import passport from '../middleware/googleAuth';
import { LoginRequest, RegisterRequest, AuthResponse, ApiResponse, User } from '../types';
import { NotificationService } from '../services/notificationService';
import { EmailService } from '../services/emailService';

const router = express.Router();

// Register endpoint
router.post('/register', [
  body('name').trim().isLength({ min: 2, max: 255 }).withMessage('Name must be between 2 and 255 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long')
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { name, email, password }: RegisterRequest = req.body;

    // Check if user already exists
    const existingUser = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingUser.rows.length > 0) {
      res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      } as AuthResponse);
      return;
    }

    // Hash password
    const saltRounds = 12;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // Create user
    const result = await query(`
      INSERT INTO users (name, email, password_hash, role, preferences, unlocked_badges)
      VALUES ($1, $2, $3, 'STUDENT', '{"emailNotifications": true, "studyReminders": true}', ARRAY['b1'])
      RETURNING id, name, email, role, is_premium, avatar, preferences, xp, level, streak, last_active_date, unlocked_badges, practice_attempts, created_at, updated_at
    `, [name, email, password_hash]);

    const user = result.rows[0];
    // Add bookmarks array (empty for new users)
    user.bookmarks = [];
    const token = generateToken(user);

    // Create welcome notification
    await NotificationService.createWelcomeNotification(user.id);

    // Send welcome email via Brevo (non-blocking)
    console.log('📧 Triggering welcome email for new user:', { email: user.email, name: user.name });
    EmailService.sendWelcomeEmail(user.email, user.name).catch(error => {
      console.error('❌ Failed to send welcome email:', error);
      // Don't fail registration if email fails
    });

    res.status(201).json({
      success: true,
      user,
      token,
      message: 'User registered successfully'
    } as AuthResponse);
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      message: 'Registration failed'
    } as AuthResponse);
  }
});

// Login endpoint
router.post('/login', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required'),
  body('password').exists().withMessage('Password is required')
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { email, password }: LoginRequest = req.body;

    // Find user
    const result = await query(`
      SELECT id, name, email, password_hash, role, is_premium, avatar, preferences, xp, level, streak, last_active_date, unlocked_badges, practice_attempts, created_at, updated_at
      FROM users WHERE email = $1
    `, [email]);

    if (result.rows.length === 0) {
      res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      } as AuthResponse);
      return;
    }

    const user = result.rows[0];

    // Get bookmarks for this user
    const bookmarksResult = await query(`
      SELECT item_id FROM bookmarks WHERE user_id = $1
    `, [user.id]);

    user.bookmarks = bookmarksResult.rows.map(row => row.item_id);

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      } as AuthResponse);
      return;
    }

    // Update last active date and streak
    const today = new Date().toISOString().split('T')[0];
    const todayDate = new Date(today as string);
    if (user.last_active_date !== today) {
      const lastActive = user.last_active_date ? new Date(user.last_active_date) : todayDate;
      const diffTime = Math.abs(todayDate.getTime() - lastActive.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      let newStreak = user.streak;
      if (diffDays === 1) {
        newStreak += 1; // Consecutive day
      } else if (diffDays > 1) {
        newStreak = 1; // Streak broken
      }

      // Get current unlocked badges before update
      const currentUnlockedBadges = user.unlocked_badges || ['b1'];

      // Update user activity using Supabase directly
      const { error: updateError } = await supabase
        .from('users')
        .update({
          last_active_date: today,
          streak: newStreak,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (updateError) {
        console.error('Failed to update user activity:', updateError);
      }

      const previousStreak = user.streak || 0;
      user.streak = newStreak;
      user.last_active_date = today;

      // Check for newly unlocked badges (non-blocking)
      if (newStreak > previousStreak) {
        EmailService.checkAndUnlockBadges(
          user.id,
          user.level || 1,
          newStreak,
          currentUnlockedBadges
        ).catch(error => {
          console.error('❌ Failed to check badges on login:', error);
        });

        // Check for streak milestones (7, 14, 30, 50, 100 days)
        const streakMilestones = [7, 14, 30, 50, 100];
        if (streakMilestones.includes(newStreak)) {
          await NotificationService.createStreakMilestoneNotification(user.id, newStreak);
          
          // Send streak milestone email (non-blocking)
          if (user.email && user.name) {
            EmailService.sendStreakMilestoneEmail(
              user.email,
              user.name,
              newStreak
            ).catch(error => {
              console.error('❌ Failed to send streak milestone email on login:', error);
            });
          }
        }
      }
    }

    // Remove password hash from response
    delete user.password_hash;

    const token = generateToken(user);

    // Send login success email (non-blocking, security notification)
    // Note: Login notifications are security-related, so we send them even if user has email notifications disabled
    const loginTime = new Date().toLocaleString('en-US', {
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
    
    // Get IP address for location (simplified - in production, use a geolocation service)
    const ip = req.ip || req.socket.remoteAddress || 'Unknown';
    const location = `IP: ${ip}`; // Simplified - you can enhance this with geolocation API
    
    console.log('📧 Triggering login success email for user:', { email: user.email, name: user.name });
    EmailService.sendLoginSuccessEmail(user.email, user.name, loginTime, deviceInfo, location).catch(error => {
      console.error('❌ Failed to send login success email:', error);
      // Don't fail login if email fails
    });

    res.json({
      success: true,
      user,
      token,
      message: 'Login successful'
    } as AuthResponse);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed'
    } as AuthResponse);
  }
});

// Verify token endpoint
router.get('/verify', authenticateToken, (req: express.Request, res: express.Response): void => {
  res.json({
    success: true,
    user: req.user,
    message: 'Token is valid'
  } as ApiResponse);
});

// Logout endpoint (client-side token removal)
router.post('/logout', (req: express.Request, res: express.Response): void => {
  res.json({
    success: true,
    message: 'Logged out successfully'
  } as ApiResponse);
});

// Google OAuth routes
router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/login', session: false }),
  (req: express.Request, res: express.Response): void => {
    // Generate JWT token for the authenticated user
    // req.user is guaranteed to exist here due to successful authentication
    const token = generateToken(req.user as User);

    // Redirect to frontend auth callback with token
    const frontendUrl = config.server.frontendUrl || 'http://localhost:5173';
    const redirectUrl = `${frontendUrl}/auth/callback?token=${token}&success=true`;
    res.redirect(redirectUrl);
  }
);

// Forgot password endpoint - Request password reset
router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail().withMessage('Valid email is required')
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { email } = req.body;

    // Find user by email
    const result = await query('SELECT id, name, email FROM users WHERE email = $1', [email]);

    // Always return success message (security best practice - don't reveal if email exists)
    // But only send email if user exists
    if (result.rows.length > 0) {
      const user = result.rows[0];

      // Generate short opaque token (32 bytes = 64 hex characters)
      const resetToken = crypto.randomBytes(32).toString('hex');
      
      // Calculate expiration time (1 hour from now)
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1);

      // Store token in database
      await query(
        'INSERT INTO tokens (token, user_id, type, expires_at) VALUES ($1, $2, $3, $4)',
        [resetToken, user.id, 'password-reset', expiresAt.toISOString()]
      );
      
      // Verify token was saved (debugging)
      const verifyToken = await query(
        'SELECT token FROM tokens WHERE token = $1',
        [resetToken]
      );
      console.log('🔐 Token saved verification:', {
        saved: verifyToken.rows.length > 0,
        tokenLength: resetToken.length,
        tokenPreview: resetToken.substring(0, 20) + '...'
      });

      // Create reset link (short token, no encoding needed)
      const frontendUrl = config.server.frontendUrl || 'http://localhost:5173';
      const resetLink = `${frontendUrl}/reset-password?token=${resetToken}`;

      // Send password reset email (truly non-blocking - deferred to next event loop)
      // This ensures the HTTP response is sent immediately, even if Brevo API hangs
      console.log('📧 Triggering password reset email for user:', { email: user.email, name: user.name });
      setImmediate(() => {
        EmailService.sendPasswordResetEmail(user.email, user.name, resetLink).catch(error => {
          console.error('❌ Failed to send password reset email:', error);
          // Don't fail the request if email fails
        });
      });
    }

    // Always return success (security best practice)
    // Response is sent immediately, email sending happens in background
    res.json({
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent.'
    } as ApiResponse);
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process password reset request'
    } as ApiResponse);
  }
});

// Reset password endpoint - Validate token and update password
router.post('/reset-password', [
  body('token').exists().withMessage('Reset token is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long')
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { token, password } = req.body;

    console.log('🔐 Reset password request received');
    console.log('🔐 Token length:', token ? token.length : 0);
    console.log('🔐 Token received (raw):', token ? token.substring(0, 20) + '...' : 'none');

    // Clean and decode token (handle URL encoding and whitespace)
    let cleanedToken = token ? token.trim() : token;
    
    // Try URL decoding in case frontend encoded it
    try {
      cleanedToken = decodeURIComponent(cleanedToken);
    } catch (e) {
      // If decoding fails, use original (might not be encoded)
      console.log('🔐 Token not URL encoded, using as-is');
    }
    
    console.log('🔐 Token after cleaning:', cleanedToken ? cleanedToken.substring(0, 20) + '...' : 'none');
    console.log('🔐 Token length after cleaning:', cleanedToken ? cleanedToken.length : 0);

    // Verify token from database
    const tokenResult = await query(
      'SELECT token, user_id, type, expires_at, used_at FROM tokens WHERE token = $1 AND type = $2',
      [cleanedToken, 'password-reset']
    );

    console.log('🔐 Token query result:', {
      found: tokenResult.rows.length > 0,
      rowCount: tokenResult.rows.length
    });

    if (tokenResult.rows.length === 0) {
      // Additional debugging: check if token exists without type filter
      const anyTokenResult = await query(
        'SELECT token, type, expires_at, used_at FROM tokens WHERE token = $1',
        [cleanedToken]
      );
      console.error('🔐 Token not found with type filter');
      console.error('🔐 Token exists without type filter:', anyTokenResult.rows.length > 0);
      if (anyTokenResult.rows.length > 0) {
        console.error('🔐 Found token with type:', anyTokenResult.rows[0].type);
      }
      
      res.status(400).json({
        success: false,
        message: 'Invalid reset token'
      } as ApiResponse);
      return;
    }

    const tokenRecord = tokenResult.rows[0];

    // Check if token has been used
    if (tokenRecord.used_at) {
      console.error('🔐 Token already used');
      res.status(400).json({
        success: false,
        message: 'This reset token has already been used. Please request a new one.'
      } as ApiResponse);
      return;
    }

    // Check if token has expired
    const expiresAt = new Date(tokenRecord.expires_at);
    if (expiresAt < new Date()) {
      console.error('🔐 Token expired');
      res.status(400).json({
        success: false,
        message: 'Reset token has expired. Please request a new one.'
      } as ApiResponse);
      return;
    }

    // Get user
    const userResult = await query('SELECT id, name, email FROM users WHERE id = $1', [tokenRecord.user_id]);
    if (userResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      } as ApiResponse);
      return;
    }

    const user = userResult.rows[0];

    // Hash new password
    const saltRounds = 12;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // Update password and mark token as used
    await query('UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [password_hash, user.id]);
    await query('UPDATE tokens SET used_at = CURRENT_TIMESTAMP WHERE token = $1', [cleanedToken]);
    console.log('✅ Password updated successfully for user:', user.email);

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
    
    console.log('📧 Triggering password reset success email for user:', { email: user.email, name: user.name });
    EmailService.sendPasswordResetSuccessEmail(user.email, user.name, changeTime, deviceInfo).catch(error => {
      console.error('❌ Failed to send password reset success email:', error);
      // Don't fail password reset if email fails
    });

    res.json({
      success: true,
      message: 'Password has been reset successfully'
    } as ApiResponse);
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset password'
    } as ApiResponse);
  }
});

// Accept admin invitation endpoint - Validate token and set password
router.post('/accept-invitation', [
  body('token').exists().withMessage('Invitation token is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long')
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { token, password } = req.body;

    // Verify token from database
    const tokenResult = await query(
      'SELECT token, user_id, type, expires_at, used_at FROM tokens WHERE token = $1 AND type = $2',
      [token, 'admin-invitation']
    );

    if (tokenResult.rows.length === 0) {
      console.error('🔐 Invitation token not found');
      res.status(400).json({
        success: false,
        message: 'Invalid invitation token'
      } as ApiResponse);
      return;
    }

    const tokenRecord = tokenResult.rows[0];

    // Check if token has been used
    if (tokenRecord.used_at) {
      console.error('🔐 Invitation token already used');
      res.status(400).json({
        success: false,
        message: 'This invitation token has already been used.'
      } as ApiResponse);
      return;
    }

    // Check if token has expired
    const expiresAt = new Date(tokenRecord.expires_at);
    if (expiresAt < new Date()) {
      console.error('🔐 Invitation token expired');
      res.status(400).json({
        success: false,
        message: 'Invitation token has expired. Please contact an administrator for a new invitation.'
      } as ApiResponse);
      return;
    }

    // Find user by ID from token
    const result = await query(
      'SELECT id, email, name, role, status, is_premium, avatar, preferences, xp, level, streak, last_active_date, unlocked_badges, practice_attempts, created_at, updated_at FROM users WHERE id = $1',
      [tokenRecord.user_id]
    );
    
    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      } as ApiResponse);
      return;
    }

    const user = result.rows[0];

    // Log the role before update to verify it's preserved
    console.log('🔐 Accepting invitation for user:', {
      id: user.id,
      email: user.email,
      currentRole: user.role,
      status: user.status
    });

    // Hash the new password
    const saltRounds = 12;
    const password_hash = await bcrypt.hash(password, saltRounds);

    // Update user password, activate account, and mark token as used
    // NOTE: We do NOT update the role here - it should already be set correctly from invitation
    await query(
      'UPDATE users SET password_hash = $1, status = $2, updated_at = NOW() WHERE id = $3',
      [password_hash, 'Active', user.id]
    );
    await query('UPDATE tokens SET used_at = CURRENT_TIMESTAMP WHERE token = $1', [token]);

    // Get updated user data
    const updatedResult = await query(
      'SELECT id, name, email, role, is_premium, avatar, preferences, xp, level, streak, last_active_date, unlocked_badges, practice_attempts, created_at, updated_at FROM users WHERE id = $1',
      [user.id]
    );
    
    const updatedUser = updatedResult.rows[0];
    
    // Verify role is preserved
    console.log('🔐 User after invitation acceptance:', {
      id: updatedUser.id,
      email: updatedUser.email,
      role: updatedUser.role,
      is_premium: updatedUser.is_premium,
      status: updatedUser.status
    });
    // Add bookmarks array (empty for new users)
    updatedUser.bookmarks = [];
    
    const authToken = generateToken(updatedUser as User);

    // Send welcome email (non-blocking)
    console.log('📧 Triggering welcome email for new admin:', { email: user.email, name: user.name });
    EmailService.sendWelcomeEmail(user.email, user.name).catch(error => {
      console.error('❌ Failed to send welcome email:', error);
    });

    res.json({
      success: true,
      message: 'Invitation accepted successfully. Your account has been activated.',
      user: updatedUser,
      token: authToken
    } as AuthResponse);
  } catch (error) {
    console.error('Accept invitation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to accept invitation'
    } as ApiResponse);
  }
});

export default router;
