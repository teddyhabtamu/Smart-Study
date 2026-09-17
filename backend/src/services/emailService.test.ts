import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Email guardrails: test recipients must never burn Brevo quota, and a
// failing mailer must never break the caller. axios is mocked; the
// database facade is stubbed (only env shape matters for import).
const { mockPost } = vi.hoisted(() => ({ mockPost: vi.fn() }));

vi.mock('axios', () => ({
  default: { post: mockPost },
}));

vi.mock('../database/config', () => ({
  query: vi.fn(),
  supabaseAdmin: {},
  dbAdmin: {},
}));

const savedEnv = { ...process.env };

const setTestEnv = () => {
  process.env.DATABASE_URL = 'postgresql://testuser:testpass@localhost:5432/testdb';
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'test-anon-key';
  process.env.JWT_SECRET = 'test-secret';
  process.env.GOOGLE_CLIENT_ID = 'test-google-id';
  process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret';
  process.env.FRONTEND_URL = 'http://localhost:5173';
  process.env.BACKEND_URL = 'http://localhost:5000';
  process.env.BREVO_API_KEY = 'xkeysib-test-key';
};

beforeEach(() => {
  setTestEnv();
  mockPost.mockReset();
  mockPost.mockResolvedValue({ data: { messageId: 'test-msg-id' } });
});

afterEach(() => {
  process.env = { ...savedEnv };
});

const loadService = async () => {
  const mod = await import('./emailService');
  return mod;
};

describe('isTestRecipient (quota guard)', () => {
  it('matches RFC-reserved and test domains, case-insensitively', async () => {
    const { isTestRecipient } = await loadService();
    for (const addr of [
      'e2e.reg.mu54b8th@example.com',
      'USER@EXAMPLE.ORG',
      'a@sub.example.net',
      'x@y.test',
      'x@y.invalid',
      'x@localhost',
      'x@foo.localhost',
    ]) {
      expect(isTestRecipient(addr)).toBe(true);
    }
  });

  it('passes real addresses (including lookalikes)', async () => {
    const { isTestRecipient } = await loadService();
    for (const addr of [
      'degusamrawi29@gmail.com',
      'user@myexample.com',
      'user@example.com.evil.com',
      '',
      'not-an-email',
    ]) {
      expect(isTestRecipient(addr)).toBe(false);
    }
  });
});

describe('login fingerprint gating (new device/IP only)', () => {
  it('notifies on first login (nothing stored)', async () => {
    const { isNewLoginFingerprint } = await loadService();
    expect(isNewLoginFingerprint(null, '1.2.3.4', 'UA')).toBe(true);
    expect(isNewLoginFingerprint({}, '1.2.3.4', 'UA')).toBe(true);
    expect(isNewLoginFingerprint({ ip: null, device: null }, '1.2.3.4', 'UA')).toBe(true);
  });

  it('stays quiet for the same device and IP', async () => {
    const { isNewLoginFingerprint } = await loadService();
    expect(
      isNewLoginFingerprint({ ip: '1.2.3.4', device: 'Mozilla/5.0' }, '1.2.3.4', 'Mozilla/5.0')
    ).toBe(false);
  });

  it('notifies on IP or device change', async () => {
    const { isNewLoginFingerprint } = await loadService();
    expect(
      isNewLoginFingerprint({ ip: '1.2.3.4', device: 'Mozilla/5.0' }, '5.6.7.8', 'Mozilla/5.0')
    ).toBe(true);
    expect(
      isNewLoginFingerprint({ ip: '1.2.3.4', device: 'Mozilla/5.0' }, '1.2.3.4', 'Chrome/120')
    ).toBe(true);
  });

  it('treats IPv4-mapped IPv6 as the same address', async () => {
    const { isNewLoginFingerprint, normalizeIp } = await loadService();
    expect(normalizeIp('::ffff:127.0.0.1')).toBe('127.0.0.1');
    expect(
      isNewLoginFingerprint({ ip: '127.0.0.1', device: 'UA' }, '::ffff:127.0.0.1', 'UA')
    ).toBe(false);
  });
});

describe('sendTemplateEmail (quota + failure contract)', () => {
  it('suppresses test recipients without touching Brevo, returns true', async () => {
    const { EmailService } = await loadService();
    const ok = await EmailService.sendTemplateEmail(
      'e2e.reg.mu54b8th@example.com',
      26,
      { userName: 'E2E' }
    );
    expect(ok).toBe(true);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('sends real recipients through Brevo', async () => {
    const { EmailService } = await loadService();
    const ok = await EmailService.sendTemplateEmail('real@gmail.com', 2, {});
    expect(ok).toBe(true);
    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost.mock.calls[0][0]).toContain('api.brevo.com');
  });

  it('returns false (never throws) when Brevo fails', async () => {
    mockPost.mockRejectedValue(new Error('socket hang up'));
    const { EmailService } = await loadService();
    const ok = await EmailService.sendTemplateEmail('real@gmail.com', 2, {});
    expect(ok).toBe(false);
  });
});
