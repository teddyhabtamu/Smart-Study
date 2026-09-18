import express from 'express';
import { body } from 'express-validator';
import { authenticateToken, validateRequest } from '../middleware/auth';
import { query } from '../database/config';
import { config } from '../config';
import type { ApiResponse } from '../types';

const router = express.Router();

// A subscription is accepted only with a reachable-looking endpoint and
// real key material: http(s) URL (localhost allowed for dev), keys long
// enough to be genuine P-256/auth secrets rather than empty strings.
const isValidSubscription = (endpoint: unknown, keys: any): boolean => {
  if (typeof endpoint !== 'string') return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  const localHost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && localHost)) return false;
  if (!keys || typeof keys.p256dh !== 'string' || typeof keys.auth !== 'string') return false;
  return keys.p256dh.length >= 16 && keys.auth.length >= 8;
};

// Register (or reassign on a shared device) this browser for push.
// 503 when VAPID isn't configured — the client hides the toggle instead.
router.post(
  '/subscribe',
  [
    authenticateToken,
    body('endpoint').isString().notEmpty().withMessage('endpoint is required'),
    body('keys.p256dh').isString().notEmpty().withMessage('keys.p256dh is required'),
    body('keys.auth').isString().notEmpty().withMessage('keys.auth is required'),
  ],
  validateRequest,
  async (req: express.Request, res: express.Response): Promise<void> => {
    try {
      if (!config.push.publicKey || !config.push.privateKey) {
        res.status(503).json({
          success: false,
          code: 'PUSH_NOT_CONFIGURED',
          message: 'Push notifications are not configured on this server',
        } as ApiResponse);
        return;
      }
      const userId = req.user!.id;
      const { endpoint, keys } = req.body as { endpoint: string; keys: { p256dh: string; auth: string } };
      const userAgent = typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 200) : null;
      if (!isValidSubscription(endpoint, keys)) {
        res.status(400).json({
          success: false,
          message: 'Invalid push subscription',
        } as ApiResponse);
        return;
      }
      await query(
        `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, user_agent = EXCLUDED.user_agent`,
        [userId, endpoint, keys.p256dh, keys.auth, userAgent]
      );
      res.status(201).json({ success: true, data: { subscribed: true } } as ApiResponse);
    } catch (error) {
      console.error('Push subscribe error:', error);
      res.status(500).json({ success: false, message: 'Failed to save push subscription' } as ApiResponse);
    }
  }
);

// Remove this browser. Idempotent: unknown endpoints still 200.
router.delete(
  '/unsubscribe',
  [authenticateToken, body('endpoint').isString().notEmpty().withMessage('endpoint is required')],
  validateRequest,
  async (req: express.Request, res: express.Response): Promise<void> => {
    try {
      const userId = req.user!.id;
      const { endpoint } = req.body as { endpoint: string };
      const result = await query('DELETE FROM push_subscriptions WHERE endpoint = $1 AND user_id = $2', [
        endpoint,
        userId,
      ]);
      res.json({ success: true, data: { removed: result.rowCount ?? 0 } } as ApiResponse);
    } catch (error) {
      console.error('Push unsubscribe error:', error);
      res.status(500).json({ success: false, message: 'Failed to remove push subscription' } as ApiResponse);
    }
  }
);

export default router;
