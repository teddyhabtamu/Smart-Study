import express from 'express';
import { body, query as queryValidator } from 'express-validator';
import { db, dbAdmin, query } from '../database/config';
import { authenticateToken, validateRequest } from '../middleware/auth';
import { ApiResponse, ForumPost, ForumComment, User } from '../types';
import { NotificationService } from '../services/notificationService';
import { EmailService } from '../services/emailService';

const router = express.Router();

// Test route
router.get('/test', (req: express.Request, res: express.Response): void => {
  res.json({ success: true, message: 'Forum API is working' });
});

// Get all forum posts with optional filtering
router.get('/posts', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { subject, grade, search, limit = 20, offset = 0 } = req.query;

    // Get posts from database
    let posts = await dbAdmin.get('forum_posts');

    // Apply filters
    if (subject) {
      posts = posts.filter(p => p.subject === subject);
    }

    if (grade) {
      posts = posts.filter(p => p.grade === parseInt(grade as string));
    }

    if (search) {
      const searchTerm = search.toString().toLowerCase();
      posts = posts.filter(p =>
        p.title.toLowerCase().includes(searchTerm) ||
        p.content.toLowerCase().includes(searchTerm)
      );
    }

    // Sort by creation date (newest first)
    posts.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // Apply pagination
    const startIndex = parseInt(offset as string) || 0;
    const limitNum = parseInt(limit as string) || 20;
    const paginatedPosts = posts.slice(startIndex, startIndex + limitNum);

    // Add author info and comment count
    const users = await dbAdmin.get('users');
    const comments = await dbAdmin.get('forum_comments');

    const enrichedPosts = paginatedPosts.map(post => {
      const author = users.find(u => u.id === post.author_id);
      const commentCount = comments.filter(c => c.post_id === post.id).length;

      return {
        id: post.id,
        title: post.title,
        content: post.content,
        subject: post.subject,
        grade: post.grade,
        votes: post.votes || 0,
        views: post.views || 0,
        tags: post.tags || [],
        is_solved: post.is_solved || false,
        is_edited: post.is_edited || false,
        aiAnswer: post.ai_answer, // Convert snake_case to camelCase for frontend
        created_at: post.created_at,
        updated_at: post.updated_at,
        author: author?.name,
        author_role: author?.role,
        author_avatar: author?.avatar,
        comment_count: commentCount
      };
    });

    res.json({
      success: true,
      data: {
        posts: enrichedPosts,
        pagination: {
          total: posts.length,
          limit: limitNum,
          offset: startIndex,
          hasMore: startIndex + limitNum < posts.length
        }
      }
    } as ApiResponse);
  } catch (error) {
    console.error('Get forum posts error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get forum posts'
    } as ApiResponse);
  }
});

