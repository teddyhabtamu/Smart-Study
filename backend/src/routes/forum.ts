import express from 'express';
import { createHash } from 'crypto';
import { body, query as queryValidator } from 'express-validator';
import { db, dbAdmin, query } from '../database/config';
import { EAT_TODAY_SQL } from '../utils/dates';
import { authenticateToken, optionalAuth, validateRequest } from '../middleware/auth';
import { ApiResponse, ForumPost, ForumComment, User } from '../types';
import { NotificationService } from '../services/notificationService';
import { awardXP } from '../services/xpService';
import { EmailService } from '../services/emailService';
import { logAdminActivity } from '../services/adminAuditLog';

const router = express.Router();

// Pure vote-transition math shared by the post and comment vote endpoints.
// current: the user's existing vote (1 | -1) or null for first-time voters.
// Returns the counter delta to apply atomically (UPDATE ... SET votes =
// votes + delta). Exported for unit tests.
// Toggle-off removes the vote (-current); changing sides swings by the
// difference (e.g. -1 -> +1 is +2). No flooring: clamping at zero dropped
// downvotes and inflated later removals (see vote endpoints).
export const voteTransition = (
  current: number | null,
  next: 1 | -1
): { delta: number; message: string } => {
  if (current === next) return { delta: -next, message: 'Vote removed' };
  if (current === null) {
    return { delta: next, message: next === 1 ? 'Voted' : 'Downvoted' };
  }
  return {
    delta: next - current,
    message: next === 1 ? 'Upvoted' : 'Vote changed to downvote',
  };
};

// --- Post moderation (earned trust) -----------------------------------------
// A post is public only when approved. Staff and authors with ≥1 approved
// post skip the queue; everyone else lands in pending for review. Edits
// re-check trust (closes the "post homework, edit in spam links" bypass;
// edits on rejected posts always re-queue). All helpers fail OPEN on a
// missing moderation column (code 42703): a pre-migration database keeps
// the old behavior (everything live) instead of 500ing the community.
const isStaffRole = (role?: string): boolean =>
  role === 'ADMIN' || role === 'MODERATOR';

const isMissingModerationColumn = (err: any): boolean =>
  (err as any)?.code === '42703' ||
  String((err as any)?.message || '').includes('decision_reason') ||
  (String((err as any)?.message || '').includes('status') &&
    String((err as any)?.message || '').includes('forum_posts'));

// Exported for unit tests.
export const isTrustedPoster = async (userId: string, role?: string): Promise<boolean> => {
  if (isStaffRole(role)) return true;
  try {
    const r = await query(
      `SELECT 1 FROM forum_posts WHERE author_id = $1 AND status = 'approved' LIMIT 1`,
      [userId]
    );
    return (r.rows?.length ?? 0) > 0;
  } catch {
    return true;
  }
};

// Visibility: approved (or pre-migration rows with no status) → everyone;
// anything else → author + staff only. Callers answer 404 on false — never
// 403, so strangers can't probe for hidden posts.
const canSeePost = (post: any, req: express.Request): boolean => {
  if (!post) return false;
  if (post.status === 'approved' || !post.status) return true;
  const uid = req.user?.id;
  if (uid && String(post.author_id) === String(uid)) return true;
  return isStaffRole(req.user?.role);
};

// Test route
router.get('/test', (req: express.Request, res: express.Response): void => {
  res.json({ success: true, message: 'Forum API is working' });
});

// AI-answer paywall (READ-time redaction). Generating is Pro-only, but the
// stored answer used to ship FULL to every reader — one Pro tap un-paywalled
// it for all free users and guests forever. Now the API returns only a
// teaser preview unless the VIEWER is entitled (Pro member, or staff who
// need the text for moderation). Deliberately server-side, never a frontend
// blur: the old video_url leak proved redaction must happen before JSON
// leaves the server. Guests and Googlebot (both unauthenticated) receive the
// identical teaser, so this is not cloaking.
const AI_PREVIEW_MIN = 120;
const AI_PREVIEW_MAX = 400;

// Plain-text teaser: markdown is stripped BEFORE slicing (a cut mid-syntax
// renders broken bold/fences), then ~25% of the text is kept within
// [MIN, MAX] chars so tiny answers still tease and long ones stay gated.
export const aiAnswerPreview = (full: string): string => {
  const stripped = (full || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~]{1,3}/g, '')
    .replace(/^[\s]*[-*+]\s+/gm, '')
    .replace(/^[\s]*\d+\.\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!stripped) return '';
  const target = Math.min(Math.max(Math.floor(stripped.length * 0.25), AI_PREVIEW_MIN), AI_PREVIEW_MAX);
  if (stripped.length <= target) return stripped;
  const cut = stripped.slice(0, target);
  const lastSpace = cut.lastIndexOf(' ');
  return `${lastSpace > target * 0.5 ? cut.slice(0, lastSpace) : cut}…`;
};

