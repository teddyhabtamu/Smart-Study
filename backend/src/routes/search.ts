import express from 'express';
import { query } from '../database/config';
import { ApiResponse, User } from '../types';

const router = express.Router();

// ---------------------------------------------------------------------------
// Full-text text matching with ILIKE fallback.
//
// Uses the weighted tsvector columns (search_vector + GIN index, see
// migration add_fulltext_search.sql) with ts_rank relevance ordering.
// Falls back to plain ILIKE when the term yields no lexemes (e.g. pure
// punctuation like "!!!"), so behavior never breaks on odd input.
//
// All call sites pass the search term as $1; extra filters append $2+.
// Returns { where, order, select, param } to splice into each query.
// ---------------------------------------------------------------------------
const textMatch = (
  vectorCol: string,
  ilikeCols: string[],
  term: string,
  tiebreakCol = 'created_at'
): { where: string; order: string; select: string; param: string } => {
  // Lexemes for an OR query: any single word can match, ts_rank puts the
  // best (multi-word, title-weighted) hits first. Stricter AND semantics
  // returned zero too often ("biology textbook" matched nothing even though
  // biology books exist).
  const lexemes = term.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  if (lexemes.length === 0) {
    const ors = ilikeCols.map((c) => `${c} ILIKE $1`).join(' OR ');
    return {
      where: `(${ors})`,
      order: `${tiebreakCol} DESC`,
      select: `0 AS rank`,
      param: `%${term}%`,
    };
  }
  const tsQuery = lexemes.join(' | ');
  return {
    where: `${vectorCol} @@ to_tsquery('english', $1)`,
    order: `ts_rank(${vectorCol}, to_tsquery('english', $1)) DESC, ${tiebreakCol} DESC`,
    select: `ts_rank(${vectorCol}, to_tsquery('english', $1)) AS rank`,
    param: tsQuery,
  };
};

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
    const offsetNum = Math.max(0, parseInt(offset as string) || 0); // Never negative (pg rejects OFFSET -n)

    // User info for premium filtering
    const userId = req.user?.id;
    const isPremium = req.user?.is_premium || false;

    const results: any = {
      documents: [],
      videos: [],
      forumPosts: [],
      total: 0
    };

    // Search documents (full-text ranked, ILIKE fallback for odd input)
    if (!type || type === 'documents' || type === 'all') {
      try {
        const match = textMatch(
          'search_vector',
          ['title', 'description', 'subject', 'author'],
          term
        );
        let docQuery = `
          SELECT id, title, description, subject, grade, file_type, is_premium,
                 preview_image, author, created_at, ${match.select}
          FROM documents
          WHERE ${match.where}
        `;

        const docParams = [match.param];

        // Add premium filter for non-premium users
        if (!isPremium) {
          docQuery += ` AND is_premium = false`;
        }

        docQuery += ` ORDER BY ${match.order} LIMIT $${docParams.length + 1} OFFSET $${docParams.length + 2}`;
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
          author: doc.author,
          created_at: doc.created_at,
          rank: Number(doc.rank) || 0
        }));
      } catch (error) {
        console.error('Document search error:', error);
        // Continue with other searches
      }
    }

    // Search videos (full-text ranked, ILIKE fallback for odd input)
    if (!type || type === 'videos' || type === 'all') {
      try {
        const match = textMatch(
          'search_vector',
          ['title', 'description', 'subject', 'instructor'],
          term
        );
        let vidQuery = `
          SELECT id, title, description, subject, grade, thumbnail, instructor, is_premium, created_at, ${match.select}
          FROM videos
          WHERE ${match.where}
        `;

        const vidParams = [match.param];

        // Add premium filter for non-premium users
        if (!isPremium) {
          vidQuery += ` AND is_premium = false`;
        }

        vidQuery += ` ORDER BY ${match.order} LIMIT $${vidParams.length + 1} OFFSET $${vidParams.length + 2}`;
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
          instructor: vid.instructor,
          created_at: vid.created_at,
          rank: Number(vid.rank) || 0
        }));
      } catch (error) {
        console.error('Video search error:', error);
        // Continue with other searches
      }
    }

    // Search forum posts (full-text ranked, ILIKE fallback for odd input)
    if (!type || type === 'forumPosts' || type === 'posts' || type === 'all') {
      try {
        const match = textMatch('fp.search_vector', ['fp.title', 'fp.content'], term, 'fp.created_at');
        const postQuery = `
          SELECT fp.id, fp.title, fp.subject, fp.grade, fp.created_at, fp.author_id,
                 u.name as author, u.role as author_role, COUNT(fc.id) as comment_count,
                 ${match.select}
          FROM forum_posts fp
          LEFT JOIN users u ON fp.author_id = u.id
          LEFT JOIN forum_comments fc ON fp.id = fc.post_id
          WHERE ${match.where}
          GROUP BY fp.id, u.name, u.role
          ORDER BY ${match.order}
          LIMIT $2 OFFSET $3
        `;

        const postResults = await query(postQuery, [match.param, limitNum, offsetNum]);
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
          rank: Number(post.rank) || 0
        }));
      } catch (error) {
        console.error('Forum post search error:', error);
        // Continue
      }
    }

    // Calculate totals
    results.total = results.documents.length + results.videos.length + results.forumPosts.length;

    // Sort merged results by relevance rank (then newest) — previously this
    // re-sorted everything by date, throwing away relevance entirely.
    const allResults = [
      ...results.documents,
      ...results.videos,
      ...results.forumPosts
    ].sort((a, b) => (b.rank || 0) - (a.rank || 0) || new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

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
    const limitNum = Math.min(parseInt(limit as string) || 20, 100);
    const offsetNum = Math.max(0, parseInt(offset as string) || 0); // Never negative (pg rejects OFFSET -n)
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
        const match = textMatch('search_vector', ['title', 'description', 'subject', 'author'], term);
        const baseConditions = [match.where];
        const params = [match.param];

        // Add premium filter for non-premium users
        if (!isPremium) {
          baseConditions.push(`is_premium = false`);
        }

        const whereClause = buildWhereClause(baseConditions, params, subjects, grades);

        const docQuery = `
          SELECT id, title, description, subject, grade, file_type, is_premium,
                 preview_image, author, created_at, ${match.select}
          FROM documents
          WHERE ${baseConditions.join(' AND ')}${whereClause}
          ORDER BY ${match.order}
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
          created_at: doc.created_at,
          rank: Number(doc.rank) || 0
        }));
      } catch (error) {
        console.error('Advanced document search error:', error);
      }
    }

    // Search videos
    if (types.includes('videos')) {
      try {
        const match = textMatch('search_vector', ['title', 'description', 'subject', 'instructor'], term);
        const baseConditions = [match.where];
        const params = [match.param];

        // Add premium filter for non-premium users
        if (!isPremium) {
          baseConditions.push(`is_premium = false`);
        }

        const whereClause = buildWhereClause(baseConditions, params, subjects, grades);

        const vidQuery = `
          SELECT id, title, description, subject, grade, thumbnail, instructor, is_premium, created_at, ${match.select}
          FROM videos
          WHERE ${baseConditions.join(' AND ')}${whereClause}
          ORDER BY ${match.order}
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
          created_at: vid.created_at,
          rank: Number(vid.rank) || 0
        }));
      } catch (error) {
        console.error('Advanced video search error:', error);
      }
    }

    // Search forum posts
    if (types.includes('forumPosts')) {
      try {
        const match = textMatch('fp.search_vector', ['fp.title', 'fp.content'], term, 'fp.created_at');
        const baseConditions = [match.where];
        const params = [match.param];

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
                 u.name as author, u.role as author_role, COUNT(fc.id) as comment_count,
                 ${match.select}
          FROM forum_posts fp
          LEFT JOIN users u ON fp.author_id = u.id
          LEFT JOIN forum_comments fc ON fp.id = fc.post_id
          WHERE ${baseConditions.join(' AND ')}
          GROUP BY fp.id, u.name, u.role
          ORDER BY ${match.order}
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
          created_at: post.created_at,
          rank: Number(post.rank) || 0
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
        allResults.sort((a, b) => (b.rank || 0) - (a.rank || 0) || new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
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
    const isPremiumSuggester = req.user?.is_premium || false;

    // Get suggestions from different content types. Premium titles are
    // hidden from guests/free users, same as the search endpoints — titles
    // alone would otherwise leak the premium catalog.
    const suggestions: string[] = [];
    const premiumClause = isPremiumSuggester ? '' : ' AND is_premium = false';

    try {
      // Document titles
      const docQuery = `
        SELECT DISTINCT title
        FROM documents
        WHERE title ILIKE $1${premiumClause}
        ORDER BY title
        LIMIT $2
      `;
      const docResults = await query(docQuery, [`${term}%`, limitNum]);
      suggestions.push(...docResults.rows.map(r => r.title));

      // Video titles
      const vidQuery = `
        SELECT DISTINCT title
        FROM videos
        WHERE title ILIKE $1${premiumClause}
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
