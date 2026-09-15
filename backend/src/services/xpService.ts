import { query, getClient } from '../database/config';
import { NotificationService } from './notificationService';
import { EmailService } from './emailService';
import { BADGE_DEFINITIONS } from '../constants';

// ---------------------------------------------------------------------------
// awardXP: the ONLY way XP enters a user account.
//
// Previously every feature awarded XP through POST /users/gain-xp with a
// client-chosen amount (1-1000, unlimited calls) — anyone could mint max
// level with curl. That endpoint is gone. Each feature now calls this with
// the amount its own server-side logic computed, so the award is always
// tied to a verified action. It also centralizes what used to be
// copy-pasted (and drifting) in every route: level math, level-based badge
// unlocks, xp_history, and the level-up notification/email.
// ---------------------------------------------------------------------------

export interface AwardXPResult {
  xpGained: number;
  newXp: number;
  newLevel: number;
  leveledUp: boolean;
  newBadges: string[];
}

const LEVEL_BADGES = BADGE_DEFINITIONS.filter((b) => b.requiredLevel !== undefined) as { id: string; requiredLevel: number; name: string; description: string }[];

export const awardXP = async (
  userId: string,
  amount: number,
  opts: { source: string; source_id?: string | null; description: string }
): Promise<AwardXPResult> => {
  const safeAmount = Math.max(0, Math.floor(Number(amount) || 0));
  if (safeAmount === 0) {
    const rows = await query('SELECT xp, level FROM users WHERE id = $1', [userId]);
    const level = rows.rows[0]?.level || 1;
    return { xpGained: 0, newXp: rows.rows[0]?.xp || 0, newLevel: level, leveledUp: false, newBadges: [] };
  }

  // Atomic credit: the old code ran SELECT then three separate writes on
  // different pool connections — two concurrent awards (video + quiz
  // finishing together, double-click) both read xp=1000 and both wrote 1100,
  // silently losing one award and risking badge-insert races. Now the user
  // row is locked (FOR UPDATE) and credit + history + badges commit as one
  // transaction; a concurrent awarder simply waits its turn.
  const client = await getClient();
  let newXp = 0;
  let newLevel = 1;
  let leveledUp = false;
  const newUnlockedBadges: string[] = [];
  let currentEmail: string | undefined;
  let currentName: string | undefined;
  try {
    await client.query('BEGIN');
    const cur = await client.query(
      'SELECT xp, unlocked_badges, email, name FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );
    const currentUser = cur.rows[0];
    if (!currentUser) {
      throw new Error('User not found');
    }

    const currentXp = currentUser.xp || 0;
    newXp = currentXp + safeAmount;
    newLevel = Math.floor(newXp / 1000) + 1;
    const previousLevel = Math.floor(currentXp / 1000) + 1;
    leveledUp = newLevel > previousLevel;

    // Level-based badge unlocks
    const currentUnlockedBadges: string[] = currentUser.unlocked_badges || ['b1'];
    for (const badge of LEVEL_BADGES) {
      if (!currentUnlockedBadges.includes(badge.id) && newLevel >= badge.requiredLevel) {
        newUnlockedBadges.push(badge.id);
      }
    }
    const allUnlockedBadges = [...new Set([...currentUnlockedBadges, ...newUnlockedBadges])];

    await client.query(
      'INSERT INTO xp_history (user_id, amount, source, source_id, description) VALUES ($1, $2, $3, $4, $5)',
      [userId, safeAmount, opts.source, opts.source_id ?? null, opts.description]
    );

    for (const badgeId of newUnlockedBadges) {
      const existing = await client.query(
        'SELECT id FROM badge_unlocks WHERE user_id = $1 AND badge_id = $2',
        [userId, badgeId]
      );
      if (!existing.rows[0]) {
        try {
          await client.query(
            'INSERT INTO badge_unlocks (user_id, badge_id, unlocked_at) VALUES ($1, $2, $3)',
            [userId, badgeId, new Date().toISOString()]
          );
        } catch (badgeErr: any) {
          // A racing awarder inserted the same badge after our check —
          // unique violation means the row exists, which is the outcome we
          // wanted anyway. Anything else rethrows and rolls back.
          if (String(badgeErr?.code) !== '23505') throw badgeErr;
        }
      }
    }

    // unlocked_badges is text[]: pg serializes JS arrays natively (same as
    // the old Table.update path, which passed arrays through untouched).
    await client.query(
      'UPDATE users SET xp = $1, level = $2, unlocked_badges = $3 WHERE id = $4',
      [newXp, newLevel, allUnlockedBadges, userId]
    );

    await client.query('COMMIT');
    currentEmail = currentUser.email;
    currentName = currentUser.name;
  } catch (txErr) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Rollback best-effort: the original error is what matters.
    }
    throw txErr;
  } finally {
    client.release();
  }

  if (leveledUp) {
    await NotificationService.createLevelUpNotification(userId, newLevel);
  }

  // In-app notification per unlocked badge. Previously badges only sent
  // email, so anyone not reading email never learned they'd earned one
  // (createBadgeUnlockedNotification existed but had zero callers).
  for (const badgeId of newUnlockedBadges) {
    const badge = LEVEL_BADGES.find((b) => b.id === badgeId);
    if (badge) {
      await NotificationService.createBadgeUnlockedNotification(userId, badge.name);
    }
  }

  if (newUnlockedBadges.length > 0 && currentEmail && currentName) {
    const badgeNames: Record<string, { name: string; description: string }> = Object.fromEntries(
      LEVEL_BADGES.map((b) => [b.id, { name: b.name, description: b.description }])
    );
    for (const badgeId of newUnlockedBadges) {
      const badge = badgeNames[badgeId];
      if (badge) {
        console.log('📧 Triggering achievement unlocked email for badge:', { badgeId, badgeName: badge.name });
        EmailService.sendAchievementUnlockedEmail(
          currentEmail,
          currentName,
          badge.name,
          badge.description,
          leveledUp,
          leveledUp ? newLevel : undefined
        ).catch((error) => {
          console.error(`❌ Failed to send achievement unlocked email for badge ${badgeId}:`, error);
        });
      }
    }
  }

  return { xpGained: safeAmount, newXp, newLevel, leveledUp, newBadges: newUnlockedBadges };
};