export const canReadFullAiAnswer = (req: express.Request): boolean =>
  !!req.user && (!!req.user.is_premium || req.user.role === 'ADMIN' || req.user.role === 'MODERATOR');

// Get all forum posts with optional filtering
// optionalAuth (not open): the AI-answer paywall below needs to know whether
// the reader is Pro/staff. Guests still read everything else freely.
router.get('/posts', optionalAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { subject, grade, search, limit = 20, offset = 0 } = req.query;

    const limitNum = Math.min(parseInt(limit as string) || 20, 100);
    const startIndex = parseInt(offset as string) || 0;

    // Single query: posts + author + comment count, filtered/sorted/paginated
    // in SQL. Previously this was 3 full-table scans (posts + ALL users with
    // password hashes + ALL comments) joined in JS on every request.
    const conditions: string[] = [];
    const params: any[] = [];
    let paramCount = 1;

    if (subject) {
      conditions.push(`p.subject = $${paramCount++}`);
      params.push(subject);
    }
    if (grade) {
      conditions.push(`p.grade = $${paramCount++}`);
      params.push(parseInt(grade as string));
    }
    if (search) {
      conditions.push(`(p.title ILIKE $${paramCount} OR p.content ILIKE $${paramCount} OR u.name ILIKE $${paramCount})`);
      params.push(`%${search}%`);
      paramCount++;
    }

    // Moderation visibility: the public only sees approved posts. The
    // author sees their own pending/rejected rows (badged client-side);
    // staff see everything (the review queue is a separate endpoint, but
    // moderators browsing the community shouldn't hit 404s either).
    // The status predicate is appended LAST so the legacy fallback below
    // can reuse the same base conditions with identical $ numbering.
    const baseWhere = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const baseParams = [...params];
    let whereClause = baseWhere;
    if (!isStaffRole(req.user?.role)) {
      const viewerId = req.user?.id;
      const glue = baseWhere ? `${baseWhere} AND ` : 'WHERE ';
      if (viewerId) {
        whereClause = `${glue}(p.status = 'approved' OR (p.author_id = $${paramCount} AND p.status IN ('pending', 'rejected')))`;
        params.push(viewerId);
      } else {
        whereClause = `${glue}p.status = 'approved'`;
      }
    }

    const modernSelect = `SELECT p.id, p.title, p.content, p.subject, p.grade, p.votes, p.views,
            p.tags, p.is_solved, p.is_edited, p.ai_answer, p.created_at, p.updated_at,
            p.author_id, p.status, p.decision_reason,
            u.name as author, u.role as author_role, u.avatar as author_avatar,
            (SELECT COUNT(*) FROM forum_comments c WHERE c.post_id = p.id) as comment_count
     FROM forum_posts p
     LEFT JOIN users u ON u.id = p.author_id`;
    // Pre-migration shape: no status anywhere (old behavior — everything
    // listed, everything implicitly live).
    const legacySelect = `SELECT p.id, p.title, p.content, p.subject, p.grade, p.votes, p.views,
            p.tags, p.is_solved, p.is_edited, p.ai_answer, p.created_at, p.updated_at,
            u.name as author, u.role as author_role, u.avatar as author_avatar,
            (SELECT COUNT(*) FROM forum_comments c WHERE c.post_id = p.id) as comment_count
     FROM forum_posts p
     LEFT JOIN users u ON u.id = p.author_id`;

    let countResult: any;
    let postsResult: any;
    try {
      [countResult, postsResult] = await Promise.all([
        query(`SELECT COUNT(*) as total FROM forum_posts p LEFT JOIN users u ON u.id = p.author_id ${whereClause}`, params),
        query(
          `${modernSelect}
           ${whereClause}
           ORDER BY p.created_at DESC
           LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
          [...params, limitNum, startIndex]
        ),
      ]);
    } catch (listErr) {
      if (!isMissingModerationColumn(listErr)) throw listErr;
      [countResult, postsResult] = await Promise.all([
        query(`SELECT COUNT(*) as total FROM forum_posts p LEFT JOIN users u ON u.id = p.author_id ${baseWhere}`, baseParams),
        query(
          `${legacySelect}
           ${baseWhere}
           ORDER BY p.created_at DESC
           LIMIT $${baseParams.length + 1} OFFSET $${baseParams.length + 2}`,
          [...baseParams, limitNum, startIndex]
        ),
      ]);
    }
    const total = parseInt(countResult.rows[0]?.total || '0', 10);

    const enrichedPosts = postsResult.rows.map((post: any) => ({
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
      // Moderation state (legacy rows arrive without it → implicitly live).
      // author_id lets the client badge its own pending/rejected rows without
      // fragile name matching; decision_reason only ever reaches viewers who
      // passed canSeePost (author + staff for non-approved).
      status: post.status || 'approved',
      author_id: post.author_id || null,
      decision_reason: post.decision_reason || null,
      // The list UI never renders AI answers — they ride along only as a
      // 20-per-page payload tax and a paywall hole. Non-entitled readers get
      // null; entitled readers keep the full text for shape stability.
      aiAnswer: canReadFullAiAnswer(req) ? post.ai_answer : null,
      created_at: post.created_at,
      updated_at: post.updated_at,
      author: post.author,
      author_role: post.author_role,
      author_avatar: post.author_avatar,
      comment_count: parseInt(post.comment_count || '0', 10)
    }));

    res.json({
      success: true,
      data: {
        posts: enrichedPosts,
        pagination: {
          total,
          limit: limitNum,
          offset: startIndex,
          hasMore: startIndex + limitNum < total
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
// optionalAuth (not open): same paywall reason as the list route — without
// it every reader looks like a guest and Pro members would only ever see
// teasers of answers they paid for.
router.get('/posts/:id', optionalAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.id; // May be undefined for non-authenticated users

    // Single indexed query: post + author. Never SELECT users.* here — the
    // old code fetched ALL users (password hashes included) on every post
    // view just to find one name. Only the display columns are selected.
    // Moderation columns ride along for the visibility gate below; the
    // legacy retry drops them (pre-migration rows are implicitly live).
    let post: any;
    try {
      const postRows = await query(
        `SELECT p.id, p.title, p.content, p.subject, p.grade, p.votes, p.views,
                p.tags, p.is_solved, p.is_edited, p.ai_answer, p.created_at,
                p.updated_at, p.author_id, p.status, p.decision_reason,
                u.name as author, u.role as author_role, u.avatar as author_avatar
         FROM forum_posts p
         LEFT JOIN users u ON p.author_id = u.id
         WHERE p.id = $1`,
        [id]
      );
      post = postRows.rows[0];
    } catch (detailErr) {
      if (!isMissingModerationColumn(detailErr)) throw detailErr;
      const postRows = await query(
        `SELECT p.id, p.title, p.content, p.subject, p.grade, p.votes, p.views,
                p.tags, p.is_solved, p.is_edited, p.ai_answer, p.created_at,
                p.updated_at, p.author_id,
                u.name as author, u.role as author_role, u.avatar as author_avatar
         FROM forum_posts p
         LEFT JOIN users u ON p.author_id = u.id
         WHERE p.id = $1`,
        [id]
      );
      post = postRows.rows[0];
    }

    // Non-approved posts are invisible to strangers (404, not 403 — no
    // existence leak); the author and staff see them with their state.
    if (!canSeePost(post, req)) {
      res.status(404).json({
        success: false,
        message: 'Forum post not found'
      } as ApiResponse);
      return;
    }

    if (!post) {
      res.status(404).json({
        success: false,
        message: 'Forum post not found'
      } as ApiResponse);
      return;
    }

    // Track unique views for authenticated users. Atomic increment: the old
    // read-modify-write (views = post.views + 1) lost views under concurrent
    // readers.
    if (userId) {
      const existingView = await query(
        'SELECT id FROM forum_views WHERE user_id = $1 AND post_id = $2',
        [userId, id]
      );

      if (existingView.rows.length === 0) {
        // First time viewing this post - record the view and increment count
        await query('INSERT INTO forum_views (user_id, post_id) VALUES ($1, $2)', [userId, id]);
        await query('UPDATE forum_posts SET views = views + 1 WHERE id = $1', [id]);
        post.views = (post.views || 0) + 1;
      }
    } else {
      // Guest dedup (mirrors video views): one counted view per
      // (viewer_hash, post_id). viewer_hash is SHA-256(IP + User-Agent) — no
      // identity stored. Previously EVERY guest load incremented (refresh-loop
      // view farming). Best-effort: if tracking fails (e.g. the viewer_hash
      // migration hasn't run yet), count the view rather than fail the post
      // fetch — same degradation philosophy as the video route.
      try {
        const forwardedFor = req.headers['x-forwarded-for'];
        const ip = (() => {
          if (typeof forwardedFor === 'string') {
            const first = forwardedFor.split(',').shift();
            return (first ?? '').trim() || req.ip || 'unknown';
          }
          return req.ip || 'unknown';
        })();
        const ua = String(req.headers['user-agent'] || 'unknown');
        const viewerHash = createHash('sha256').update(`${ip}|${ua}`).digest('hex');

        const seen = await query(
          'SELECT id FROM forum_views WHERE viewer_hash = $1 AND post_id = $2',
          [viewerHash, id]
        );
        if (seen.rows.length === 0) {
          try {
            await query(
              'INSERT INTO forum_views (post_id, viewer_hash) VALUES ($1, $2)',
              [id, viewerHash]
            );
          } catch (insErr: any) {
            // Racy double-insert means already counted — same outcome.
            if (String(insErr?.code) !== '23505') throw insErr;
          }
          await query('UPDATE forum_posts SET views = views + 1 WHERE id = $1', [id]);
          post.views = (post.views || 0) + 1;
        }
      } catch (trackErr: any) {
        console.warn('Guest view tracking unavailable; counting view:', trackErr?.message || trackErr);
        await query('UPDATE forum_posts SET views = views + 1 WHERE id = $1', [id]);
        post.views = (post.views || 0) + 1;
      }
    }

    // Comments + authors in one query, ordered in SQL (was: fetch ALL
    // comments + ALL users, join in JS, sort in JS). Votes desc so the
    // accepted/best answers surface first, oldest first within ties.
    const commentsResult = await query(
      `SELECT c.id, c.content, c.votes, c.is_accepted, c.is_edited,
              c.created_at, c.updated_at, c.author_id,
              u.name as author, u.role as author_role, u.avatar as author_avatar
       FROM forum_comments c
       LEFT JOIN users u ON c.author_id = u.id
       WHERE c.post_id = $1
       ORDER BY c.votes DESC, c.created_at ASC`,
      [id]
    );
    const enrichedComments = commentsResult.rows.map((comment: any) => ({
      id: comment.id,
      content: comment.content,
      votes: comment.votes || 0,
      is_accepted: comment.is_accepted || false,
      is_edited: comment.is_edited || false,
      created_at: comment.created_at,
      updated_at: comment.updated_at,
      author: comment.author,
      author_id: comment.author_id,
      author_role: comment.author_role,
      author_avatar: comment.author_avatar
    }));

    // The voter's own votes in ONE query (was: one query per comment — N+1).
    let userPostVote = null;
    let userCommentVotes: { [commentId: string]: number } = {};

    if (userId) {
      const commentIds = enrichedComments.map((c: any) => c.id);
      const votesResult = await query(
        `SELECT target_type, target_id, vote_value FROM forum_votes
         WHERE user_id = $1 AND ((target_type = 'post' AND target_id = $2)
           OR (target_type = 'comment' AND target_id = ANY($3)))`,
        [userId, id, commentIds]
      );
      for (const v of votesResult.rows) {
        if (v.target_type === 'post') userPostVote = v.vote_value;
        else userCommentVotes[v.target_id] = v.vote_value;
      }
    }

    const entitled = canReadFullAiAnswer(req);
    const enrichedPost = {
      id: post.id,
      title: post.title,
      content: post.content,
      subject: post.subject,
      grade: post.grade,
      votes: post.votes || 0,
      views: post.views || 0, // Already incremented above (in memory + in SQL)
      tags: post.tags || [],
      is_solved: post.is_solved || false,
      is_edited: post.is_edited || false,
      // Paywalled read: full text for Pro/staff, plain-text teaser for
      // everyone else (see helper). aiAnswerLocked tells the UI to render
      // the upsell instead of the markdown body.
      aiAnswer: entitled ? post.ai_answer : (post.ai_answer ? aiAnswerPreview(post.ai_answer) : null),
      aiAnswerLocked: !!post.ai_answer && !entitled,
      created_at: post.created_at,
      updated_at: post.updated_at,
      author: post.author,
      author_id: post.author_id,
      author_role: post.author_role,
      author_avatar: post.author_avatar,
      // Moderation state for the author's own badges (only author + staff
      // ever receive non-approved rows — see the gate above).
      status: post.status || 'approved',
      decision_reason: post.decision_reason || null,
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

// Create forum post. Validated like updates (title 5+, content 10+) —
// previously unvalidated, so empty one-word posts could be stored.
router.post('/posts', [
  authenticateToken,
  body('title').trim().isLength({ min: 5, max: 500 }).withMessage('Title must be between 5 and 500 characters'),
  body('content').trim().isLength({ min: 10 }).withMessage('Content must be at least 10 characters'),
  body('subject').optional().isString().trim().isLength({ max: 100 }),
  body('grade').optional().isInt({ min: 0, max: 12 }).toInt(),
  body('tags').optional().isArray()
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { title, content, subject, grade, tags = [] } = req.body;
    const author_id = req.user!.id;

    // Free accounts get 1 question per Ethiopian day (server date is UTC —
    // a UTC slice would steal the last evening hours); Pro is unlimited.
    // The gate lives here — not just in the UI — so it can't be bypassed.
    if (!req.user!.is_premium) {
      const todayCount = await query(
        `SELECT COUNT(*) as count FROM forum_posts
         WHERE author_id = $1 AND created_at >= ${EAT_TODAY_SQL}`,
        [author_id]
      );
      if (parseInt(todayCount.rows[0]?.count || '0', 10) >= 1) {
        res.status(403).json({
          success: false,
          code: 'FREE_LIMIT_REACHED',
          message: "You've used today's free question. Go Pro to ask unlimited questions."
        } as ApiResponse);
        return;
      }
    }

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
      is_edited: false,
      // Earned trust: staff and authors with a live post skip review.
      status: (await isTrustedPoster(author_id, req.user!.role)) ? 'approved' : 'pending'
    };

    let inserted: any;
    try {
      inserted = await dbAdmin.insert('forum_posts', postData);
    } catch (insErr) {
      // Pre-migration database: retry the legacy shape (implicitly live,
      // exactly the old behavior) instead of 500ing every new post.
      if (!isMissingModerationColumn(insErr)) throw insErr;
      const { status: _dropped, ...legacyData } = postData;
      inserted = await dbAdmin.insert('forum_posts', legacyData);
    }

    const liveNow = (inserted as any)?.status !== 'pending';
    res.status(201).json({
      success: true,
      data: inserted,
      message: liveNow ? 'Forum post created successfully' : 'Submitted for review — visible to everyone after approval'
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

    // Indexed lookup (was a full-table fetch + in-memory filter).
    // Pre-migration fallback: without the status column this is just the
    // old authorship check (no status to re-evaluate).
    let postCheck: any;
    try {
      const postRows = await query('SELECT id, author_id, status FROM forum_posts WHERE id = $1', [id]);
      postCheck = postRows.rows[0];
    } catch (lookupErr) {
      if (!isMissingModerationColumn(lookupErr)) throw lookupErr;
      const postRows = await query('SELECT id, author_id FROM forum_posts WHERE id = $1', [id]);
      postCheck = postRows.rows[0];
    }

    if (!postCheck) {
      res.status(404).json({
        success: false,
        message: 'Forum post not found'
      } as ApiResponse);
      return;
    }

    if (String(postCheck.author_id) !== String(userId)) {
      res.status(403).json({
        success: false,
        message: 'You can only edit your own posts'
      } as ApiResponse);
      return;
    }

    // Build update object — title/content/tags ONLY. Votes change only via
    // the vote endpoints (atomic counters), solved only via PUT /:id/solved,
    // and ai_answer only via the premium generation route. A previous
    // revision accepted votes/isSolved/aiAnswer here, letting any author rig
    // ranking (votes: 99999), self-award solved, or forge a fake AI answer
    // with one request. Those keys are now ignored, not stored.
    //
    // Moderation re-check on content edits: rejected posts always re-queue
    // (the rejection may have targeted exactly this text); otherwise the
    // author's current trust decides. Tags-only edits can't smuggle a new
    // payload, so they leave visibility untouched. A stale rejection reason
    // is cleared whenever the post re-queues; the decision audit log keeps
    // the history.
    const updates: any = { is_edited: true };
    if (title !== undefined) updates.title = title;
    if (content !== undefined) updates.content = content;
    if (tags !== undefined) updates.tags = tags;
    if (title !== undefined || content !== undefined) {
      try {
        const stillTrusted = postCheck.status === 'rejected'
          ? false
          : await isTrustedPoster(userId, req.user!.role);
        updates.status = stillTrusted ? 'approved' : 'pending';
        if (updates.status === 'pending') {
          updates.reviewed_by = null;
          updates.reviewed_at = null;
          updates.decision_reason = null;
        }
      } catch {
        // Fail open (missing column): leave status untouched.
        delete updates.status;
      }
    }

    const result = await (async () => {
      try {
        return await dbAdmin.update('forum_posts', id, updates);
      } catch (updErr) {
        // Pre-migration database: drop the moderation keys and apply the
        // content edit the legacy way.
        if (!isMissingModerationColumn(updErr)) throw updErr;
        const { status: _s, reviewed_by: _b, reviewed_at: _a, decision_reason: _r, ...legacyUpdates } = updates;
        return await dbAdmin.update('forum_posts', id, legacyUpdates);
      }
    })();

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

    // Indexed existence check (dbAdmin.findOne fetches the whole table —
    // the facade filters client-side, so it must never back a hot path).
    // Non-approved posts are invisible to strangers (404, not 403).
    const postRows = await query('SELECT id, author_id, status FROM forum_posts WHERE id = $1', [id]);
    if (postRows.rows.length === 0 || !canSeePost(postRows.rows[0], req)) {
      res.status(404).json({
        success: false,
        message: 'Post not found'
      } as ApiResponse);
      return;
    }

    // Check if user has already voted on this post (indexed by
    // idx_forum_votes_user_target)
    const existingVote = await query(
      'SELECT vote_value FROM forum_votes WHERE user_id = $1 AND target_type = $2 AND target_id = $3',
      [userId, 'post', id]
    );

    let delta = 0;
    let message = '';

    if (existingVote.rows.length > 0) {
      const currentVote = existingVote.rows[0].vote_value;

      if (currentVote === vote) {
        // User is trying to vote the same way again - remove the vote
        await query('DELETE FROM forum_votes WHERE user_id = $1 AND target_type = $2 AND target_id = $3',
          [userId, 'post', id]);
        delta = -vote;
        message = 'Vote removed';
      } else {
        // User is changing their vote
        await query('UPDATE forum_votes SET vote_value = $1 WHERE user_id = $2 AND target_type = $3 AND target_id = $4',
          [vote, userId, 'post', id]);
        delta = vote - currentVote;
        message = vote === 1 ? 'Post upvoted' : 'Vote changed to downvote';
      }
    } else {
      // First time voting
      await query('INSERT INTO forum_votes (user_id, target_type, target_id, vote_value) VALUES ($1, $2, $3, $4)',
        [userId, 'post', id, vote]);
      delta = vote;
      message = vote === 1 ? 'Post upvoted' : 'Post downvoted';
    }

    // Atomic counter: the old read-modify-write (read post.votes, add, write
    // back) lost votes under concurrent voters, and the Math.max(..., 0)
    // floor silently dropped downvotes at zero — then credited them back as
    // +1 on toggle-off, inflating the score. Scores may go negative (standard
    // forum behavior); the unused increment/decrement SQL helpers still floor
    // and should not be wired back in without fixing that first.
    const updated = await query(
      'UPDATE forum_posts SET votes = votes + $1 WHERE id = $2 RETURNING votes',
      [delta, id]
    );

    res.json({
      success: true,
      message,
      data: { votes: updated.rows[0]?.votes ?? 0 }
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

    // Indexed lookup (the old dbAdmin.get fetched every post to find one).
    // Team members may also resolve threads — consistent with comment delete,
    // where admins/moderators can act on others' content. Non-approved posts
    // are invisible to strangers (404, not 403).
    const postRows = await query('SELECT id, author_id, status FROM forum_posts WHERE id = $1', [id]);
    if (postRows.rows.length === 0 || !canSeePost(postRows.rows[0], req)) {
      res.status(404).json({
        success: false,
        message: 'Forum post not found'
      } as ApiResponse);
      return;
    }

    const roleStr = String(req.user!.role || '').toUpperCase();
    const isTeam = roleStr === 'ADMIN' || roleStr === 'MODERATOR';
    if (String(postRows.rows[0].author_id) !== String(userId) && !isTeam) {
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

    // Premium gating from the authenticated session (previously this loaded
    // the entire users table to re-check the flag).
    if (!req.user!.is_premium) {
      res.status(403).json({
        success: false,
        message: 'Premium subscription required to generate AI answers'
      } as ApiResponse);
      return;
    }

    // Indexed lookup (was a full-table fetch + in-memory find).
    // Non-approved posts are invisible to strangers (404, not 403).
    const postRows = await query(
      'SELECT id, author_id, status, title, content, subject, grade FROM forum_posts WHERE id = $1', [id]
    );
    const post = postRows.rows[0];

    if (!post || !canSeePost(post, req)) {
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

    // Award XP through the shared helper (level math, badges, history,
    // level-up notification). Previously an inline +10 with no history entry,
    // no badge checks, and no notification — the last mint outside awardXP.
    const award = await awardXP(userId, 10, {
      source: 'ai_answer',
      source_id: id,
      description: `AI answer for: ${post.title}`
    });

    res.json({
      success: true,
      data: {
        aiAnswer,
        xpGained: award.xpGained,
        newLevel: award.newLevel,
        leveledUp: award.leveledUp
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

// Delete forum post (only by author, admin, or moderator)
router.delete('/posts/:id', authenticateToken, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const userRole = req.user!.role;

    // Indexed lookup (was a full-table fetch + in-memory filter). Audit
    // fields are selected here so the deletion audit below needs no refetch.
    const postRows = await query(
      'SELECT id, author_id, title, subject, grade FROM forum_posts WHERE id = $1', [id]
    );
    const postCheck = postRows.rows[0];

    if (!postCheck) {
      res.status(404).json({
        success: false,
        message: 'Forum post not found'
      } as ApiResponse);
      return;
    }

    const roleStr = String(userRole || '').toUpperCase();
    const isTeam = roleStr === 'ADMIN' || roleStr === 'MODERATOR';

    if (String(postCheck.author_id) !== String(userId) && !isTeam) {
      res.status(403).json({
        success: false,
        message: 'You can only delete your own posts'
      } as ApiResponse);
      return;
    }

    const beforePost = postCheck;
    await dbAdmin.delete('forum_posts', id);

    // Audit log for admin/moderator deletions (non-blocking)
    if (isTeam) {
      logAdminActivity(req, {
        action: 'forum.post.delete',
        target_type: 'forum_post',
        target_id: String(id),
        summary: `Deleted forum post "${beforePost?.title || id}"`,
        before: {
          id: beforePost?.id,
          title: beforePost?.title,
          subject: beforePost?.subject,
          grade: beforePost?.grade,
          author_id: beforePost?.author_id
        }
      }).catch(() => {});
    }

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
router.post('/posts/:postId/comments', [
  authenticateToken,
  body('content').trim().isLength({ min: 1, max: 5000 }).withMessage('Comment must be between 1 and 5000 characters')
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { postId } = req.params;
    const { content } = req.body;
    const author_id = req.user!.id;

    // Indexed existence check (was a full-table fetch + in-memory find).
    // Comments can't be smuggled onto invisible posts: non-approved posts
    // 404 for everyone but the author and staff.
    const postRows = await query(
      'SELECT id, author_id, status, title FROM forum_posts WHERE id = $1', [postId]
    );
    const post = postRows.rows[0];
    if (!post || !canSeePost(post, req)) {
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

    // Send notification to post author (if not commenting on own post)
    if (post.author_id !== author_id) {
      try {
        // Targeted lookups (were a full users-table fetch for two rows).
        const [commenterRows, authorRows] = await Promise.all([
          query('SELECT id, name FROM users WHERE id = $1', [author_id]),
          query('SELECT id, name, email FROM users WHERE id = $1', [post.author_id])
        ]);
        const commenter = commenterRows.rows[0];
        const postAuthor = authorRows.rows[0];

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

    // Indexed lookup (was a full-table fetch + in-memory find).
    const commentRows = await query(
      'SELECT id, author_id FROM forum_comments WHERE id = $1', [id]
    );
    const comment = commentRows.rows[0];

    if (!comment) {
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

    // Indexed existence check (was a full-table fetch + in-memory find).
    const commentRows = await query('SELECT id FROM forum_comments WHERE id = $1', [id]);
    if (commentRows.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Comment not found'
      } as ApiResponse);
      return;
    }

    // Check if user has already voted on this comment (indexed by
    // idx_forum_votes_user_target)
    const existingVote = await query(
      'SELECT vote_value FROM forum_votes WHERE user_id = $1 AND target_type = $2 AND target_id = $3',
      [userId, 'comment', id]
    );

    let delta = 0;
    let message = '';

    if (existingVote.rows.length > 0) {
      const currentVote = existingVote.rows[0].vote_value;

      if (currentVote === vote) {
        // User is trying to vote the same way again - remove the vote
        await query('DELETE FROM forum_votes WHERE user_id = $1 AND target_type = $2 AND target_id = $3',
          [userId, 'comment', id]);
        delta = -vote;
        message = 'Vote removed';
      } else {
        // User is changing their vote
        await query('UPDATE forum_votes SET vote_value = $1 WHERE user_id = $2 AND target_type = $3 AND target_id = $4',
          [vote, userId, 'comment', id]);
        delta = vote - currentVote;
        message = vote === 1 ? 'Comment upvoted' : 'Vote changed to downvote';
      }
    } else {
      // First time voting
      await query('INSERT INTO forum_votes (user_id, target_type, target_id, vote_value) VALUES ($1, $2, $3, $4)',
        [userId, 'comment', id, vote]);
      delta = vote;
      message = vote === 1 ? 'Comment upvoted' : 'Comment downvoted';
    }

    // Atomic counter (same lost-update + floor bugs as the post vote path —
    // see above). Scores may go negative.
    const updated = await query(
      'UPDATE forum_comments SET votes = votes + $1 WHERE id = $2 RETURNING votes',
      [delta, id]
    );

    res.json({
      success: true,
      message,
      data: { votes: updated.rows[0]?.votes ?? 0 }
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

    // IMPORTANT:
    // Do not use the `query()` helper here with JOINs — it doesn't support complex SQL and can
    // incorrectly return empty rows in production. Use direct table reads instead.

    // Indexed lookups (were full-table fetches + in-memory finds on every
    // accept — the users table scan ran even when only the email was needed).
    const commentRows = await query(
      'SELECT id, post_id, author_id FROM forum_comments WHERE id = $1', [id]
    );
    if (commentRows.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Comment not found'
      } as ApiResponse);
      return;
    }
    const comment = commentRows.rows[0];

    const post_id = comment.post_id;
    const commentAuthorId = comment.author_id;

    // Get post details (indexed)
    const postRows = await query(
      'SELECT id, author_id, title FROM forum_posts WHERE id = $1', [post_id]
    );
    if (postRows.rows.length === 0) {
      res.status(404).json({
        success: false,
        message: 'Post not found'
      } as ApiResponse);
      return;
    }
    const post = postRows.rows[0];

    // Permission: only post author can accept answers
    if (String(post.author_id) !== String(userId)) {
      res.status(403).json({
        success: false,
        message: 'Only the post author can accept answers'
      } as ApiResponse);
      return;
    }

    const postTitle = post.title;

    // Unaccept all other comments on this post in one statement (was: fetch
    // every comment in the table, filter in memory, N sequential updates).
    await query(
      'UPDATE forum_comments SET is_accepted = false WHERE post_id = $1 AND id <> $2 AND is_accepted IS TRUE',
      [post_id, id]
    );

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

    // Notify the comment author — unless they ARE the post author accepting
    // their own answer, in which case a "your answer was accepted"
    // notification (and email) about your own action is pure noise.
    if (String(commentAuthorId) === String(userId)) {
      res.json({
        success: true,
        message: 'Comment accepted as answer'
      } as ApiResponse);
      return;
    }
    try {
      // Create in-app notification
      await NotificationService.createForumAnswerAcceptedNotification(
        commentAuthorId,
        postTitle
      );

      // Send email notification (non-blocking, targeted lookup — was a full
      // users-table fetch)
      const authorRows = await query(
        'SELECT email, name FROM users WHERE id = $1', [commentAuthorId]
      );
      const commentAuthor = authorRows.rows[0];
      
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
    const roleStr = String(userRole || '').toUpperCase();
    const isTeam = roleStr === 'ADMIN' || roleStr === 'MODERATOR';

    // Indexed lookup (was a full-table fetch + in-memory find).
    const commentRows = await query(
      'SELECT id, author_id FROM forum_comments WHERE id = $1', [id]
    );
    const comment = commentRows.rows[0];

    if (!comment) {
      res.status(404).json({
        success: false,
        message: 'Comment not found'
      } as ApiResponse);
      return;
    }

    if (comment.author_id !== userId && !isTeam) {
      res.status(403).json({
        success: false,
        message: 'You can only delete your own comments'
      } as ApiResponse);
      return;
    }

    await dbAdmin.delete('forum_comments', id);

    // Audit log for admin/moderator deletions (non-blocking)
    if (isTeam) {
      logAdminActivity(req, {
        action: 'forum.comment.delete',
        target_type: 'forum_comment',
        target_id: String(id),
        summary: `Deleted forum comment ${id}`,
        before: {
          id: comment.id,
          post_id: comment.post_id,
          author_id: comment.author_id,
          // keep it short-ish
          content_preview: typeof comment.content === 'string' ? comment.content.slice(0, 200) : null
        }
      }).catch(() => {});
    }

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
