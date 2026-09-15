import express from 'express';
import { body, query, param } from 'express-validator';
import { dbAdmin, query as dbQuery, supabaseAdmin } from '../database/config';
import { authenticateToken, optionalAuth, requireRole, validateRequest } from '../middleware/auth';
import { ApiResponse, JobPosition, JobApplication } from '../types';
import { NotificationService } from '../services/notificationService';
import { EmailService } from '../services/emailService';
import { logAdminActivity } from '../services/adminAuditLog';

const router = express.Router();

// Get all active job positions (public)
router.get('/', [
  query('department').optional().isString(),
  query('employment_type').optional().isIn(['Full-time', 'Part-time', 'Contract', 'Internship']),
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { department, employment_type } = req.query;

    // Filtered/sorted in SQL (was: fetch every position, filter/sort in JS).
    const conditions = ['is_active = TRUE'];
    const params: any[] = [];
    if (department) {
      conditions.push(`department = $${params.length + 1}`);
      params.push(department);
    }
    if (employment_type) {
      conditions.push(`employment_type = $${params.length + 1}`);
      params.push(employment_type);
    }
    const listResult = await dbQuery(
      `SELECT * FROM job_positions WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`,
      params
    );

    res.json({
      success: true,
      data: listResult.rows,
      message: 'Job positions retrieved successfully'
    } as ApiResponse<JobPosition[]>);
  } catch (error) {
    console.error('Get job positions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve job positions'
    } as ApiResponse);
  }
});

// Terms of Service (Public - no authentication required)
router.get('/terms-of-service', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { data: termsOfService, error } = await supabaseAdmin
      .from('terms_of_service')
      .select('content, last_updated')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows returned"
      throw error;
    }

    let result;
    if (!termsOfService) {
      // Return default terms of service if none exists in database
      result = {
        content: `
Terms of Service

Last updated: December 2025

Welcome to SmartStudy. By accessing or using our platform, you agree to be bound by these Terms of Service. Please read them carefully.

1. Acceptance of Terms

By creating an account, accessing, or using SmartStudy, you agree to comply with and be legally bound by these Terms. If you do not agree, please do not use the platform.

2. Description of Service

SmartStudy is an educational platform designed to help students learn more effectively through structured content, study tools, and AI-powered assistance.

We may update, improve, or modify features at any time to enhance user experience.

3. User Accounts

You are responsible for maintaining the confidentiality of your account credentials

You agree to provide accurate and complete information

You are responsible for all activities that occur under your account

SmartStudy reserves the right to suspend or terminate accounts that violate these Terms.

4. Acceptable Use

You agree not to:

Use the platform for unlawful or harmful purposes

Attempt to hack, disrupt, or misuse the system

Upload malicious code or harmful content

Impersonate others or provide false information

SmartStudy is intended for educational use only.

5. User Content

You may submit content such as questions, notes, or study materials.

By submitting content:

You retain ownership of your content

You grant SmartStudy permission to use it only to provide and improve services

You agree not to upload content that is illegal, offensive, or violates others' rights

6. AI Features Disclaimer

SmartStudy uses AI to assist learning. While we strive for accuracy:

AI-generated content is for educational support only

It should not be considered professional, academic, or legal advice

Users should verify important information independently

7. Intellectual Property

All platform content, branding, logos, design, and software belong to SmartStudy unless otherwise stated.

You may not copy, distribute, or reproduce any part of the platform without permission.

8. Third-Party Services

SmartStudy may integrate third-party tools or services. We are not responsible for the content or practices of third-party platforms.

9. Termination

We reserve the right to suspend or terminate access to SmartStudy at any time if these Terms are violated or if misuse is detected.

Users may stop using the platform at any time.

10. Limitation of Liability

SmartStudy is provided on an "as-is" basis. We are not liable for:

Data loss

Academic outcomes

Service interruptions

Errors or inaccuracies in content

Use of the platform is at your own risk.

11. Changes to These Terms

We may update these Terms from time to time. Continued use of SmartStudy after changes means you accept the updated Terms.

12. Governing Law

These Terms are governed by applicable laws. Any disputes will be handled under relevant legal jurisdictions.

13. Contact Us

If you have questions about these Terms of Service, please contact us:

Email: smartstudy.ethio@gmail.com
Platform: SmartStudy
        `,
        lastUpdated: 'December 2025'
      };
    } else {
      result = {
        content: termsOfService.content,
        lastUpdated: new Date(termsOfService.last_updated).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
      };
    }

    res.json({
      success: true,
      data: result
    } as ApiResponse);
  } catch (error) {
    console.error('Terms of service fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch terms of service'
    } as ApiResponse);
  }
});

