import crypto from 'crypto';
import { query as dbQuery } from '../database/config';
import { NotificationService } from './notificationService';

// Referral program rules (single source of truth — the Subscription page
// copy, the verify hook, and the admin queue all read these).
export const REFERRALS_REQUIRED = 5;
export const REWARD_PRO_MONTHS = 1;

/** 8-char public code (A-Z0-9, no lookalikes kept on purpose: simple). */
export const generateReferralCode = (): string => {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(8);
  let code = '';
  for (let i = 0; i < 8; i++) code += alphabet[(bytes[i] ?? 0) % alphabet.length];
  return code;
};

/** Mint a code that doesn't collide (bounded retries, then throw). */
export const mintUniqueReferralCode = async (): Promise<string> => {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode();
    const existing = await dbQuery('SELECT id FROM users WHERE referral_code = $1', [code]);
    if (existing.rows.length === 0) return code;
  }
  throw new Error('Could not mint a unique referral code');
};

/**
 * Resolve a raw ?ref= value (register body, OAuth state) to a referrer id.
 * Never throws and never blocks signup: blank/unknown codes and DB errors
 * all resolve to null (the registration proceeds unattributed).
 */
export const resolveReferrerId = async (raw: unknown): Promise<string | null> => {
  const code = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  if (!code) return null;
  try {
    const ref = await dbQuery('SELECT id FROM users WHERE referral_code = $1', [code]);
    if (ref.rows.length > 0) return String(ref.rows[0].id);
  } catch (err) {
    console.error('Referral lookup failed (non-fatal):', (err as any)?.message || err);
  }
  return null;
};

/** Mask a referee email for the referrer's own progress list (privacy:
 * the referrer recruited them, but full emails belong to admin eyes only). */
export const maskEmail = (email: string): string => {
  const [local, domain] = String(email || '').split('@');
  if (!local || !domain) return '***';
  return `${local.slice(0, 1)}***@${domain}`;
};

/**
 * After a referee qualifies, check whether the referrer hit the threshold.
 * Creates ONE pending reward (never duplicates) and pings every admin —
 * AWAITED with the same 8s bound as payment claims (a void post-response
 * block dies on runtime suspend; this runs inline before verify responds).
 * Returns the new reward id, or null when nothing was earned yet.
 */
export const maybeCreateReferralReward = async (referrerId: string): Promise<string | null> => {
  const pending = await dbQuery(
    `SELECT id FROM referral_rewards WHERE referrer_id = $1 AND status = 'pending' LIMIT 1`,
    [referrerId]
  );
  if (pending.rows.length > 0) return null;

  // Banned AND deactivated referees never count (a deactivated test/fake
  // account must stop contributing the moment an admin removes it).
  const earned = await dbQuery(
    `SELECT r.id FROM referrals r
     JOIN users u ON u.id = r.referee_id
     WHERE r.referrer_id = $1
       AND r.qualified_at IS NOT NULL
       AND r.reward_id IS NULL
       AND u.email_verified IS TRUE
       AND u.status IS DISTINCT FROM 'Banned'
       AND u.status IS DISTINCT FROM 'Inactive'
     ORDER BY r.qualified_at ASC
     LIMIT $2`,
    [referrerId, REFERRALS_REQUIRED]
  );
  if (earned.rows.length < REFERRALS_REQUIRED) return null;

  const reward = await dbQuery(
    `INSERT INTO referral_rewards (referrer_id, qualified_count)
     VALUES ($1, $2) RETURNING id`,
    [referrerId, REFERRALS_REQUIRED]
  );
  const rewardId = String(reward.rows[0].id);
  await dbQuery(
    `UPDATE referrals SET reward_id = $1 WHERE id = ANY($2)`,
    [rewardId, earned.rows.map((r: any) => r.id)]
  );

  // Admin ping — best-effort, bounded, never fails the verification.
  try {
    const notifyWork = (async () => {
      const admins = await dbQuery(
        `SELECT id FROM users WHERE role = 'ADMIN' AND status IS DISTINCT FROM 'Banned'`
      );
      const who = await dbQuery(`SELECT name, email FROM users WHERE id = $1`, [referrerId]);
      const name = who.rows[0]?.name || who.rows[0]?.email || 'A student';
      const results = await Promise.allSettled((admins.rows || []).map((a: any) =>
        NotificationService.create({
          user_id: String(a.id),
          title: 'Referral reward ready',
          message: `${name} earned 1 month of Pro with ${REFERRALS_REQUIRED} verified referrals. Review the referees, then approve from Students.`,
          type: 'INFO',
        })
      ));
      return results.filter((r) => r.status === 'fulfilled').length;
    })();
    await Promise.race([
      notifyWork,
      new Promise<number>((resolve) => {
        const t = setTimeout(() => resolve(0), 8000);
        (t as any)?.unref?.();
      }),
    ]);
  } catch (notifyErr) {
    console.error('Admin referral notification failed (non-fatal):', (notifyErr as any)?.message || notifyErr);
  }

  return rewardId;
};
