import { query, dbAdmin } from '../database/config';
import { NotificationService } from './notificationService';
import { EmailService } from './emailService';

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

const LEVEL_BADGES = [
  { id: 'b1', requiredLevel: 1, name: 'First Steps', description: 'Create your account and start learning.' },
  { id: 'b2', requiredLevel: 5, name: 'Dedicated Student', description: 'Reach Level 5 by earning XP.' },
  { id: 'b3', requiredLevel: 10, name: 'Scholar', description: 'Reach Level 10 and master your subjects.' },
  { id: 'b5', requiredLevel: 2, name: 'Community Pillar', description: 'Contribute helpful answers in the forum.' },
  { id: 'b6', requiredLevel: 20, name: 'Top of the Class', description: 'Reach Level 20. You are an expert!' }
];

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

  const currentUserRows = await query('SELECT * FROM users WHERE id = $1', [userId]);
  const currentUser = currentUserRows.rows[0];
  if (!currentUser) {
    throw new Error('User not found');
  }

  const currentXp = currentUser.xp || 0;
  const newXp = currentXp + safeAmount;
  const newLevel = Math.floor(newXp / 1000) + 1;
  const previousLevel = Math.floor(currentXp / 1000) + 1;
  const leveledUp = newLevel > previousLevel;

  // Level-based badge unlocks
  const currentUnlockedBadges: string[] = currentUser.unlocked_badges || ['b1'];
  const newUnlockedBadges: string[] = [];
  for (const badge of LEVEL_BADGES) {
    if (!currentUnlockedBadges.includes(badge.id) && newLevel >= badge.requiredLevel) {
      newUnlockedBadges.push(badge.id);
    }
  }
  const allUnlockedBadges = [...new Set([...currentUnlockedBadges, ...newUnlockedBadges])];

  await dbAdmin.insert('xp_history', {
    user_id: userId,
    amount: safeAmount,
    source: opts.source,
    source_id: opts.source_id ?? null,
    description: opts.description
  });

  for (const badgeId of newUnlockedBadges) {
    const existingRows = await query('SELECT id FROM badge_unlocks WHERE user_id = $1 AND badge_id = $2', [userId, badgeId]);
    if (!existingRows.rows[0]) {
      await dbAdmin.insert('badge_unlocks', {
        user_id: userId,
        badge_id: badgeId,
        unlocked_at: new Date().toISOString()
      });
    }
  }

  await dbAdmin.update('users', userId, {
    xp: newXp,
    level: newLevel,
    unlocked_badges: allUnlockedBadges
  });

  if (leveledUp) {
    await NotificationService.createLevelUpNotification(userId, newLevel);
  }

  if (newUnlockedBadges.length > 0 && currentUser.email && currentUser.name) {
    const badgeNames: Record<string, { name: string; description: string }> = Object.fromEntries(
      LEVEL_BADGES.map((b) => [b.id, { name: b.name, description: b.description }])
    );
    for (const badgeId of newUnlockedBadges) {
      const badge = badgeNames[badgeId];
      if (badge) {
        console.log('📧 Triggering achievement unlocked email for badge:', { badgeId, badgeName: badge.name });
        EmailService.sendAchievementUnlockedEmail(
          currentUser.email,
          currentUser.name,
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
