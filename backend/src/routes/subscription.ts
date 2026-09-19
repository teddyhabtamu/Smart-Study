import express from 'express';
import { body } from 'express-validator';
import { query as dbQuery } from '../database/config';
import { authenticateToken, validateRequest } from '../middleware/auth';
import { NotificationService } from '../services/notificationService';
import { ApiResponse } from '../types';

const router = express.Router();

// Pro payment claims: the money moves over Telebirr outside the app, but
// the CLAIM lives here — linking payer identity at click time so the admin
// never has to match a Telegram receipt to an account by a typed email.
// One pending claim per user (repeat clicks return the existing row, never
// a duplicate queue entry). Creating a claim pings all admins in-app.
router.post('/claim', authenticateToken, [
  body('transactionRef').optional().isString().trim().isLength({ max: 100 }),
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const transactionRef = typeof req.body.transactionRef === 'string'
      ? req.body.transactionRef.trim().slice(0, 100) || null
      : null;

    const existing = await dbQuery(
      `SELECT id, status, transaction_ref, created_at FROM payment_claims
       WHERE user_id = $1 AND status = 'pending'
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    if (existing.rows.length > 0) {
      res.json({ success: true, data: existing.rows[0] } as ApiResponse);
      return;
    }

    const inserted = await dbQuery(
      `INSERT INTO payment_claims (user_id, transaction_ref)
       VALUES ($1, $2)
       RETURNING id, status, transaction_ref, created_at`,
      [userId, transactionRef]
    );
    const claim = inserted.rows[0];

    // Ping every admin in-app (best-effort, never fails the claim).
    void (async () => {
      try {
        const admins = await dbQuery(
          `SELECT id FROM users WHERE role = 'ADMIN' AND status IS DISTINCT FROM 'Banned'`
        );
        const name = req.user?.name || req.user?.email || 'A student';
        await Promise.allSettled((admins.rows || []).map((a: any) =>
          NotificationService.create({
            user_id: String(a.id),
            title: 'New Pro payment claim',
            message: `${name} submitted a payment claim${transactionRef ? ` (ref ${transactionRef})` : ''}. Verify the Telebirr receipt, then upgrade them from Students.`,
            type: 'INFO',
          })
        ));
      } catch (notifyErr) {
        console.error('Admin claim notification failed (non-fatal):', (notifyErr as any)?.message || notifyErr);
      }
    })();

    res.json({ success: true, data: claim } as ApiResponse);
  } catch (error) {
    console.error('Submit payment claim error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit payment claim'
    } as ApiResponse);
  }
});

// The student's own latest claim (any status) — drives the persistent
// pending state on the Subscription page across sessions and devices.
router.get('/claim/mine', authenticateToken, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const r = await dbQuery(
      `SELECT id, status, transaction_ref, created_at, decided_at FROM payment_claims
       WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [req.user!.id]
    );
    res.json({ success: true, data: r.rows[0] || null } as ApiResponse);
  } catch (error) {
    console.error('Get my payment claim error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get payment claim'
    } as ApiResponse);
  }
});

export default router;
