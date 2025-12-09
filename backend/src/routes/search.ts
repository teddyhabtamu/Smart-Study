import express from 'express';
import { query } from '../database/config';
import { ApiResponse, User } from '../types';

const router = express.Router();

// Unified search endpoint
router.get('/', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { q: searchTerm, type, limit = 10, offset = 0 } = req.query;

    if (!searchTerm || typeof searchTerm !== 'string' || searchTerm.trim().length < 2) {
      res.status(400).json({
        success: false,
        message: 'Search term must be at least 2 characters long'
      } as ApiResponse);
      return;
    }

    const term = searchTerm.trim();
    const limitNum = Math.min(parseInt(limit as string) || 10, 50); // Max 50 results per type
    const offsetNum = parseInt(offset as string) || 0;

    // User info for premium filtering
    const userId = req.user?.id;
    const isPremium = req.user?.is_premium || false;

    const results: any = {
      documents: [],
      videos: [],
      forumPosts: [],
      total: 0
    };

    // Search documents
    if (!type || type === 'documents' || type === 'all') {
      try {
        let docQuery = `
          SELECT id, title, description, subject, grade, file_type, is_premium,
                 preview_image, author, created_at
          FROM documents
          WHERE (title ILIKE $1 OR description ILIKE $1 OR subject ILIKE $1 OR author ILIKE $1)
        `;

        const docParams = [`%${term}%`];

        // Add premium filter for non-premium users
        if (!isPremium) {
          docQuery += ` AND is_premium = false`;
        }

        docQuery += ` ORDER BY created_at DESC LIMIT $${docParams.length + 1} OFFSET $${docParams.length + 2}`;
        docParams.push(limitNum.toString(), offsetNum.toString());

        const docResults = await query(docQuery, docParams);
        results.documents = docResults.rows.map(doc => ({
          id: doc.id,
          title: doc.title,
          subject: doc.subject,
          grade: doc.grade,
          type: 'document',
          url: `/document/${doc.id}`,
          isPremium: doc.is_premium,
          previewImage: doc.preview_image,
          author: doc.author
        }));
      } catch (error) {
        console.error('Document search error:', error);
        // Continue with other searches
      }
    }

    // Search videos
    if (!type || type === 'videos' || type === 'all') {
      try {
        let vidQuery = `
          SELECT id, title, description, subject, grade, thumbnail, instructor, is_premium, created_at
          FROM videos
          WHERE (title ILIKE $1 OR description ILIKE $1 OR subject ILIKE $1 OR instructor ILIKE $1)
        `;

        const vidParams = [`%${term}%`];

        // Add premium filter for non-premium users
        if (!isPremium) {
          vidQuery += ` AND is_premium = false`;
        }

        vidQuery += ` ORDER BY created_at DESC LIMIT $${vidParams.length + 1} OFFSET $${vidParams.length + 2}`;
        vidParams.push(limitNum.toString(), offsetNum.toString());

        const vidResults = await query(vidQuery, vidParams);
        results.videos = vidResults.rows.map(vid => ({
          id: vid.id,
          title: vid.title,
          subject: vid.subject,
          grade: vid.grade,
          type: 'video',
          url: `/video/${vid.id}`,
          isPremium: vid.is_premium,
          thumbnail: vid.thumbnail,
          instructor: vid.instructor
        }));
      } catch (error) {
        console.error('Video search error:', error);
        // Continue with other searches
      }
    }

    // Search forum posts
    if (!type || type === 'forumPosts' || type === 'posts' || type === 'all') {
      try {
        const postQuery = `
          SELECT fp.id, fp.title, fp.subject, fp.grade, fp.created_at, fp.author_id,
                 u.name as author, u.role as author_role, COUNT(fc.id) as comment_count
          FROM forum_posts fp
          LEFT JOIN users u ON fp.author_id = u.id
          LEFT JOIN forum_comments fc ON fp.id = fc.post_id
          WHERE fp.title ILIKE $1 OR fp.content ILIKE $1
          GROUP BY fp.id, u.name, u.role
          ORDER BY fp.created_at DESC
          LIMIT $2 OFFSET $3
        `;

        const postResults = await query(postQuery, [`%${term}%`, limitNum, offsetNum]);
        results.forumPosts = postResults.rows.map(post => ({
          id: post.id,
          title: post.title,
          subject: post.subject,
          grade: post.grade,
          type: 'post',
          url: `/community/${post.id}`,
          author: post.author,
          authorRole: post.author_role,
          commentCount: parseInt(post.comment_count) || 0
        }));
      } catch (error) {
        console.error('Forum post search error:', error);
        // Continue
      }
    }

    // Calculate totals
    results.total = results.documents.length + results.videos.length + results.forumPosts.length;

    // Sort all results by relevance (created_at for now, could be enhanced with scoring)
    const allResults = [
      ...results.documents,
      ...results.videos,
      ...results.forumPosts
    ].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

    res.json({
      success: true,
      data: {
        results: allResults,
        breakdown: {
          documents: results.documents.length,
          videos: results.videos.length,
          forumPosts: results.forumPosts.length
        },
        total: results.total,
        hasMore: allResults.length >= limitNum,
        searchTerm: term
      }
    } as ApiResponse);

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({
      success: false,
      message: 'Search failed'
    } as ApiResponse);
  }
});