// Privacy Policy (Public - no authentication required)
router.get('/privacy-policy', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { data: privacyPolicy, error } = await supabaseAdmin
      .from('privacy_policy')
      .select('content, last_updated')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows returned"
      throw error;
    }

    let result;
    if (!privacyPolicy) {
      // Return default privacy policy if none exists in database
      result = {
        content: `
Privacy Policy

Last updated: December 2025

Welcome to SmartStudy. Your privacy is important to us, and this Privacy Policy explains how we collect, use, protect, and handle your information when you use our platform.

1. Information We Collect

We may collect the following types of information:

Personal Information:
Name, email address, and account details when you sign up or log in.

Usage Information:
How you interact with the platform, such as pages visited, features used, and study activity.

Device & Technical Data:
Browser type, device type, IP address, and general location (non-precise).

User Content:
Study notes, questions, or inputs you provide while using SmartStudy.

2. How We Use Your Information

We use your information to:

• Provide and improve SmartStudy services
• Personalize learning experiences
• Enable AI-powered features
• Maintain platform security
• Communicate important updates or support responses

3. Information Sharing

We do not sell, trade, or otherwise transfer your personal information to third parties without your consent, except as described in this policy.

4. Data Security

We implement appropriate technical and organizational measures to protect your personal information against unauthorized access, alteration, disclosure, or destruction.

5. Your Rights

You have the right to:
• Access your personal information
• Correct inaccurate information
• Delete your account and associated data
• Object to or restrict certain processing

6. Cookies and Tracking

We use cookies and similar technologies to enhance your experience and analyze usage patterns.

7. Changes to This Policy

We may update this Privacy Policy from time to time. We will notify you of any material changes.

8. Contact Us

If you have any questions about this Privacy Policy, please contact us at:
Email: smartstudy.ethio@gmail.com
Platform: SmartStudy
        `,
        lastUpdated: 'December 2025'
      };
    } else {
      result = {
        content: privacyPolicy.content,
        lastUpdated: new Date(privacyPolicy.last_updated).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
      };
    }

    res.json({
      success: true,
      data: result
    } as ApiResponse);
  } catch (error) {
    console.error('Privacy policy fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch privacy policy'
    } as ApiResponse);
  }
});

// Get job position by ID (public)
router.get('/:id', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params;
    // Indexed lookup (was a full-table fetch). Inactive positions 404 here —
    // the public detail must never expose a deactivated posting.
    const detailResult = await dbQuery(
      'SELECT * FROM job_positions WHERE id = $1 AND is_active = TRUE', [id]
    );
    const position = detailResult.rows[0];

    if (!position) {
      res.status(404).json({
        success: false,
        message: 'Job position not found'
      } as ApiResponse);
      return;
    }
    
    res.json({
      success: true,
      data: position,
      message: 'Job position retrieved successfully'
    } as ApiResponse<JobPosition>);
  } catch (error) {
    console.error('Get job position error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve job position'
    } as ApiResponse);
  }
});

