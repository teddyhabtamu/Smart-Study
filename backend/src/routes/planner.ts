import express from 'express';
import { body } from 'express-validator';
import { dbAdmin, query } from '../database/config';
import { authenticateToken, validateRequest } from '../middleware/auth';
import { ApiResponse, StudyEvent, User } from '../types';
import { NotificationService } from '../services/notificationService';
import { EmailService } from '../services/emailService';
import { awardXP } from '../services/xpService';
import { CONTENT_SUBJECTS } from '../constants';

const router = express.Router();

// Subject normalization map - maps common variations to allowed subjects
const normalizeSubject = (subject: string): string | null => {
  if (!subject) return null;
  
  const normalized = subject.trim();
  const subjectMap: Record<string, string> = {
    'mathematics': 'Mathematics',
    'math': 'Mathematics',
    'maths': 'Mathematics',
    'english': 'English',
    'history': 'History',
    'chemistry': 'Chemistry',
    'physics': 'Physics',
    'biology': 'Biology',
    'civics': 'Civics',
    'geography': 'Geography',
    'economics': 'Economics',
    'business': 'Business',
    'ict': 'ICT',
    'information technology': 'ICT',
    'amharic': 'Amharic',
    'afaan oromoo': 'Afaan Oromoo',
    'oromoo': 'Afaan Oromoo',
    'tigrigna': 'Tigrigna',
    'tigrinya': 'Tigrigna',
    'aptitude': 'Aptitude',
    'sat': 'SAT',
    'act': 'ACT',
    'gmat': 'GMAT',
    'gre': 'GRE',
    'toefl': 'TOEFL',
    'ielts': 'IELTS',
    'general': 'Mathematics', // Default to Mathematics for "General"
    'other': 'Mathematics'
  };

  const lowerSubject = normalized.toLowerCase();
  return subjectMap[lowerSubject] || (CONTENT_SUBJECTS.includes(normalized) || ['SAT', 'ACT', 'GMAT', 'GRE', 'TOEFL', 'IELTS'].includes(normalized) ? normalized : null);
};

// Get user's study events
router.get('/events', authenticateToken, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { date, type, completed, archived } = req.query;

    // Filtered/sorted in SQL over idx_study_events_user (was: fetch every
    // study_events row in the table, filter/sort in JS). 'all' omits the
    // archive predicate; default is active only.
    const conditions = ['user_id = $1'];
    const params: any[] = [userId];
    if (archived === 'true') {
      conditions.push('is_archived IS TRUE');
    } else if (archived !== 'all') {
      conditions.push('is_archived IS NOT TRUE');
    }
    if (date) {
      conditions.push(`event_date = $${params.length + 1}`);
      params.push(date);
    }
    if (type) {
      conditions.push(`event_type = $${params.length + 1}`);
      params.push(type);
    }
    if (completed !== undefined) {
      conditions.push(`is_completed = $${params.length + 1}`);
      params.push(completed === 'true');
    }
    const eventRows = await query(
      `SELECT * FROM study_events WHERE ${conditions.join(' AND ')} ORDER BY event_date ASC`,
      params
    );

    res.json({
      success: true,
      data: eventRows.rows
    } as ApiResponse<StudyEvent[]>);
  } catch (error) {
    console.error('Get study events error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get study events'
    } as ApiResponse);
  }
});

