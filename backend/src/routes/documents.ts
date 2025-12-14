import express from 'express';
import { body, query } from 'express-validator';
import { query as dbQuery, db, dbAdmin, supabaseAdmin } from '../database/config';
import { authenticateToken, requirePremium, validateRequest, optionalAuth } from '../middleware/auth';
import { ApiResponse, Document, User } from '../types';
import { EmailService } from '../services/emailService';
import { NotificationService } from '../services/notificationService';
import axios from 'axios';

// Helper function to convert Google Drive sharing links to direct URLs
const convertGoogleDriveUrl = (url: string): string => {
  if (!url || !url.includes('drive.google.com')) {
    return url;
  }

  // If it's already converted to uc?export=view format, return as is
  if (url.includes('uc?export=view&id=') || url.includes('uc?export=download&id=')) {
    return url;
  }

  // Extract file ID from various Google Drive URL formats:
  // - https://drive.google.com/file/d/FILE_ID/view?usp=sharing
  // - https://drive.google.com/file/d/FILE_ID/view
  // - https://drive.google.com/open?id=FILE_ID
  // - https://drive.google.com/d/FILE_ID/
  // - https://drive.google.com/uc?id=FILE_ID
  let fileId: string | null = null;
  
  // Try different patterns (order matters - most specific first)
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,           // /file/d/FILE_ID (handles /view, /view?usp=sharing, etc.)
    /\/d\/([a-zA-Z0-9_-]+)/,                  // /d/FILE_ID
    /[?&]id=([a-zA-Z0-9_-]+)/,                // ?id=FILE_ID or &id=FILE_ID
    /\/uc\?id=([a-zA-Z0-9_-]+)/               // /uc?id=FILE_ID
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      fileId = match[1];
      break;
    }
  }

  if (fileId) {
    // Convert to direct image URL that works in <img> tags
    // This format works for publicly shared images
    // Using export=view for images (lighter than download)
    return `https://drive.google.com/uc?export=view&id=${fileId}`;
  }

  // If we can't extract file ID, return original URL (might be a different format)
  return url;
};

const router = express.Router();

