import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { validationResult } from 'express-validator';
import { query } from '../database/config';
import { config } from '../config';
import { JWTPayload, User } from '../types';

export const authenticateToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      res.status(401).json({
        success: false,
        message: 'Access token required'
      });
      return;
    }

    const decoded = jwt.verify(token, config.jwt.secret!) as unknown as JWTPayload;

    // Fetch user from database to ensure they still exist and get latest data
    const result = await query(
      'SELECT id, name, email, role, status, is_premium, avatar, preferences, xp, level, streak, last_active_date, unlocked_badges, practice_attempts, created_at, updated_at FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      res.status(401).json({
        success: false,
        message: 'User not found'
      });
      return;
    }

    const user = result.rows[0] as User;

    // Check if user is banned or suspended
    if (user.status === 'Banned' || user.status === 'Suspended') {
      res.status(403).json({
        success: false,
        message: `Your account has been ${user.status.toLowerCase()}. Please contact support for assistance.`
      });
      return;
    }

    // Get bookmarks for this user (same as login does)
    const bookmarksResult = await query(
      'SELECT item_id FROM bookmarks WHERE user_id = $1',
      [user.id]
    );

    user.bookmarks = bookmarksResult.rows.map(row => row.item_id);

    req.user = user;
    return next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      res.status(403).json({
        success: false,
        message: 'Invalid token'
      });
      return;
    }

    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        success: false,
        message: 'Token expired'
      });
      return;
    }

    console.error('Authentication error:', error);
    res.status(500).json({
      success: false,
      message: 'Authentication failed'
    });
  }
};

export const requireRole = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required'
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        message: 'Insufficient permissions'
      });
      return;
    }

    next();
  };
};

export const optionalAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (token) {
      const decoded = jwt.verify(token, config.jwt.secret!) as unknown as JWTPayload;

      // Fetch user from database to ensure they still exist and get latest data
      const result = await query(
        'SELECT id, name, email, role, status, is_premium, avatar, preferences, xp, level, streak, last_active_date, unlocked_badges, practice_attempts, created_at, updated_at FROM users WHERE id = $1',
        [decoded.userId]
      );

      if (result.rows.length > 0) {
        const user = result.rows[0] as User;
        // For optionalAuth, we don't block banned users (it's for public routes)
        // But we still set the user so routes can check status if needed
        req.user = user;
      }
    }
  } catch (error) {
    // Ignore authentication errors for optional auth
    console.log('Optional auth failed, continuing without user');
  }

  return next();
};

export const requirePremium = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
    return;
  }

  if (!req.user.is_premium) {
    res.status(403).json({
      success: false,
      message: 'Premium subscription required'
    });
    return;
  }

  next();
};

// Validation middleware
export const validateRequest = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({
      success: false,
      errors: errors.array()
    });
    return;
  }
  next();
};

// Generate JWT token
export const generateToken = (user: User): string => {
  const payload: JWTPayload = {
    userId: user.id,
    email: user.email,
    role: user.role
  };

  return (jwt.sign as any)(payload, config.jwt.secret, {
    expiresIn: config.jwt.expire
  });
};
