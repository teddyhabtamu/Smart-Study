import express from 'express';
import { body } from 'express-validator';
import { reportError } from '../services/errorLog';
import { validateRequest } from '../middleware/auth';
import { clientErrorLimiter } from '../middleware/rateLimit';
import { ApiResponse } from '../types';

const router = express.Router();

// Client crash telemetry: window.onerror / unhandledrejection beacons land
// here (guests included — logged-out crashes count too). Unauthenticated
// by design, so abuse is the risk: per-IP limiter + tight validation +
// server-side fingerprinting (one row per distinct failure, not per hit).
// ALWAYS 200s with {received:true} — telemetry must never break the app,
// even when the database itself is the thing that's down.
router.post('/', clientErrorLimiter, [
  body('message').isString().trim().isLength({ min: 1, max: 500 }).withMessage('Message must be 1-500 characters'),
  body('route').optional().isString().trim().isLength({ max: 200 }),
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { message, route } = req.body;
    // Fire-and-forget: the beacon already got its answer below; the upsert
    // must not hold the response (or a sick pool hold it hostage).
    void reportError({ source: 'client', route: route || req.path, message });
  } catch (err) {
    console.error('Client error intake failed (non-fatal):', (err as any)?.message || err);
  }
  res.json({ success: true, data: { received: true } } as ApiResponse);
});

export default router;