// Get all documents with optional filtering
router.get('/', optionalAuth, [
  query('subject').optional().isString(),
  query('grade').optional().custom((value) => {
    if (value === undefined || value === null) return true;
    const grade = parseInt(value);
    if (grade === 0 || (grade >= 9 && grade <= 12)) {
      return true;
    }
    throw new Error('Grade must be 0 (General), 9, 10, 11, or 12');
  }),
  query('search').optional().isString(),
  query('bookmarked').optional().isBoolean(),
  query('tag').optional().isString(),
  query('excludeTag').optional().isString(),
  query('sort').optional().isIn(['newest', 'popular', 'title']).withMessage('Sort must be newest, popular, or title'),
  query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
  query('offset').optional().isInt({ min: 0 }).toInt()
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const subject = req.query.subject as string;
    const grade = req.query.grade as string;
    const search = req.query.search as string;
    const bookmarked = req.query.bookmarked as string;
    const tag = req.query.tag as string;
    const excludeTag = req.query.excludeTag as string;
    const sort = req.query.sort as string || 'newest';
    const limit = Number(req.query.limit) || 20;
    const offset = Number(req.query.offset) || 0;

    // User info is optional (for authenticated users)
    const userId = req.user?.id;
    const isPremium = req.user?.is_premium || false;

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
    let orderByField = 'created_at';
    let orderByAsc = false;
    if (sort === 'popular') {
      orderByField = 'downloads';
      orderByAsc = false;
    } else if (sort === 'title') {
      orderByField = 'title';
      orderByAsc = true;
    }

    // Use Supabase directly for better search support
    // Build all filter conditions
    const andConditions: string[] = [];
    
    if (!isPremium) {
      andConditions.push('is_premium.eq.false');
    }

    if (subject) {
      andConditions.push(`subject.eq.${subject}`);
    }

    if (grade) {
      andConditions.push(`grade.eq.${parseInt(grade)}`);
    }

    // Filter by tag - Supabase uses cs (contains) for array contains
    if (tag) {
      andConditions.push(`tags.cs.{"${tag}"}`);
    }

    // Exclude documents with specific tag - use ncs (not contains)
    if (excludeTag) {
      andConditions.push(`tags.ncs.{"${excludeTag}"}`);
    }

    // Handle bookmarked filter
    if (bookmarked === 'true') {
      if (bookmarkedDocIds.length === 0) {
        // No bookmarks, return empty result
        andConditions.push('id.eq.00000000-0000-0000-0000-000000000000');
      } else {
        // Use in operator for multiple IDs
        const ids = bookmarkedDocIds.join(',');
        andConditions.push(`id.in.(${ids})`);
      }
    }

    // Build the query
    let query = supabaseAdmin
      .from('documents')
      .select('id, title, description, subject, grade, file_type, file_size, file_url, is_premium, downloads, preview_image, tags, author, created_at, updated_at', { count: 'exact' });

    // Apply AND filters individually (Supabase combines these with AND)
    if (!isPremium) {
      query = query.eq('is_premium', false);
    }
    if (subject) {
      query = query.eq('subject', subject);
    }
    if (grade) {
      query = query.eq('grade', parseInt(grade));
    }
    if (tag) {
      query = query.filter('tags', 'cs', `{"${tag}"}`);
    }
    if (excludeTag) {
      query = query.not('tags', 'cs', `{"${excludeTag}"}`);
    }
    if (bookmarked === 'true') {
      if (bookmarkedDocIds.length === 0) {
        query = query.eq('id', '00000000-0000-0000-0000-000000000000');
      } else {
        query = query.in('id', bookmarkedDocIds);
      }
    }

    // Apply search filter - Supabase should combine this with previous AND filters
    // The .or() method when chained after .eq() should create: (AND filters) AND (search OR)
    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%,author.ilike.%${search}%`);
    }

    // Apply sorting
    query = query.order(orderByField, { ascending: orderByAsc });

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    // Execute query
    const { data: documentsData, error: documentsError, count } = await query;

    if (documentsError) {
      console.error('Error fetching documents:', documentsError);
      res.status(500).json({
        success: false,
        message: 'Failed to get documents'
      } as ApiResponse);
      return;
    }

    let paginatedDocuments = (documentsData || []).map((doc: any) => ({
      id: doc.id,
      title: doc.title,
      description: doc.description,
      subject: doc.subject,
      grade: doc.grade,
      file_type: doc.file_type,
      file_size: doc.file_size,
      file_url: doc.file_url,
      is_premium: doc.is_premium,
      downloads: doc.downloads || 0,
      preview_image: doc.preview_image,
      tags: doc.tags || [],
      author: doc.author,
      created_at: doc.created_at,
      updated_at: doc.updated_at
    }));

    const total = count || 0;

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

// Proxy endpoint for Google Drive images (bypasses CORS)
// IMPORTANT: This must come BEFORE /:id route to avoid route conflicts
router.get('/image-proxy/:fileId', optionalAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { fileId } = req.params;
    console.log('Image proxy request received for fileId:', fileId);
    
    if (!fileId || fileId.length < 5) {
      res.status(400).json({
        success: false,
        message: 'Invalid file ID'
      } as ApiResponse);
      return;
    }

    // Try multiple Google Drive URL formats
    const urls = [
      `https://drive.google.com/uc?export=view&id=${fileId}`,
      `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`,
      `https://drive.google.com/thumbnail?id=${fileId}&sz=w500`
    ];

    let imageData: Buffer | null = null;
    let contentType = 'image/jpeg';

    // Try each URL until one works
    for (const url of urls) {
      try {
        const response = await axios.get(url, {
          responseType: 'arraybuffer',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          timeout: 10000 // 10 second timeout
        });

        if (response.status === 200 && response.data) {
          imageData = Buffer.from(response.data);
          contentType = response.headers['content-type'] || 'image/jpeg';
          break;
        }
      } catch (error: any) {
        // Try next URL if this one fails
        if (error.response?.status === 403 || error.response?.status === 404) {
          continue;
        }
        // For other errors, also try next URL
        continue;
      }
    }

    if (!imageData) {
      res.status(404).json({
        success: false,
        message: 'Image not found or not publicly accessible. Please ensure the file is publicly shared on Google Drive.'
      } as ApiResponse);
      return;
    }

    // Set appropriate headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // Cache for 1 year
    res.setHeader('Access-Control-Allow-Origin', '*');
    
    // Send the image
    res.send(imageData);
  } catch (error) {
    console.error('Image proxy error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch image'
    } as ApiResponse);
  }
});

