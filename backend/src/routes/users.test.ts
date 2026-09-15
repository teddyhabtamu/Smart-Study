import { describe, it, expect } from 'vitest';

// authorizeAccountDeletion is the re-auth gate for DELETE /users/account: a
// bare session token must not irreversibly delete an account. Password
// accounts re-verify via bcrypt; OAuth-only accounts (no hash) confirm by
// typing their email. The compare fn is injected so no bcrypt/DB is needed.
import { authorizeAccountDeletion } from './users';

const compare = async (password: string, hash: string): Promise<boolean> =>
  `${password}:${hash}` === 'correct:hash123';

const pwUser = { email: 'student@example.com', password_hash: 'hash123' };
const oauthUser = { email: 'Google@Example.com', password_hash: null };
// Google sign-ups store a placeholder, NOT NULL — the gate must treat it as
// "no password", otherwise OAuth users can never delete their accounts.
const oauthPlaceholderUser = { email: 'google@example.com', password_hash: 'oauth_user_no_password' };

describe('authorizeAccountDeletion', () => {
  it('rejects a missing user', async () => {
    const r = await authorizeAccountDeletion(null, {}, compare);
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.status).toBe(404);
  });

  it('allows a password account with the correct password', async () => {
    expect(await authorizeAccountDeletion(pwUser, { password: 'correct' }, compare)).toEqual({
      allowed: true,
    });
  });

  it('rejects a wrong password without leaking which check failed loudly', async () => {
    const r = await authorizeAccountDeletion(pwUser, { password: 'wrong' }, compare);
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.status).toBe(401);
      expect(r.code).toBe('INCORRECT_PASSWORD');
    }
  });

  it('rejects a missing password with a 400 (not 401)', async () => {
    const r = await authorizeAccountDeletion(pwUser, {}, compare);
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.status).toBe(400);
      expect(r.code).toBe('PASSWORD_REQUIRED');
    }
  });

  it('allows an OAuth-only account with the matching email (case-insensitive)', async () => {
    expect(
      await authorizeAccountDeletion(oauthUser, { confirmEmail: 'google@example.com' }, compare),
    ).toEqual({ allowed: true });
  });

  it('rejects an OAuth-only account with a non-matching email', async () => {
    const r = await authorizeAccountDeletion(oauthUser, { confirmEmail: 'someone@else.com' }, compare);
    expect(r.allowed).toBe(false);
    if (!r.allowed) {
      expect(r.status).toBe(400);
      expect(r.code).toBe('OAUTH_CONFIRM_EMAIL');
    }
  });

  it('a password on an OAuth account does not bypass the email check', async () => {
    const r = await authorizeAccountDeletion(oauthUser, { password: 'correct' }, compare);
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.code).toBe('OAUTH_CONFIRM_EMAIL');
  });

  it('treats the OAuth placeholder hash as no password (email flow)', async () => {
    expect(
      await authorizeAccountDeletion(oauthPlaceholderUser, { confirmEmail: 'google@example.com' }, compare),
    ).toEqual({ allowed: true });
    const r = await authorizeAccountDeletion(oauthPlaceholderUser, { password: 'anything' }, compare);
    expect(r.allowed).toBe(false);
    if (!r.allowed) expect(r.code).toBe('OAUTH_CONFIRM_EMAIL');
  });
});
