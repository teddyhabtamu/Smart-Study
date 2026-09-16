import { dbAdmin, query } from '../database/config';
import { eatTodayStr } from '../utils/dates';
import { NotificationService } from './notificationService';

export class SchedulerService {
  private static intervals: NodeJS.Timeout[] = [];
  private static isRunning = false;

  /**
   * Start the scheduler
   */
  static start(): void {
    if (this.isRunning) {
      console.log('Scheduler is already running');
      return;
    }

    this.isRunning = true;
    console.log('Starting notification scheduler...');

    // Run study reminders every hour
    const studyReminderInterval = setInterval(() => {
      this.checkAndSendStudyReminders();
    }, 60 * 60 * 1000); // 1 hour

    // Run daily tasks at midnight
    const dailyTasksInterval = setInterval(() => {
      const now = new Date();
      if (now.getHours() === 0 && now.getMinutes() === 0) {
        this.runDailyTasks();
      }
    }, 60 * 1000); // Check every minute

    // Run weekly tasks on Mondays at 9 AM
    const weeklyTasksInterval = setInterval(() => {
      const now = new Date();
      if (now.getDay() === 1 && now.getHours() === 9 && now.getMinutes() === 0) {
        this.runWeeklyTasks();
      }
    }, 60 * 1000); // Check every minute

    this.intervals.push(studyReminderInterval, dailyTasksInterval, weeklyTasksInterval);

    // Run initial checks
    this.checkAndSendStudyReminders();
    this.runDailyTasks();
  }

  /**
   * Stop the scheduler
   */
  static stop(): void {
    this.isRunning = false;
    this.intervals.forEach(interval => clearInterval(interval));
    this.intervals = [];
    console.log('Notification scheduler stopped');
  }

