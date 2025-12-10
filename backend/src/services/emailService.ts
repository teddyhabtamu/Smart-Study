import { dbAdmin } from '../database/config';

export interface EmailNotificationData {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Email Service - Handles sending email notifications
 * Note: This is a basic implementation. In production, integrate with services like SendGrid, AWS SES, etc.
 */
export class EmailService {

  /**
   * Send an email notification
   * This is a placeholder implementation - integrate with real email service
   */
  static async sendEmail(emailData: EmailNotificationData): Promise<boolean> {
    try {
      console.log('📧 Sending email notification:', {
        to: emailData.to,
        subject: emailData.subject,
        // Don't log the full HTML content for privacy
        htmlLength: emailData.html.length
      });

      // TODO: Integrate with real email service (SendGrid, AWS SES, etc.)
      // For now, just log the email that would be sent
      console.log('Email content preview:', emailData.html.substring(0, 200) + '...');

      // Simulate email sending delay
      await new Promise(resolve => setTimeout(resolve, 100));

      return true;
    } catch (error) {
      console.error('Failed to send email:', error);
      return false;
    }
  }

  /**
   * Send welcome email to new users
   */
  static async sendWelcomeEmail(email: string, name: string): Promise<boolean> {
    const subject = 'Welcome to SmartStudy! 🎓';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #1f2937 0%, #374151 100%); color: white; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="margin: 0; font-size: 28px; font-weight: bold;">Welcome to SmartStudy!</h1>
          <p style="margin: 10px 0 0 0; opacity: 0.9;">Your AI-powered learning journey starts here</p>
        </div>

        <div style="background: white; padding: 40px 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
          <h2 style="color: #1f2937; margin-top: 0;">Hi ${name}! 👋</h2>

          <p style="color: #6b7280; line-height: 1.6; margin-bottom: 20px;">
            Thank you for joining SmartStudy! We're excited to help you achieve your academic goals with our AI-powered learning platform.
          </p>

          <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin: 30px 0; border-left: 4px solid #3b82f6;">
            <h3 style="color: #1f2937; margin-top: 0;">What you can do now:</h3>
            <ul style="color: #6b7280; margin: 10px 0; padding-left: 20px;">
              <li>Explore our document and video library</li>
              <li>Chat with our AI tutor for instant help</li>
              <li>Plan your study schedule and get reminders</li>
              <li>Join the community forum</li>
              <li>Earn XP and unlock achievements</li>
            </ul>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard"
               style="background: #1f2937; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
              Start Learning Now
            </a>
          </div>

          <p style="color: #9ca3af; font-size: 14px; text-align: center; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
            Need help? Contact us at support@smartstudy.com<br>
            Happy learning! 📚✨
          </p>
        </div>
      </div>
    `;

    return await this.sendEmail({ to: email, subject, html });
  }

  /**
   * Send premium upgrade confirmation email
   */
  static async sendPremiumUpgradeEmail(email: string, name: string): Promise<boolean> {
    const subject = 'Welcome to Student Pro! 🌟';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%); color: white; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="margin: 0; font-size: 28px; font-weight: bold;">Welcome to Student Pro!</h1>
          <p style="margin: 10px 0 0 0; opacity: 0.9;">You've unlocked premium features! 🎉</p>
        </div>

        <div style="background: white; padding: 40px 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
          <h2 style="color: #1f2937; margin-top: 0;">Congratulations ${name}! 🏆</h2>

          <p style="color: #6b7280; line-height: 1.6; margin-bottom: 20px;">
            You now have access to all premium features on SmartStudy. Here's what you can enjoy:
          </p>

          <div style="background: #fef3c7; padding: 20px; border-radius: 8px; margin: 30px 0; border-left: 4px solid #f59e0b;">
            <h3 style="color: #92400e; margin-top: 0;">Premium Features Unlocked:</h3>
            <ul style="color: #92400e; margin: 10px 0; padding-left: 20px;">
              <li>Unlimited AI tutor conversations</li>
              <li>Access to exclusive premium content</li>
              <li>Advanced practice quizzes</li>
              <li>Priority support</li>
              <li>Download documents without limits</li>
            </ul>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/dashboard"
               style="background: #f59e0b; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
              Explore Premium Content
            </a>
          </div>

          <p style="color: #9ca3af; font-size: 14px; text-align: center; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
            Thank you for choosing SmartStudy Pro!<br>
            Questions? Reach out to our premium support team.
          </p>
        </div>
      </div>
    `;

    return await this.sendEmail({ to: email, subject, html });
  }

  /**
   * Send study reminder email
   */
  static async sendStudyReminderEmail(email: string, name: string, eventTitle: string, eventDate: string, hoursUntil: number): Promise<boolean> {
    const timeMessage = hoursUntil === 1 ? '1 hour' : hoursUntil === 24 ? '1 day' : `${hoursUntil} hours`;
    const subject = `Study Reminder: ${eventTitle} in ${timeMessage}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: white; padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
          <h1 style="margin: 0; font-size: 24px; font-weight: bold;">📚 Study Reminder</h1>
          <p style="margin: 10px 0 0 0; opacity: 0.9;">Don't forget your upcoming study session!</p>
        </div>

        <div style="background: white; padding: 40px 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
          <h2 style="color: #1f2937; margin-top: 0;">Hi ${name}!</h2>

          <div style="background: #eff6ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
            <h3 style="color: #1e40af; margin-top: 0;">Upcoming Study Session</h3>
            <p style="color: #1e40af; margin: 10px 0; font-size: 18px; font-weight: bold;">
              ${eventTitle}
            </p>
            <p style="color: #1e40af; margin: 5px 0;">
              📅 Date: ${new Date(eventDate).toLocaleDateString('en-US', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </p>
            <p style="color: #1e40af; margin: 5px 0;">
              ⏰ Time until event: ${timeMessage}
            </p>
          </div>

          <p style="color: #6b7280; line-height: 1.6;">
            Make sure you're prepared for your study session. Review your notes, complete any assignments, and get ready to succeed!
          </p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/planner"
               style="background: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
              View Study Planner
            </a>
          </div>

          <p style="color: #9ca3af; font-size: 14px; text-align: center; margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
            You can disable study reminders in your profile settings anytime.
          </p>
        </div>
      </div>
    `;

    return await this.sendEmail({ to: email, subject, html });
  }

  /**
   * Check if user has email notifications enabled
   */
  static async shouldSendEmailToUser(userId: string): Promise<boolean> {
    try {
      const users = await dbAdmin.get('users');
      const user = users.find((u: any) => u.id === userId);

      if (!user || !user.preferences) {
        return false; // Default to not sending if no preferences set
      }

      return user.preferences.emailNotifications !== false; // Default to true if not explicitly disabled
    } catch (error) {
      console.error('Error checking user email preferences:', error);
      return false;
    }
  }

  /**
   * Send notification email to user (if they have email notifications enabled)
   */
  static async sendNotificationEmailIfEnabled(userId: string, emailData: Omit<EmailNotificationData, 'to'>): Promise<boolean> {
    try {
      const shouldSend = await this.shouldSendEmailToUser(userId);

      if (!shouldSend) {
        console.log(`Skipping email notification for user ${userId} - email notifications disabled`);
        return false;
      }

      // Get user email
      const users = await dbAdmin.get('users');
      const user = users.find((u: any) => u.id === userId);

      if (!user || !user.email) {
        console.error(`Cannot send email notification - user ${userId} not found or has no email`);
        return false;
      }

      return await this.sendEmail({
        ...emailData,
        to: user.email
      });
    } catch (error) {
      console.error('Error sending notification email:', error);
      return false;
    }
  }
}
