import express from 'express';
import { body, query } from 'express-validator';
import { query as dbQuery, db, dbAdmin } from '../database/config';
import { authenticateToken, requirePremium, validateRequest, optionalAuth } from '../middleware/auth';
import { ApiResponse, Document, User } from '../types';
import { EmailService } from '../services/emailService';

// Helper function to convert Google Drive sharing links to direct URLs
const convertGoogleDriveUrl = (url: string): string => {
  if (!url || !url.includes('drive.google.com')) {
    return url;
  }

  // Extract file ID from sharing link
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)\//) || url.match(/id=([a-zA-Z0-9-_]+)/);
  const fileId = match ? match[1] : null;

  if (fileId) {
    // Convert to direct URL for images
    return `https://drive.google.com/uc?export=view&id=${fileId}`;
  }

  return url;
};

const router = express.Router();

// Get all documents with optional filtering
router.get('/', optionalAuth, [
  query('subject').optional().isString(),
  query('grade').optional().isInt({ min: 9, max: 12 }),
  query('search').optional().isString(),
  query('bookmarked').optional().isBoolean(),
  query('sort').optional().isIn(['newest', 'popular', 'title']).withMessage('Sort must be newest, popular, or title'),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('offset').optional().isInt({ min: 0 }).toInt()
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const subject = req.query.subject as string;
    const grade = req.query.grade as string;
    const search = req.query.search as string;
    const bookmarked = req.query.bookmarked as string;
    const sort = req.query.sort as string || 'newest';
    const limit = Number(req.query.limit) || 20;
    const offset = Number(req.query.offset) || 0;

    // User info is optional (for authenticated users)
    const userId = req.user?.id;
    const isPremium = req.user?.is_premium || false;

    // Build query conditions
    let conditions = [];
    let params: any[] = [];
    let paramCount = 1;

    // Only show premium content to premium users
    if (!isPremium) {
      conditions.push(`is_premium = $${paramCount++}`);
      params.push(false);
    }

    if (subject) {
      conditions.push(`subject = $${paramCount++}`);
      params.push(subject);
    }

    if (grade) {
      conditions.push(`grade = $${paramCount++}`);
      params.push(parseInt(grade as string));
    }

    if (search) {
      conditions.push(`(title ILIKE $${paramCount++} OR description ILIKE $${paramCount++} OR author ILIKE $${paramCount++})`);
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Handle bookmarked filter separately (client-side filtering since it's user-specific)
    let bookmarkedDocIds: string[] = [];
    if (bookmarked === 'true') {
      if (!userId) {
        // Unauthenticated users can't have bookmarks
        bookmarkedDocIds = [];
      } else {
        // Get user's bookmarks
        const userResult = await dbQuery('SELECT bookmarks FROM users WHERE id = $1', [userId]);
        if (userResult.rows.length > 0) {
          bookmarkedDocIds = userResult.rows[0].bookmarks || [];
        }
      }
    }

    // Determine sort order
    let orderBy = 'created_at DESC'; // default: newest
    if (sort === 'popular') {
      orderBy = 'downloads DESC';
    } else if (sort === 'title') {
      orderBy = 'title ASC';
    }

    // Get documents
    const documentsResult = await dbQuery(`
      SELECT id, title, description, subject, grade, file_type, file_size, file_url, is_premium,
             downloads, preview_image, tags, author, created_at, updated_at
      FROM documents
      ${whereClause}
      ORDER BY ${orderBy}
    `, params);

    let documents = documentsResult.rows;

    // Apply bookmarked filter if requested
    if (bookmarked === 'true') {
      documents = documents.filter(doc => bookmarkedDocIds.includes(doc.id.toString()));
    }

    // Apply pagination after filtering
    const startIndex = Number(offset) || 0;
    const limitNum = Number(limit) || 20;
    const paginatedDocuments = documents.slice(startIndex, startIndex + limitNum);

    // Get total count for pagination (after filtering)
    const total = documents.length;

    res.json({
      success: true,
      data: {
        documents: paginatedDocuments,
        pagination: {
          total,
          limit: Number(limit),
          offset: Number(offset),
          hasMore: offset + paginatedDocuments.length < total
        }
      }
    } as ApiResponse);
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get documents'
    } as ApiResponse);
  }
});

