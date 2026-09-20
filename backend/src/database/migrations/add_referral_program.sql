-- Migration: referral program (invite link → verified user → Pro reward)
-- Created: 2026-09-20
-- Description: "Refer 5 friends, earn 1 month of Pro." Each user gets a
-- public referral_code; signup accepts ?ref=CODE into users.referred_by and
-- a referrals row. A referral QUALIFIES when the referee verifies their
-- email (verified-email-only rule: cheap enough to grow, costly enough that
-- 5 Gmail aliases is real work). At 5 unrewarded qualified referees a
-- referral_rewards row goes pending and every admin is pinged (same awaited
-- pattern as payment_claims — never fire-and-forget). Admin Approve grants
-- 1 stacked Pro month via users.premium_until (NULL = paid forever, never
-- expires); Reject releases the 5 back so honest progress survives a misclick
-- (fake accounts are handled with the existing ban tool, and banned referees
-- never count). Only one pending reward per referrer at a time.
--
-- Safe to re-run (IF NOT EXISTS / guarded constraint).

ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_until TIMESTAMPTZ;

-- Backfill public codes for existing users (8 hex chars; collision risk is
-- negligible at this scale, and the UNIQUE constraint below guards it).
UPDATE users
SET referral_code = UPPER(SUBSTRING(MD5(gen_random_uuid()::text), 1, 8))
WHERE referral_code IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_referral_code_unique') THEN
    ALTER TABLE users ADD CONSTRAINT users_referral_code_unique UNIQUE (referral_code);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users (referred_by);

-- Reward rows first: referrals.reward_id points at them, so the target
-- table must exist before the FK is declared.
CREATE TABLE IF NOT EXISTS referral_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  qualified_count INT NOT NULL DEFAULT 5,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at TIMESTAMPTZ,
  decided_by UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_referral_rewards_status ON referral_rewards (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_referrer ON referral_rewards (referrer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  referee_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  qualified_at TIMESTAMPTZ,
  reward_id UUID REFERENCES referral_rewards(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals (referrer_id, created_at DESC);
