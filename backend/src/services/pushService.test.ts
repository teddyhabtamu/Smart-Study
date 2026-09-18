import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// PushService: never throws, prunes dead endpoints, degrades without keys.
// web-push + the DB facade are both mocked; a committed TEST-ONLY VAPID
// pair drives the success path (useless outside tests: nothing is signed
// for real delivery here).
const { mockSend, mockQuery } = vi.hoisted(() => ({
  mockSend: vi.fn(),
  mockQuery: vi.fn(),
}));

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: mockSend,
  },
}));

vi.mock('../database/config', () => ({
  query: mockQuery,
}));

const TEST_VAPID_PUBLIC =
  'BCoZ2aJefX8xlHeaQER_Gr9OTK9z1WfAf9XYCWEQy4r3iDyl-T59BtmhvW9vtAcSKFiFbLDDobSF9OnXAHZnZXY';
const TEST_VAPID_PRIVATE = 'rMBfGvUb9XST_o-AnK8o7WwzYJIzShPPkWLkJ438B_E';

const savedEnv = { ...process.env };

const setTestEnv = (withKeys = true) => {
  process.env.DATABASE_URL = 'postgresql://testuser:testpass@localhost:5432/testdb';
  process.env.SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'test-anon-key';
  process.env.JWT_SECRET = 'test-secret';
  process.env.GOOGLE_CLIENT_ID = 'test-google-id';
  process.env.GOOGLE_CLIENT_SECRET = 'test-google-secret';
  process.env.FRONTEND_URL = 'http://localhost:5173';
  process.env.BACKEND_URL = 'http://localhost:5000';
  if (withKeys) {
    process.env.VAPID_PUBLIC_KEY = TEST_VAPID_PUBLIC;
    process.env.VAPID_PRIVATE_KEY = TEST_VAPID_PRIVATE;
  } else {
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
  }
};

const sub = (over: Record<string, string> = {}) => ({
  endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint',
  p256dh: 'test-p256dh-key-material',
  auth: 'test-auth-secret',
  ...over,
});

beforeEach(() => {
  vi.resetModules();
  mockSend.mockReset();
  mockQuery.mockReset();
  mockSend.mockResolvedValue(undefined);
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

afterEach(() => {
  process.env = { ...savedEnv };
});

const loadService = async () => {
  const mod = await import('./pushService');
  mod.__resetPushForTests();
  return mod;
};

describe('sendPushToUser (never-throws broadcast)', () => {
  it('sends to every subscription and counts deliveries', async () => {
    setTestEnv();
    mockQuery.mockResolvedValue({
      rows: [sub(), sub({ endpoint: 'https://fcm.googleapis.com/fcm/send/other' })],
      rowCount: 2,
    });
    const { sendPushToUser } = await loadService();
    const sent = await sendPushToUser('user-1', { title: 'Hi', body: 'There' });
    expect(sent).toBe(2);
    expect(mockSend).toHaveBeenCalledTimes(2);
    const payload = JSON.parse(mockSend.mock.calls[0][1]);
    expect(payload).toMatchObject({ title: 'Hi', body: 'There' });
  });

  it('prunes 410/404 endpoints and keeps the rest', async () => {
    setTestEnv();
    const dead = sub({ endpoint: 'https://fcm.googleapis.com/fcm/send/dead' });
    mockQuery
      .mockResolvedValueOnce({ rows: [sub(), dead], rowCount: 2 })
      .mockResolvedValue({ rows: [], rowCount: 1 });
    const gone = Object.assign(new Error('Gone'), { statusCode: 410 });
    mockSend.mockImplementation(async (s: any) =>
      s.endpoint.endsWith('/dead') ? Promise.reject(gone) : undefined
    );
    const { sendPushToUser } = await loadService();
    const sent = await sendPushToUser('user-1', { title: 'Hi', body: 'There' });
    expect(sent).toBe(1);
    expect(mockQuery).toHaveBeenCalledWith(
      'DELETE FROM push_subscriptions WHERE endpoint = $1',
      [dead.endpoint]
    );
  });

  it('keeps rows on transient failures and counts zero', async () => {
    setTestEnv();
    mockQuery.mockResolvedValue({ rows: [sub()], rowCount: 1 });
    mockSend.mockRejectedValue(Object.assign(new Error('boom'), { statusCode: 500 }));
    const { sendPushToUser } = await loadService();
    expect(await sendPushToUser('user-1', { title: 'Hi', body: 'There' })).toBe(0);
    expect(
      mockQuery.mock.calls.some(([sql]: any[]) => String(sql).startsWith('DELETE'))
    ).toBe(false);
  });

  it('is a quiet no-op without VAPID keys (never throws)', async () => {
    setTestEnv(false);
    const { sendPushToUser } = await loadService();
    expect(await sendPushToUser('user-1', { title: 'Hi', body: 'There' })).toBe(0);
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('survives a database outage', async () => {
    setTestEnv();
    mockQuery.mockRejectedValue(new Error('db down'));
    const { sendPushToUser } = await loadService();
    expect(await sendPushToUser('user-1', { title: 'Hi', body: 'There' })).toBe(0);
  });
});