// Create study event
router.post('/events', [
  authenticateToken,
  body('title').trim().isLength({ min: 1, max: 200 }).withMessage('Title is required'),
  body('subject').notEmpty().withMessage('Subject is required'),
  body('event_date').notEmpty().withMessage('Date is required'),
  body('event_type').isIn(['Exam', 'Revision', 'Assignment']).withMessage('Valid event type required')
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    let { title, subject, event_date, event_type, notes } = req.body;

    // Normalize subject
    const normalizedSubject = normalizeSubject(subject);
    if (!normalizedSubject) {
      res.status(400).json({
        success: false,
        message: `Invalid subject: "${subject}". Must be one of: ${[...CONTENT_SUBJECTS, 'SAT', 'ACT', 'GMAT', 'GRE', 'TOEFL', 'IELTS'].join(', ')}`,
        errors: [{ field: 'subject', message: 'Invalid subject value' }]
      } as ApiResponse);
      return;
    }

    // Normalize and validate date format (YYYY-MM-DD)
    if (typeof event_date === 'string') {
      event_date = event_date.trim();
      // Check if it's a valid date format
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(event_date)) {
        res.status(400).json({
          success: false,
          message: `Invalid date format: "${event_date}". Must be in YYYY-MM-DD format`,
          errors: [{ field: 'event_date', message: 'Date must be in YYYY-MM-DD format' }]
        } as ApiResponse);
        return;
      }

      // Validate it's a valid date
      const dateObj = new Date(event_date);
      if (isNaN(dateObj.getTime())) {
        res.status(400).json({
          success: false,
          message: `Invalid date value: "${event_date}"`,
          errors: [{ field: 'event_date', message: 'Invalid date value' }]
        } as ApiResponse);
        return;
      }
    } else {
      res.status(400).json({
        success: false,
        message: 'Date must be a string in YYYY-MM-DD format',
        errors: [{ field: 'event_date', message: 'Date must be a string' }]
      } as ApiResponse);
      return;
    }

    const eventData = {
      user_id: userId,
      title: title.trim(),
      subject: normalizedSubject,
      event_date,
      event_type,
      is_completed: false,
      notes: (notes || '').trim()
    };

    const inserted = await dbAdmin.insert('study_events', eventData);

    res.status(201).json({
      success: true,
      data: inserted,
      message: 'Study event created successfully'
    } as ApiResponse<StudyEvent>);
  } catch (error) {
    console.error('Create study event error:', error);
    // No raw error in the body — pg messages can leak schema detail.
    res.status(500).json({
      success: false,
      message: 'Failed to create study event'
    } as ApiResponse);
  }
});

// Batch-create study events (used by AI schedule generation — one round trip
// instead of N sequential POSTs)
router.post('/events/batch', [
  authenticateToken,
  body('events').isArray({ min: 1, max: 31 }).withMessage('events must be an array of 1-31 items'),
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { events } = req.body as { events: Array<{
      title: string; subject: string; event_date: string; event_type: string; notes?: string;
    }> };

    // Validate + normalize every item before touching the DB (all-or-nothing)
    const rows: Array<[string, string, string, string, string, string]> = [];
    for (const [i, e] of events.entries()) {
      if (!e || typeof e.title !== 'string' || !e.title.trim() || e.title.trim().length > 200) {
        res.status(400).json({ success: false, message: `events[${i}].title is required (1-200 chars)` } as ApiResponse);
        return;
      }
      const normalizedSubject = normalizeSubject(e.subject);
      if (!normalizedSubject) {
        res.status(400).json({ success: false, message: `events[${i}].subject "${e.subject}" is invalid` } as ApiResponse);
        return;
      }
      if (typeof e.event_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(e.event_date.trim()) || isNaN(new Date(e.event_date).getTime())) {
        res.status(400).json({ success: false, message: `events[${i}].event_date must be YYYY-MM-DD` } as ApiResponse);
        return;
      }
      if (!['Exam', 'Revision', 'Assignment'].includes(e.event_type)) {
        res.status(400).json({ success: false, message: `events[${i}].event_type must be Exam/Revision/Assignment` } as ApiResponse);
        return;
      }
      rows.push([userId, e.title.trim(), normalizedSubject, e.event_date.trim(), e.event_type, (e.notes || '').trim()]);
    }

    // Single multi-row INSERT
    const values: any[] = [];
    const valueGroups = rows.map((r) => {
      const start = values.length + 1;
      values.push(r[0], r[1], r[2], r[3], r[4], false, r[5]);
      return `($${start}, $${start + 1}, $${start + 2}, $${start + 3}, $${start + 4}, $${start + 5}, $${start + 6})`;
    });

    const result = await query(
      `INSERT INTO study_events (user_id, title, subject, event_date, event_type, is_completed, notes) VALUES ${valueGroups.join(', ')} RETURNING *`,
      values
    );

    res.status(201).json({
      success: true,
      data: result.rows,
      message: `${result.rows.length} study events created successfully`
    } as ApiResponse);
  } catch (error) {
    console.error('Batch create study events error:', error);
    // No raw error in the body — pg messages can leak schema detail.
    res.status(500).json({
      success: false,
      message: 'Failed to create study events'
    } as ApiResponse);
  }
});

