import { dbAdmin, query } from '../database/config';
import { EmailService } from './emailService';

export type NotificationType = 'INFO' | 'WARNING' | 'SUCCESS' | 'ERROR';

export interface CreateNotificationData {
  user_id: string;
  title: string;
  message: string;
  type?: NotificationType;
  is_read?: boolean;
}

/**
 * Notification Service - Handles all notification operations
 */
export class NotificationService {

  /**
   * Create a new notification
   */
  static async create(notificationData: CreateNotificationData): Promise<any> {
    try {
      const notification = {
        user_id: notificationData.user_id,
        title: notificationData.title,
        message: notificationData.message,
        type: notificationData.type || 'INFO',
        is_read: notificationData.is_read || false
      };

      const result = await dbAdmin.insert('notifications', notification);
      return result;
    } catch (error) {
      console.error('Failed to create notification:', error);
      throw error;
    }
  }

  /**
   * Delete a notification by ID
   * Single indexed DELETE scoped to the owner — no full-table scan, and a
   * user can never delete another user's row by ID enumeration.
   */
  static async delete(notificationId: string, userId: string): Promise<boolean> {
    try {
      const result = await query(
        'DELETE FROM notifications WHERE id = $1 AND user_id = $2',
        [notificationId, userId]
      );
      return (result.rowCount ?? 0) > 0;
    } catch (error) {
      console.error('Failed to delete notification:', error);
      throw error;
    }
  }

  /**
   * Mark notifications as read for a user.
   * Two indexed UPDATEs (no per-row round-trips, no full-table scans).
   */
  static async markAsRead(userId: string, notificationIds?: string[]): Promise<void> {
    try {
      if (notificationIds && notificationIds.length > 0) {
        // Ownership enforced in the WHERE clause — foreign IDs are simply
        // unaffected instead of flipping another user's rows.
        await query(
          'UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND id = ANY($2) AND is_read IS DISTINCT FROM TRUE',
          [userId, notificationIds]
        );
      } else {
        // Mark all notifications as read for the user
        await query(
          'UPDATE notifications SET is_read = TRUE WHERE user_id = $1 AND is_read IS DISTINCT FROM TRUE',
          [userId]
        );
      }
    } catch (error) {
      console.error('Failed to mark notifications as read:', error);
      throw error;
    }
  }

  /**
   * Get notifications for a user — indexed, newest first, paginated in SQL.
   */
  static async getForUser(userId: string, limit?: number, offset?: number): Promise<any[]> {
    try {
      let sql = 'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC';
      const params: any[] = [userId];
      if (limit !== undefined) {
        params.push(limit);
        sql += ` LIMIT $${params.length}`;
      }
      if (offset) {
        params.push(offset);
        sql += ` OFFSET $${params.length}`;
      }
      const result = await query(sql, params);
      return result.rows;
    } catch (error) {
      console.error('Failed to get notifications for user:', error);
      throw error;
    }
  }

  /**
   * Get unread count for a user — COUNT(*) in SQL, not a full-table fetch.
   */
  static async getUnreadCount(userId: string): Promise<number> {
    try {
      const result = await query(
        'SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read IS DISTINCT FROM TRUE',
        [userId]
      );
      return result.rows[0]?.count ?? 0;
    } catch (error) {
      console.error('Failed to get unread count:', error);
      return 0;
    }
  }

  // Predefined notification templates

  /**
   * Create a welcome notification for new users
   */
  static async createWelcomeNotification(userId: string): Promise<void> {
    await this.create({
      user_id: userId,
      title: 'Welcome to SmartStudy!',
      message: 'Thanks for joining! Explore our library, try AI tutoring, and start your learning journey.',
      type: 'SUCCESS'
    });

    // Send welcome email
    try {
      const users = await dbAdmin.get('users');
      const user = users.find((u: any) => u.id === userId);

      if (user) {
        await EmailService.sendWelcomeEmail(user.email, user.name);
      }
    } catch (error) {
      console.error('Failed to send welcome email:', error);
      // Don't fail the notification creation for email errors
    }
  }

  /**
   * Create a level up notification
   */
  static async createLevelUpNotification(userId: string, newLevel: number): Promise<void> {
    await this.create({
      user_id: userId,
      title: 'Level Up!',
      message: `Congratulations! You reached Level ${newLevel}. Keep up the great work!`,
      type: 'SUCCESS'
    });
  }

  /**
   * Create a premium upgrade notification
   */
  static async createPremiumUpgradeNotification(userId: string): Promise<void> {
    await this.create({
      user_id: userId,
      title: 'Welcome to Student Pro!',
      message: 'Congratulations! You now have access to premium features including unlimited AI tutoring and exclusive content.',
      type: 'SUCCESS'
    });

    // Send premium upgrade email
    try {
      const users = await dbAdmin.get('users');
      const user = users.find((u: any) => u.id === userId);

      if (user) {
        await EmailService.sendPremiumUpgradeEmail(user.email, user.name);
      }
    } catch (error) {
      console.error('Failed to send premium upgrade email:', error);
      // Don't fail the notification creation for email errors
    }
  }

