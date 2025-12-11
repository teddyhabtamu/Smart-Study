import { dbAdmin } from '../database/config';
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
   * Check for upcoming study events and send reminders
   */
  private static async checkAndSendStudyReminders(): Promise<void> {
    try {
      console.log('Checking for study event reminders...');

      const now = new Date();
      const oneHourFromNow = new Date(now.getTime() + (60 * 60 * 1000));
      const oneDayFromNow = new Date(now.getTime() + (24 * 60 * 60 * 1000));

      // Get all upcoming study events that are not completed
      const events = await dbAdmin.get('study_events');
      const upcomingEvents = events.filter((event: any) => {
        if (event.is_completed) return false;

        const eventDate = new Date(event.event_date);
        return eventDate > now;
      });

      for (const event of upcomingEvents) {
        const eventDate = new Date(event.event_date);
        const timeDiff = eventDate.getTime() - now.getTime();
        const hoursUntil = Math.floor(timeDiff / (1000 * 60 * 60));

        // Check if we need to send a reminder
        const shouldSendHourReminder = hoursUntil === 1;
        const shouldSendDayReminder = hoursUntil === 24;

        if (shouldSendHourReminder || shouldSendDayReminder) {
          // Check if we've already sent this reminder (by checking recent notifications)
          const recentNotifications = await NotificationService.getForUser(event.user_id, 50);
          const reminderType = shouldSendHourReminder ? 'hour' : 'day';
          const alreadySent = recentNotifications.some((notif: any) =>
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
    } catch (error) {
      console.error('Error checking study reminders:', error);
    }
  }

  /**
   * Run daily maintenance tasks
   */
  private static async runDailyTasks(): Promise<void> {
    try {
      console.log('Running daily notification tasks...');

      // Update user streaks based on last activity
      await this.updateUserStreaks();

      // Clean up old read notifications (keep only last 100 per user)
      await this.cleanupOldNotifications();

    } catch (error) {
      console.error('Error running daily tasks:', error);
    }
  }

  /**
   * Update user streaks based on daily activity
   */
  private static async updateUserStreaks(): Promise<void> {
    try {
      const users = await dbAdmin.get('users');
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];

      for (const user of users) {
        const lastActive = user.last_active_date;
        if (lastActive === yesterdayStr) {
          // User was active yesterday, increment streak
          const currentStreak = user.streak || 0;
          const newStreak = currentStreak + 1;
          const currentUnlockedBadges = user.unlocked_badges || ['b1'];
          
          await dbAdmin.update('users', user.id, {
            streak: newStreak,
            last_active_date: new Date().toISOString().split('T')[0]
          });

          // Check for streak milestones (7, 14, 30, 50, 100 days)
          const streakMilestones = [7, 14, 30, 50, 100];
          if (streakMilestones.includes(newStreak)) {
            await NotificationService.createStreakMilestoneNotification(user.id, newStreak);
            
            // Send streak milestone email (non-blocking)
            if (user.email && user.name) {
              const { EmailService } = await import('./emailService');
              EmailService.sendStreakMilestoneEmail(
                user.email,
                user.name,
                newStreak
              ).catch(error => {
                console.error(`❌ Failed to send streak milestone email for user ${user.id}:`, error);
              });
            }
          }

          // Check for newly unlocked badges (non-blocking)
          const { EmailService } = await import('./emailService');
          EmailService.checkAndUnlockBadges(
            user.id,
            user.level || 1,
            newStreak,
            currentUnlockedBadges
          ).catch(error => {
            console.error(`❌ Failed to check badges for user ${user.id}:`, error);
          });
        } else if (lastActive !== new Date().toISOString().split('T')[0]) {
          // User wasn't active yesterday, reset streak if it's been more than 1 day
          const lastActiveDate = new Date(lastActive);
          const daysSinceActive = Math.floor((new Date().getTime() - lastActiveDate.getTime()) / (1000 * 60 * 60 * 24));

          if (daysSinceActive > 1) {
            await dbAdmin.update('users', user.id, {
              streak: 0,
              last_active_date: new Date().toISOString().split('T')[0]
            });
          }
        }
      }
    } catch (error) {
      console.error('Error updating user streaks:', error);
    }
  }

  /**
   * Clean up old read notifications to prevent database bloat
   */
  private static async cleanupOldNotifications(): Promise<void> {
    try {
      // For each user, keep only the most recent 100 read notifications
      const users = await dbAdmin.get('users');

      for (const user of users) {
        const userNotifications = await NotificationService.getForUser(user.id);
        const readNotifications = userNotifications.filter((n: any) => n.is_read);

        if (readNotifications.length > 100) {
          // Sort by date and delete older ones
          readNotifications.sort((a: any, b: any) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );

          const toDelete = readNotifications.slice(100);
          for (const notification of toDelete) {
            await NotificationService.delete(notification.id, user.id);
          }

          console.log(`Cleaned up ${toDelete.length} old notifications for user ${user.id}`);
        }
      }
    } catch (error) {
      console.error('Error cleaning up old notifications:', error);
    }
  }

  /**
   * Manually trigger study reminder check (for testing)
   */
  static async triggerStudyReminders(): Promise<void> {
    await this.checkAndSendStudyReminders();
  }

  /**
   * Manually trigger daily tasks (for testing)
   */
  static async triggerDailyTasks(): Promise<void> {
    await this.runDailyTasks();
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
    } catch (error) {
      console.error('❌ Error running weekly tasks:', error);
    }
  }
}
