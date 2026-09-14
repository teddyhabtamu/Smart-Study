import * as brevo from '@getbrevo/brevo';
import https from 'https';
import axios, { AxiosInstance } from 'axios';
import { config } from '../config';
import { query, supabaseAdmin, dbAdmin } from '../database/config';
import { BADGE_DEFINITIONS } from '../constants';
import { NotificationService } from './notificationService';

export interface EmailNotificationData {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  templateId?: number;
  params?: Record<string, any>;
}

/**
 * Email Service - Handles sending email notifications via Brevo
 */
export class EmailService {
  private static apiInstance: brevo.TransactionalEmailsApi | null = null;

  /**
   * Initialize Brevo API instance
   */
  private static getApiInstance(): brevo.TransactionalEmailsApi {
    if (!this.apiInstance) {
      if (!config.email.brevo.apiKey) {
        throw new Error('BREVO_API_KEY is not configured');
      }
      
      // Validate API key format
      const apiKey = config.email.brevo.apiKey;
      if (apiKey.startsWith('xsmtpsib-')) {
        console.error('❌ ERROR: You are using an SMTP API key, but the Brevo SDK requires a REST API key.');
        console.error('❌ SMTP keys start with "xsmtpsib-", but REST API keys start with "xkeysib-"');
        console.error('❌ Please get your REST API key from: https://app.brevo.com/settings/keys/api');
        throw new Error('Invalid API key type: SMTP key provided, REST API key required');
      }
      
      if (!apiKey.startsWith('xkeysib-')) {
        console.warn('⚠️ WARNING: API key format may be incorrect. REST API keys should start with "xkeysib-"');
      }
      
      this.apiInstance = new brevo.TransactionalEmailsApi();
      this.apiInstance.setApiKey(brevo.TransactionalEmailsApiApiKeys.apiKey, apiKey);
    }
    return this.apiInstance;
  }