  /**
   * Create a study goal completion notification
   */
  static async createStudyGoalCompletedNotification(userId: string, eventTitle: string, xpGained: number): Promise<void> {
    await this.create({
      user_id: userId,
      title: 'Study Goal Completed!',
      message: `Congratulations on completing: ${eventTitle}. You earned ${xpGained} XP!`,
      type: 'SUCCESS'
    });
  }

  /**
   * Create a practice milestone notification
   */
  static async createPracticeMilestoneNotification(userId: string, totalSessions: number): Promise<void> {
    await this.create({
      user_id: userId,
      title: 'Practice Milestone!',
      message: `You've completed ${totalSessions} practice sessions! Keep up the great work!`,
      type: 'SUCCESS'
    });
  }

  /**
   * Create a study reminder notification
   */
  static async createStudyReminderNotification(userId: string, eventTitle: string, eventDate: string, hoursUntil: number): Promise<void> {
    const timeMessage = hoursUntil === 1 ? '1 hour' : hoursUntil === 24 ? '1 day' : `${hoursUntil} hours`;
    await this.create({
      user_id: userId,
      title: 'Study Reminder',
      message: `${eventTitle} is coming up in ${timeMessage}. Don't forget to prepare!`,
      type: 'INFO'
    });

    // Send email notification if user has email notifications enabled and it's a 1-day or 1-hour reminder
    if (hoursUntil === 1 || hoursUntil === 24) {
      try {
        const users = await dbAdmin.get('users');
        const user = users.find((u: any) => u.id === userId);

        if (user) {
          await EmailService.sendStudyReminderEmail(user.email, user.name, eventTitle, eventDate, hoursUntil);
        }
      } catch (error) {
        console.error('Failed to send study reminder email:', error);
        // Don't fail the notification creation for email errors
      }
    }
  }

  /**
   * Create a forum reply notification
   */
  static async createForumReplyNotification(userId: string, postTitle: string, replierName: string): Promise<void> {
    await this.create({
      user_id: userId,
      title: 'New Reply to Your Post',
      message: `${replierName} replied to your post: "${postTitle}"`,
      type: 'INFO'
    });
  }

  /**
   * Create a forum answer accepted notification
   */
  static async createForumAnswerAcceptedNotification(userId: string, postTitle: string): Promise<void> {
    await this.create({
      user_id: userId,
      title: 'Answer Accepted!',
      message: `Your answer to "${postTitle}" was accepted as the solution!`,
      type: 'SUCCESS'
    });
  }

  /**
   * Create a badge unlocked notification
   */
  static async createBadgeUnlockedNotification(userId: string, badgeName: string): Promise<void> {
    await this.create({
      user_id: userId,
      title: 'New Badge Unlocked!',
      message: `You've earned the "${badgeName}" badge! Check your profile to see it.`,
      type: 'SUCCESS'
    });
  }

  /**
   * Create a streak milestone notification
   */
  static async createStreakMilestoneNotification(userId: string, streakDays: number): Promise<void> {
    await this.create({
      user_id: userId,
      title: 'Study Streak Milestone!',
      message: `Amazing! You've maintained a ${streakDays}-day study streak. You're unstoppable!`,
      type: 'SUCCESS'
    });
  }

  /**
   * Notify all users about new resources (in-app notification only, no emails).
   * Single bulk INSERT ... SELECT — one round-trip regardless of user count,
   * so this fits in a serverless time budget. Per-row inserts (N round-trips)
   * would time out as the user base grows, and fire-and-forget callers on
   * Vercel may be frozen after the response anyway.
   */
  static async notifyUsersAboutNewResources(isPremium?: boolean): Promise<void> {
    try {
      console.log('🔔 Notifying all users about new resources (in-app only)');

      // Only accounts that can actually sign in (Active). Staff see new
      // content through admin panels, not user notifications.
      const result = isPremium
        ? await query(
            `INSERT INTO notifications (user_id, title, message, type)
             SELECT id, 'New resources available',
               'New content has been added to the library. Check it out!', 'INFO'
             FROM users WHERE status = 'Active' AND is_premium = TRUE
             RETURNING id`
          )
        : await query(
            `INSERT INTO notifications (user_id, title, message, type)
             SELECT id, 'New resources available',
               'New content has been added to the library. Check it out!', 'INFO'
             FROM users WHERE status = 'Active'
             RETURNING id`
          );

      console.log(`🔔 New resources notification summary: ${result.rowCount ?? 0} in-app notifications created`);
    } catch (error) {
      console.error('❌ Failed to notify users about new resources:', error);
    }
  }
}