// Update study event
router.put('/events/:id', [
  authenticateToken,
  body('title').optional().trim().isLength({ min: 1, max: 200 }),
  body('subject').optional().isIn(CONTENT_SUBJECTS),
  body('event_date').optional().isString().isLength({ min: 10, max: 10 }).withMessage('Valid date required'),
  body('event_type').optional().isIn(['Exam', 'Revision', 'Assignment']),
  body('is_completed').optional().isBoolean(),
  body('is_archived').optional().isBoolean(),
  body('notes').optional().trim().isLength({ max: 1000 })
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const eventId = id;

    // Verify ownership with an indexed lookup (was a full-table fetch).
    const eventRows = await query(
      'SELECT id, user_id, title, event_type, is_completed, xp_awarded FROM study_events WHERE id = $1 AND user_id = $2',
      [eventId, userId]
    );
    const event = eventRows.rows[0];

    if (!event) {
      res.status(404).json({
        success: false,
        message: 'Study event not found'
      } as ApiResponse);
      return;
    }

    // Explicit allowlist: never spread req.body into the UPDATE. The old
    // `const updates = req.body` let callers set user_id (reassign events),
    // xp_awarded (re-arm payouts), or crafted keys for SQL injection via the
    // interpolated SET clause. Only validated client fields are picked here;
    // xp_awarded is set server-side on first completion only.
    const { title, subject, event_date, event_type, is_completed, is_archived, notes } = req.body;
    const updates: any = {};
    if (title !== undefined) updates.title = title;
    if (subject !== undefined) updates.subject = subject;
    if (event_date !== undefined) updates.event_date = event_date;
    if (event_type !== undefined) updates.event_type = event_type;
    if (is_completed !== undefined) updates.is_completed = is_completed;
    if (is_archived !== undefined) updates.is_archived = is_archived;
    if (notes !== undefined) updates.notes = notes;

    // Award XP for completing events. This is the ONLY award path — the old
    // frontend also called gainXP(50) after this update, double-paying every
    // completion (e.g. Revision paid 20 + 50). Guarded to the FIRST false→true
    // transition via xp_awarded, so uncomplete→re-complete cycles pay nothing.
    // Credited through the shared awardXP helper (level math, badges,
    // history, level-up notification in one place).
    let xpGained = 0;
    let newLevel: number | undefined;
    let leveledUp = false;
    if (updates.is_completed === true && !event.is_completed && !event.xp_awarded) {
      const xpGain = event.event_type === 'Exam' ? 50 : event.event_type === 'Revision' ? 20 : 30;
      const award = await awardXP(userId, xpGain, {
        source: 'study_event',
        source_id: eventId,
        description: `Completed ${event.event_type}: ${event.title}`
      });
      xpGained = award.xpGained;
      newLevel = award.newLevel;
      leveledUp = award.leveledUp;

      // Latch the payout so re-completing this event never pays again.
      // (Folded into the same update below would also work; explicit here
      // keeps the economy rule next to the award.)
      updates.xp_awarded = true;

      // Create notification
      await NotificationService.createStudyGoalCompletedNotification(userId, event.title, xpGain);
    }

    const updated = await dbAdmin.update('study_events', eventId, {
      ...updates,
      updated_at: new Date().toISOString()
    });

    res.json({
      success: true,
      data: { ...updated, xpGained, newLevel, leveledUp },
      message: 'Study event updated successfully'
    } as ApiResponse<StudyEvent>);
  } catch (error) {
    console.error('Update study event error:', error);
    // No raw error in the body — pg messages can leak schema detail.
    res.status(500).json({
      success: false,
      message: 'Failed to update study event'
    } as ApiResponse);
  }
});

