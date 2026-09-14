// Canonical content taxonomy. Every subject validator for library content
// (documents, videos, admin create/update) must use CONTENT_SUBJECTS — nine
// hand-copied 7-subject arrays drifted, so the YouTube sync imported Civics /
// Geography / Economics / ... videos that the API then refused to accept on
// manual create and the browse filters couldn't reach.
//
// Keep in sync with:
//   - frontend src/constants.ts SUBJECTS (browse/create dropdowns)
//   - youtubeService.ts SUBJECTS (import allowlist; 'ICT', not 'IT')
//   - aiTutor.ts quiz prompt canonical names
export const CONTENT_SUBJECTS = [
  'Mathematics',
  'English',
  'History',
  'Chemistry',
  'Physics',
  'Biology',
  'Civics',
  'Geography',
  'Economics',
  'Business',
  'ICT',
  'Amharic',
  'Afaan Oromoo',
  'Tigrigna',
  'Aptitude'
];

export interface BadgeDefinition {
  id: string;
  requiredLevel?: number;
  requiredStreak?: number;
  name: string;
  description: string;
}

// Single source of truth for badge definitions (level + streak). Mirrors
// frontend src/constants.ts BADGES. Used by xpService (level awards) and
// emailService.checkAndUnlockBadges (streak/daily sweep) so the copies can't
// drift again.
export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  { id: 'b1', requiredLevel: 1, name: 'First Steps', description: 'Create your account and start learning.' },
  { id: 'b2', requiredLevel: 5, name: 'Dedicated Student', description: 'Reach Level 5 by earning XP.' },
  { id: 'b3', requiredLevel: 10, name: 'Scholar', description: 'Reach Level 10 and master your subjects.' },
  { id: 'b4', requiredStreak: 7, name: 'Streak Master', description: 'Maintain a 7-day study streak.' },
  { id: 'b5', requiredLevel: 2, name: 'Community Pillar', description: 'Contribute helpful answers in the forum.' },
  { id: 'b6', requiredLevel: 20, name: 'Top of the Class', description: 'Reach Level 20. You are an expert!' }
];