// Apply for a job position (authenticated or guest)
router.post('/:id/apply', [
  optionalAuth,
  body('applicant_name').trim().isLength({ min: 2, max: 255 }).withMessage('Name is required'),
  body('applicant_email').isEmail().withMessage('Valid email is required'),
  body('applicant_phone').optional().trim().isLength({ max: 50 }),
  body('cover_letter').optional().trim().isLength({ max: 5000 }),
  body('resume_url').optional().isURL().withMessage('Resume URL must be valid'),
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { applicant_name, applicant_email, applicant_phone, cover_letter, resume_url } = req.body;
    const applicant_id = req.user?.id;
    
    // Indexed lookups (were full-table fetches + in-memory finds).
    const posResult = await dbQuery(
      'SELECT id, title, is_active FROM job_positions WHERE id = $1', [id]
    );
    const position = posResult.rows[0];
    if (!position || !position.is_active) {
      res.status(404).json({
        success: false,
        message: 'Job position not found or no longer accepting applications'
      } as ApiResponse);
      return;
    }
    
    // Check if user already applied (if authenticated)
    if (applicant_id) {
      const dupResult = await dbQuery(
        'SELECT id FROM job_applications WHERE position_id = $1 AND applicant_id = $2 LIMIT 1',
        [id, applicant_id]
      );
      const existingApplication = dupResult.rows[0];
      
      if (existingApplication) {
        res.status(400).json({
          success: false,
          message: 'You have already applied for this position'
        } as ApiResponse);
        return;
      }
    }
    
    // Duplicate guard for guests too: without this, one email address could
    // file unlimited applications for the same position (authed users are
    // checked by applicant_id above).
    // Case-insensitive email match in SQL (equivalent to the old
    // lower() comparison, without fetching the table).
    const clashResult = await dbQuery(
      'SELECT id FROM job_applications WHERE position_id = $1 AND LOWER(applicant_email) = LOWER($2) LIMIT 1',
      [id, String(applicant_email)]
    );
    const emailClash = clashResult.rows[0];

    if (emailClash) {
      res.status(400).json({
        success: false,
        message: 'An application with this email already exists for this position'
      } as ApiResponse);
      return;
    }

    // Create application
    const application = await dbAdmin.insert('job_applications', {
      position_id: id,
      applicant_id: applicant_id || null,
      applicant_name,
      applicant_email,
      applicant_phone: applicant_phone || null,
      cover_letter: cover_letter || null,
      resume_url: resume_url || null,
      status: 'Pending'
    });
    
    // Notify admins (in-app notifications). Only admin IDs are selected —
    // the old code fetched every user row (password hashes included).
    try {
      const adminRows = await dbQuery(
        "SELECT id FROM users WHERE role = 'ADMIN'"
      );

      for (const admin of adminRows.rows) {
        await NotificationService.create({
          user_id: admin.id,
          title: 'New Job Application',
          message: `${applicant_name} applied for ${position.title}`,
          type: 'INFO'
        });
      }
    } catch (notifError) {
      console.error('Failed to send notification:', notifError);
    }

    // Send email notifications to admins (non-blocking)
    console.log('📧 Triggering job application received email for admins');
    EmailService.notifyAdminsAboutJobApplication(
      position.title,
      applicant_name,
      applicant_email,
      applicant_phone || undefined
    ).catch(error => {
      console.error('❌ Failed to notify admins about job application:', error);
      // Don't fail the request if email fails
    });
    
    res.status(201).json({
      success: true,
      data: application,
      message: 'Application submitted successfully'
    } as ApiResponse<JobApplication>);
  } catch (error) {
    console.error('Apply for job error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit application'
    } as ApiResponse);
  }
});

// Admin: Get all job positions (including inactive)
router.get('/admin/positions', [
  authenticateToken,
  requireRole(['ADMIN'])
], async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    // Ordered in SQL (was: fetch all, sort in JS).
    const allPositions = await dbQuery(
      'SELECT * FROM job_positions ORDER BY created_at DESC'
    );

    res.json({
      success: true,
      data: allPositions.rows,
      message: 'Job positions retrieved successfully'
    } as ApiResponse<JobPosition[]>);
  } catch (error) {
    console.error('Get all job positions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve job positions'
    } as ApiResponse);
  }
});