// Get document by ID
router.get('/:id', optionalAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    const isPremium = req.user?.is_premium || false;

    // Use Supabase directly to ensure correct ID matching
    const { data: documents, error: docError } = await supabaseAdmin
      .from('documents')
      .select('id, title, description, subject, grade, file_type, file_size, file_url, is_premium, downloads, preview_image, tags, author, created_at, updated_at')
      .eq('id', id)
      .limit(1);

    if (docError) {
      console.error('Error fetching document:', docError);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch document'
      } as ApiResponse);
      return;
    }

    if (!documents || documents.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Document not found'
      } as ApiResponse);
      return;
    }

    const document = documents[0];
    if (!document) {
      res.status(404).json({
        success: false,
        message: 'Document not found'
      } as ApiResponse);
      return;
    }

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
        // Check if view already exists using Supabase directly
        const { data: existingViews, error: findError } = await supabaseAdmin
          .from('document_views')
          .select('id')
          .eq('user_id', userId)
          .eq('document_id', id)
          .limit(1);
        
        if (findError) throw findError;
        
        if (!existingViews || existingViews.length === 0) {
          // Insert new view
          const { error: insertError } = await supabaseAdmin
            .from('document_views')
            .insert({
              user_id: userId,
              document_id: id,
              viewed_at: new Date().toISOString()
            });
          
          if (insertError) throw insertError;
        } else {
          // Update view timestamp to track latest view (for weekly digest, we count unique documents)
          const existingView = existingViews[0];
          if (existingView && existingView.id) {
            const { error: updateError } = await supabaseAdmin
              .from('document_views')
              .update({ viewed_at: new Date().toISOString() })
              .eq('id', existingView.id);
            
            if (updateError) throw updateError;
          }
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
  body('subject').isIn(['Mathematics', 'English', 'History', 'Chemistry', 'Physics', 'Biology', 'Aptitude']).withMessage('Valid subject required'),
  body('grade').custom((value) => {
    const grade = parseInt(value);
    if (grade === 0 || (grade >= 9 && grade <= 12)) {
      return true;
    }
    throw new Error('Grade must be 0 (General), 9, 10, 11, or 12');
  }),
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

    // Notify users about new document (in-app notification only, no emails)
    if (newDocument && newDocument.id) {
      console.log('🔔 Triggering new document notification for users (in-app only)');
      NotificationService.notifyUsersAboutNewResources(is_premium).catch(error => {
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
  body('subject').optional().isIn(['Mathematics', 'English', 'History', 'Chemistry', 'Physics', 'Biology', 'Aptitude']),
  body('grade').optional().custom((value) => {
    if (value === undefined || value === null) return true;
    const grade = parseInt(value);
    if (grade === 0 || (grade >= 9 && grade <= 12)) {
      return true;
    }
    throw new Error('Grade must be 0 (General), 9, 10, 11, or 12');
  }),
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
    if (preview_image !== undefined) {
      // Convert Google Drive URL to direct image URL if needed
      updates.preview_image = preview_image ? convertGoogleDriveUrl(preview_image) : null;
    }
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
