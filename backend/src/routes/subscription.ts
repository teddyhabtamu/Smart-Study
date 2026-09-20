import express from 'express';
import { body } from 'express-validator';
import { query as dbQuery } from '../database/config';
import { authenticateToken, validateRequest } from '../middleware/auth';
import { NotificationService } from '../services/notificationService';
import { REFERRALS_REQUIRED, REWARD_PRO_MONTHS, maskEmail, mintUniqueReferralCode } from '../services/referralService';
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

    // Ping every admin in-app — AWAITED, not fire-and-forget. A void async
    // block after res.json() dies unsent whenever the runtime suspends the
    // handler (serverless freeze/idle): the claim row landed while the
    // notification never did, exactly the production failure seen. Bounded
    // at 8s so a sick notifier can't hold the submission hostage; failure
    // still returns the claim (the queue card is the backstop).
    let notifiedAdmins = 0;
    try {
      const notifyWork = (async () => {
        const admins = await dbQuery(
          `SELECT id FROM users WHERE role = 'ADMIN' AND status IS DISTINCT FROM 'Banned'`
        );
        const name = req.user?.name || req.user?.email || 'A student';
        const results = await Promise.allSettled((admins.rows || []).map((a: any) =>
          NotificationService.create({
            user_id: String(a.id),
            title: 'New Pro payment claim',
            message: `${name} submitted a payment claim${transactionRef ? ` (ref ${transactionRef})` : ''}. Verify the Telebirr receipt, then upgrade them from Students.`,
            type: 'INFO',
          })
        ));
        return results.filter((r) => r.status === 'fulfilled').length;
      })();
      notifiedAdmins = await Promise.race([
        notifyWork,
        new Promise<number>((resolve) => {
          const t = setTimeout(() => resolve(0), 8000);
          (t as any)?.unref?.();
        }),
      ]);
    } catch (notifyErr) {
      console.error('Admin claim notification failed (non-fatal):', (notifyErr as any)?.message || notifyErr);
    }

    res.json({ success: true, data: { ...claim, notifiedAdmins } } as ApiResponse);
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

// The student's own referral dashboard: public code, qualified progress
// toward the Pro reward, pending/latest reward state, and a masked referee
// list (full emails are admin-eyes-only). Lazy-mints a code for accounts
// created before the program existed.
router.get('/referrals/mine', authenticateToken, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    let codeRow = await dbQuery('SELECT referral_code FROM users WHERE id = $1', [userId]);
    let code: string | null = codeRow.rows[0]?.referral_code || null;
    if (!code) {
      try {
        code = await mintUniqueReferralCode();
        await dbQuery('UPDATE users SET referral_code = $1 WHERE id = $2 AND referral_code IS NULL', [code, userId]);
      } catch (mintErr) {
        console.error('Referral code mint failed (non-fatal):', (mintErr as any)?.message || mintErr);
      }
    }

    let progress: any[] = [];
    let pendingReward = null;
    let latestReward = null;
    try {
      const rw = await dbQuery(
        `SELECT id, status, qualified_count, created_at, decided_at FROM referral_rewards
         WHERE referrer_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [userId]
      );
      latestReward = rw.rows[0] || null;
      if (latestReward?.status === 'pending') pendingReward = latestReward;
    } catch (rwErr) {
      console.error('Referral reward read failed (non-fatal):', (rwErr as any)?.message || rwErr);
    }
    try {
      // Progress counts unrewarded referees PLUS the ones consumed by the
      // pending reward (they're still yours — just awaiting approval — so
      // the bar must read 5/5, not reset to 0, while under review).
      const r = await dbQuery(
        `SELECT r.qualified_at, r.created_at, u.email, u.status
         FROM referrals r JOIN users u ON u.id = r.referee_id
         WHERE r.referrer_id = $1 AND (r.reward_id IS NULL OR r.reward_id = $2)
         ORDER BY r.created_at DESC LIMIT 20`,
        [userId, pendingReward?.id || null]
      );
      progress = r.rows;
    } catch (progErr) {
      console.error('Referral progress read failed (non-fatal, table may predate migration):', (progErr as any)?.message || progErr);
    }

    const qualified = progress.filter((p) => p.qualified_at && p.status !== 'Banned').length;
    res.json({
      success: true,
      data: {
        code,
        required: REFERRALS_REQUIRED,
        rewardMonths: REWARD_PRO_MONTHS,
        qualifiedCount: qualified,
        pendingReward,
        latestReward,
        referees: progress.map((p) => ({
          email: maskEmail(p.email),
          qualified: !!p.qualified_at,
        })),
      },
    } as ApiResponse);
  } catch (error) {
    console.error('Get my referrals error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get referral status'
    } as ApiResponse);
  }
});

export default router;
