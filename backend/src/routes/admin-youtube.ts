import express, { Request, Response } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth';
import { YouTubeService, GRADES, SUBJECTS, isQuotaExceededError } from '../services/youtubeService';

const router = express.Router();

/**
 * Trigger a full YouTube sync for a specific grade and subject.
 */
router.post('/sync', authenticateToken, requireRole(['ADMIN', 'MODERATOR']), async (req: Request, res: Response): Promise<void> => {
    const { grade, subject } = req.body;

    if (!grade || !subject) {
        res.status(400).json({ success: false, message: 'grade and subject are required' });
        return;
    }

    const numericGrade = Number(grade);

    if (!GRADES.includes(numericGrade)) {
        res.status(400).json({ success: false, message: `grade must be one of: ${GRADES.join(', ')}` });
        return;
    }

    if (!SUBJECTS.includes(subject as string)) {
        res.status(400).json({ success: false, message: `subject must be one of: ${SUBJECTS.join(', ')}` });
        return;
    }

    const adminUserId = req.user!.id;

    // Fail fast with a clear message: without a key every call 500s deep
    // inside the service instead of saying what's actually wrong.
    if (!process.env.YOUTUBE_API_KEY) {
        res.status(503).json({ success: false, message: 'YouTube sync is not configured (missing API key)' });
        return;
    }

    try {
        const result = await YouTubeService.syncVideosForGradeAndSubject(numericGrade, subject as string, adminUserId);
        res.json({
            success: true,
            message: result.added === 0
                ? `No new videos for Grade ${numericGrade} ${subject} — library already has these results.`
                : `Successfully synced ${result.added} new videos for Grade ${numericGrade} ${subject}.`,
            data: result
        });
    } catch (error) {
        console.error('Sync error:', error);
        if (isQuotaExceededError(error)) {
            res.status(429).json({ success: false, message: 'YouTube API quota exhausted for today. Try again after the daily reset.' });
            return;
        }
        res.status(500).json({ success: false, message: 'An error occurred while syncing YouTube videos' });
    }
});

/**
 * Trigger a full sync (CRON endpoint)
 * Time-boxed like the cron caller: a full 60-combination run cannot fit in
 * a 30s serverless invocation, so partial counts are reported honestly
 * instead of dying mid-run.
 */
router.post('/sync-all', authenticateToken, requireRole(['ADMIN', 'MODERATOR']), async (req: Request, res: Response): Promise<void> => {
    const adminUserId = req.user!.id;

    try {
        const result = await YouTubeService.syncAllGradesAndSubjects(adminUserId, { deadline: Date.now() + 25_000 });
        const suffix = result.quotaExceeded
            ? ' YouTube API quota exhausted — rerun after the daily reset.'
            : result.stoppedEarly
                ? ' Stopped early on time budget — rerun to cover more combinations (existing videos are skipped, but each search costs API quota).'
                : '';
        res.json({
            success: true,
            message: `Global sync completed. Added ${result.added} new videos. Encountered ${result.errors} errors.${suffix}`,
            data: result
        });
    } catch (error) {
        console.error('Sync all error:', error);
        res.status(500).json({ success: false, message: 'An error occurred during global sync' });
    }
});

export default router;