// Delete study event
router.delete('/events/:id', authenticateToken, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const eventId = id;

    // Ownership-scoped atomic delete (was: full-table fetch for the check,
    // then an unscoped delete-by-id).
    const delResult = await query(
      'DELETE FROM study_events WHERE id = $1 AND user_id = $2',
      [eventId, userId]
    );
    if ((delResult.rowCount ?? 0) === 0) {
      res.status(404).json({
        success: false,
        message: 'Study event not found'
      } as ApiResponse);
      return;
    }

    res.json({
      success: true,
      message: 'Study event deleted successfully'
    } as ApiResponse);
  } catch (error) {
    console.error('Delete study event error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete study event'
    } as ApiResponse);
  }
});

// Get study statistics
router.get('/stats', authenticateToken, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    // Aggregated in SQL over idx_study_events_user (was: fetch every
    // study_events row, count in JS). Date buckets use CURRENT_DATE, which
    // matches the old JS rule (today counts as upcoming, not overdue).
    // Actionable buckets ignore archived tasks, same as the dashboard.
    const [aggRows, subjRows] = await Promise.all([
      query(
        `SELECT COUNT(*) AS total,
                COUNT(*) FILTER (WHERE is_completed IS TRUE) AS completed,
                COUNT(*) FILTER (WHERE is_completed IS NOT TRUE AND is_archived IS NOT TRUE AND event_date >= CURRENT_DATE) AS upcoming,
                COUNT(*) FILTER (WHERE is_completed IS NOT TRUE AND is_archived IS NOT TRUE AND event_date < CURRENT_DATE) AS overdue,
                COUNT(*) FILTER (WHERE event_type = 'Exam') AS exam,
                COUNT(*) FILTER (WHERE event_type = 'Revision') AS revision,
                COUNT(*) FILTER (WHERE event_type = 'Assignment') AS assignment
         FROM study_events WHERE user_id = $1`,
        [userId]
      ),
      query(
        'SELECT subject, COUNT(*) AS n FROM study_events WHERE user_id = $1 GROUP BY subject',
        [userId]
      )
    ]);
    const agg = aggRows.rows[0] || {};
    const bySubject: Record<string, number> = {};
    for (const r of subjRows.rows) {
      bySubject[r.subject] = parseInt(r.n, 10) || 0;
    }

    const stats = {
      total_events: parseInt(agg.total, 10) || 0,
      completed_events: parseInt(agg.completed, 10) || 0,
      upcoming_events: parseInt(agg.upcoming, 10) || 0,
      overdue_events: parseInt(agg.overdue, 10) || 0,
      by_type: {
        Exam: parseInt(agg.exam, 10) || 0,
        Revision: parseInt(agg.revision, 10) || 0,
        Assignment: parseInt(agg.assignment, 10) || 0
      },
      by_subject: bySubject
    };

    res.json({
      success: true,
      data: stats
    } as ApiResponse);
  } catch (error) {
    console.error('Get study stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get study statistics'
    } as ApiResponse);
  }
});

// Record practice session
router.post('/practice', [
  authenticateToken,
  body('subject').isIn(CONTENT_SUBJECTS).withMessage('Valid subject required'),
  body('duration').isInt({ min: 1, max: 480 }).withMessage('Duration must be between 1 and 480 minutes'),
  body('topics').optional().isArray().withMessage('Topics must be an array')
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { subject, duration, topics = [] } = req.body;

    // Update user's practice attempts + credit through the shared helper
    // (previously inline with no badge checks). Indexed lookup of only the
    // column read (was a full-table fetch of every user row).
    const attemptRows = await query('SELECT practice_attempts FROM users WHERE id = $1', [userId]);
    const user = attemptRows.rows[0];
    if (user) {
      const newAttempts = (user.practice_attempts || 0) + 1;
      const xpGain = Math.min(duration, 60); // Max 60 XP per session
      await dbAdmin.update('users', userId, { practice_attempts: newAttempts });
      await awardXP(userId, xpGain, {
        source: 'practice_session',
        source_id: null,
        description: `Practice session: ${subject} (${duration} minutes)`
      });

      // Create notification for milestone
      if (newAttempts % 10 === 0) {
        await NotificationService.createPracticeMilestoneNotification(userId, newAttempts);
      }
    }

    res.json({
      success: true,
      data: {
        subject,
        duration,
        topics,
        xp_gained: Math.min(duration, 60)
      },
      message: 'Practice session recorded successfully'
    } as ApiResponse);
  } catch (error) {
    console.error('Record practice error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record practice session'
    } as ApiResponse);
  }
});