// Advanced search with filters
router.post('/advanced', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const {
      query: searchQuery,
      types = ['documents', 'videos', 'forumPosts'],
      subjects = [],
      grades = [],
      limit = 20,
      offset = 0,
      sortBy = 'relevance'
    } = req.body;

    if (!searchQuery || typeof searchQuery !== 'string' || searchQuery.trim().length < 2) {
      res.status(400).json({
        success: false,
        message: 'Search query must be at least 2 characters long'
      } as ApiResponse);
      return;
    }

    const term = searchQuery.trim();
    const limitNum = Math.min(parseInt(limit) || 20, 100);
    const offsetNum = parseInt(offset) || 0;
    const isPremium = req.user?.is_premium || false;

    const results: any = {
      documents: [],
      videos: [],
      forumPosts: [],
      total: 0
    };

    // Build WHERE conditions
    const buildWhereClause = (baseConditions: string[], params: any[], subjectFilter: string[], gradeFilter: number[]) => {
      if (subjectFilter.length > 0) {
        baseConditions.push(`subject = ANY($${params.length + 1})`);
        params.push(subjectFilter);
      }
      if (gradeFilter.length > 0) {
        baseConditions.push(`grade = ANY($${params.length + 1})`);
        params.push(gradeFilter);
      }
      return baseConditions.length > 0 ? ` AND ${baseConditions.join(' AND ')}` : '';
    };

    // Search documents
    if (types.includes('documents')) {
      try {
        const baseConditions = [`(title ILIKE $1 OR description ILIKE $1 OR subject ILIKE $1 OR author ILIKE $1)`];
        const params = [`%${term}%`];

        // Add premium filter for non-premium users
        if (!isPremium) {
          baseConditions.push(`is_premium = false`);
        }

        const whereClause = buildWhereClause(baseConditions, params, subjects, grades);

        const docQuery = `
          SELECT id, title, description, subject, grade, file_type, is_premium,
                 preview_image, author, created_at
          FROM documents
          WHERE ${baseConditions.join(' AND ')}${whereClause}
          ORDER BY created_at DESC
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `;

        params.push(limitNum.toString(), offsetNum.toString());

        const docResults = await query(docQuery, params);
        results.documents = docResults.rows.map(doc => ({
          id: doc.id,
          title: doc.title,
          subject: doc.subject,
          grade: doc.grade,
          type: 'document',
          url: `/document/${doc.id}`,
          isPremium: doc.is_premium,
          previewImage: doc.preview_image,
          author: doc.author,
          created_at: doc.created_at
        }));
      } catch (error) {
        console.error('Advanced document search error:', error);
      }
    }

    // Search videos
    if (types.includes('videos')) {
      try {
        const baseConditions = [`(title ILIKE $1 OR description ILIKE $1 OR subject ILIKE $1 OR instructor ILIKE $1)`];
        const params = [`%${term}%`];

        // Add premium filter for non-premium users
        if (!isPremium) {
          baseConditions.push(`is_premium = false`);
        }

        const whereClause = buildWhereClause(baseConditions, params, subjects, grades);

        const vidQuery = `
          SELECT id, title, description, subject, grade, thumbnail, instructor, is_premium, created_at
          FROM videos
          WHERE ${baseConditions.join(' AND ')}${whereClause}
          ORDER BY created_at DESC
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `;

        params.push(limitNum.toString(), offsetNum.toString());

        const vidResults = await query(vidQuery, params);
        results.videos = vidResults.rows.map(vid => ({
          id: vid.id,
          title: vid.title,
          subject: vid.subject,
          grade: vid.grade,
          type: 'video',
          url: `/video/${vid.id}`,
          isPremium: vid.is_premium,
          thumbnail: vid.thumbnail,
          instructor: vid.instructor,
          created_at: vid.created_at
        }));
      } catch (error) {
        console.error('Advanced video search error:', error);
      }
    }

    // Search forum posts
    if (types.includes('forumPosts')) {
      try {
        const baseConditions = [`(fp.title ILIKE $1 OR fp.content ILIKE $1)`];
        const params = [`%${term}%`];

        let whereClause = '';
        if (subjects.length > 0) {
          baseConditions.push(`fp.subject = ANY($${params.length + 1})`);
          params.push(subjects);
        }
        if (grades.length > 0) {
          baseConditions.push(`fp.grade = ANY($${params.length + 1})`);
          params.push(grades);
        }

        const postQuery = `
          SELECT fp.id, fp.title, fp.subject, fp.grade, fp.created_at, fp.author_id,
                 u.name as author, u.role as author_role, COUNT(fc.id) as comment_count
          FROM forum_posts fp
          LEFT JOIN users u ON fp.author_id = u.id
          LEFT JOIN forum_comments fc ON fp.id = fc.post_id
          WHERE ${baseConditions.join(' AND ')}
          GROUP BY fp.id, u.name, u.role
          ORDER BY fp.created_at DESC
          LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `;

        params.push(limitNum.toString(), offsetNum.toString());

        const postResults = await query(postQuery, params);
        results.forumPosts = postResults.rows.map(post => ({
          id: post.id,
          title: post.title,
          subject: post.subject,
          grade: post.grade,
          type: 'post',
          url: `/community/${post.id}`,
          author: post.author,
          authorRole: post.author_role,
          commentCount: parseInt(post.comment_count) || 0,
          created_at: post.created_at
        }));
      } catch (error) {
        console.error('Advanced forum post search error:', error);
      }
    }

    // Sort results based on sortBy parameter
    let allResults = [
      ...results.documents,
      ...results.videos,
      ...results.forumPosts
    ];

    switch (sortBy) {
      case 'newest':
        allResults.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
        break;
      case 'oldest':
        allResults.sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
        break;
      case 'title':
        allResults.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'relevance':
      default:
        // For now, sort by creation date (could be enhanced with scoring algorithm)
        allResults.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
        break;
    }

    results.total = allResults.length;

    res.json({
      success: true,
      data: {
        results: allResults.slice(0, limitNum),
        breakdown: {
          documents: results.documents.length,
          videos: results.videos.length,
          forumPosts: results.forumPosts.length
        },
        total: results.total,
        hasMore: allResults.length > limitNum,
        searchQuery: term,
        filters: { types, subjects, grades, sortBy }
      }
    } as ApiResponse);

  } catch (error) {
    console.error('Advanced search error:', error);
    res.status(500).json({
      success: false,
      message: 'Advanced search failed'
    } as ApiResponse);
  }
});