// Get document by ID
router.get('/:id', optionalAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const isPremium = req.user?.is_premium || false;

    const result = await dbQuery(`
      SELECT id, title, description, subject, grade, file_type, file_size, file_url, is_premium,
             downloads, preview_image, tags, author, created_at, updated_at
      FROM documents WHERE id = $1
    `, [id]);

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Document not found'
      } as ApiResponse);
      return;
    }

    const document = result.rows[0];

    // Check premium access
    if (document.is_premium && !isPremium) {
      res.status(403).json({
        success: false,
        message: 'Premium subscription required'
      } as ApiResponse);
      return;
    }

    // Record document view for authenticated users
    if (userId) {
      try {
        // Check if view already exists
        const existingView = await dbAdmin.findOne('document_views', (v: any) => 
          v.user_id === userId && v.document_id === id
        );
        
        if (!existingView) {
          // Insert new view
          await dbAdmin.insert('document_views', {
            user_id: userId,
            document_id: id,
            viewed_at: new Date().toISOString()
          });
        } else {
          // Update view timestamp to track latest view (for weekly digest, we count unique documents)
          await dbAdmin.update('document_views', existingView.id, {
            viewed_at: new Date().toISOString()
          });
        }
      } catch (viewError) {
        console.error('Failed to record document view:', viewError);
        // Don't fail the request if view tracking fails
      }
    }

    res.json({
      success: true,
      data: document
    } as ApiResponse<Document>);
  } catch (error) {
    console.error('Get document error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get document'
    } as ApiResponse);
  }
});

// Download document (increments download count)
router.get('/:id/download', authenticateToken, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const isPremium = req.user!.is_premium;

    // Get document info
    const docResult = await dbQuery(`
      SELECT title, file_path, is_premium FROM documents WHERE id = $1
    `, [id]);

    if (docResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Document not found'
      } as ApiResponse);
      return;
    }

    const document = docResult.rows[0];

    // Check premium access
    if (document.is_premium && !isPremium) {
      res.status(403).json({
        success: false,
        message: 'Premium subscription required'
      } as ApiResponse);
      return;
    }

    // Increment download count
    await dbQuery(
      'UPDATE documents SET downloads = downloads + 1 WHERE id = $1',
      [id]
    );

    // In a real implementation, you would serve the actual file
    // For now, return file info
    res.json({
      success: true,
      data: {
        downloadUrl: document.file_path || `/api/documents/${id}/file`,
        filename: document.title
      },
      message: 'Download initiated'
    } as ApiResponse);
  } catch (error) {
    console.error('Download document error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to download document'
    } as ApiResponse);
  }
});

// Create document (Admin only)
router.post('/', [
  authenticateToken,
  requirePremium, // Only premium users can upload? Or should this be admin only?
  body('title').trim().isLength({ min: 1, max: 500 }).withMessage('Title is required'),
  body('description').optional().trim().isLength({ max: 2000 }),
  body('subject').isIn(['Mathematics', 'English', 'History', 'Chemistry', 'Physics', 'Biology']).withMessage('Valid subject required'),
  body('grade').isInt({ min: 9, max: 12 }).withMessage('Grade must be between 9 and 12'),
  body('file_type').isIn(['PDF', 'DOCX', 'PPT']).withMessage('Valid file type required'),
  body('is_premium').optional().isBoolean(),
  body('author').optional().trim().isLength({ max: 255 }),
  body('tags').optional().isArray()
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { title, description, subject, grade, file_type, is_premium = false, author, tags = [] } = req.body;
    const uploaded_by = req.user!.id;

    // In a real implementation, you would handle file upload here
    // For now, we'll create a placeholder entry
    const result = await dbQuery(`
      INSERT INTO documents (title, description, subject, grade, file_type, is_premium, author, tags, uploaded_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, title, description, subject, grade, file_type, is_premium, downloads, preview_image, tags, author, created_at, updated_at
    `, [title, description, subject, grade, file_type, is_premium, author, tags, uploaded_by]);

    const newDocument = result.rows[0];

    // Notify users about new document (non-blocking)
    if (newDocument && newDocument.id) {
      console.log('📧 Triggering new document notification for users');
      EmailService.notifyUsersAboutNewDocument(
        newDocument.id,
        title,
        subject,
        grade,
        description,
        is_premium
      ).catch(error => {
        console.error('❌ Failed to notify users about new document:', error);
        // Don't fail the request if notification fails
      });
    }

    res.status(201).json({
      success: true,
      data: newDocument,
      message: 'Document created successfully'
    } as ApiResponse<Document>);
  } catch (error) {
    console.error('Create document error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create document'
    } as ApiResponse);
  }
});

