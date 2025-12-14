import { dbAdmin, supabaseAdmin } from '../database/config';
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
      console.log(`Created notification for user ${notificationData.user_id}: ${notificationData.title}`);
      return result;
    } catch (error) {
      console.error('Failed to create notification:', error);
      throw error;
    }
  }

  /**
   * Delete a notification by ID
   */
  static async delete(notificationId: string, userId: string): Promise<boolean> {
    try {
      const notification = await dbAdmin.findOne('notifications', (n: any) =>
        n.id === notificationId && n.user_id === userId
      );

      if (!notification) {
        return false;
      }

      await dbAdmin.delete('notifications', notificationId);
      return true;
    } catch (error) {
      console.error('Failed to delete notification:', error);
      throw error;
    }
  }

  /**
   * Mark notifications as read for a user
   */
  static async markAsRead(userId: string, notificationIds?: string[]): Promise<void> {
    try {
      if (notificationIds && notificationIds.length > 0) {
        // Mark specific notifications as read
        for (const id of notificationIds) {
          await dbAdmin.update('notifications', id, { is_read: true });
        }
      } else {
        // Mark all notifications as read for the user
        const notifications = await dbAdmin.get('notifications');
        const userNotifications = notifications.filter((n: any) =>
          n.user_id === userId && !n.is_read
        );

        for (const notification of userNotifications) {
          await dbAdmin.update('notifications', notification.id, { is_read: true });
        }
      }
    } catch (error) {
      console.error('Failed to mark notifications as read:', error);
      throw error;
    }
  }

  /**
   * Get notifications for a user
   */
  static async getForUser(userId: string, limit?: number, offset?: number): Promise<any[]> {
    try {
      let notifications = await dbAdmin.get('notifications');
      notifications = notifications.filter((n: any) => n.user_id === userId);

      // Sort by creation date (newest first)
      notifications.sort((a: any, b: any) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      // Apply pagination
      if (offset) {
        notifications = notifications.slice(offset);
      }
      if (limit) {
        notifications = notifications.slice(0, limit);
      }

      return notifications;
    } catch (error) {
      console.error('Failed to get notifications for user:', error);
      throw error;
    }
  }

  /**
   * Get unread count for a user
   */
  static async getUnreadCount(userId: string): Promise<number> {
    try {
      const notifications = await dbAdmin.get('notifications');
      return notifications.filter((n: any) =>
        n.user_id === userId && !n.is_read
      ).length;
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
   * Notify all users about new resources (in-app notification only, no emails)
   */
  static async notifyUsersAboutNewResources(isPremium?: boolean): Promise<void> {
    try {
      console.log('🔔 Notifying all users about new resources (in-app only)');
      
      // Get all users using Supabase directly
      const { data: users, error: usersError } = await supabaseAdmin
        .from('users')
        .select('id, is_premium');

      if (usersError) {
        console.error('❌ Failed to fetch users for new resource notification:', usersError);
        return;
      }

      if (!users || users.length === 0) {
        console.log('🔔 No users found to notify about new resources');
        return;
      }

      let notifiedCount = 0;
      let skippedCount = 0;

      // Create in-app notification for each user
      for (const user of users) {
        try {
          // For premium content, only notify premium users
          if (isPremium && !user.is_premium) {
            skippedCount++;
            continue;
          }

          // Create in-app notification
          await this.create({
            user_id: user.id,
            title: 'New resources available',
            message: 'New content has been added to the library. Check it out!',
            type: 'INFO'
          });

          notifiedCount++;
        } catch (error) {
          console.error(`❌ Error creating notification for user ${user.id}:`, error);
        }
      }

      console.log(`🔔 New resources notification summary: ${notifiedCount} in-app notifications created, ${skippedCount} users skipped`);
    } catch (error) {
      console.error('❌ Failed to notify users about new resources:', error);
    }
  }
}