// Get single forum post with comments
router.get('/posts/:id', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.id; // May be undefined for non-authenticated users

    // Get post
    const posts = await dbAdmin.get('forum_posts');
    const post = posts.find(p => p.id === id);

    if (!post) {
      res.status(404).json({
        success: false,
        message: 'Forum post not found'
      } as ApiResponse);
      return;
    }

    // Track unique views for authenticated users
    if (userId) {
      const existingView = await query(
        'SELECT id FROM forum_views WHERE user_id = $1 AND post_id = $2',
        [userId, id]
      );

      if (existingView.rows.length === 0) {
        // First time viewing this post - record the view and increment count
        await query('INSERT INTO forum_views (user_id, post_id) VALUES ($1, $2)', [userId, id]);
        await dbAdmin.update('forum_posts', id, { views: (post.views || 0) + 1 });
      }
    } else {
      // For non-authenticated users, still increment views but don't track uniqueness
      await dbAdmin.update('forum_posts', id, { views: (post.views || 0) + 1 });
    }

    // Get author info
    const users = await dbAdmin.get('users');
    const author = users.find(u => u.id === post.author_id);

    // Get comments
    const comments = await dbAdmin.get('forum_comments');
    const postComments = comments.filter(c => c.post_id === id);

    // Enrich comments with author info
    const enrichedComments = postComments.map(comment => {
      const commentAuthor = users.find(u => u.id === comment.author_id);
      return {
        id: comment.id,
        content: comment.content,
        votes: comment.votes || 0,
        is_accepted: comment.is_accepted || false,
        is_edited: comment.is_edited || false,
        created_at: comment.created_at,
        updated_at: comment.updated_at,
        author: commentAuthor?.name,
        author_role: commentAuthor?.role,
        author_avatar: commentAuthor?.avatar
      };
    });

    // Sort comments by votes desc, then by creation date
    enrichedComments.sort((a, b) => {
      if (b.votes !== a.votes) return b.votes - a.votes;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    // Add voting information for authenticated users
    let userPostVote = null;
    let userCommentVotes: { [commentId: string]: number } = {};

    if (userId) {
      // Check if user voted on this post
      const postVote = await query(
        'SELECT vote_value FROM forum_votes WHERE user_id = $1 AND target_type = $2 AND target_id = $3',
        [userId, 'post', id]
      );
      if (postVote.rows.length > 0) {
        userPostVote = postVote.rows[0].vote_value;
      }

      // Check votes on comments
      for (const comment of enrichedComments) {
        const commentVote = await query(
          'SELECT vote_value FROM forum_votes WHERE user_id = $1 AND target_type = $2 AND target_id = $3',
          [userId, 'comment', comment.id]
        );
        if (commentVote.rows.length > 0) {
          userCommentVotes[comment.id] = commentVote.rows[0].vote_value;
        }
      }
    }

    const enrichedPost = {
      id: post.id,
      title: post.title,
      content: post.content,
      subject: post.subject,
      grade: post.grade,
      votes: post.votes || 0,
      views: (post.views || 0) + 1, // Include the view we just added
      tags: post.tags || [],
      is_solved: post.is_solved || false,
      is_edited: post.is_edited || false,
      aiAnswer: post.ai_answer, // Convert snake_case to camelCase for frontend
      created_at: post.created_at,
      updated_at: post.updated_at,
      author: author?.name,
      author_role: author?.role,
      author_avatar: author?.avatar,
      userVote: userPostVote, // Add user's vote on this post
      userCommentVotes: userCommentVotes // Add user's votes on comments
    };

    res.json({
      success: true,
      data: {
        ...enrichedPost,
        comments: enrichedComments
      }
    } as ApiResponse);
  } catch (error) {
    console.error('Get forum post error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get forum post'
    } as ApiResponse);
  }
});

// Create forum post
router.post('/posts', authenticateToken, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    console.log('Creating forum post, body:', req.body);
    const { title, content, subject, grade, tags = [] } = req.body;
    const author_id = req.user!.id;

    const postData = {
      title,
      content,
      author_id,
      subject,
      grade,
      tags,
      votes: 0,
      views: 0,
      is_solved: false,
      is_edited: false
    };

    const inserted = await dbAdmin.insert('forum_posts', postData);
    console.log('Inserted post:', inserted);

    res.status(201).json({
      success: true,
      data: inserted,
      message: 'Forum post created successfully'
    } as ApiResponse<ForumPost>);
  } catch (error) {
    console.error('Create forum post error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create forum post'
    } as ApiResponse);
  }
});

// Update forum post (only by author)
router.put('/posts/:id', [
  authenticateToken,
  body('title').optional().trim().isLength({ min: 5, max: 500 }),
  body('content').optional().trim().isLength({ min: 10 }),
  body('tags').optional().isArray()
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { title, content, tags } = req.body;
    const userId = req.user!.id;

    // Check if user is the author
    const posts = await dbAdmin.get('forum_posts');
    const postCheck = posts.filter(p => p.id === id);

    if (postCheck.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Forum post not found'
      } as ApiResponse);
      return;
    }

    if (postCheck[0].author_id !== userId) {
      res.status(403).json({
        success: false,
        message: 'You can only edit your own posts'
      } as ApiResponse);
      return;
    }

    // Build update object
    const updates: any = { is_edited: true };
    if (title !== undefined) updates.title = title;
    if (content !== undefined) updates.content = content;
    if (tags !== undefined) updates.tags = tags;
    // Handle aiAnswer field (camelCase from frontend -> snake_case in DB)
    if (req.body.aiAnswer !== undefined) updates.ai_answer = req.body.aiAnswer;
    if (req.body.ai_answer !== undefined) updates.ai_answer = req.body.ai_answer;
    // Handle isSolved field
    if (req.body.isSolved !== undefined) updates.is_solved = req.body.isSolved;
    if (req.body.is_solved !== undefined) updates.is_solved = req.body.is_solved;
    // Handle votes field
    if (req.body.votes !== undefined) updates.votes = req.body.votes;
    // Handle comments field
    if (req.body.comments !== undefined) {
      // Comments are stored separately, so we don't update them here
      // This is handled by the comments endpoints
    }

    const result = await dbAdmin.update('forum_posts', id, updates);

    if (!result) {
      res.status(404).json({
        success: false,
        message: 'Forum post not found'
      } as ApiResponse);
      return;
    }

    res.json({
      success: true,
      data: result,
      message: 'Forum post updated successfully'
    } as ApiResponse<ForumPost>);
  } catch (error) {
    console.error('Update forum post error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update forum post'
    } as ApiResponse);
  }
});

