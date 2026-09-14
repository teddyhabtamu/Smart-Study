import express from 'express';
import { ApiResponse } from '../types';

// ---------------------------------------------------------------------------
// Vercel Cron endpoints. The in-process SchedulerService only runs in
// traditional server mode; in production (Vercel serverless) NOTHING
// scheduled ever ran — no reminders, no digests, no streak sweeps, no
// YouTube sync (newest video predates the serverless move by months).
// These endpoints are the serverless replacement, triggered by Vercel Cron
// (see backend/vercel.json `crons`).
//
// Auth: Vercel automatically sends `Authorization: Bearer <CRON_SECRET>`
// when the CRON_SECRET env var is set — no other caller is accepted.
// Set CRON_SECRET in the Vercel project environment, or every call 500s.
//
// Time-boxing: serverless functions die hard at maxDuration (30s). Each job
// carries a ~25s budget and reports honest partial counts instead of dying
// mid-batch and looking like a total failure.
// ---------------------------------------------------------------------------

const router = express.Router();

const BUDGET_MS = 25_000;

const checkCronAuth = (req: express.Request, res: express.Response): boolean => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('Cron called but CRON_SECRET is not configured — refusing');
    res.status(500).json({ success: false, message: 'Cron not configured' } as ApiResponse);
    return false;
  }
  const header = req.headers.authorization || '';
  if (header !== `Bearer ${secret}`) {
    res.status(401).json({ success: false, message: 'Unauthorized' } as ApiResponse);
    return false;
  }
  return true;
};

// Daily: study reminders + streak maintenance + notification cleanup.
router.get('/daily', async (req: express.Request, res: express.Response): Promise<void> => {
  if (!checkCronAuth(req, res)) return;
  try {
    const deadline = Date.now() + BUDGET_MS;
    const { SchedulerService } = await import('../services/schedulerService');
    await SchedulerService.triggerStudyReminders({ deadline });
    await SchedulerService.triggerDailyTasks({ deadline });
    res.json({ success: true, message: 'Daily tasks completed' } as ApiResponse);
  } catch (error) {
    console.error('Cron daily error:', error);
    res.status(500).json({ success: false, message: 'Daily tasks failed' } as ApiResponse);
  }
});

// Weekly: digest emails, then YouTube sync with whatever budget remains.
router.get('/weekly', async (req: express.Request, res: express.Response): Promise<void> => {
  if (!checkCronAuth(req, res)) return;
  try {
    const deadline = Date.now() + BUDGET_MS;
    const { EmailService } = await import('../services/emailService');
    const digest = await EmailService.sendWeeklyDigestsToAllUsers({ deadline });

    const { YouTubeService } = await import('../services/youtubeService');
    const { dbAdmin } = await import('../database/config');
    const users = await dbAdmin.get('users');
    const admin = users.find((u: any) => u.role === 'ADMIN');
    // No random-user fallback (see schedulerService): NULL attribution when
    // no admin exists, never a student's id.
    const sync = await YouTubeService.syncAllGradesAndSubjects(admin ? admin.id : null, { deadline });

    res.json({
      success: true,
      data: { digest, youtube: sync },
      message: 'Weekly tasks completed'
    } as ApiResponse);
  } catch (error) {
    console.error('Cron weekly error:', error);
    res.status(500).json({ success: false, message: 'Weekly tasks failed' } as ApiResponse);
  }
});

export default router;