  /**
   * Check for upcoming study events and send reminders.
   * Events are grouped by user so recent-notification dedup costs one indexed
   * query per user, not one full-table scan per event. Honors a deadline for
   * serverless cron (stops cleanly instead of being hard-killed mid-batch).
   */
  private static async checkAndSendStudyReminders(opts?: { deadline?: number }): Promise<void> {
    try {
      console.log('Checking for study event reminders...');

      const now = new Date();

      // Only events in the reminder windows — not every future event.
      const eventsResult = await query(
        `SELECT * FROM study_events WHERE is_completed IS DISTINCT FROM TRUE
         AND event_date > NOW() AND event_date <= NOW() + INTERVAL '25 hours'`
      );

      // Group by user: one dedup query per user instead of per event.
      const byUser = new Map<string, any[]>();
      for (const event of eventsResult.rows) {
        const list = byUser.get(event.user_id) || [];
        list.push(event);
        byUser.set(event.user_id, list);
      }

      for (const [userId, userEvents] of byUser) {
        if (opts?.deadline && Date.now() > opts.deadline) break;
        // One indexed fetch covers every event for this user.
        const recent = await NotificationService.getForUser(userId, 50);

        for (const event of userEvents) {
          const eventDate = new Date(event.event_date);
          const timeDiff = eventDate.getTime() - now.getTime();
          const hoursUntil = Math.floor(timeDiff / (1000 * 60 * 60));

          // Check if we need to send a reminder
          const shouldSendHourReminder = hoursUntil === 1;
          const shouldSendDayReminder = hoursUntil === 24;

          if (shouldSendHourReminder || shouldSendDayReminder) {
            // Check if we've already sent this reminder (by checking recent notifications)
            const reminderType = shouldSendHourReminder ? 'hour' : 'day';
            const alreadySent = recent.some((notif: any) =>
              notif.title === 'Study Reminder' &&
              notif.message.includes(event.title) &&
              notif.message.includes(reminderType === 'hour' ? '1 hour' : '1 day') &&
              // Check if sent within the last 2 hours for hour reminders, or 2 days for day reminders
              new Date(notif.created_at).getTime() > (now.getTime() - (reminderType === 'hour' ? 2 * 60 * 60 * 1000 : 2 * 24 * 60 * 60 * 1000))
            );

            if (!alreadySent) {
              await NotificationService.createStudyReminderNotification(
                event.user_id,
                event.title,
                event.event_date,
                shouldSendHourReminder ? 1 : 24
              );
              console.log(`Sent ${reminderType} reminder for event: ${event.title}`);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error checking study reminders:', error);
    }
  }

  /**
   * Run daily maintenance tasks
   */
  private static async runDailyTasks(opts?: { deadline?: number }): Promise<void> {
    try {
      console.log('Running daily notification tasks...');

      // Update user streaks based on last activity
      await this.updateUserStreaks(opts);

      // Clean up old read notifications (keep only last 100 per user)
      await this.cleanupOldNotifications();

      // Trim AI usage metering (90-day retention: aggregates for the admin
      // widget and quota alerts read 7d/24h windows; raw rows older than
      // that are dead weight on a table that grows per AI call).
      await this.cleanupOldAiUsage();

    } catch (error) {
      console.error('Error running daily tasks:', error);
    }
  }

  /**
   * Update user streaks based on daily activity
   */
  private static async updateUserStreaks(opts?: { deadline?: number }): Promise<void> {
    try {
      const users = await dbAdmin.get('users');

      for (const user of users) {
        // Serverless time-box: stop cleanly so the cron caller can report
        // partial progress instead of being hard-killed mid-sweep.
        if (opts?.deadline && Date.now() > opts.deadline) break;
        const lastActive = user.last_active_date;
        // Skip accounts that have never recorded activity (no last_active_date
        // yet) — otherwise every such row gets rewritten daily for no reason.
        if (!lastActive) continue;
        // NOTE: the sweep never increments streaks and never touches
        // last_active_date — increments belong to the login paths (email +
        // OAuth), which credit exactly one consecutive day each. A previous
        // revision incremented here AND stamped last_active_date=today, so
        // abandoned accounts accrued ghost streaks daily forever (with
        // milestone emails to inactive users), and the reset branch below
        // restarted the ghost cycle by fabricating today's activity.
        // "Today" is the Ethiopian day (login paths agree).
        if (lastActive !== eatTodayStr()) {
          // User wasn't active yesterday, reset streak if it's been more than 1 day
          const lastActiveDate = new Date(lastActive);
          const daysSinceActive = Math.floor((new Date().getTime() - lastActiveDate.getTime()) / (1000 * 60 * 60 * 24));

          if (daysSinceActive > 1) {
            // Reset the counter only — last_active_date keeps pointing at the
            // user's real last visit so the next login correctly starts a new
            // streak at 1 instead of inheriting a fabricated date.
            await dbAdmin.update('users', user.id, {
              streak: 0
            });
          }
        }
      }
    } catch (error) {
      console.error('Error updating user streaks:', error);
    }
  }

  /**
   * Clean up old read notifications to prevent database bloat.
   * Single statement for all users (window function keeps the 100 most recent
   * read rows per user) — the old per-user fetch-filter-delete loop was
   * O(users × notifications) full-table scans.
   */
  private static async cleanupOldNotifications(): Promise<void> {
    try {
      const result = await query(
        `DELETE FROM notifications WHERE id IN (
           SELECT id FROM (
             SELECT id, ROW_NUMBER() OVER (
               PARTITION BY user_id ORDER BY created_at DESC
             ) AS rn FROM notifications WHERE is_read = TRUE
           ) ranked WHERE rn > 100
         )`
      );
      if ((result.rowCount ?? 0) > 0) {
        console.log(`Cleaned up ${result.rowCount} old read notifications`);
      }
    } catch (error) {
      console.error('Error cleaning up old notifications:', error);
    }
  }

  /**
   * Trim AI usage rows older than 90 days. See runDailyTasks for why.
   * Guarded for old databases: if the ai_usage table predates the migration
   * the DELETE errors, logs once, and daily tasks continue.
   */
  private static async cleanupOldAiUsage(): Promise<void> {
    try {
      const result = await query(
        `DELETE FROM ai_usage WHERE created_at < NOW() - INTERVAL '90 days'`
      );
      if ((result.rowCount ?? 0) > 0) {
        console.log(`Cleaned up ${result.rowCount} old AI usage rows`);
      }
    } catch (error) {
      console.error('Error cleaning up old AI usage:', error);
    }
  }

  /**
   * Manually trigger study reminder check (for testing / cron)
   */
  static async triggerStudyReminders(opts?: { deadline?: number }): Promise<void> {
    await this.checkAndSendStudyReminders(opts);
  }

  /**
   * Manually trigger daily tasks (for testing / cron)
   */
  static async triggerDailyTasks(opts?: { deadline?: number }): Promise<void> {
    await this.runDailyTasks(opts);
  }

  /**
   * Run weekly tasks (sends weekly digest emails)
   */
  private static async runWeeklyTasks(): Promise<void> {
    try {
      console.log('📧 Running weekly tasks...');

      const { EmailService } = await import('./emailService');
      await EmailService.sendWeeklyDigestsToAllUsers();

      console.log('✅ Weekly tasks completed');

      // Weekly YouTube Video Sync
      console.log('📺 Running weekly YouTube videos sync...');
      try {
        const { YouTubeService } = await import('./youtubeService');
        const dbAdminModule = await import('../database/config');
        const users = await dbAdminModule.dbAdmin.get('users');
        const admin = users.find((u: any) => u.role === 'ADMIN');

        // No random-user fallback: with no admin, attribution stays NULL
        // (see YouTubeService) rather than stamping a student's id.
        await YouTubeService.syncAllGradesAndSubjects(admin ? admin.id : null);
        console.log('✅ Weekly YouTube sync completed successfully');
      } catch (err) {
        console.error('❌ Error during weekly YouTube sync:', err);
      }
    } catch (error) {
      console.error('❌ Error running weekly tasks:', error);
    }
  }
}