// Vote on forum post
router.post('/posts/:id/vote', authenticateToken, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { vote } = req.body;
    const userId = req.user!.id;

    // Validate vote value
    if (vote !== 1 && vote !== -1) {
      res.status(400).json({
        success: false,
        message: 'Invalid vote value. Must be 1 (upvote) or -1 (downvote)'
      } as ApiResponse);
      return;
    }

    // Check if post exists
    const post = await dbAdmin.findOne('forum_posts', p => p.id === id);
    if (!post) {
      res.status(404).json({
        success: false,
        message: 'Post not found'
      } as ApiResponse);
      return;
    }

    // Check if user has already voted on this post
    const existingVote = await query(
      'SELECT vote_value FROM forum_votes WHERE user_id = $1 AND target_type = $2 AND target_id = $3',
      [userId, 'post', id]
    );

    let newVoteCount = post.votes || 0;
    let message = '';

    if (existingVote.rows.length > 0) {
      const currentVote = existingVote.rows[0].vote_value;

      if (currentVote === vote) {
        // User is trying to vote the same way again - remove the vote
        await query('DELETE FROM forum_votes WHERE user_id = $1 AND target_type = $2 AND target_id = $3',
          [userId, 'post', id]);
        newVoteCount = Math.max(newVoteCount - vote, 0);
        message = 'Vote removed';
      } else {
        // User is changing their vote
        await query('UPDATE forum_votes SET vote_value = $1 WHERE user_id = $2 AND target_type = $3 AND target_id = $4',
          [vote, userId, 'post', id]);
        newVoteCount = newVoteCount - currentVote + vote;
        message = vote === 1 ? 'Post upvoted' : 'Vote changed to downvote';
      }
    } else {
      // First time voting
      await query('INSERT INTO forum_votes (user_id, target_type, target_id, vote_value) VALUES ($1, $2, $3, $4)',
        [userId, 'post', id, vote]);
      newVoteCount += vote;
      message = vote === 1 ? 'Post upvoted' : 'Post downvoted';
    }

    // Update the post's vote count
    await dbAdmin.update('forum_posts', id, { votes: Math.max(newVoteCount, 0) });

    res.json({
      success: true,
      message,
      data: { votes: Math.max(newVoteCount, 0) }
    } as ApiResponse);
  } catch (error) {
    console.error('Vote on post error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to vote on post'
    } as ApiResponse);
  }
});

// Mark post as solved (only by author)
router.put('/posts/:id/solved', [
  authenticateToken,
  body('solved').isBoolean().withMessage('Solved must be boolean')
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { solved } = req.body;
    const userId = req.user!.id;

    // Check if user is the author
    const posts = await dbAdmin.get('forum_posts');
    const postCheck = posts.filter(p => p.id === id);

    if (postCheck.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Forum post not found'
      } as ApiResponse);
      return;
    }

    if (postCheck[0].author_id !== userId) {
      res.status(403).json({
        success: false,
        message: 'You can only mark your own posts as solved'
      } as ApiResponse);
      return;
    }

    // Update the post using dbAdmin.update() which handles the update properly
    const updated = await dbAdmin.update('forum_posts', id, {
      is_solved: solved,
      updated_at: new Date().toISOString()
    });

    if (!updated) {
      res.status(404).json({
        success: false,
        message: 'Forum post not found'
      } as ApiResponse);
      return;
    }

    res.json({
      success: true,
      data: updated,
      message: `Post marked as ${solved ? 'solved' : 'unsolved'}`
    } as ApiResponse);
  } catch (error) {
    console.error('Mark solved error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update post status'
    } as ApiResponse);
  }
});