// Admin: Create job position
router.post('/admin/positions', [
  authenticateToken,
  requireRole(['ADMIN']),
  body('title').trim().isLength({ min: 5, max: 255 }).withMessage('Title is required'),
  body('description').trim().isLength({ min: 20 }).withMessage('Description is required'),
  body('requirements').optional().trim(),
  body('department').optional().trim().isLength({ max: 100 }),
  body('employment_type').isIn(['Full-time', 'Part-time', 'Contract', 'Internship']).withMessage('Valid employment type required'),
  body('location').optional().trim().isLength({ max: 255 }),
  body('is_active').optional().isBoolean(),
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { title, description, requirements, department, employment_type, location, is_active = true } = req.body;
    const posted_by = req.user!.id;
    
    const position = await dbAdmin.insert('job_positions', {
      title,
      description,
      requirements: requirements || null,
      department: department || null,
      employment_type,
      location: location || null,
      is_active,
      posted_by
    });

    // Audit log (non-blocking)
    logAdminActivity(req, {
      action: 'job_position.create',
      target_type: 'job_position',
      target_id: String(position?.id || ''),
      summary: `Created job position "${position?.title}"`,
      after: {
        id: position?.id,
        title: position?.title,
        department: position?.department,
        employment_type: position?.employment_type,
        is_active: position?.is_active,
        posted_by
      }
    }).catch(() => {});
    
    // Notify all users about new job position (non-blocking)
    if (position && position.id && is_active) {
      console.log('📧 Triggering new job position notification for users');
      EmailService.notifyUsersAboutNewJobPosition(
        position.id,
        title,
        department || 'General',
        employment_type,
        description,
        location || undefined
      ).catch(error => {
        console.error('❌ Failed to notify users about new job position:', error);
        // Don't fail the request if notification fails
      });
    }
    
    res.status(201).json({
      success: true,
      data: position,
      message: 'Job position created successfully'
    } as ApiResponse<JobPosition>);
  } catch (error) {
    console.error('Create job position error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create job position'
    } as ApiResponse);
  }
});

// Admin: Update job position
router.put('/admin/positions/:id', [
  authenticateToken,
  requireRole(['ADMIN']),
  body('title').optional().trim().isLength({ min: 5, max: 255 }),
  body('description').optional().trim().isLength({ min: 20 }),
  body('requirements').optional().trim(),
  body('department').optional().trim().isLength({ max: 100 }),
  body('employment_type').optional().isIn(['Full-time', 'Part-time', 'Contract', 'Internship']),
  body('location').optional().trim().isLength({ max: 255 }),
  body('is_active').optional().isBoolean(),
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // Indexed lookup (was a full-table fetch + in-memory find).
    const posRow = await dbQuery('SELECT * FROM job_positions WHERE id = $1', [id]);
    const position = posRow.rows[0];
    if (!position) {
      res.status(404).json({
        success: false,
        message: 'Job position not found'
      } as ApiResponse);
      return;
    }
    
    const updated = await dbAdmin.update('job_positions', id, updates);

    // Audit log (non-blocking)
    logAdminActivity(req, {
      action: 'job_position.update',
      target_type: 'job_position',
      target_id: String(id),
      summary: `Updated job position "${position?.title || id}"`,
      before: position,
      after: updated
    }).catch(() => {});
    
    res.json({
      success: true,
      data: updated,
      message: 'Job position updated successfully'
    } as ApiResponse<JobPosition>);
  } catch (error) {
    console.error('Update job position error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update job position'
    } as ApiResponse);
  }
});

// Admin: Delete job position
router.delete('/admin/positions/:id', [
  authenticateToken,
  requireRole(['ADMIN'])
], async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Indexed lookups (were two full-table fetches — positions AND every
    // application — for one existence check).
    const beforeRows = await dbQuery('SELECT * FROM job_positions WHERE id = $1', [id]);
    const before = beforeRows.rows[0];
    if (!before) {
      res.status(404).json({
        success: false,
        message: 'Job position not found'
      } as ApiResponse);
      return;
    }

    // Check if there are applications for this position
    const appCheck = await dbQuery(
      'SELECT 1 FROM job_applications WHERE position_id = $1 LIMIT 1', [id]
    );
    const hasApplications = appCheck.rows.length > 0;
    
    if (hasApplications) {
      // Don't delete, just deactivate
      const updated = await dbAdmin.update('job_positions', id, { is_active: false });

      logAdminActivity(req, {
        action: 'job_position.deactivate',
        target_type: 'job_position',
        target_id: String(id),
        summary: `Deactivated job position "${before?.title || id}" (has applications)`,
        before,
        after: updated
      }).catch(() => {});

      res.json({
        success: true,
        message: 'Job position deactivated (has applications)'
      } as ApiResponse);
    } else {
      // Safe to delete
      await dbAdmin.delete('job_positions', id);

      logAdminActivity(req, {
        action: 'job_position.delete',
        target_type: 'job_position',
        target_id: String(id),
        summary: `Deleted job position "${before?.title || id}"`,
        before
      }).catch(() => {});

      res.json({
        success: true,
        message: 'Job position deleted successfully'
      } as ApiResponse);
    }
  } catch (error) {
    console.error('Delete job position error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete job position'
    } as ApiResponse);
  }
});

