import express from 'express';
import { body, query, param } from 'express-validator';
import { dbAdmin } from '../database/config';
import { authenticateToken, optionalAuth, requireRole, validateRequest } from '../middleware/auth';
import { ApiResponse, JobPosition, JobApplication } from '../types';
import { NotificationService } from '../services/notificationService';
import { EmailService } from '../services/emailService';

const router = express.Router();

// Get all active job positions (public)
router.get('/', [
  query('department').optional().isString(),
  query('employment_type').optional().isIn(['Full-time', 'Part-time', 'Contract', 'Internship']),
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { department, employment_type } = req.query;
    
    let positions = await dbAdmin.get('job_positions');
    
    // Filter by active status
    positions = positions.filter((p: any) => p.is_active === true);
    
    // Apply filters
    if (department) {
      positions = positions.filter((p: any) => p.department === department);
    }
    
    if (employment_type) {
      positions = positions.filter((p: any) => p.employment_type === employment_type);
    }
    
    // Sort by created_at descending
    positions.sort((a: any, b: any) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    
    res.json({
      success: true,
      data: positions,
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

// Get job position by ID (public)
router.get('/:id', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params;
    const position = await dbAdmin.findOne('job_positions', (p: any) => p.id === id);
    
    if (!position) {
      res.status(404).json({
        success: false,
        message: 'Job position not found'
      } as ApiResponse);
      return;
    }
    
    if (!position.is_active) {
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
    
    // Check if position exists and is active
    const position = await dbAdmin.findOne('job_positions', (p: any) => p.id === id);
    if (!position || !position.is_active) {
      res.status(404).json({
        success: false,
        message: 'Job position not found or no longer accepting applications'
      } as ApiResponse);
      return;
    }
    
    // Check if user already applied (if authenticated)
    if (applicant_id) {
      const existingApplication = await dbAdmin.findOne('job_applications', (app: any) => 
        app.position_id === id && app.applicant_id === applicant_id
      );
      
      if (existingApplication) {
        res.status(400).json({
          success: false,
          message: 'You have already applied for this position'
        } as ApiResponse);
        return;
      }
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
    
    // Notify admins (in-app notifications)
    try {
      const admins = await dbAdmin.get('users');
      const adminUsers = admins.filter((u: any) => u.role === 'ADMIN');
      
      for (const admin of adminUsers) {
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
    const positions = await dbAdmin.get('job_positions');
    
    // Sort by created_at descending
    positions.sort((a: any, b: any) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    
    res.json({
      success: true,
      data: positions,
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
    
    const position = await dbAdmin.findOne('job_positions', (p: any) => p.id === id);
    if (!position) {
      res.status(404).json({
        success: false,
        message: 'Job position not found'
      } as ApiResponse);
      return;
    }
    
    const updated = await dbAdmin.update('job_positions', id, updates);
    
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
    
    // Check if there are applications for this position
    const applications = await dbAdmin.get('job_applications');
    const hasApplications = applications.some((app: any) => app.position_id === id);
    
    if (hasApplications) {
      // Don't delete, just deactivate
      await dbAdmin.update('job_positions', id, { is_active: false });
      res.json({
        success: true,
        message: 'Job position deactivated (has applications)'
      } as ApiResponse);
    } else {
      // Safe to delete
      await dbAdmin.delete('job_positions', id);
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
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { position_id, status } = req.query;
    
    let applications = await dbAdmin.get('job_applications');
    
    // Apply filters
    if (position_id) {
      applications = applications.filter((app: any) => app.position_id === position_id);
    }
    
    if (status) {
      applications = applications.filter((app: any) => app.status === status);
    }
    
    // Sort by created_at descending
    applications.sort((a: any, b: any) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    
    res.json({
      success: true,
      data: applications,
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
    const application = await dbAdmin.findOne('job_applications', (app: any) => app.id === id);
    
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
    
    const application = await dbAdmin.findOne('job_applications', (app: any) => app.id === id);
    if (!application) {
      res.status(404).json({
        success: false,
        message: 'Application not found'
      } as ApiResponse);
      return;
    }
    
    const updates: any = {
      status,
      reviewed_by,
      reviewed_at: new Date().toISOString()
    };
    
    if (notes) {
      updates.notes = notes;
    }
    
    const updated = await dbAdmin.update('job_applications', id, updates);
    
    // Get position title for notifications
    const position = await dbAdmin.findOne('job_positions', (p: any) => p.id === application.position_id);
    const positionTitle = position?.title || 'a position';
    
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

// Admin: Delete application
router.delete('/admin/applications/:id', [
  authenticateToken,
  requireRole(['ADMIN'])
], async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params;
    await dbAdmin.delete('job_applications', id);
    
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