// Generate AI answer for forum post (any premium user)
router.post('/posts/:id/generate-ai-answer', authenticateToken, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    // Check if user is premium
    const users = await dbAdmin.get('users');
    const user = users.find(u => u.id === userId);

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      } as ApiResponse);
      return;
    }

    if (!user.is_premium) {
      res.status(403).json({
        success: false,
        message: 'Premium subscription required to generate AI answers'
      } as ApiResponse);
      return;
    }

    // Check if post exists
    const posts = await dbAdmin.get('forum_posts');
    const post = posts.find(p => p.id === id);

    if (!post) {
      res.status(404).json({
        success: false,
        message: 'Forum post not found'
      } as ApiResponse);
      return;
    }

    // Generate AI answer
    const { getTutorResponse } = await import('../services/aiTutor');

    const prompt = `Question Title: ${post.title}\nQuestion Details: ${post.content}\n\nAct as an expert tutor. Please provide a clear, step-by-step, verified answer to this student's question. Explain the concepts simply and provide an example if relevant.`;

    const aiAnswer = await getTutorResponse([], prompt, post.subject, post.grade);

    // Update post with AI answer
    await dbAdmin.update('forum_posts', id, { ai_answer: aiAnswer });

    // Award XP for generating AI answer
    const newXp = (user.xp || 0) + 10;
    const newLevel = Math.floor(newXp / 1000) + 1;
    await dbAdmin.update('users', userId, { xp: newXp, level: newLevel });

    res.json({
      success: true,
      data: {
        aiAnswer,
        xpGained: 10
      },
      message: 'AI Answer generated successfully'
    } as ApiResponse);
  } catch (error) {
    console.error('Generate AI answer error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate AI answer'
    } as ApiResponse);
  }
});

// Delete forum post (only by author or admin)
router.delete('/posts/:id', authenticateToken, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const userRole = req.user!.role;

    console.log('Delete post request:', { id, userId, userRole });

    // Check if user is the author or admin
    const posts = await dbAdmin.get('forum_posts');
    const postCheck = posts.filter(p => p.id === id);

    console.log('Found posts:', postCheck.length);

    if (postCheck.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Forum post not found'
      } as ApiResponse);
      return;
    }

    console.log('Post author_id:', postCheck[0].author_id, 'userId:', userId, 'userRole:', userRole);

    if (postCheck[0].author_id !== userId && userRole !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'You can only delete your own posts'
      } as ApiResponse);
      return;
    }

    console.log('Deleting post:', id);
    await dbAdmin.delete('forum_posts', id);
    console.log('Post deleted successfully');

    res.json({
      success: true,
      message: 'Forum post deleted successfully'
    } as ApiResponse);
  } catch (error) {
    console.error('Delete forum post error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete forum post'
    } as ApiResponse);
  }
});

// Create comment on post
router.post('/posts/:postId/comments', authenticateToken, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { postId } = req.params;
    const { content } = req.body;
    const author_id = req.user!.id;

    console.log('Create comment request:', { postId, content: content.substring(0, 50), author_id });

    // Check if post exists
    const post = await dbAdmin.findOne('forum_posts', p => p.id === postId);
    if (!post) {
      res.status(404).json({
        success: false,
        message: 'Forum post not found'
      } as ApiResponse);
      return;
    }

    const commentData = {
      post_id: postId,
      author_id,
      content,
      votes: 0,
      is_accepted: false,
      is_edited: false
    };

    const inserted = await dbAdmin.insert('forum_comments', commentData);
    console.log('Comment created:', { id: inserted.id, postId, author_id });

    // Send notification to post author (if not commenting on own post)
    if (post.author_id !== author_id) {
      try {
        // Get comment author's name and post author's details for notifications
        const users = await dbAdmin.get('users');
        const commenter = users.find(u => u.id === author_id);
        const postAuthor = users.find(u => u.id === post.author_id);

        if (commenter) {
          // Create in-app notification
          await NotificationService.createForumReplyNotification(
            post.author_id,
            post.title,
            commenter.name
          );

          // Send email notification (non-blocking)
          if (postAuthor && postAuthor.email && postAuthor.name && postId) {
            console.log('📧 Triggering forum comment reply email for post author:', { 
              postAuthorEmail: postAuthor.email, 
              postTitle: post.title 
            });
            EmailService.sendForumCommentReplyEmail(
              postAuthor.email,
              postAuthor.name,
              commenter.name,
              postId,
              post.title,
              content
            ).catch(error => {
              console.error('❌ Failed to send forum comment reply email:', error);
              // Don't fail the request if email fails
            });
          }
        }
      } catch (notificationError) {
        console.error('Failed to create forum reply notification:', notificationError);
        // Don't fail the comment creation for notification errors
      }
    }

    res.status(201).json({
      success: true,
      data: inserted,
      message: 'Comment added successfully'
    } as ApiResponse<ForumComment>);
  } catch (error) {
    console.error('Create comment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add comment'
    } as ApiResponse);
  }
});

