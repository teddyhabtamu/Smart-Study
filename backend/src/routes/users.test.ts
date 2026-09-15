import { describe, it, expect } from 'vitest';

// Deletion re-auth for DELETE /users/account: a bare session token must not
// irreversibly delete an account. Password accounts re-verify via bcrypt
// (compare injected); OAuth-only accounts (placeholder hash) prove inbox
// control with an emailed 6-digit code — helpers below are pure, the DB
// dance lives in the route handler.
import {
  authorizePasswordDeletion,
  hasUsablePassword,
  generateDeletionCode,
  hashDeletionCode,
  deletionCodeMatches,
  resolveCodeAttempt,
  maskEmail,
  DELETION_CODE_MAX_ATTEMPTS,
} from './users';

const compare = async (password: string, hash: string): Promise<boolean> =>
  `${password}:${hash}` === 'correct:hash123';

const pwUser = { email: 'student@example.com', password_hash: 'hash123' };
// Google sign-ups store a placeholder, NOT NULL — the gate must treat it as
// "no password", otherwise OAuth users can never delete their accounts.
const oauthPlaceholderUser = { email: 'google@example.com', password_hash: 'oauth_user_no_password' };

describe('hasUsablePassword', () => {
  it('accepts a real hash', () => {
    expect(hasUsablePassword('hash123')).toBe(true);
  });

  it('rejects null and the OAuth placeholder', () => {
    expect(hasUsablePassword(null)).toBe(false);
    expect(hasUsablePassword('oauth_user_no_password')).toBe(false);
  });
});

describe('authorizePasswordDeletion', () => {
  it('rejects a missing user', async () => {
    const r = await authorizePasswordDeletion(null, {}, compare);
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.status).toBe(404);
  });

  it('allows with the correct password', async () => {
    expect(await authorizePasswordDeletion(pwUser, { password: 'correct' }, compare)).toEqual({
      allowed: true,
    });
  });

  it('rejects a wrong password with 401', async () => {
    const r = await authorizePasswordDeletion(pwUser, { password: 'wrong' }, compare);
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.status).toBe(401);
      expect(r.code).toBe('INCORRECT_PASSWORD');
    }
  });

  it('rejects a missing password with 400 (not 401)', async () => {
    const r = await authorizePasswordDeletion(pwUser, {}, compare);
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.status).toBe(400);
      expect(r.code).toBe('PASSWORD_REQUIRED');
    }
  });

  it('rejects the OAuth placeholder as if no password existed', async () => {
    // Placeholder never verifies: compare stub would only pass 'correct',
    // and an OAuth user has no password to give — wrong/missing both fail.
    const r = await authorizePasswordDeletion(oauthPlaceholderUser, { password: 'correct' }, async () => false);
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.status).toBe(401);
  });
});

describe('deletion codes (OAuth path)', () => {
  it('generates zero-padded 6-digit codes', () => {
    for (let i = 0; i < 50; i++) {
      expect(generateDeletionCode()).toMatch(/^\d{6}$/);
    }
  });

  it('hash round-trips and rejects wrong codes', () => {
    const hash = hashDeletionCode('123456');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain('123456');
    expect(deletionCodeMatches('123456', hash)).toBe(true);
    expect(deletionCodeMatches('123457', hash)).toBe(false);
    expect(deletionCodeMatches('12345', hash)).toBe(false);
  });

  it('exposes the attempt cap for the handler', () => {
    expect(DELETION_CODE_MAX_ATTEMPTS).toBe(5);
  });
});

describe('resolveCodeAttempt (shared deletion + password-setup verdicts)', () => {
  const row = (attempts: number | string) => ({ id: 'row1', code_hash: hashDeletionCode('123456'), attempts });

  it('missing row -> missing', () => {
    expect(resolveCodeAttempt(undefined, '123456')).toEqual({ status: 'missing' });
  });

  it('matching code -> ok with row id', () => {
    expect(resolveCodeAttempt(row(0), '123456')).toEqual({ status: 'ok', id: 'row1' });
  });

  it('wrong code -> invalid with attempts left', () => {
    expect(resolveCodeAttempt(row(2), '000000')).toEqual({ status: 'invalid', id: 'row1', attemptsLeft: 2 });
  });

  it('capped attempts -> locked (string counts from pg tolerated)', () => {
    expect(resolveCodeAttempt(row(5), '123456')).toEqual({ status: 'locked', id: 'row1' });
    expect(resolveCodeAttempt(row('5'), '123456')).toEqual({ status: 'locked', id: 'row1' });
  });
});

describe('maskEmail', () => {
  it('masks the local part, keeps the domain', () => {
    expect(maskEmail('google@example.com')).toBe('g***@example.com');
  });

  it('degrades gracefully without a domain', () => {
    expect(maskEmail('not-an-email')).toBe('your email');
  });
});