  /**
   * Send an email using Brevo template
   */
  static async sendTemplateEmail(
    to: string,
    templateId: number,
    params: Record<string, any> = {}
  ): Promise<boolean> {
    try {
      console.log('📧 sendTemplateEmail called:', { to, templateId, params });
      
      if (!config.email.brevo.apiKey) {
        console.warn('⚠️ BREVO_API_KEY not configured. Email sending disabled.');
        console.warn('⚠️ Check your .env file for BREVO_API_KEY');
        return false;
      }

      console.log('✅ BREVO_API_KEY is configured');
      const apiInstance = this.getApiInstance();
      
      const sendSmtpEmail = new brevo.SendSmtpEmail();
      sendSmtpEmail.to = [{ email: to }];
      sendSmtpEmail.templateId = templateId;
      sendSmtpEmail.params = params;
      sendSmtpEmail.sender = {
        email: config.email.sender.email,
        name: config.email.sender.name
      };

      console.log('📧 Sending email via Brevo API:', {
        to,
        templateId,
        sender: sendSmtpEmail.sender,
        paramsCount: Object.keys(params).length
      });

      // Use direct axios call for better serverless control (timeout + keep-alive disabled)
      // Brevo SDK doesn't expose HTTP client configuration needed for serverless
      const TIMEOUT_MS = 25000; // 25 seconds - Brevo recommends ≥20s for serverless
      const startTime = Date.now();
      
      // Create HTTPS agent with keep-alive disabled (critical for serverless)
      // Keep-alive sockets cause "socket hang up" errors on Vercel
      const httpsAgent = new https.Agent({
        keepAlive: false,
        rejectUnauthorized: true
      });

      console.log(`⏱️ Starting Brevo API call with ${TIMEOUT_MS}ms timeout (keep-alive disabled for serverless)...`);
      
      // Use direct axios call instead of SDK for better control
      const payload = {
        to: sendSmtpEmail.to,
        templateId: sendSmtpEmail.templateId,
        params: sendSmtpEmail.params,
        sender: sendSmtpEmail.sender
      };

      const axiosResponse = await axios.post(
        'https://api.brevo.com/v3/smtp/email',
        payload,
        {
          headers: {
            'api-key': config.email.brevo.apiKey!,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          timeout: TIMEOUT_MS,
          httpsAgent: httpsAgent
        }
      );

      const elapsed = Date.now() - startTime;
      console.log(`✅ Brevo API call completed in ${elapsed}ms`);
      
      // Transform axios response to match SDK response format
      const response = {
        body: axiosResponse.data,
        messageId: axiosResponse.data?.messageId
      } as any;
      
      // Extract messageId from response (it's in response.body.messageId)
      const messageId = (response as any).body?.messageId || (response as any).messageId || 'N/A';
      
      // Log response details for debugging (but not the full response object which is huge)
      if (messageId !== 'N/A') {
        console.log('📧 Brevo API Response - Message ID:', messageId);
      } else {
        console.log('📧 Brevo API Response:', {
          hasBody: !!(response as any).body,
          bodyKeys: (response as any).body ? Object.keys((response as any).body) : [],
          responseKeys: Object.keys(response || {})
        });
      }
      
      console.log('✅ Email sent successfully:', {
        messageId: messageId,
        to,
        templateId
      });
      
      return true;
    } catch (error: any) {
      const statusCode = error.statusCode || error.status || error.response?.status;
      const errorBody = error.response?.body || error.body;
      
      // Check if it's a timeout error
      const isTimeout = error.message && error.message.includes('timed out');
      
      console.error('❌ Failed to send email:', {
        to,
        templateId,
        error: error.message || error,
        statusCode,
        isTimeout,
        errorType: isTimeout ? 'TIMEOUT' : 'API_ERROR'
      });
      
      if (isTimeout) {
        console.error('⏱️ Brevo API call timed out - this may indicate network issues or Brevo API problems');
        console.error('⏱️ The email may still be queued by Brevo, but we cannot confirm delivery');
      }
      
      // Provide helpful error messages based on status code
      if (statusCode === 401) {
        console.error('❌ 401 Unauthorized - This usually means:');
        console.error('   1. Your API key is incorrect or invalid');
        console.error('   2. You are using an SMTP key instead of a REST API key');
        console.error('   3. Get your REST API key from: https://app.brevo.com/settings/keys/api');
        console.error('   4. REST API keys start with "xkeysib-", not "xsmtpsib-"');
      } else if (statusCode === 400) {
        console.error('❌ 400 Bad Request - Check your template ID and parameters');
      } else if (statusCode === 404) {
        console.error('❌ 404 Not Found - Template ID might not exist or you don\'t have access to it');
      }
      
      // Log full error for debugging
      if (errorBody) {
        console.error('❌ Brevo API Error Response:', JSON.stringify(errorBody, null, 2));
      } else if (error.response?.data) {
        console.error('❌ Brevo API Error Response (data):', JSON.stringify(error.response.data, null, 2));
      } else if (error.response?.body) {
        console.error('❌ Brevo API Error Response (body):', JSON.stringify(error.response.body, null, 2));
      } else if (error.response) {
        console.error('❌ Brevo API Error Response (full):', JSON.stringify(error.response, null, 2));
      } else if (error.message) {
        console.error('❌ Error message:', error.message);
      }
      
      // Log the request that was sent for debugging
      console.error('❌ Request details:', {
        to,
        templateId,
        params: JSON.stringify(params, null, 2),
        sender: {
          email: config.email.sender.email,
          name: config.email.sender.name
        }
      });
      
      return false;
    }
  }

  /**
   * Send an email with custom HTML content
   */
  static async sendEmail(emailData: EmailNotificationData): Promise<boolean> {
    try {
      if (!config.email.brevo.apiKey) {
        console.warn('⚠️ BREVO_API_KEY not configured. Email sending disabled.');
        return false;
      }

      const apiInstance = this.getApiInstance();
      
      const sendSmtpEmail = new brevo.SendSmtpEmail();
      sendSmtpEmail.to = [{ email: emailData.to }];
      sendSmtpEmail.subject = emailData.subject;
      
      if (emailData.html) {
        sendSmtpEmail.htmlContent = emailData.html;
      }
      if (emailData.text) {
        sendSmtpEmail.textContent = emailData.text;
      }
      
      sendSmtpEmail.sender = {
        email: config.email.sender.email,
        name: config.email.sender.name
      };

      const response = await apiInstance.sendTransacEmail(sendSmtpEmail);
      console.log('✅ Email sent successfully:', {
        messageId: (response as any).messageId || 'N/A',
        to: emailData.to,
        subject: emailData.subject,
        response: response
      });
      return true;
    } catch (error: any) {
      console.error('❌ Failed to send email:', {
        to: emailData.to,
        subject: emailData.subject,
        error: error.message || error
      });
      return false;
    }
  }

  /**
   * Send welcome email to new users using Brevo template
   */
  static async sendWelcomeEmail(email: string, name: string): Promise<boolean> {
    try {
      console.log('📧 Attempting to send welcome email:', { email, name });
      
      const params = {
        userName: name,
        userEmail: email,
        platformName: 'SmartStudy',
        frontendUrl: config.email.frontendUrl,
        supportEmail: config.email.supportEmail,
        currentYear: new Date().getFullYear().toString()
      };

      console.log('📧 Email params:', params);
      console.log('📧 Using template ID: 2');

      // Template ID 2 for welcome email
      const result = await this.sendTemplateEmail(email, 2, params);
      
      if (result) {
        console.log('✅ Welcome email sent successfully to:', email);
      } else {
        console.warn('⚠️ Welcome email sending returned false for:', email);
      }
      
      return result;
    } catch (error: any) {
      console.error('❌ Failed to send welcome email:', {
        email,
        name,
        error: error.message || error,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Send email verification email to new users using Brevo template
   * @param email - User's email address
   * @param name - User's name
   * @param verificationUrl - Full URL with verification token
   * @param templateId - Brevo template ID for email verification
   */
  static async sendVerificationEmail(
    email: string,
    name: string,
    verificationUrl: string,
    templateId: number
  ): Promise<boolean> {
    try {
      console.log('📧 Attempting to send verification email:', { email, name });
      
      const params = {
        userName: name,
        userEmail: email,
        verificationUrl: verificationUrl,
        platformName: 'SmartStudy',
        frontendUrl: config.email.frontendUrl,
        supportEmail: config.email.supportEmail,
        currentYear: new Date().getFullYear().toString()
      };

      console.log('📧 Verification email params:', params);
      console.log('📧 Using template ID:', templateId);

      const result = await this.sendTemplateEmail(email, templateId, params);
      
      if (result) {
        console.log('✅ Verification email sent successfully to:', email);
      } else {
        console.warn('⚠️ Verification email sending returned false for:', email);
      }
      
      return result;
    } catch (error: any) {
      console.error('❌ Failed to send verification email:', {
        email,
        name,
        error: error.message || error,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Send login success notification email
   */
  static async sendLoginSuccessEmail(
    email: string,
    name: string,
    loginTime: string,
    deviceInfo?: string,
    location?: string
  ): Promise<boolean> {
    try {
      console.log('📧 Attempting to send login success email:', { email, name });
      
      const params = {
        userName: name,
        userEmail: email,
        loginTime: loginTime,
        deviceInfo: deviceInfo || 'Unknown device',
        location: location || 'Unknown location',
        frontendUrl: config.email.frontendUrl,
        supportEmail: config.email.supportEmail,
        currentYear: new Date().getFullYear().toString()
      };

      console.log('📧 Login email params:', params);
      console.log('📧 Using template ID: 3');

      // Template ID 3 for login success
      const result = await this.sendTemplateEmail(email, 3, params);
      
      if (result) {
        console.log('✅ Login success email sent successfully to:', email);
      } else {
        console.warn('⚠️ Login success email sending returned false for:', email);
      }
      
      return result;
    } catch (error: any) {
      console.error('❌ Failed to send login success email:', {
        email,
        name,
        error: error.message || error,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Send password reset request email
   */
  static async sendPasswordResetEmail(
    email: string,
    name: string,
    resetLink: string
  ): Promise<boolean> {
    try {
      console.log('📧 Attempting to send password reset email:', { email, name });
      
      const params = {
        userName: name,
        userEmail: email,
        resetLink: resetLink,
        frontendUrl: config.email.frontendUrl,
        supportEmail: config.email.supportEmail,
        currentYear: new Date().getFullYear().toString()
      };

      console.log('📧 Password reset email params:', params);
      console.log('📧 Using template ID: 4');

      // Template ID 4 for password reset request
      const result = await this.sendTemplateEmail(email, 4, params);
      
      if (result) {
        console.log('✅ Password reset email sent successfully to:', email);
      } else {
        console.warn('⚠️ Password reset email sending returned false for:', email);
      }
      
      return result;
    } catch (error: any) {
      console.error('❌ Failed to send password reset email:', {
        email,
        name,
        error: error.message || error,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Send password reset success confirmation email
   */
  static async sendPasswordResetSuccessEmail(
    email: string,
    name: string,
    changeTime: string,
    deviceInfo?: string
  ): Promise<boolean> {
    try {
      console.log('📧 Attempting to send password reset success email:', { email, name });
      
      const params = {
        userName: name,
        userEmail: email,
        changeTime: changeTime,
        deviceInfo: deviceInfo || 'Unknown device',
        frontendUrl: config.email.frontendUrl,
        supportEmail: config.email.supportEmail,
        currentYear: new Date().getFullYear().toString()
      };

      console.log('📧 Password reset success email params:', params);
      console.log('📧 Using template ID: 5');

      // Template ID 5 for password reset success
      const result = await this.sendTemplateEmail(email, 5, params);
      
      if (result) {
        console.log('✅ Password reset success email sent successfully to:', email);
      } else {
        console.warn('⚠️ Password reset success email sending returned false for:', email);
      }
      
      return result;
    } catch (error: any) {
      console.error('❌ Failed to send password reset success email:', {
        email,
        name,
        error: error.message || error,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Send account suspended notification email
   */
  static async sendAccountSuspendedEmail(
    email: string,
    name: string,
    suspensionReason: string
  ): Promise<boolean> {
    try {
      console.log('📧 Attempting to send account suspended email:', { email, name });
      
      const params = {
        userName: name,
        userEmail: email,
        suspensionReason: suspensionReason,
        frontendUrl: config.email.frontendUrl,
        supportEmail: config.email.supportEmail,
        currentYear: new Date().getFullYear().toString()
      };

      console.log('📧 Account suspended email params:', params);
      console.log('📧 Using template ID: 6');

      // Template ID 6 for account suspended
      const result = await this.sendTemplateEmail(email, 6, params);
      
      if (result) {
        console.log('✅ Account suspended email sent successfully to:', email);
      } else {
        console.warn('⚠️ Account suspended email sending returned false for:', email);
      }
      
      return result;
    } catch (error: any) {
      console.error('❌ Failed to send account suspended email:', {
        email,
        name,
        error: error.message || error,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Send account reactivated notification email
   */
  static async sendAccountReactivatedEmail(
    email: string,
    name: string
  ): Promise<boolean> {
    try {
      console.log('📧 Attempting to send account reactivated email:', { email, name });
      
      const params = {
        userName: name,
        userEmail: email,
        frontendUrl: config.email.frontendUrl,
        supportEmail: config.email.supportEmail,
        currentYear: new Date().getFullYear().toString()
      };

      console.log('📧 Account reactivated email params:', params);
      console.log('📧 Using template ID: 10');

      // Template ID 10 for account reactivated
      const result = await this.sendTemplateEmail(email, 10, params);
      
      if (result) {
        console.log('✅ Account reactivated email sent successfully to:', email);
      } else {
        console.warn('⚠️ Account reactivated email sending returned false for:', email);
      }
      
      return result;
    } catch (error: any) {
      console.error('❌ Failed to send account reactivated email:', {
        email,
        name,
        error: error.message || error,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Send premium upgrade confirmation email
   */
  static async sendPremiumUpgradeEmail(
    email: string,
    name: string
  ): Promise<boolean> {
    try {
      console.log('📧 Attempting to send premium upgrade email:', { email, name });
      
      const params = {
        userName: name,
        userEmail: email,
        platformName: 'SmartStudy',
        frontendUrl: config.email.frontendUrl,
        supportEmail: config.email.supportEmail,
        currentYear: new Date().getFullYear().toString()
      };

      console.log('📧 Premium upgrade email params:', params);
      console.log('📧 Using template ID: 11');

      // Template ID 11 for premium upgrade
      const result = await this.sendTemplateEmail(email, 11, params);
      
      if (result) {
        console.log('✅ Premium upgrade email sent successfully to:', email);
      } else {
        console.warn('⚠️ Premium upgrade email sending returned false for:', email);
      }
      
      return result;
    } catch (error: any) {
      console.error('❌ Failed to send premium upgrade email:', {
        email,
        name,
        error: error.message || error,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Send premium downgrade/cancellation email
   */
  static async sendPremiumDowngradeEmail(
    email: string,
    name: string,
    expiryDate?: string
  ): Promise<boolean> {
    // If no expiry date provided, set it to current date (immediate cancellation)
    const expiryDateFormatted = expiryDate || new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    const params = {
      userName: name,
      userEmail: email,
      expiryDate: expiryDateFormatted,
      frontendUrl: config.email.frontendUrl,
      supportEmail: config.email.supportEmail,
      currentYear: new Date().getFullYear().toString()
    };

    try {
      console.log('📧 Attempting to send premium downgrade email:', { email, name });
      console.log('📧 Premium downgrade email params:', params);
      console.log('📧 Using template ID: 12');

      // Template ID 12 for premium downgrade
      const result = await this.sendTemplateEmail(email, 12, params);
      
      if (result) {
        console.log('✅ Premium downgrade email sent successfully to:', email);
      } else {
        console.warn('⚠️ Premium downgrade email sending returned false for:', email);
      }
      
      return result;
    } catch (error: any) {
      console.error('❌ Failed to send premium downgrade email:', {
        email,
        name,
        expiryDate: expiryDateFormatted,
        params: JSON.stringify(params, null, 2),
        error: error.message || error,
        response: error.response?.data || error.response || 'No response data',
        statusCode: error.response?.status || error.status || 'Unknown',
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Send new document uploaded notification email to a user
   */
  static async sendNewDocumentUploadedEmail(
    email: string,
    name: string,
    documentId: string,
    documentTitle: string,
    subject: string,
    grade: number,
    documentDescription?: string,
    isPremium?: boolean
  ): Promise<boolean> {
    try {
      console.log('📧 Attempting to send new document uploaded email:', { email, name, documentTitle });
      
      const params = {
        userName: name,
        userEmail: email,
        documentId: documentId,
        documentTitle: documentTitle,
        subject: subject,
        grade: grade.toString(),
        documentDescription: documentDescription || '',
        isPremium: isPremium || false,
        frontendUrl: config.email.frontendUrl,
        supportEmail: config.email.supportEmail,
        currentYear: new Date().getFullYear().toString()
      };

      console.log('📧 New document uploaded email params:', params);
      console.log('📧 Using template ID: 13');

      // Template ID 13 for new document uploaded
      const result = await this.sendTemplateEmail(email, 13, params);
      
      if (result) {
        console.log('✅ New document uploaded email sent successfully to:', email);
      } else {
        console.warn('⚠️ New document uploaded email sending returned false for:', email);
      }
      
      return result;
    } catch (error: any) {
      console.error('❌ Failed to send new document uploaded email:', {
        email,
        name,
        error: error.message || error,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Notify all users with email notifications enabled about a new document
   * In production, you might want to filter by user preferences (subject/grade interests)
   */
  static async notifyUsersAboutNewDocument(
    documentId: string,
    documentTitle: string,
    subject: string,
    grade: number,
    documentDescription?: string,
    isPremium?: boolean
  ): Promise<void> {
    try {
      console.log('📧 Notifying users about new document:', { documentId, documentTitle, subject, grade });
      
      // Get all users with email notifications enabled
      const usersResult = await query(
        `SELECT id, name, email, preferences, is_premium
         FROM users
         WHERE email IS NOT NULL AND email != ''
           AND status NOT IN ('Banned', 'Suspended', 'Inactive')`
      );

      if (usersResult.rows.length === 0) {
        console.log('📧 No users found to notify about new document');
        return;
      }

      let notifiedCount = 0;
      let skippedCount = 0;

      // Send email to each user (if they have email notifications enabled)
      for (const user of usersResult.rows) {
        try {
          // Check if user has email notifications enabled
          const shouldSend = await this.shouldSendEmailToUser(user.id);
          
          if (!shouldSend) {
            skippedCount++;
            continue;
          }

          // For premium content, only notify premium users
          if (isPremium && !user.is_premium) {
            skippedCount++;
            continue;
          }

          // Send email asynchronously (non-blocking)
          this.sendNewDocumentUploadedEmail(
            user.email,
            user.name,
            documentId,
            documentTitle,
            subject,
            grade,
            documentDescription,
            isPremium
          ).catch(error => {
            console.error(`❌ Failed to send new document email to ${user.email}:`, error);
          });

          notifiedCount++;
        } catch (error) {
          console.error(`❌ Error processing user ${user.id} for new document notification:`, error);
        }
      }

      console.log(`📧 New document notification summary: ${notifiedCount} emails sent, ${skippedCount} users skipped`);
    } catch (error) {
      console.error('❌ Failed to notify users about new document:', error);
    }
  }

  /**
   * Send new video uploaded notification email to a user
   */
  static async sendNewVideoUploadedEmail(
    email: string,
    name: string,
    videoId: string,
    videoTitle: string,
    subject: string,
    grade: number,
    instructor?: string,
    videoDescription?: string,
    isPremium?: boolean
  ): Promise<boolean> {
    try {
      console.log('📧 Attempting to send new video uploaded email:', { email, name, videoTitle });
      
      const params = {
        userName: name,
        userEmail: email,
        videoId: videoId,
        videoTitle: videoTitle,
        subject: subject,
        grade: grade.toString(),
        instructor: instructor || 'SmartStudy Team',
        videoDescription: videoDescription || '',
        isPremium: isPremium || false,
        frontendUrl: config.email.frontendUrl,
        supportEmail: config.email.supportEmail,
        currentYear: new Date().getFullYear().toString()
      };

      console.log('📧 New video uploaded email params:', params);
      console.log('📧 Using template ID: 14');

      // Template ID 14 for new video uploaded
      const result = await this.sendTemplateEmail(email, 14, params);
      
      if (result) {
        console.log('✅ New video uploaded email sent successfully to:', email);
      } else {
        console.warn('⚠️ New video uploaded email sending returned false for:', email);
      }
      
      return result;
    } catch (error: any) {
      console.error('❌ Failed to send new video uploaded email:', {
        email,
        name,
        error: error.message || error,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Notify all users with email notifications enabled about a new video
   * In production, you might want to filter by user preferences (subject/grade interests)
   */
  static async notifyUsersAboutNewVideo(
    videoId: string,
    videoTitle: string,
    subject: string,
    grade: number,
    instructor?: string,
    videoDescription?: string,
    isPremium?: boolean
  ): Promise<void> {
    try {
      console.log('📧 Notifying users about new video:', { videoId, videoTitle, subject, grade });
      
      // Get all users with email notifications enabled
      const usersResult = await query(
        `SELECT id, name, email, preferences, is_premium
         FROM users
         WHERE email IS NOT NULL AND email != ''
           AND status NOT IN ('Banned', 'Suspended', 'Inactive')`
      );

      if (usersResult.rows.length === 0) {
        console.log('📧 No users found to notify about new video');
        return;
      }

      let notifiedCount = 0;
      let skippedCount = 0;

      // Send email to each user (if they have email notifications enabled)
      for (const user of usersResult.rows) {
        try {
          // Check if user has email notifications enabled
          const shouldSend = await this.shouldSendEmailToUser(user.id);
          
          if (!shouldSend) {
            skippedCount++;
            continue;
          }

          // For premium content, only notify premium users
          if (isPremium && !user.is_premium) {
            skippedCount++;
            continue;
          }

          // Send email asynchronously (non-blocking)
          this.sendNewVideoUploadedEmail(
            user.email,
            user.name,
            videoId,
            videoTitle,
            subject,
            grade,
            instructor,
            videoDescription,
            isPremium
          ).catch(error => {
            console.error(`❌ Failed to send new video email to ${user.email}:`, error);
          });

          notifiedCount++;
        } catch (error) {
          console.error(`❌ Error processing user ${user.id} for new video notification:`, error);
        }
      }

      console.log(`📧 New video notification summary: ${notifiedCount} emails sent, ${skippedCount} users skipped`);
    } catch (error) {
      console.error('❌ Failed to notify users about new video:', error);
    }
  }

  /**
   * Send new job position posted notification email to a user
   */
  static async sendNewJobPositionEmail(
    email: string,
    name: string,
    positionId: string,
    positionTitle: string,
    department: string,
    employmentType: string,
    positionDescription: string,
    location?: string
  ): Promise<boolean> {
    try {
      console.log('📧 Attempting to send new job position email:', { email, name, positionTitle });
      
      const params: Record<string, any> = {
        userName: name,
        userEmail: email,
        positionTitle: positionTitle,
        department: department,
        employmentType: employmentType,
        positionDescription: positionDescription,
        frontendUrl: config.email.frontendUrl,
        supportEmail: config.email.supportEmail,
        currentYear: new Date().getFullYear().toString()
      };

      // Only include location if it's provided
      if (location) {
        params.location = location;
      }

      console.log('📧 New job position email params:', params);
      console.log('📧 Using template ID: 15');

      // Template ID 15 for new job position
      const result = await this.sendTemplateEmail(email, 15, params);
      
      if (result) {
        console.log('✅ New job position email sent successfully to:', email);
      } else {
        console.warn('⚠️ New job position email sending returned false for:', email);
      }
      
      return result;
    } catch (error: any) {
      console.error('❌ Failed to send new job position email:', {
        email,
        name,
        error: error.message || error,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Notify all users with email notifications enabled about a new job position
   */
  static async notifyUsersAboutNewJobPosition(
    positionId: string,
    positionTitle: string,
    department: string,
    employmentType: string,
    positionDescription: string,
    location?: string
  ): Promise<void> {
    try {
      console.log('📧 Notifying users about new job position:', { positionId, positionTitle, department });
      
      // Get all users with email notifications enabled
      const usersResult = await query(
        `SELECT id, name, email, preferences, is_premium
         FROM users
         WHERE email IS NOT NULL AND email != ''
           AND status NOT IN ('Banned', 'Suspended', 'Inactive')`
      );

      if (usersResult.rows.length === 0) {
        console.log('📧 No users found to notify about new job position');
        return;
      }

      let notifiedCount = 0;
      let skippedCount = 0;

      // Send email to each user (if they have email notifications enabled)
      for (const user of usersResult.rows) {
        try {
          // Check if user has email notifications enabled
          const shouldSend = await this.shouldSendEmailToUser(user.id);
          
          if (!shouldSend) {
            skippedCount++;
            continue;
          }

          // Send email asynchronously (non-blocking)
          this.sendNewJobPositionEmail(
            user.email,
            user.name,
            positionId,
            positionTitle,
            department,
            employmentType,
            positionDescription,
            location
          ).catch(error => {
            console.error(`❌ Failed to send new job position email to ${user.email}:`, error);
          });

          notifiedCount++;
        } catch (error) {
          console.error(`❌ Error processing user ${user.id} for new job position notification:`, error);
        }
      }

      console.log(`📧 New job position notification summary: ${notifiedCount} emails sent, ${skippedCount} users skipped`);
    } catch (error) {
      console.error('❌ Failed to notify users about new job position:', error);
    }
  }

  /**
   * Send job application received notification email to an admin
   */
  static async sendJobApplicationReceivedEmail(
    adminEmail: string,
    adminName: string,
    positionTitle: string,
    applicantName: string,
    applicantEmail: string,
    applicantPhone?: string
  ): Promise<boolean> {
    try {
      console.log('📧 Attempting to send job application received email to admin:', { adminEmail, adminName, positionTitle });
      
      const params: Record<string, any> = {
        adminName: adminName,
        positionTitle: positionTitle,
        applicantName: applicantName,
        applicantEmail: applicantEmail,
        frontendUrl: config.email.frontendUrl,
        supportEmail: config.email.supportEmail,
        currentYear: new Date().getFullYear().toString()
      };

      // Only include phone if it's provided
      if (applicantPhone) {
        params.applicantPhone = applicantPhone;
      }

      console.log('📧 Job application received email params:', params);
      console.log('📧 Using template ID: 16');

      // Template ID 16 for job application received (admin)
      const result = await this.sendTemplateEmail(adminEmail, 16, params);
      
      if (result) {
        console.log('✅ Job application received email sent successfully to admin:', adminEmail);
      } else {
        console.warn('⚠️ Job application received email sending returned false for admin:', adminEmail);
      }
      
      return result;
    } catch (error: any) {
      console.error('❌ Failed to send job application received email to admin:', {
        adminEmail,
        adminName,
        error: error.message || error,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Notify all admins about a new job application
   */
  static async notifyAdminsAboutJobApplication(
    positionTitle: string,
    applicantName: string,
    applicantEmail: string,
    applicantPhone?: string
  ): Promise<void> {
    try {
      console.log('📧 Notifying admins about new job application:', { positionTitle, applicantName });
      
      // Get all admin users using Supabase directly to ensure proper filtering
      if (!supabaseAdmin) {
        console.error('❌ Supabase admin client not available');
        return;
      }

      const { data: admins, error } = await supabaseAdmin
        .from('users')
        .select('id, name, email, preferences')
        .eq('role', 'ADMIN')
        .not('email', 'is', null)
        .neq('email', '');

      if (error) {
        console.error('❌ Failed to fetch admin users:', error);
        return;
      }

      if (!admins || admins.length === 0) {
        console.log('📧 No admin users found to notify about job application');
        return;
      }

      console.log(`📧 Found ${admins.length} admin users to notify`);

      let notifiedCount = 0;
      let skippedCount = 0;

      // Send email to each admin (even if they have email notifications disabled, admins should receive job application notifications)
      for (const admin of admins) {
        try {
          // Admins should always receive job application notifications (important business notifications)
          // But we can still check if they have email notifications enabled as a preference
          const shouldSend = await this.shouldSendEmailToUser(admin.id);
          
          if (!shouldSend) {
            console.log(`⚠️ Skipping email to admin ${admin.email} - email notifications disabled (but they'll still get in-app notification)`);
            skippedCount++;
            continue;
          }

          // Send email asynchronously (non-blocking)
          this.sendJobApplicationReceivedEmail(
            admin.email,
            admin.name,
            positionTitle,
            applicantName,
            applicantEmail,
            applicantPhone
          ).catch(error => {
            console.error(`❌ Failed to send job application email to admin ${admin.email}:`, error);
          });

          notifiedCount++;
        } catch (error) {
          console.error(`❌ Error processing admin ${admin.id} for job application notification:`, error);
        }
      }

      console.log(`📧 Job application notification summary: ${notifiedCount} emails sent to admins, ${skippedCount} admins skipped`);
    } catch (error) {
      console.error('❌ Failed to notify admins about job application:', error);
    }
  }

  /**
   * Send job application status update email to applicant
   */
  static async sendJobApplicationStatusUpdateEmail(
    applicantEmail: string,
    applicantName: string,
    positionTitle: string,
    applicationStatus: string,
    adminNotes?: string
  ): Promise<boolean> {
    try {
      console.log('📧 Attempting to send job application status update email:', { applicantEmail, applicantName, applicationStatus });
      
      // Determine status colors and icon based on application status
      let statusIcon = '📋';
      let statusBackground = '#fafafa';
      let statusColor = '#18181b';
      let statusTextColor = '#18181b';
      const isAccepted = applicationStatus === 'Accepted';
      const isRejected = applicationStatus === 'Rejected';
      
      if (isAccepted) {
        statusIcon = '✅';
        statusBackground = '#f0fdf4';
        statusColor = '#10b981';
        statusTextColor = '#166534';
      } else if (isRejected) {
        statusIcon = '❌';
        statusBackground = '#fef2f2';
        statusColor = '#ef4444';
        statusTextColor = '#991b1b';
      } else if (applicationStatus === 'Interview') {
        statusIcon = '📅';
        statusBackground = '#eff6ff';
        statusColor = '#3b82f6';
        statusTextColor = '#1e40af';
      } else {
        // Under Review or Pending
        statusIcon = '⏳';
        statusBackground = '#fafafa';
        statusColor = '#3b82f6';
        statusTextColor = '#18181b';
      }
      
      const params: Record<string, any> = {
        applicantName: applicantName,
        positionTitle: positionTitle,
        applicationStatus: applicationStatus,
        statusIcon: statusIcon,
        statusBackground: statusBackground,
        statusColor: statusColor,
        statusTextColor: statusTextColor,
        isAccepted: isAccepted,
        isRejected: isRejected,
        frontendUrl: config.email.frontendUrl,
        supportEmail: config.email.supportEmail,
        currentYear: new Date().getFullYear().toString()
      };

      // Only include admin notes if provided
      if (adminNotes) {
        params.adminNotes = adminNotes;
      }

      console.log('📧 Job application status update email params:', params);
      console.log('📧 Using template ID: 17');

      // Template ID 17 for job application status update
      const result = await this.sendTemplateEmail(applicantEmail, 17, params);
      
      if (result) {
        console.log('✅ Job application status update email sent successfully to:', applicantEmail);
      } else {
        console.warn('⚠️ Job application status update email sending returned false for:', applicantEmail);
      }
      
      return result;
    } catch (error: any) {
      console.error('❌ Failed to send job application status update email:', {
        applicantEmail,
        applicantName,
        error: error.message || error,
        stack: error.stack
      });
      return false;
    }
  }


  /**
   * Send study reminder email
   */
  static async sendStudyReminderEmail(
    email: string,
    name: string,
    eventTitle: string,
    eventDate: string,
    hoursUntil: number
  ): Promise<boolean> {
    try {
      const timeMessage = hoursUntil === 1 ? '1 hour' : hoursUntil === 24 ? '1 day' : `${hoursUntil} hours`;
      const subject = `Study Reminder: ${eventTitle} in ${timeMessage}`;

      const params = {
        userName: name,
        eventTitle,
        eventDate: new Date(eventDate).toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }),
        timeUntil: timeMessage,
        frontendUrl: config.email.frontendUrl,
        currentYear: new Date().getFullYear().toString()
      };

      // TODO: Update template ID when study reminder template is created
      // For now, using custom email
      const html = `
        <div style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #fafafa;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; border: 1px solid #e4e4e7;">
            <div style="background: #18181b; padding: 30px; text-align: center;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #ffffff;">📚 Study Reminder</h1>
            </div>
            <div style="padding: 40px 30px;">
              <h2 style="color: #18181b; margin-top: 0;">Hi ${name}!</h2>
              <p style="color: #71717a; line-height: 1.6;">Don't forget: ${eventTitle} in ${timeMessage}</p>
            </div>
          </div>
        </div>
      `;
      
      return await this.sendEmail({ to: email, subject, html });
    } catch (error) {
      console.error('Failed to send study reminder email:', error);
      return false;
    }
  }

  /**
   * Check if user has email notifications enabled
   */
  static async shouldSendEmailToUser(userId: string): Promise<boolean> {
    try {
      const result = await query(
        'SELECT preferences FROM users WHERE id = $1',
        [userId]
      );

      if (result.rows.length === 0) {
        return false;
      }

      const user = result.rows[0];
      if (!user.preferences) {
        return true; // Default to true if no preferences set
      }

      const preferences = typeof user.preferences === 'string' 
        ? JSON.parse(user.preferences) 
        : user.preferences;

      return preferences.emailNotifications !== false; // Default to true if not explicitly disabled
    } catch (error) {
      console.error('Error checking user email preferences:', error);
      return true; // Default to true on error
    }
  }

  /**
   * Send notification email to user (if they have email notifications enabled)
   */
  static async sendNotificationEmailIfEnabled(
    userId: string,
    templateId: number,
    params: Record<string, any> = {}
  ): Promise<boolean> {
    try {
      const shouldSend = await this.shouldSendEmailToUser(userId);

      if (!shouldSend) {
        console.log(`Skipping email notification for user ${userId} - email notifications disabled`);
        return false;
      }

      // Get user email
      const result = await query(
        'SELECT email FROM users WHERE id = $1',
        [userId]
      );

      if (result.rows.length === 0 || !result.rows[0].email) {
        console.error(`Cannot send email notification - user ${userId} not found or has no email`);
        return false;
      }

      const userEmail = result.rows[0].email;
      return await this.sendTemplateEmail(userEmail, templateId, params);
    } catch (error) {
      console.error('Error sending notification email:', error);
      return false;
    }
  }

  /**
   * Send forum comment reply email to post author
   */
  static async sendForumCommentReplyEmail(
    postAuthorEmail: string,
    postAuthorName: string,
    commenterName: string,
    postId: string,
    postTitle: string,
    commentContent: string
  ): Promise<boolean> {
    try {
      console.log('📧 Attempting to send forum comment reply email:', { 
        postAuthorEmail, 
        postAuthorName, 
        commenterName, 
        postTitle 
      });
      
      // Truncate comment content for preview (first 150 characters)
      const commentPreview = commentContent.length > 150 
        ? commentContent.substring(0, 150) + '...'
        : commentContent;
      
      const params = {
        userName: postAuthorName,
        commenterName: commenterName,
        postId: postId,
        postTitle: postTitle,
        commentPreview: commentPreview,
        frontendUrl: config.email.frontendUrl,
        supportEmail: config.email.supportEmail,
        currentYear: new Date().getFullYear().toString()
      };

      console.log('📧 Forum comment reply email params:', params);
      console.log('📧 Using template ID: 18');

      // Template ID 18 for forum comment reply
      const result = await this.sendTemplateEmail(postAuthorEmail, 18, params);
      
      if (result) {
        console.log('✅ Forum comment reply email sent successfully to:', postAuthorEmail);
      } else {
        console.warn('⚠️ Forum comment reply email sending returned false for:', postAuthorEmail);
      }
      
      return result;
    } catch (error: any) {
      console.error('❌ Failed to send forum comment reply email:', {
        postAuthorEmail,
        postAuthorName,
        error: error.message || error,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Send comment accepted as solution email to comment author
   */
  static async sendCommentAcceptedSolutionEmail(
    commentAuthorEmail: string,
    commentAuthorName: string,
    postId: string,
    postTitle: string
  ): Promise<boolean> {
    try {
      console.log('📧 Attempting to send comment accepted as solution email:', { 
        commentAuthorEmail, 
        commentAuthorName, 
        postTitle 
      });
      
      const params = {
        userName: commentAuthorName,
        postId: postId,
        postTitle: postTitle,
        frontendUrl: config.email.frontendUrl,
        supportEmail: config.email.supportEmail,
        currentYear: new Date().getFullYear().toString()
      };

      console.log('📧 Comment accepted as solution email params:', params);
      console.log('📧 Using template ID: 19');

      // Template ID 19 for comment accepted as solution
      const result = await this.sendTemplateEmail(commentAuthorEmail, 19, params);
      
      if (result) {
        console.log('✅ Comment accepted as solution email sent successfully to:', commentAuthorEmail);
      } else {
        console.warn('⚠️ Comment accepted as solution email sending returned false for:', commentAuthorEmail);
      }
      
      return result;
    } catch (error: any) {
      console.error('❌ Failed to send comment accepted as solution email:', {
        commentAuthorEmail,
        commentAuthorName,
        error: error.message || error,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Send achievement unlocked email to user
   */
  static async sendAchievementUnlockedEmail(
    userEmail: string,
    userName: string,
    badgeName: string,
    badgeDescription: string,
    levelUp: boolean = false,
    newLevel?: number
  ): Promise<boolean> {
    try {
      console.log('📧 Attempting to send achievement unlocked email:', { 
        userEmail, 
        userName, 
        badgeName,
        levelUp 
      });
      
      const params: Record<string, any> = {
        userName: userName,
        badgeName: badgeName,
        badgeDescription: badgeDescription,
        frontendUrl: config.email.frontendUrl,
        supportEmail: config.email.supportEmail,
        currentYear: new Date().getFullYear().toString()
      };

      // Only include level up info if leveling up
      if (levelUp && newLevel) {
        params.levelUp = true;
        params.newLevel = newLevel.toString();
      }

      console.log('📧 Achievement unlocked email params:', params);
      console.log('📧 Using template ID: 21');

      // Template ID 21 for achievement unlocked
      const result = await this.sendTemplateEmail(userEmail, 21, params);
      
      if (result) {
        console.log('✅ Achievement unlocked email sent successfully to:', userEmail);
      } else {
        console.warn('⚠️ Achievement unlocked email sending returned false for:', userEmail);
      }
      
      return result;
    } catch (error: any) {
      console.error('❌ Failed to send achievement unlocked email:', {
        userEmail,
        userName,
        error: error.message || error,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Check and unlock badges based on level and streak, sending emails for newly unlocked badges
   */
  static async checkAndUnlockBadges(
    userId: string,
    userLevel: number,
    userStreak: number,
    currentUnlockedBadges: string[]
  ): Promise<string[]> {
    try {
      const newUnlockedBadges: string[] = [];

      // Badge requirements — canonical definitions (see constants.ts), so
      // level thresholds and names can't drift from the XP award path.
      const badgeRequirements = BADGE_DEFINITIONS;

      // Check which badges should be unlocked
      for (const badge of badgeRequirements) {
        if (!currentUnlockedBadges.includes(badge.id)) {
          const shouldUnlock = 
            (badge.requiredLevel !== undefined && userLevel >= badge.requiredLevel) ||
            (badge.requiredStreak !== undefined && userStreak >= badge.requiredStreak);
          
          if (shouldUnlock) {
            newUnlockedBadges.push(badge.id);
          }
        }
      }

      // If new badges unlocked, update user and send emails
      if (newUnlockedBadges.length > 0) {
        const allUnlockedBadges = [...new Set([...currentUnlockedBadges, ...newUnlockedBadges])];
        
        // Record badge unlocks in badge_unlocks table
        for (const badgeId of newUnlockedBadges) {
          // Check if badge unlock already exists
          const existingUnlock = await dbAdmin.findOne('badge_unlocks', (b: any) => 
            b.user_id === userId && b.badge_id === badgeId
          );
          
          if (!existingUnlock) {
            await dbAdmin.insert('badge_unlocks', {
              user_id: userId,
              badge_id: badgeId,
              unlocked_at: new Date().toISOString()
            });
          }
        }
        
        // Update user badges
        await dbAdmin.update('users', userId, {
          unlocked_badges: allUnlockedBadges
        });

        // In-app notification per unlocked badge (previously email-only —
        // see xpService awardXP for the same rule on the XP path).
        for (const badgeId of newUnlockedBadges) {
          const badge = badgeRequirements.find(b => b.id === badgeId);
          if (badge) {
            try {
              await NotificationService.createBadgeUnlockedNotification(userId, badge.name);
            } catch (notifError) {
              console.error(`❌ Failed to create badge notification for badge ${badgeId}:`, notifError);
            }
          }
        }

        // Get user details for email
        const user = await dbAdmin.findOne('users', (u: any) => u.id === userId);
        
        if (user && user.email && user.name) {
          // Send achievement emails for each newly unlocked badge
          for (const badgeId of newUnlockedBadges) {
            const badge = badgeRequirements.find(b => b.id === badgeId);
            if (badge) {
              console.log('📧 Triggering achievement unlocked email for badge:', { badgeId, badgeName: badge.name });
              this.sendAchievementUnlockedEmail(
                user.email,
                user.name,
                badge.name,
                badge.description,
                false, // Not a level up, just badge unlock
                undefined
              ).catch(error => {
                console.error(`❌ Failed to send achievement unlocked email for badge ${badgeId}:`, error);
              });
            }
          }
        }
      }

      return newUnlockedBadges;
    } catch (error: any) {
      console.error('❌ Failed to check and unlock badges:', {
        userId,
        error: error.message || error,
        stack: error.stack
      });
      return [];
    }
  }

  /**
   * Send practice session completed email to user
   */
  static async sendPracticeSessionCompletedEmail(
    userEmail: string,
    userName: string,
    subject: string,
    score: number,
    totalQuestions: number,
    timeSpent: string,
    xpEarned: number,
    isHighScore: boolean = false
  ): Promise<boolean> {
    try {
      console.log('📧 Attempting to send practice session completed email:', { 
        userEmail, 
        userName, 
        subject,
        score,
        totalQuestions
      });
      
      const scorePercentage = totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;
      
      const params: Record<string, any> = {
        userName: userName,
        subject: subject,
        score: score.toString(),
        totalQuestions: totalQuestions.toString(),
        scorePercentage: scorePercentage.toString(),
        timeSpent: timeSpent,
        xpEarned: xpEarned.toString(),
        frontendUrl: config.email.frontendUrl,
        supportEmail: config.email.supportEmail,
        currentYear: new Date().getFullYear().toString()
      };

      // Only include isHighScore if it's true
      if (isHighScore) {
        params.isHighScore = true;
      }

      console.log('📧 Practice session completed email params:', params);
      console.log('📧 Using template ID: 22');

      // Template ID 22 for practice session completed
      const result = await this.sendTemplateEmail(userEmail, 22, params);
      
      if (result) {
        console.log('✅ Practice session completed email sent successfully to:', userEmail);
      } else {
        console.warn('⚠️ Practice session completed email sending returned false for:', userEmail);
      }
      
      return result;
    } catch (error: any) {
      console.error('❌ Failed to send practice session completed email:', {
        userEmail,
        userName,
        error: error.message || error,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Send streak milestone email to user
   */
  static async sendStreakMilestoneEmail(
    userEmail: string,
    userName: string,
    streakDays: number
  ): Promise<boolean> {
    try {
      console.log('📧 Attempting to send streak milestone email:', { 
        userEmail, 
        userName, 
        streakDays 
      });
      
      const params = {
        userName: userName,
        streakDays: streakDays.toString(),
        frontendUrl: config.email.frontendUrl,
        supportEmail: config.email.supportEmail,
        currentYear: new Date().getFullYear().toString()
      };

      console.log('📧 Streak milestone email params:', params);
      console.log('📧 Using template ID: 23');

      // Template ID 23 for streak milestone
      const result = await this.sendTemplateEmail(userEmail, 23, params);
      
      if (result) {
        console.log('✅ Streak milestone email sent successfully to:', userEmail);
      } else {
        console.warn('⚠️ Streak milestone email sending returned false for:', userEmail);
      }
      
      return result;
    } catch (error: any) {
      console.error('❌ Failed to send streak milestone email:', {
        userEmail,
        userName,
        error: error.message || error,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Send weekly digest email to user
   */
  static async sendWeeklyDigestEmail(
    userEmail: string,
    userName: string,
    weeklyXP: number,
    documentsViewed: number,
    videosWatched: number,
    practiceSessions: number,
    currentStreak: number,
    currentLevel: number,
    achievementsUnlocked?: string[]
  ): Promise<boolean> {
    try {
      console.log('📧 Attempting to send weekly digest email:', { 
        userEmail, 
        userName,
        weeklyXP,
        documentsViewed,
        videosWatched,
        practiceSessions
      });
      
      const params: Record<string, any> = {
        userName: userName,
        weeklyXP: weeklyXP.toString(),
        documentsViewed: documentsViewed.toString(),
        videosWatched: videosWatched.toString(),
        practiceSessions: practiceSessions.toString(),
        currentStreak: currentStreak.toString(),
        currentLevel: currentLevel.toString(),
        frontendUrl: config.email.frontendUrl,
        supportEmail: config.email.supportEmail,
        currentYear: new Date().getFullYear().toString()
      };

      // Only include achievements if there are any
      if (achievementsUnlocked && achievementsUnlocked.length > 0) {
        params.achievementsUnlocked = achievementsUnlocked;
      }

      console.log('📧 Weekly digest email params:', params);
      console.log('📧 Using template ID: 24');

      // Template ID 24 for weekly digest
      const result = await this.sendTemplateEmail(userEmail, 24, params);
      
      if (result) {
        console.log('✅ Weekly digest email sent successfully to:', userEmail);
      } else {
        console.warn('⚠️ Weekly digest email sending returned false for:', userEmail);
      }
      
      return result;
    } catch (error: any) {
      console.error('❌ Failed to send weekly digest email:', {
        userEmail,
        userName,
        error: error.message || error,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Calculate weekly stats for a user and send weekly digest email
   */
  static async sendWeeklyDigestToUser(userId: string): Promise<void> {
    try {
      const user = await dbAdmin.findOne('users', (u: any) => u.id === userId);
      if (!user || !user.email || !user.name) {
        console.log(`⚠️ Skipping weekly digest for user ${userId} - no email or name`);
        return;
      }

      // Check if user has email notifications enabled
      const shouldSend = await this.shouldSendEmailToUser(userId);
      if (!shouldSend) {
        console.log(`⚠️ Skipping weekly digest for user ${userId} - email notifications disabled`);
        return;
      }

      // Calculate date range (last 7 days)
      const now = new Date();
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      const weekAgoStr = weekAgo.toISOString();

      // Calculate weekly XP from XP history
      const xpHistoryData = await supabaseAdmin
        .from('xp_history')
        .select('amount')
        .eq('user_id', userId)
        .gte('created_at', weekAgoStr);
      
      const weeklyXP = xpHistoryData.data?.reduce((sum: number, entry: any) => sum + (entry.amount || 0), 0) || 0;

      // Count documents viewed in the last week
      const documentViewsData = await supabaseAdmin
        .from('document_views')
        .select('id')
        .eq('user_id', userId)
        .gte('viewed_at', weekAgoStr);
      
      const documentsViewed = documentViewsData.data?.length || 0;

      // Count videos watched in the last week
      const videoCompletions = await supabaseAdmin
        .from('video_completions')
        .select('id')
        .eq('user_id', userId)
        .gte('created_at', weekAgoStr);
      
      const videosWatched = videoCompletions.data?.length || 0;

      // Count practice sessions in the last week
      const practiceSessionsData = await supabaseAdmin
        .from('practice_sessions')
        .select('id')
        .eq('user_id', userId)
        .gte('completed_at', weekAgoStr);
      
      const practiceSessions = practiceSessionsData.data?.length || 0;

      // Get current streak and level
      const currentStreak = user.streak || 0;
      const currentLevel = user.level || 1;

      // Get achievements unlocked this week from badge_unlocks table
      const badgeUnlocksData = await supabaseAdmin
        .from('badge_unlocks')
        .select('badge_id')
        .eq('user_id', userId)
        .gte('unlocked_at', weekAgoStr);
      
      // Badge display names come from the canonical definitions so digest
      // copy can't drift from the award paths.
      const achievementsUnlocked = badgeUnlocksData.data?.map((entry: any) =>
        BADGE_DEFINITIONS.find(b => b.id === entry.badge_id)?.name || entry.badge_id
      ) || [];

      // Send the weekly digest email
      await this.sendWeeklyDigestEmail(
        user.email,
        user.name,
        weeklyXP,
        documentsViewed,
        videosWatched,
        practiceSessions,
        currentStreak,
        currentLevel,
        achievementsUnlocked.length > 0 ? achievementsUnlocked : undefined
      );
    } catch (error: any) {
      console.error(`❌ Failed to send weekly digest to user ${userId}:`, {
        error: error.message || error,
        stack: error.stack
      });
    }
  }

  /**
   * Send admin invitation email
   */
  static async sendAdminInvitationEmail(
    email: string,
    name: string,
    role: string,
    invitationLink: string
  ): Promise<boolean> {
    try {
      console.log('📧 Attempting to send admin invitation email:', { email, name, role });
      
      const params = {
        userName: name,
        role: role === 'ADMIN' ? 'Administrator' : 'Moderator',
        invitationLink: invitationLink,
        supportEmail: config.email.supportEmail,
        currentYear: new Date().getFullYear().toString()
      };

      console.log('📧 Admin invitation email params:', params);
      console.log('📧 Using template ID: 25');

      // Template ID 25 for admin invitation
      const result = await this.sendTemplateEmail(email, 25, params);
      
      if (result) {
        console.log('✅ Admin invitation email sent successfully to:', email);
      } else {
        console.warn('⚠️ Admin invitation email sending returned false for:', email);
      }
      
      return result;
    } catch (error: any) {
      console.error('❌ Failed to send admin invitation email:', {
        email,
        name,
        role,
        error: error.message || error,
        stack: error.stack
      });
      return false;
    }
  }

  /**
   * Send weekly digest emails to all eligible users
   */
  static async sendWeeklyDigestsToAllUsers(): Promise<void> {
    try {
      console.log('📧 Starting weekly digest email batch...');
      
      const users = await dbAdmin.get('users');
      // Staff excluded; banned/suspended/deactivated accounts must not get
      // engagement emails.
      const ineligibleStatuses = ['Banned', 'Suspended', 'Inactive'];
      const eligibleUsers = users.filter((u: any) =>
        u.email &&
        u.name &&
        u.role !== 'ADMIN' && // Don't send to admins
        !ineligibleStatuses.includes(u.status)
      );

      console.log(`📧 Found ${eligibleUsers.length} eligible users for weekly digest`);

      let sentCount = 0;
      let skippedCount = 0;

      for (const user of eligibleUsers) {
        try {
          await this.sendWeeklyDigestToUser(user.id);
          sentCount++;
        } catch (error) {
          console.error(`❌ Failed to send weekly digest to user ${user.id}:`, error);
          skippedCount++;
        }
      }

      console.log(`📧 Weekly digest batch complete: ${sentCount} sent, ${skippedCount} skipped`);
    } catch (error: any) {
      console.error('❌ Failed to send weekly digests:', {
        error: error.message || error,
        stack: error.stack
      });
    }
  }
}
