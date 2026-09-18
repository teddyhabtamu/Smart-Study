import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// Cron contract: bearer auth gating, and — the load-bearing invariant —
// /hourly runs reminders ONLY. Daily tasks (streak-risk pushes assume
// once-a-day with no throttle table) must never run on the hourly tick,
// or users get up to 24 streak nudges a day. SchedulerService is mocked;
// only routing + auth + job selection run for real.
const mockReminders = vi.fn();
const mockDaily = vi.fn();

vi.mock('../services/schedulerService', () => ({
  SchedulerService: {
    triggerStudyReminders: (...args: any[]) => mockReminders(...args),
    triggerDailyTasks: (...args: any[]) => mockDaily(...args),
  },
}));

const savedEnv = { ...process.env };

beforeEach(() => {
  process.env.CRON_SECRET = 'test-cron-secret';
  mockReminders.mockReset().mockResolvedValue(undefined);
  mockDaily.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  process.env = { ...savedEnv };
});

const loadApp = async () => {
  const { default: cronRouter } = await import('./cron');
  const app = express();
  app.use(express.json());
  app.use('/api/cron', cronRouter);
  return app;
};

const auth = { Authorization: 'Bearer test-cron-secret' };

describe('GET /api/cron/* (auth gating)', () => {
  it.each(['/api/cron/hourly', '/api/cron/daily'])(
    'rejects %s without the bearer secret',
    async (path) => {
      const app = await loadApp();
      const res = await request(app).get(path);
      expect(res.status).toBe(401);
      expect(mockReminders).not.toHaveBeenCalled();
      expect(mockDaily).not.toHaveBeenCalled();
    }
  );

  it.each(['/api/cron/hourly', '/api/cron/daily'])(
    'rejects %s with a wrong bearer secret',
    async (path) => {
      const app = await loadApp();
      const res = await request(app).get(path).set('Authorization', 'Bearer nope');
      expect(res.status).toBe(401);
      expect(mockReminders).not.toHaveBeenCalled();
      expect(mockDaily).not.toHaveBeenCalled();
    }
  );

  it('500s when CRON_SECRET is not configured (fail loud, not open)', async () => {
    delete process.env.CRON_SECRET;
    const app = await loadApp();
    const res = await request(app).get('/api/cron/hourly').set(auth);
    expect(res.status).toBe(500);
    expect(res.body.message).toContain('not configured');
  });
});

describe('GET /api/cron/hourly (reminders only)', () => {
  it('runs the reminder sweep and nothing else', async () => {
    const app = await loadApp();
    const res = await request(app).get('/api/cron/hourly').set(auth);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockReminders).toHaveBeenCalledTimes(1);
    // The invariant: streak sweeps, streak-risk pushes and usage trimming
    // stay on the daily tick. Hourly daily-tasks = up to 24 nudges/day.
    expect(mockDaily).not.toHaveBeenCalled();
  });

  it('500s (not partial silence) when the sweep throws', async () => {
    mockReminders.mockRejectedValue(new Error('db down'));
    const app = await loadApp();
    const res = await request(app).get('/api/cron/hourly').set(auth);
    expect(res.status).toBe(500);
  });
});

describe('GET /api/cron/daily (reminders + daily tasks)', () => {
  it('runs both legs on the daily tick', async () => {
    const app = await loadApp();
    const res = await request(app).get('/api/cron/daily').set(auth);
    expect(res.status).toBe(200);
    expect(mockReminders).toHaveBeenCalledTimes(1);
    expect(mockDaily).toHaveBeenCalledTimes(1);
  });
});