// Admin: Get all applications
router.get('/admin/applications', [
  authenticateToken,
  requireRole(['ADMIN']),
  query('position_id').optional().isUUID(),
  query('status').optional().isIn(['Pending', 'Under Review', 'Interview', 'Accepted', 'Rejected']),
  query('archived').optional().isString(),
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { position_id, status, archived } = req.query;

    // Filtered/sorted in SQL (was: fetch every application, filter/sort in
    // JS). 'all' omits the archive predicate; default is active only.
    const appConditions: string[] = [];
    const appParams: any[] = [];
    if (position_id) {
      appConditions.push(`position_id = $${appParams.length + 1}`);
      appParams.push(position_id);
    }
    if (status) {
      appConditions.push(`status = $${appParams.length + 1}`);
      appParams.push(status);
    }
    if (archived === 'true') {
      appConditions.push('is_archived IS TRUE');
    } else if (archived !== 'all') {
      appConditions.push('is_archived IS NOT TRUE');
    }
    const appWhere = appConditions.length > 0 ? `WHERE ${appConditions.join(' AND ')}` : '';
    const appList = await dbQuery(
      `SELECT * FROM job_applications ${appWhere} ORDER BY created_at DESC`,
      appParams
    );

    res.json({
      success: true,
      data: appList.rows,
      message: 'Applications retrieved successfully'
    } as ApiResponse<JobApplication[]>);
  } catch (error) {
    console.error('Get applications error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve applications'
    } as ApiResponse);
  }
});

// Admin: Get application by ID
router.get('/admin/applications/:id', [
  authenticateToken,
  requireRole(['ADMIN'])
], async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params;
    // Indexed lookup (was a full-table fetch + in-memory find).
    const appRows = await dbQuery('SELECT * FROM job_applications WHERE id = $1', [id]);
    const application = appRows.rows[0];

    if (!application) {
      res.status(404).json({
        success: false,
        message: 'Application not found'
      } as ApiResponse);
      return;
    }
    
    res.json({
      success: true,
      data: application,
      message: 'Application retrieved successfully'
    } as ApiResponse<JobApplication>);
  } catch (error) {
    console.error('Get application error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve application'
    } as ApiResponse);
  }
});