// Record quiz completion (practice quiz). XP is computed AND credited here
// from the submitted score — never trusted from the client amount. The old
// generic /users/gain-xp endpoint let any caller mint arbitrary XP.
router.post('/practice/quiz-complete', [
  authenticateToken,
  body('subject').isIn(CONTENT_SUBJECTS).withMessage('Valid subject required'),
  body('score').isInt({ min: 0 }).withMessage('Score must be a non-negative integer'),
  body('totalQuestions').isInt({ min: 1, max: 10 }).withMessage('Total questions must be between 1 and 10'),
  body('timeSpent').isString().trim().isLength({ min: 1 }).withMessage('Time spent is required'),
  // NOTE: no xpEarned field is accepted — XP is priced server-side from the
  // clamped score below. A previous revision validated an optional client
  // xpEarned that nothing read, advertising a knob that did nothing.
  body('isHighScore').optional().isBoolean().withMessage('isHighScore must be a boolean')
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { subject, score, totalQuestions, timeSpent, isHighScore = false } = req.body;

    // Indexed lookup (never a full-table scan)
    const userRows = await query('SELECT id, name, email, xp, level, practice_attempts FROM users WHERE id = $1', [userId]);
    const user = userRows.rows[0];
    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      } as ApiResponse);
      return;
    }

    // Clamp the claim into the legal range, then price it: 10 XP per
    // correct answer. A forged 100/10 still pays at most 100.
    const safeTotal = Math.min(Math.max(Number(totalQuestions) || 1, 1), 10);
    const safeScore = Math.min(Math.max(Number(score) || 0, 0), safeTotal);
    const award = await awardXP(userId, safeScore * 10, {
      source: 'practice_quiz',
      source_id: null,
      description: `Practice quiz: ${subject} (${safeScore}/${safeTotal})`
    });
    const serverXp = award.xpGained;
    const newLevel = award.newLevel;

    // Update user's practice attempts (XP already credited above)
    const newAttempts = (user.practice_attempts || 0) + 1;
    await dbAdmin.update('users', userId, {
      practice_attempts: newAttempts
    });

    // Send practice session completed email (non-blocking)
    if (user.email && user.name) {
      console.log('📧 Triggering practice session completed email for user:', { 
        email: user.email, 
        subject,
        score,
        totalQuestions
      });
      EmailService.sendPracticeSessionCompletedEmail(
        user.email,
        user.name,
        subject,
        safeScore,
        safeTotal,
        timeSpent,
        serverXp,
        isHighScore
      ).catch(error => {
        console.error('❌ Failed to send practice session completed email:', error);
        // Don't fail the request if email fails
      });
    }

    res.json({
      success: true,
      data: {
        subject,
        score: safeScore,
        totalQuestions: safeTotal,
        timeSpent,
        xpEarned: serverXp,
        xpGained: serverXp,
        newLevel,
        leveledUp: award.leveledUp,
        isHighScore
      },
      message: 'Quiz completion recorded successfully'
    } as ApiResponse);
  } catch (error) {
    console.error('Record quiz completion error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record quiz completion'
    } as ApiResponse);
  }
});

// Get practice statistics
router.get('/practice/stats', authenticateToken, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const statRows = await query(
      'SELECT practice_attempts, level, xp, streak FROM users WHERE id = $1',
      [userId]
    );
    const user = statRows.rows[0];

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      } as ApiResponse);
      return;
    }

    res.json({
      success: true,
      data: {
        total_sessions: user.practice_attempts || 0,
        current_level: user.level || 1,
        total_xp: user.xp || 0,
        xp_to_next_level: Math.max(0, ((user.level || 1) * 1000) - (user.xp || 0)),
        current_streak: user.streak || 0
      }
    } as ApiResponse);
  } catch (error) {
    console.error('Get practice stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get practice statistics'
    } as ApiResponse);
  }
});

export default router;