// Autocomplete suggestions
router.get('/suggest', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { q: prefix, limit = 5 } = req.query;

    if (!prefix || typeof prefix !== 'string' || prefix.trim().length < 1) {
      res.json({
        success: true,
        data: { suggestions: [] }
      } as ApiResponse);
      return;
    }

    const term = prefix.trim();
    const limitNum = Math.min(parseInt(limit as string) || 5, 20);

    // Get suggestions from different content types
    const suggestions: string[] = [];

    try {
      // Document titles
      const docQuery = `
        SELECT DISTINCT title
        FROM documents
        WHERE title ILIKE $1
        ORDER BY title
        LIMIT $2
      `;
      const docResults = await query(docQuery, [`${term}%`, limitNum]);
      suggestions.push(...docResults.rows.map(r => r.title));

      // Video titles
      const vidQuery = `
        SELECT DISTINCT title
        FROM videos
        WHERE title ILIKE $1
        ORDER BY title
        LIMIT $2
      `;
      const vidResults = await query(vidQuery, [`${term}%`, limitNum]);
      suggestions.push(...vidResults.rows.map(r => r.title));

      // Forum post titles
      const postQuery = `
        SELECT DISTINCT title
        FROM forum_posts
        WHERE title ILIKE $1
        ORDER BY title
        LIMIT $2
      `;
      const postResults = await query(postQuery, [`${term}%`, limitNum]);
      suggestions.push(...postResults.rows.map(r => r.title));

    } catch (error) {
      console.error('Suggestions error:', error);
    }

    // Remove duplicates and limit
    const uniqueSuggestions = [...new Set(suggestions)].slice(0, limitNum);

    res.json({
      success: true,
      data: {
        suggestions: uniqueSuggestions,
        count: uniqueSuggestions.length
      }
    } as ApiResponse);

  } catch (error) {
    console.error('Suggestions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get suggestions'
    } as ApiResponse);
  }
});

export default router;
