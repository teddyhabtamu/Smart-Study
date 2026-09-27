import express, { Request, Response } from 'express';
import { body } from 'express-validator';
import { authenticateToken, requireRole, validateRequest } from '../middleware/auth';
import { query as dbQuery } from '../database/config';
import { logAdminActivity } from '../services/adminAuditLog';
import { YouTubeService, GRADES, SUBJECTS, isQuotaExceededError, verifyVideoGrade } from '../services/youtubeService';

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

/**
 * Grade audit: re-verify every library video's stored grade against the
 * grades its own title/description claims (same extractor the sync gate
 * uses — one rule everywhere). Costs zero YouTube quota: pure text
 * analysis over rows we already own. Silent videos (no claim, e.g. Khan
 * Academy) are counted, never flagged.
 */
router.get('/grade-audit', authenticateToken, requireRole(['ADMIN', 'MODERATOR']), async (_req: Request, res: Response): Promise<void> => {
    try {
        const r = await dbQuery(
            `SELECT id, title, description, subject, grade, video_url, channel_id
             FROM videos ORDER BY created_at DESC LIMIT 2000`
        );
        const mismatches: Array<{
            id: string; title: string; subject: string; storedGrade: number;
            claimedGrades: number[]; video_url: string;
        }> = [];
        let silent = 0;
        for (const v of r.rows || []) {
            const check = verifyVideoGrade(Number(v.grade), String(v.title || ''), v.description);
            if (check.status === 'mismatch') {
                mismatches.push({
                    id: String(v.id),
                    title: String(v.title || ''),
                    subject: String(v.subject || ''),
                    storedGrade: Number(v.grade),
                    claimedGrades: check.claimed,
                    video_url: String(v.video_url || ''),
                });
            } else if (check.status === 'silent') {
                silent++;
            }
            if (mismatches.length >= 200) break;
        }
        res.json({
            success: true,
            data: {
                checked: (r.rows || []).length,
                mismatched: mismatches.length,
                silent,
                truncated: mismatches.length >= 200,
                mismatches,
            },
        });
    } catch (error) {
        console.error('Grade audit error:', error);
        res.status(500).json({ success: false, message: 'Failed to audit video grades' });
    }
});

/**
 * Regrade one video (audit fix or reviewer judgment call). Audit-logged;
 * the row keeps its history — use delete for actual removals.
 */
router.patch('/videos/:id/grade', authenticateToken, requireRole(['ADMIN', 'MODERATOR']), [
    body('grade').isInt({ min: 9, max: 12 }).withMessage('grade must be 9, 10, 11 or 12'),
], validateRequest, async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const grade = Number(req.body.grade);
        const before = await dbQuery(`SELECT id, title, subject, grade FROM videos WHERE id = $1`, [id]);
        if (before.rows.length === 0) {
            res.status(404).json({ success: false, message: 'Video not found' });
            return;
        }
        const r = await dbQuery(
            `UPDATE videos SET grade = $1, updated_at = NOW() WHERE id = $2
             RETURNING id, title, subject, grade`,
            [grade, id]
        );
        logAdminActivity(req, {
            action: 'video.regrade',
            target_type: 'video',
            target_id: String(id),
            summary: `Regraded "${String(before.rows[0]?.title || id).slice(0, 60)}" grade ${before.rows[0]?.grade} → ${grade}`,
            before: before.rows[0],
            after: r.rows[0],
        }).catch(() => {});
        res.json({ success: true, data: r.rows[0] });
    } catch (error) {
        console.error('Regrade video error:', error);
        res.status(500).json({ success: false, message: 'Failed to regrade video' });
    }
});

export default router;
