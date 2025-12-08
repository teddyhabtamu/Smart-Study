import express from 'express';
import { body } from 'express-validator';
import { dbAdmin } from '../database/config';
import { authenticateToken, validateRequest } from '../middleware/auth';
import { ApiResponse, StudyEvent } from '../types';

const router = express.Router();

// Get user's study events
router.get('/events', authenticateToken, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { date, type, completed } = req.query;

    let events = await dbAdmin.get('study_events');
    events = events.filter((e: any) => e.user_id === userId);

    // Apply filters
    if (date) {
      events = events.filter((e: any) => e.event_date === date);
    }

    if (type) {
      events = events.filter((e: any) => e.event_type === type);
    }

    if (completed !== undefined) {
      const isCompleted = completed === 'true';
      events = events.filter((e: any) => e.is_completed === isCompleted);
    }

    // Sort by date
    events.sort((a: any, b: any) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime());

    res.json({
      success: true,
      data: events
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
  body('subject').isIn(['Mathematics', 'English', 'History', 'Chemistry', 'Physics', 'Biology']).withMessage('Valid subject required'),
  body('event_date').isString().isLength({ min: 10, max: 10 }).withMessage('Valid date required'),
  body('event_type').isIn(['Exam', 'Revision', 'Assignment']).withMessage('Valid event type required')
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { title, subject, event_date, event_type, notes } = req.body;

    const eventData = {
      user_id: userId,
      title,
      subject,
      event_date,
      event_type,
      is_completed: false,
      notes: notes || ''
    };

    const inserted = await dbAdmin.insert('study_events', eventData);

    res.status(201).json({
      success: true,
      data: inserted,
      message: 'Study event created successfully'
    } as ApiResponse<StudyEvent>);
  } catch (error) {
    console.error('Create study event error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create study event'
    } as ApiResponse);
  }
});

// Update study event
router.put('/events/:id', [
  authenticateToken,
  body('title').optional().trim().isLength({ min: 1, max: 200 }),
  body('subject').optional().isIn(['Mathematics', 'English', 'History', 'Chemistry', 'Physics', 'Biology']),
  body('event_date').optional().isString().isLength({ min: 10, max: 10 }).withMessage('Valid date required'),
  body('event_type').optional().isIn(['Exam', 'Revision', 'Assignment']),
  body('is_completed').optional().isBoolean(),
  body('notes').optional().trim().isLength({ max: 1000 })
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const eventId = id;

    // Verify ownership
    const event = await dbAdmin.findOne('study_events', (e: any) =>
      e.id === eventId && e.user_id === userId
    );

    if (!event) {
      res.status(404).json({
        success: false,
        message: 'Study event not found'
      } as ApiResponse);
      return;
    }

    const updates = req.body;

    // Award XP for completing events
    if (updates.is_completed === true && !event.is_completed) {
      const user = await dbAdmin.findOne('users', (u: any) => u.id === userId);
      if (user) {
        const xpGain = event.event_type === 'Exam' ? 50 : event.event_type === 'Revision' ? 20 : 30;
        const newXp = (user.xp || 0) + xpGain;
        const newLevel = Math.floor(newXp / 1000) + 1;
        dbAdmin.update('users', userId, { xp: newXp, level: newLevel });

        // Create notification
        dbAdmin.insert('notifications', {
          user_id: userId,
          title: 'Study Goal Completed!',
          message: `Congratulations on completing: ${event.title}. You earned ${xpGain} XP!`,
          type: 'SUCCESS'
        });
      }
    }

    const updated = await dbAdmin.update('study_events', eventId, {
      ...updates,
      updated_at: new Date().toISOString()
    });

    res.json({
      success: true,
      data: updated,
      message: 'Study event updated successfully'
    } as ApiResponse<StudyEvent>);
  } catch (error) {
    console.error('Update study event error:', error);
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

    // Verify ownership
    const event = await dbAdmin.findOne('study_events', (e: any) =>
      e.id === eventId && e.user_id === userId
    );

    if (!event) {
      res.status(404).json({
        success: false,
        message: 'Study event not found'
      } as ApiResponse);
      return;
    }

    await dbAdmin.delete('study_events', eventId);

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

    let events = await dbAdmin.get('study_events');
    events = events.filter((e: any) => e.user_id === userId);

    const stats = {
      total_events: events.length,
      completed_events: events.filter((e: any) => e.is_completed).length,
      upcoming_events: events.filter((e: any) =>
        !e.is_completed && new Date(e.event_date) >= new Date()
      ).length,
      overdue_events: events.filter((e: any) =>
        !e.is_completed && new Date(e.event_date) < new Date()
      ).length,
      by_type: {
        Exam: events.filter((e: any) => e.event_type === 'Exam').length,
        Revision: events.filter((e: any) => e.event_type === 'Revision').length,
        Assignment: events.filter((e: any) => e.event_type === 'Assignment').length
      },
      by_subject: {} as Record<string, number>
    };

    // Count by subject
    events.forEach((event: any) => {
      stats.by_subject[event.subject] = (stats.by_subject[event.subject] || 0) + 1;
    });

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
  body('subject').isIn(['Mathematics', 'English', 'History', 'Chemistry', 'Physics', 'Biology']).withMessage('Valid subject required'),
  body('duration').isInt({ min: 1, max: 480 }).withMessage('Duration must be between 1 and 480 minutes'),
  body('topics').optional().isArray().withMessage('Topics must be an array')
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { subject, duration, topics = [] } = req.body;

    // Update user's practice attempts
    const user = await dbAdmin.findOne('users', (u: any) => u.id === userId);
    if (user) {
      const newAttempts = (user.practice_attempts || 0) + 1;
      const xpGain = Math.min(duration, 60); // Max 60 XP per session
      const newXp = (user.xp || 0) + xpGain;
      const newLevel = Math.floor(newXp / 1000) + 1;

      dbAdmin.update('users', userId, {
        practice_attempts: newAttempts,
        xp: newXp,
        level: newLevel
      });

      // Create notification for milestone
      if (newAttempts % 10 === 0) {
        dbAdmin.insert('notifications', {
          user_id: userId,
          title: 'Practice Milestone!',
          message: `You've completed ${newAttempts} practice sessions! Keep up the great work!`,
          type: 'SUCCESS'
        });
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

// Get practice statistics
router.get('/practice/stats', authenticateToken, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const user = await dbAdmin.findOne('users', (u: any) => u.id === userId);

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
        xp_to_next_level: ((user.level || 1) * 1000) - (user.xp || 0),
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