// Update document (Admin or Premium users)
router.put('/:id', [
  authenticateToken,
  body('title').optional().trim().isLength({ min: 1, max: 500 }),
  body('description').optional().trim().isLength({ max: 2000 }),
  body('subject').optional().isIn(['Mathematics', 'English', 'History', 'Chemistry', 'Physics', 'Biology']),
  body('grade').optional().isInt({ min: 9, max: 12 }),
  body('file_type').optional().isIn(['PDF', 'DOCX', 'PPT']),
  body('file_url').optional().isURL(),
  body('preview_image').optional().isURL(),
  body('is_premium').optional().isBoolean(),
  body('author').optional().trim().isLength({ max: 255 }),
  body('tags').optional().isArray()
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    // Check if user is admin, moderator, or premium
    if (req.user!.role !== 'ADMIN' && req.user!.role !== 'MODERATOR' && !req.user!.is_premium) {
      res.status(403).json({
        success: false,
        message: 'Admin, moderator, or premium subscription required to update documents'
      } as ApiResponse);
      return;
    }

    const { id } = req.params;
    const { title, description, subject, grade, file_type, file_url, preview_image, is_premium, author, tags } = req.body;

    // Build updates object
    const updates: any = {};
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (subject !== undefined) updates.subject = subject;
    if (grade !== undefined) updates.grade = grade;
    if (file_type !== undefined) updates.file_type = file_type;
    if (file_url !== undefined) updates.file_url = file_url;
    if (preview_image !== undefined) updates.preview_image = convertGoogleDriveUrl(preview_image);
    if (is_premium !== undefined) updates.is_premium = is_premium;
    if (author !== undefined) updates.author = author;
    if (tags !== undefined) updates.tags = tags;

    // Build update query dynamically (same approach as videos)
    const updateFields: string[] = [];
    const params: any[] = [];
    let paramCount = 1;

    Object.keys(updates).forEach(key => {
      if (updates[key] !== undefined) {
        updateFields.push(`${key} = $${paramCount++}`);
        params.push(updates[key]);
      }
    });

    if (updateFields.length === 0) {
      res.status(400).json({
        success: false,
        message: 'No valid fields to update'
      } as ApiResponse);
      return;
    }

    params.push(id);

    const result = await dbQuery(`
      UPDATE documents
      SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramCount}
      RETURNING id, title, description, subject, grade, file_type, file_size, file_url, is_premium,
                 downloads, preview_image, tags, author, created_at, updated_at
    `, params);

    if (result.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Document not found'
      } as ApiResponse);
      return;
    }

    res.json({
      success: true,
      data: result.rows[0],
      message: 'Document updated successfully'
    } as ApiResponse<Document>);
  } catch (error) {
    console.error('Update document error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update document'
    } as ApiResponse);
  }
});

// Delete document (Admin or Moderator only)
router.delete('/:id', authenticateToken, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    // Check if user is admin or moderator
    if (req.user!.role !== 'ADMIN' && req.user!.role !== 'MODERATOR') {
      res.status(403).json({
        success: false,
        message: 'Admin or moderator access required to delete documents'
      } as ApiResponse);
      return;
    }
    const { id } = req.params;

    const result = await dbQuery('DELETE FROM documents WHERE id = $1', [id]);

    if (result.rowCount === 0) {
      res.status(404).json({
        success: false,
        message: 'Document not found'
      } as ApiResponse);
      return;
    }

    res.json({
      success: true,
      message: 'Document deleted successfully'
    } as ApiResponse);
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete document'
    } as ApiResponse);
  }
});

export default router;
