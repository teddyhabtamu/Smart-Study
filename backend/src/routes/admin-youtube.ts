import express, { Request, Response } from 'express';
import { authenticateToken, requireRole } from '../middleware/auth';
import { YouTubeService, GRADES, SUBJECTS } from '../services/youtubeService';

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

    try {
        const result = await YouTubeService.syncVideosForGradeAndSubject(numericGrade, subject as string, adminUserId);
        res.json({
            success: true,
            message: `Successfully synced ${result.added} new videos for Grade ${numericGrade} ${subject}.`,
            data: result
        });
    } catch (error) {
        console.error('Sync error:', error);
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
        res.json({
            success: true,
            message: `Global sync completed. Added ${result.added} new videos. Encountered ${result.errors} errors.${result.stoppedEarly ? ' Stopped early on time budget — rerun to cover more combinations (existing videos are skipped, but each search costs API quota).' : ''}`,
            data: result
        });
    } catch (error) {
        console.error('Sync all error:', error);
        res.status(500).json({ success: false, message: 'An error occurred during global sync' });
    }
});

export default router;
