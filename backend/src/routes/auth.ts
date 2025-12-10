import express from 'express';
import bcrypt from 'bcryptjs';
import { body } from 'express-validator';
import { query, supabase } from '../database/config';
import { config } from '../config';
import { authenticateToken, generateToken, validateRequest } from '../middleware/auth';
import passport from '../middleware/googleAuth';
import { LoginRequest, RegisterRequest, AuthResponse, ApiResponse, User } from '../types';
import { NotificationService } from '../services/notificationService';

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

      user.streak = newStreak;
      user.last_active_date = today;
    }

    // Remove password hash from response
    delete user.password_hash;

    const token = generateToken(user);

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
    const redirectUrl = `${frontendUrl}/#/auth/callback?token=${token}&success=true`;
    res.redirect(redirectUrl);
  }
);

export default router;