// Update comment (only by author)
router.put('/comments/:id', [
  authenticateToken,
  body('content').trim().isLength({ min: 1, max: 2000 }).withMessage('Comment content is required')
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const userId = req.user!.id;

    console.log('Update comment request:', { id, content: content.substring(0, 50), userId });

    // Check if comment exists using the same method as creation (dbAdmin)
    const comments = await dbAdmin.get('forum_comments');
    const comment = comments.find(c => c.id === id);

    console.log('Comment found via dbAdmin:', !!comment, 'Comment data:', comment);

    if (!comment) {
      console.log('Comment not found via dbAdmin, checking all comments:', comments.map(c => c.id));
      res.status(404).json({
        success: false,
        message: 'Comment not found'
      } as ApiResponse);
      return;
    }

    // Check if user is the author
    if (comment.author_id !== userId) {
      res.status(403).json({
        success: false,
        message: 'You can only edit your own comments'
      } as ApiResponse);
      return;
    }

    // Update the comment
    const updatedComment = await dbAdmin.update('forum_comments', id, {
      content,
      is_edited: true
    });

    console.log('Comment updated:', updatedComment);

    res.json({
      success: true,
      data: updatedComment,
      message: 'Comment updated successfully'
    } as ApiResponse<ForumComment>);
  } catch (error) {
    console.error('Update comment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update comment'
    } as ApiResponse);
  }
});

// Vote on comment
router.post('/comments/:id/vote', [
  authenticateToken,
  body('vote').isIn([1, -1]).withMessage('Vote must be 1 (upvote) or -1 (downvote)')
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { vote } = req.body;
    const userId = req.user!.id;

    // Check if comment exists
    const comments = await dbAdmin.get('forum_comments');
    const comment = comments.find(c => c.id === id);
    if (!comment) {
      res.status(404).json({
        success: false,
        message: 'Comment not found'
      } as ApiResponse);
      return;
    }

    // Check if user has already voted on this comment
    const existingVote = await query(
      'SELECT vote_value FROM forum_votes WHERE user_id = $1 AND target_type = $2 AND target_id = $3',
      [userId, 'comment', id]
    );

    let newVoteCount = comment.votes || 0;
    let message = '';

    if (existingVote.rows.length > 0) {
      const currentVote = existingVote.rows[0].vote_value;

      if (currentVote === vote) {
        // User is trying to vote the same way again - remove the vote
        await query('DELETE FROM forum_votes WHERE user_id = $1 AND target_type = $2 AND target_id = $3',
          [userId, 'comment', id]);
        newVoteCount = Math.max(newVoteCount - vote, 0);
        message = 'Vote removed';
      } else {
        // User is changing their vote
        await query('UPDATE forum_votes SET vote_value = $1 WHERE user_id = $2 AND target_type = $3 AND target_id = $4',
          [vote, userId, 'comment', id]);
        newVoteCount = newVoteCount - currentVote + vote;
        message = vote === 1 ? 'Comment upvoted' : 'Vote changed to downvote';
      }
    } else {
      // First time voting
      await query('INSERT INTO forum_votes (user_id, target_type, target_id, vote_value) VALUES ($1, $2, $3, $4)',
        [userId, 'comment', id, vote]);
      newVoteCount += vote;
      message = vote === 1 ? 'Comment upvoted' : 'Comment downvoted';
    }

    // Update the comment's vote count
    await dbAdmin.update('forum_comments', id, { votes: Math.max(newVoteCount, 0) });

    res.json({
      success: true,
      message,
      data: { votes: Math.max(newVoteCount, 0) }
    } as ApiResponse);
  } catch (error) {
    console.error('Vote on comment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to vote on comment'
    } as ApiResponse);
  }
});