// Admin: Update application status
router.put('/admin/applications/:id/status', [
  authenticateToken,
  requireRole(['ADMIN']),
  body('status').isIn(['Pending', 'Under Review', 'Interview', 'Accepted', 'Rejected']).withMessage('Valid status required'),
  body('notes').optional().trim(),
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    const reviewed_by = req.user!.id;
    
    // Indexed lookup (was a full-table fetch + in-memory find).
    const statusAppRows = await dbQuery('SELECT * FROM job_applications WHERE id = $1', [id]);
    const application = statusAppRows.rows[0];
    if (!application) {
      res.status(404).json({
        success: false,
        message: 'Application not found'
      } as ApiResponse);
      return;
    }

    const before = application;
    
    const updates: any = {
      status,
      reviewed_by,
      reviewed_at: new Date().toISOString()
    };
    
    if (notes) {
      updates.notes = notes;
    }
    
    const updated = await dbAdmin.update('job_applications', id, updates);

    // Audit log (non-blocking)
    logAdminActivity(req, {
      action: 'job_application.status.update',
      target_type: 'job_application',
      target_id: String(id),
      summary: `Updated application status to ${status}`,
      before,
      after: updated,
      meta: notes ? { notes } : undefined
    }).catch(() => {});
    
    // Position title for notifications (indexed; only the column needed).
    const posTitleRows = await dbQuery('SELECT title FROM job_positions WHERE id = $1', [application.position_id]);
    const positionTitle = posTitleRows.rows[0]?.title || 'a position';
    
    // Notify applicant if they have an account (in-app notification)
    if (application.applicant_id) {
      try {
        await NotificationService.create({
          user_id: application.applicant_id,
          title: 'Application Status Updated',
          message: `Your application for ${positionTitle} has been ${status.toLowerCase()}.`,
          type: status === 'Accepted' ? 'SUCCESS' : status === 'Rejected' ? 'ERROR' : 'INFO'
        });
      } catch (notifError) {
        console.error('Failed to send notification:', notifError);
      }
    }
    
    // Send email notification to applicant (non-blocking)
    // Send email even if applicant doesn't have an account (guest applicants)
    if (application.applicant_email && application.applicant_name) {
      console.log('📧 Triggering job application status update email for applicant:', { 
        email: application.applicant_email, 
        name: application.applicant_name,
        status 
      });
      EmailService.sendJobApplicationStatusUpdateEmail(
        application.applicant_email,
        application.applicant_name,
        positionTitle,
        status,
        notes || undefined
      ).catch(error => {
        console.error('❌ Failed to send job application status update email:', error);
        // Don't fail the request if email fails
      });
    }
    
    res.json({
      success: true,
      data: updated,
      message: 'Application status updated successfully'
    } as ApiResponse<JobApplication>);
  } catch (error) {
    console.error('Update application status error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update application status'
    } as ApiResponse);
  }
});

// Admin: Archive/Unarchive application
router.patch('/admin/applications/:id/archive', [
  authenticateToken,
  requireRole(['ADMIN']),
  body('is_archived').isBoolean().withMessage('is_archived must be boolean'),
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { is_archived } = req.body;

    // Indexed lookup (was a full-table fetch + in-memory find).
    const archRows = await dbQuery('SELECT * FROM job_applications WHERE id = $1', [id]);
    const before = archRows.rows[0];
    if (!before) {
      res.status(404).json({
        success: false,
        message: 'Application not found'
      } as ApiResponse);
      return;
    }

    const updated = await dbAdmin.update('job_applications', id, { is_archived });

    // Audit log (non-blocking)
    logAdminActivity(req, {
      action: is_archived ? 'job_application.archive' : 'job_application.unarchive',
      target_type: 'job_application',
      target_id: String(id),
      summary: `${is_archived ? 'Archived' : 'Unarchived'} application from "${before.applicant_name}"`,
      before,
      after: updated
    }).catch(() => {});

    res.json({
      success: true,
      data: updated,
      message: `Application ${is_archived ? 'archived' : 'unarchived'} successfully`
    } as ApiResponse<JobApplication>);
  } catch (error) {
    console.error('Archive application error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to archive/unarchive application'
    } as ApiResponse);
  }
});

router.delete('/admin/applications/:id', [
  authenticateToken,
  requireRole(['ADMIN'])
], async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params;
    // Indexed lookup (was a full-table fetch). The old code also returned
    // success for unknown ids — deleting nothing still 200d with an audit
    // entry. Now it 404s like every other delete route.
    const delRows = await dbQuery('SELECT * FROM job_applications WHERE id = $1', [id]);
    const before = delRows.rows[0];
    if (!before) {
      res.status(404).json({
        success: false,
        message: 'Application not found'
      } as ApiResponse);
      return;
    }
    await dbAdmin.delete('job_applications', id);

    logAdminActivity(req, {
      action: 'job_application.delete',
      target_type: 'job_application',
      target_id: String(id),
      summary: `Deleted job application ${id}`,
      before
    }).catch(() => {});
    
    res.json({
      success: true,
      message: 'Application deleted successfully'
    } as ApiResponse);
  } catch (error) {
    console.error('Delete application error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete application'
    } as ApiResponse);
  }
});

export default router;