// Accept comment as answer (only by post author)
router.put('/comments/:id/accept', authenticateToken, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    // Get comment and check if user is post author
    const commentResult = await query(`
      SELECT c.post_id, p.author_id as post_author_id
      FROM forum_comments c
      JOIN forum_posts p ON c.post_id = p.id
      WHERE c.id = $1
    `, [id]);

    if (commentResult.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Comment not found'
      } as ApiResponse);
      return;
    }

    const { post_id, post_author_id } = commentResult.rows[0];

    if (post_author_id !== userId) {
      res.status(403).json({
        success: false,
        message: 'Only the post author can accept answers'
      } as ApiResponse);
      return;
    }

    // Get the comment first to get author_id
    const comment = await dbAdmin.findOne('forum_comments', (c: any) => c.id === id);
    if (!comment) {
      res.status(404).json({
        success: false,
        message: 'Comment not found'
      } as ApiResponse);
      return;
    }

    const commentAuthorId = comment.author_id;

    // Get post details
    const post = await dbAdmin.findOne('forum_posts', (p: any) => p.id === post_id);
    if (!post) {
      res.status(404).json({
        success: false,
        message: 'Post not found'
      } as ApiResponse);
      return;
    }

    const postTitle = post.title;

    // First, unaccept all other comments on this post
    const allComments = await dbAdmin.get('forum_comments');
    const otherComments = allComments.filter((c: any) => c.post_id === post_id && c.id !== id && c.is_accepted);
    
    for (const otherComment of otherComments) {
      await dbAdmin.update('forum_comments', otherComment.id, { is_accepted: false });
    }

    // Then accept this comment
    const updatedComment = await dbAdmin.update('forum_comments', id, { 
      is_accepted: true,
      updated_at: new Date().toISOString()
    });

    // Also mark the post as solved
    await dbAdmin.update('forum_posts', post_id, {
      is_solved: true,
      updated_at: new Date().toISOString()
    });

    // Send notification to comment author
    try {
      // Create in-app notification
      await NotificationService.createForumAnswerAcceptedNotification(
        commentAuthorId,
        postTitle
      );

      // Send email notification (non-blocking)
      // Get comment author's details
      const users = await dbAdmin.get('users');
      const commentAuthor = users.find((u: any) => u.id === commentAuthorId);
      
      if (commentAuthor && commentAuthor.email && commentAuthor.name) {
        console.log('📧 Triggering comment accepted as solution email for comment author:', { 
          commentAuthorEmail: commentAuthor.email, 
          postTitle 
        });
        EmailService.sendCommentAcceptedSolutionEmail(
          commentAuthor.email,
          commentAuthor.name,
          post_id,
          postTitle
        ).catch(error => {
          console.error('❌ Failed to send comment accepted as solution email:', error);
          // Don't fail the request if email fails
        });
      } else {
        console.warn('⚠️ Comment author not found or missing email/name:', { commentAuthorId, commentAuthor });
      }
    } catch (notificationError) {
      console.error('Failed to create answer accepted notification:', notificationError);
      // Don't fail the acceptance for notification errors
    }

    res.json({
      success: true,
      message: 'Comment accepted as answer'
    } as ApiResponse);
  } catch (error) {
    console.error('Accept comment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to accept comment'
    } as ApiResponse);
  }
});

// Delete comment (only by author or admin)
router.delete('/comments/:id', authenticateToken, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const userRole = req.user!.role;

    // Check if comment exists and user has permission
    const comments = await dbAdmin.get('forum_comments');
    const comment = comments.find(c => c.id === id);

    if (!comment) {
      res.status(404).json({
        success: false,
        message: 'Comment not found'
      } as ApiResponse);
      return;
    }

    if (comment.author_id !== userId && userRole !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'You can only delete your own comments'
      } as ApiResponse);
      return;
    }

    await dbAdmin.delete('forum_comments', id);

    res.json({
      success: true,
      message: 'Comment deleted successfully'
    } as ApiResponse);
  } catch (error) {
    console.error('Delete comment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete comment'
    } as ApiResponse);
  }
});

export default router;
