import express from 'express';
import multer from 'multer';
import { body } from 'express-validator';
import { dbAdmin, query } from '../database/config';
import { EAT_TODAY_SQL } from '../utils/dates';
import { authenticateToken, optionalAuth, validateRequest, requirePremium } from '../middleware/auth';
import { ApiResponse, ChatSession, User } from '../types';
import { extractTextFromImage } from '../services/ocrService';
import { AIQuotaExceededError, AI_QUOTA_MESSAGE } from '../services/aiTutor';
import { getDocumentExcerpt, getDocumentMeta } from '../services/documentContentService';
import { awardXP, AI_GENERATION_XP_SOURCES, DAILY_AI_GENERATION_XP_CAP } from '../services/xpService';
import { logAiUsage } from '../services/aiUsage';
import { validateBatchEvents, buildBatchInsert, buildRecentDuplicatesSelect, splitNewVsExisting } from '../services/plannerBatch';

// Map AI errors to HTTP responses: quota exhaustion → 429 with a clear,
// user-friendly message; everything else → 500.
const aiErrorResponse = (error: any): { status: number; message: string } => {
  if (error instanceof AIQuotaExceededError) {
    return { status: 429, message: AI_QUOTA_MESSAGE };
  }
  return { status: 500, message: 'Failed to generate AI response' };
};

// Free tier: 1 AI-generated quiz per UTC day, enforced here (the scarce
// resource is generation). The old gate was client-side only on a lifetime
// counter, so direct API calls bypassed it entirely.
const FREE_DAILY_QUIZ_LIMIT = 1;

// Excerpt budget for document-grounded prompts. ~10k chars ≈ 2.5k tokens:
// enough for real summaries/answers without torching shared Gemini quota.
const DOC_EXCERPT_CHARS = 10_000;

// Build the document-grounding block for a chat prompt. Tiered by design —
// an unavailable excerpt degrades to a metadata overview instead of an
// error wall, because the catalog facts (title/description/subject) are
// already public in the library:
// - excerpt readable (+ entitled) → grounded: true (file-accurate answers).
// - premium-gated / scanned / unparsable / unfetchable → grounded: false,
//   partial: true with a catalog-info prompt + UI notice. Never leaks
//   premium text; never 500s the chat over a slow Drive download.
// - no document row at all → hard unavailable (nothing honest to say).
// Exported for unit tests (route wiring itself is covered by route tests).
export interface DocumentContextResult {
  context: string | null;
  grounded: boolean;
  partial: boolean;
  notice?: string;
  reason?: string;
}

const PARTIAL_NOTICES: Record<string, string> = {
  'premium-gated': 'Pro material — general overview below. Upgrade for file-accurate answers.',
  'no-text-layer': 'Scanned document — overview from catalog info, not the file text.',
  'unsupported-type': 'Preview format — general overview from catalog info.',
  'fetch-failed': "Couldn't read the file right now — general overview. Retry for the full version.",
  'parse-failed': "Couldn't read the file right now — general overview. Retry for the full version.",
};

export const buildDocumentContext = async (
  documentId: string | undefined,
  requesterIsPremium: boolean
): Promise<DocumentContextResult> => {
  if (!documentId) return { context: null, grounded: false, partial: false };
  try {
    const doc = await getDocumentExcerpt(documentId, DOC_EXCERPT_CHARS);
    if (!('unavailable' in doc)) {
      // Premium gate: excerpt text stays server-side unless the requester is
      // entitled. Metadata fallback below reveals nothing beyond the catalog.
      if (doc.isPremium && !requesterIsPremium) {
        const meta = await getDocumentMeta(documentId);
        return metadataFallback(
          'premium-gated',
          meta?.title ?? doc.title,
          meta?.description ?? '',
          meta?.subject ?? '',
          meta?.grade ?? null
        );
      }
      return {
        context: [
          `Document context: "${doc.title}". The excerpt below is the actual document text — use it to answer.`,
          `--- document excerpt (${doc.totalChars} chars${doc.truncated ? ', truncated' : ''}) ---`,
          doc.excerpt,
          `--- end of excerpt ---`,
          `Ground your answer in the excerpt above. If the question covers content not in the excerpt, say so honestly and answer from general knowledge, clearly labeling which part is from the document vs general knowledge. Never invent quotes or page numbers not present in the excerpt.`,
        ].join('\n'),
        grounded: true,
        partial: false,
      };
    }
    const meta = await getDocumentMeta(documentId);
    if (!meta) return { context: null, grounded: false, partial: false, reason: doc.reason };
    return metadataFallback(doc.reason, meta.title, meta.description, meta.subject, meta.grade);
  } catch (err) {
    console.error('[ai-tutor] document context failed:', (err as Error)?.message);
    return { context: null, grounded: false, partial: false, reason: 'fetch-failed' };
  }
};

// Catalog-info prompt for the degraded tier. Explicitly tells the model it
// does NOT have the file, so it frames honestly instead of hallucinating
// specifics — the failure mode the old metadata-only prompts had.
const metadataFallback = (
  reason: string,
  title: string,
  description: string,
  subject: string,
  grade: number | null
): DocumentContextResult => ({
  context: [
    `Document catalog info (you do NOT have the file text): Title "${title}"` +
      (subject ? `, Subject ${subject}` : '') +
      (grade !== null ? `, Grade ${grade}` : '') +
      (description ? `. Catalog description: ${description.slice(0, 500)}` : '.'),
    `Give a helpful general study overview of this topic from your own knowledge, pitched at the student's level.`,
    `State clearly at the start that this is a general overview, not a summary of the document. Never claim to have read the file, never invent quotes, page numbers, or document-specific facts.`,
  ].join('\n'),
  grounded: false,
  partial: true,
  notice: PARTIAL_NOTICES[reason] || PARTIAL_NOTICES['fetch-failed'],
  reason,
});

const router = express.Router();

// Configure multer for image uploads (memory storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

// Get user's chat sessions
// Safely extract the messages array from a chat session row.
// The messages column is jsonb; older rows (and some Supabase returns) come
// back as an object instead of an array, which breaks .map/.push.
export const extractMessages = (session: any): { role: string; text: string; timestamp?: string }[] => {
  const raw = session?.messages;
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object') {
    // Object-shaped messages (legacy format) — try common shapes
    const values = Object.values(raw);
    if (values.length > 0 && values.every((v: any) => v && typeof v === 'object' && 'role' in v)) {
      return values as any;
    }
  }
  return [];
};

router.get('/sessions', authenticateToken, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    // Indexed lookup WITHOUT the messages payload (can be MBs across rows).
    // Full messages load on demand via GET /sessions/:id.
    const result = await query(
      'SELECT id, user_id, title, created_at, updated_at FROM chat_sessions WHERE user_id = $1 ORDER BY updated_at DESC',
      [userId]
    );

    // Normalize messages so clients always receive an array
    const normalized = result.rows.map((s: any) => ({ ...s, messages: [] }));

    res.json({
      success: true,
      data: normalized
    } as ApiResponse<ChatSession[]>);
    return;
  } catch (error) {
    console.error('Get chat sessions error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get chat sessions'
    } as ApiResponse);
    return;
  }
});

// Create new chat session
router.post('/sessions', [
  authenticateToken,
  body('title').optional().trim().isLength({ min: 1, max: 200 }).withMessage('Title must be between 1 and 200 characters')
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { title = 'New Chat Session' } = req.body;

    const sessionData = {
      user_id: userId,
      title,
      messages: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const inserted = await dbAdmin.insert('chat_sessions', sessionData);

    res.status(201).json({
      success: true,
      data: inserted,
      message: 'Chat session created successfully'
    } as ApiResponse<ChatSession>);
    return;
  } catch (error) {
    console.error('Create chat session error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create chat session'
    } as ApiResponse);
    return;
  }
});

// Get specific chat session
router.get('/sessions/:id', authenticateToken, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const sessionId = id;

    // Indexed lookup with explicit columns (was a full-table fetch including
    // every session's messages jsonb).
    const found = await query(
      'SELECT id, user_id, title, messages, created_at, updated_at FROM chat_sessions WHERE id = $1 AND user_id = $2',
      [sessionId, userId]
    );
    const session = found.rows[0];

    if (!session) {
      res.status(404).json({
        success: false,
        message: 'Chat session not found'
      } as ApiResponse);
      return;
    }

    res.json({
      success: true,
      data: { ...session, messages: extractMessages(session) }
    } as ApiResponse<ChatSession>);
    return;
  } catch (error) {
    console.error('Get chat session error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get chat session'
    } as ApiResponse);
    return;
  }
});

// Add message to chat session. Validated: previously any role string and
// unbounded text went straight into the jsonb column.
router.post('/sessions/:id/messages', [
  authenticateToken,
  body('role').isIn(['user']).withMessage('Only user messages can be appended'),
  body('text').isString().trim().isLength({ min: 1, max: 20000 }).withMessage('Message must be between 1 and 20000 characters')
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { role, text } = req.body;
    const userId = req.user!.id;
    const sessionId = id;

    // Indexed ownership check fetching only the history column (was a
    // full-table fetch of every session's messages jsonb).
    const found = await query(
      'SELECT id, messages FROM chat_sessions WHERE id = $1 AND user_id = $2',
      [sessionId, userId]
    );
    const session = found.rows[0];

    if (!session) {
      res.status(404).json({
        success: false,
        message: 'Chat session not found'
      } as ApiResponse);
      return;
    }

    // Add message to session. History is capped at the last 100 messages:
    // sessions grew unbounded (20k chars/message, no limit) into MB jsonb
    // rows, and every fetch/update dragged the whole payload along.
    const messages = extractMessages(session);
    const newMessage = {
      role,
      text,
      timestamp: new Date().toISOString()
    };

    messages.push(newMessage);
    const capped = messages.length > 100 ? messages.slice(-100) : messages;

    // Update session
    await dbAdmin.update('chat_sessions', sessionId, {
      messages: capped,
      updated_at: new Date().toISOString()
    });

    res.json({
      success: true,
      data: newMessage,
      message: 'Message added successfully'
    } as ApiResponse);
    return;
  } catch (error) {
    console.error('Add message error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add message'
    } as ApiResponse);
    return;
  }
});

// Update chat session title
router.put('/sessions/:id', [
  authenticateToken,
  body('title').trim().isLength({ min: 1, max: 200 }).withMessage('Title must be between 1 and 200 characters')
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { title } = req.body;
    const userId = req.user!.id;
    const sessionId = id;

    // Indexed existence check (was a full-table fetch).
    const found = await query(
      'SELECT id FROM chat_sessions WHERE id = $1 AND user_id = $2',
      [sessionId, userId]
    );

    if (!found.rows[0]) {
      res.status(404).json({
        success: false,
        message: 'Chat session not found'
      } as ApiResponse);
      return;
    }

    // Update session
    const updated = await dbAdmin.update('chat_sessions', sessionId, {
      title,
      updated_at: new Date().toISOString()
    });

    res.json({
      success: true,
      data: updated,
      message: 'Chat session updated successfully'
    } as ApiResponse<ChatSession>);
    return;
  } catch (error) {
    console.error('Update chat session error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update chat session'
    } as ApiResponse);
    return;
  }
});

// Delete chat session
router.delete('/sessions/:id', authenticateToken, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const sessionId = id;

    // Ownership-scoped atomic delete (was: full-table fetch for the check,
    // then an unscoped delete-by-id — a stale read in between could remove
    // another user's session).
    const delResult = await query(
      'DELETE FROM chat_sessions WHERE id = $1 AND user_id = $2',
      [sessionId, userId]
    );

    if ((delResult.rowCount ?? 0) === 0) {
      res.status(404).json({
        success: false,
        message: 'Chat session not found'
      } as ApiResponse);
      return;
    }

    res.json({
      success: true,
      message: 'Chat session deleted successfully'
    } as ApiResponse);
    return;
  } catch (error) {
    console.error('Delete chat session error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete chat session'
    } as ApiResponse);
    return;
  }
});

// Generate Study Plan using AI (Pro only — enforced server-side; the Planner
// page also gates, but frontend gates don't stop direct API calls).
router.post('/generate-study-plan', [
  authenticateToken,
  body('prompt').isString().trim().isLength({ min: 1, max: 2000 }).withMessage('Prompt must be between 1 and 2000 characters')
], validateRequest, requirePremium, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { prompt } = req.body;
    const userId = req.user!.id;
    const userGrade = req.user!.grade ?? 10;
    // Metering clock: every outcome below (success, fallback, quota, error)
    // logs one ai_usage row so the shared key stops being a black box.
    const planT0 = Date.now();

    // Fail fast on a missing AI key with 503, not the generic 500 below.
    // A 500 here once sent us hunting for a code bug when the preview
    // deployment simply had no GEMINI_API_KEY set — every Smart Schedule
    // attempt died with "Failed to generate study plan" and zero signal.
    // Either the single key or the rotation ring counts as configured.
    if (!process.env.GEMINI_API_KEY && !process.env.GEMINI_API_KEYS) {
      console.error('Generate study plan: GEMINI_API_KEY is not configured');
      await logAiUsage({ route: 'generate-study-plan', userId, ok: false, errorCode: 'AI_NOT_CONFIGURED', latencyMs: Date.now() - planT0 });
      res.status(503).json({
        success: false,
        code: 'AI_NOT_CONFIGURED',
        message: 'AI study generation is unavailable right now — please try again later'
      } as ApiResponse);
      return;
    }

    // Import the smart schedule planner (single AI call, full structured plan)
    const { generateSmartPlan } = await import('../services/aiTutor');

    // Generate structured study plan
    const { plan: studyPlan, fallback: planFallback } = await generateSmartPlan(prompt, userGrade);

    // Award XP for using AI planner — through the shared helper (level
    // math, badges, history, level-up notification). Previously inline with
    // no history entry and no badge checks. Non-fatal: a missing user row
    // must not eat a fully generated plan. The award result (not a
    // hardcoded 5) drives the response: past the daily pool this is 0.
    let planXpGained = 0;
    try {
      const planAward = await awardXP(userId, 5, {
        source: 'ai_plan',
        source_id: null,
        description: 'Generated AI study plan',
        // Farmable (unlimited for Pro): capped via the shared AI pool.
        dailyCap: DAILY_AI_GENERATION_XP_CAP,
        dailyCapSources: AI_GENERATION_XP_SOURCES,
      });
      planXpGained = planAward.xpGained;
    } catch (xpError) {
      console.error('Failed to award AI planner XP:', xpError);
    }

    // Persist in THIS invocation, on the pool that just served auth + XP
    // (already warm). The old flow made the client POST the plan back to
    // /planner/events/batch — a second cold function + pool acquisition that
    // died silently while generation succeeded, stranding every plan. Same
    // validation + single INSERT as the batch route, no extra round trip.
    // A persist failure still returns 200 with the plan: the client falls
    // back to the standalone batch endpoint instead of losing the plan.
    // Fallback skeletons are NEVER persisted: a failed generation that saves
    // 7 generic tasks creates cleanup work, not value.
    let createdEvents: any[] = [];
    let persisted = false;
    if (!planFallback) {
    try {
      const batchInputs = studyPlan.map((e) => ({
        title: e.title,
        subject: e.subject,
        event_date: e.date,
        event_type: e.type,
        notes: e.notes,
      }));
      const verdict = validateBatchEvents(batchInputs, userId);
      if (verdict.ok && verdict.rows.length > 0) {
        // Idempotent persist: a client that aborted the first attempt
        // (timeout toast) retries the SAME plan — insert only what's new.
        const dupSelect = buildRecentDuplicatesSelect(userId, verdict.rows);
        const dupRes = await query(dupSelect.text, dupSelect.values);
        const { fresh, existingRows } = splitNewVsExisting(verdict.rows, dupRes.rows);
        if (fresh.length === 0) {
          createdEvents = existingRows;
          persisted = true;
          console.log(`Study plan already persisted (retry deduped): ${createdEvents.length} events for user ${userId}`);
        } else {
          const { text, values } = buildBatchInsert(fresh);
          const inserted = await query(text, values);
          createdEvents = [...existingRows, ...inserted.rows];
          persisted = true;
          console.log(`Study plan persisted inline: ${inserted.rows.length} events for user ${userId}${existingRows.length > 0 ? ` (${existingRows.length} already present, deduped)` : ''}`);
        }
      } else if (!verdict.ok) {
        console.warn(`Study plan not persisted (validation): ${verdict.message}`);
      }
    } catch (persistError) {
      console.error('Study plan persist failed, returning plan unpersisted:', persistError);
    }
    } else {
      console.warn(`Study plan fallback skeleton for user ${userId}: not persisted, client should offer retry`);
    }

    res.json({
      success: true,
      data: {
        plan: studyPlan,
        xpGained: planXpGained,
        persisted,
        events: createdEvents,
        fallback: planFallback,
      },
      message: planFallback
        ? 'Study plan generation had trouble — showing a starter outline instead'
        : 'Study plan generated successfully'
    } as ApiResponse);
    await logAiUsage({
      route: 'generate-study-plan',
      userId,
      ok: !planFallback,
      errorCode: planFallback ? 'AI_FALLBACK' : null,
      latencyMs: Date.now() - planT0,
    });
    return;
  } catch (error) {
    console.error('Generate study plan error:', error);
    // Quota exhaustion is EXPECTED on a shared free-tier key — answer 429
    // with a plain sentence (not the markdown quota block the chat UI
    // renders; this surfaces in a toast). Every other AI route already does
    // this; the plan route was the lone generic-500 holdout.
    if (error instanceof AIQuotaExceededError) {
      await logAiUsage({ route: 'generate-study-plan', userId: req.user?.id, ok: false, errorCode: 'AI_QUOTA_EXCEEDED' });
      res.status(429).json({
        success: false,
        code: 'AI_QUOTA_EXCEEDED',
        message: 'Daily AI limit reached — please try again later. Limits reset daily.'
      } as ApiResponse);
      return;
    }
    await logAiUsage({ route: 'generate-study-plan', userId: req.user?.id, ok: false, errorCode: 'AI_ERROR' });
    res.status(500).json({
      success: false,
      message: 'Failed to generate study plan'
    } as ApiResponse);
    return;
  }
});

// Image upload with OCR endpoint
// Note: Tesseract.js can be slow on serverless platforms. Consider using a cloud OCR API
// (Google Cloud Vision, AWS Textract) or client-side OCR for better performance.
router.post('/ocr', optionalAuth, upload.single('image'), async (req: express.Request, res: express.Response): Promise<void> => {
  // Set a longer timeout for this endpoint
  req.setTimeout(60000); // 60 seconds
  
  try {
    if (!req.file) {
      res.status(400).json({
        success: false,
        message: 'No image file provided'
      } as ApiResponse);
      return;
    }

    // Check file size - reject very large images to prevent timeouts
    if (req.file.buffer.length > 5 * 1024 * 1024) { // 5MB
      res.status(400).json({
        success: false,
        message: 'Image too large. Please use an image smaller than 5MB for faster processing.'
      } as ApiResponse);
      return;
    }

    // Extract text from image using OCR
    const extractedText = await extractTextFromImage(req.file.buffer);

    res.json({
      success: true,
      data: {
        text: extractedText
      },
      message: 'Text extracted successfully'
    } as ApiResponse);
    return;
  } catch (error) {
    console.error('OCR error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to extract text from image';
    
    // Provide helpful error messages
    if (errorMessage.includes('timeout')) {
      res.status(504).json({
        success: false,
        message: 'OCR processing timed out. The image may be too large or complex. Please try with a smaller or clearer image, or use a cloud OCR service for better performance.'
      } as ApiResponse);
      return;
    }
    
    res.status(500).json({
      success: false,
      message: 'Failed to extract text from image. Please try with a smaller or clearer image.'
    } as ApiResponse);
    return;
  }
});

// AI Chat endpoint using Groq with Llama 3.1
// Use optionalAuth so authenticated users get sessions saved; guests still allowed
// Now accepts both text messages and OCR text.
// Message is validated: an empty/missing message previously crashed title
// generation (message.length of undefined) and burned shared AI quota.
router.post('/chat', [
  optionalAuth,
  body('message').isString().trim().isLength({ min: 1, max: 10000 }).withMessage('Message must be between 1 and 10000 characters'),
  body('subject').optional().isString().trim().isLength({ max: 100 }),
  body('grade').optional().isInt({ min: 0, max: 12 }).toInt(),
  body('sessionId').optional().isUUID().withMessage('Session ID must be a valid UUID'),
  body('documentId').optional().isUUID().withMessage('Document ID must be a valid UUID')
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  // Metering clock (see generate-study-plan): one ai_usage row per outcome.
  // Guests included (userId null) — quota burns the same key either way.
  const chatT0 = Date.now();
  try {
    const { message, subject, grade, sessionId, documentId } = req.body;
    const userId = req.user?.id;

    let currentSessionId = sessionId;
    let history: any[] = [];

    // For authenticated users, handle sessions normally
    if (userId) {
      // Get chat history if session exists
      if (sessionId) {
        const found = await query('SELECT * FROM chat_sessions WHERE id = $1 AND user_id = $2', [sessionId, userId]);
        if (found.rows.length > 0) {
          history = extractMessages(found.rows[0]);
        }
      } else {
        // Create new session if no sessionId provided
        const sessionData = {
          user_id: userId,
          title: message.length > 30 ? message.substring(0, 30) + '...' : message,
          messages: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        };

        const inserted = await dbAdmin.insert('chat_sessions', sessionData);
        currentSessionId = inserted.id;
      }
    } else {
      // For unauthenticated users, don't save sessions
      currentSessionId = null;
    }

    // Import the AI tutor service
    const { getTutorResponse } = await import('../services/aiTutor');

    // Document grounding: when the reader passes documentId, inject the
    // actual excerpt so answers/summaries use the file — not the title.
    // Null (extraction failed / premium-gated) falls back to metadata-only
    // with an honesty guard instead of hallucinating specifics.
    const docResult = await buildDocumentContext(documentId, !!req.user?.is_premium);
    const groundedMessage = docResult.context
      ? `${docResult.context}\n\nStudent question: ${message}`
      : documentId
        ? `Note: The full document text is unavailable (${docResult.reason || 'unknown reason'}). Answer from the context below; if you cannot answer accurately, say you cannot access the full document rather than inventing specifics.\n\nStudent question: ${message}`
        : message;

    // Generate AI response
    const reply = await getTutorResponse(history, groundedMessage, subject || 'General', grade || 10);

    // Store conversation in session (only for authenticated users)
    if (currentSessionId && userId) {
      const found = await query('SELECT * FROM chat_sessions WHERE id = $1 AND user_id = $2', [currentSessionId, userId]);
      const session = found.rows[0];

      if (session) {
        const messages = extractMessages(session);
        messages.push({ role: 'user', text: message, timestamp: new Date().toISOString() });
        messages.push({ role: 'assistant', text: reply, timestamp: new Date().toISOString() });

        await dbAdmin.update('chat_sessions', currentSessionId, {
          messages: messages.length > 100 ? messages.slice(-100) : messages,
          updated_at: new Date().toISOString()
        });
      }
    }

    // Award XP for using AI tutor (only for authenticated users) — through
    // the shared helper (previously inline: history yes, badges and
    // level-up notification no). Non-fatal: never fail a generated reply
    // over the XP credit.
    let xpGained = 0;
    if (userId) {
      try {
        const award = await awardXP(userId, 5, {
          source: 'ai_tutor',
          source_id: currentSessionId || null,
          description: 'Used AI Tutor',
          // Every chat message awards XP and chat is unlimited: without the
          // shared daily pool, "hi" x200 mints a level. Past the pool the
          // award trims to zero; the reply itself is unaffected.
          dailyCap: DAILY_AI_GENERATION_XP_CAP,
          dailyCapSources: AI_GENERATION_XP_SOURCES,
        });
        xpGained = award.xpGained;
      } catch (xpError) {
        console.error('Failed to award AI tutor XP:', xpError);
      }
    }

    res.json({
      success: true,
      data: {
        response: reply,
        sessionId: currentSessionId,
        ...(userId && { xpGained }),
        // Grounding signal for the reader: a summary request answered without
        // the excerpt is not a document summary — the UI renders a designed
        // empty state instead of the model's honesty fallback. A metadata
        // overview (partial) renders WITH a notice banner instead.
        ...(documentId ? {
          grounded: docResult.grounded,
          partial: docResult.partial,
          ...(docResult.notice ? { notice: docResult.notice } : {}),
          ...(docResult.reason ? { unavailableReason: docResult.reason } : {}),
        } : {}),
      },
      message: 'AI response generated successfully'
    } as ApiResponse);
    await logAiUsage({ route: 'chat', userId, ok: true, latencyMs: Date.now() - chatT0 });
    return;
  } catch (error) {
    console.error('AI chat error:', error);
    const { status, message } = aiErrorResponse(error);
    await logAiUsage({
      route: 'chat',
      userId: req.user?.id,
      ok: false,
      errorCode: error instanceof AIQuotaExceededError ? 'AI_QUOTA_EXCEEDED' : 'AI_ERROR',
      latencyMs: Date.now() - chatT0,
    });
    res.status(status).json({
      success: false,
      message
    } as ApiResponse);
    return;
  }
});

// Streaming AI chat via Server-Sent Events
// Sends incremental text deltas so the frontend can render as the model writes.
router.post('/chat/stream', [
  optionalAuth,
  body('message').isString().trim().isLength({ min: 1, max: 10000 }).withMessage('Message must be between 1 and 10000 characters'),
  body('subject').optional().isString().trim().isLength({ max: 100 }),
  body('grade').optional().isInt({ min: 0, max: 12 }).toInt(),
  body('sessionId').optional().isUUID().withMessage('Session ID must be a valid UUID'),
  body('documentId').optional().isUUID().withMessage('Document ID must be a valid UUID')
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  const { message, subject, grade, sessionId, deepThinking, documentId } = req.body;
  const userId = req.user?.id;
  const t0 = Date.now();
  const elapsed = () => `${Date.now() - t0}ms`;

  // SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const send = (event: string, data: any) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  let currentSessionId: string | null = sessionId ?? null;
  let history: any[] = [];
  // For brand-new sessions the insert runs CONCURRENTLY with stream startup
  // (history is already known to be empty) — saves a full DB round-trip
  // before the first token. Awaited before persistence below.
  let pendingSessionInsert: Promise<string | null> | null = null;

  try {
    if (userId) {
      if (sessionId) {
        // Indexed lookup (never a full-table scan — chat_sessions grows unbounded)
        const found = await query('SELECT * FROM chat_sessions WHERE id = $1 AND user_id = $2', [sessionId, userId]);
        if (found.rows.length > 0) history = extractMessages(found.rows[0]);
      } else {
        const sessionData = {
          user_id: userId,
          title: message.length > 30 ? message.substring(0, 30) + '...' : message,
          messages: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        pendingSessionInsert = dbAdmin.insert('chat_sessions', sessionData)
          .then((inserted: any) => {
            currentSessionId = inserted.id;
            send('session', { sessionId: currentSessionId });
            return inserted.id as string;
          })
          .catch((err: any) => {
            console.error('Background session insert failed:', err?.message);
            return null;
          });
      }
    } else {
      currentSessionId = null;
    }

    if (currentSessionId) {
      send('session', { sessionId: currentSessionId });
    }

    const { streamTutorResponse, getTutorResponse, AIQuotaExceededError: QuotaError } = await import('../services/aiTutor');

    // Same document grounding as the non-streaming route (see above).
    // Session history keeps the ORIGINAL short message — the excerpt is
    // re-injected fresh each turn so stored sessions don't balloon.
    const docResult = await buildDocumentContext(documentId, !!req.user?.is_premium);
    const groundedMessage = docResult.context
      ? `${docResult.context}\n\nStudent question: ${message}`
      : documentId
        ? `Note: The full document text is unavailable (${docResult.reason || 'unknown reason'}). Answer from the context below; if you cannot answer accurately, say you cannot access the full document rather than inventing specifics.\n\nStudent question: ${message}`
        : message;

    console.log(`[tutor] prep done in ${elapsed()} (history: ${history.length} msgs, deep: ${!!deepThinking}, doc: ${docResult.grounded ? 'grounded' : documentId ? `unavailable:${docResult.reason}` : 'none'})`);
    const tGen = Date.now();
    let full = '';
    let quotaExceeded = false;
    try {
      full = await streamTutorResponse(history, groundedMessage, subject || 'General', grade || 10, (delta) => {
        send('delta', { text: delta });
      }, { deepThinking: !!deepThinking });
    } catch (streamError: any) {
      if (streamError instanceof QuotaError) {
        // All models exhausted — the non-streaming fallback would fail
        // identically, so skip it and show the quota message directly.
        quotaExceeded = true;
        full = AI_QUOTA_MESSAGE;
        send('delta', { text: full });
      } else {
        // Streaming failed — fall back to non-streaming so the user still gets an answer
        console.error('Streaming error, falling back to non-streaming:', streamError?.message);
        full = await getTutorResponse(history, groundedMessage, subject || 'General', grade || 10, { deepThinking: !!deepThinking });
        send('delta', { text: full });
      }
    }
    console.log(`[tutor] generation done in ${Date.now() - tGen}ms (${full.length} chars, quota: ${quotaExceeded})`);

    // Persist conversation (authenticated users).
    // Settle the background session insert first so currentSessionId is final.
    if (pendingSessionInsert) {
      await pendingSessionInsert;
      pendingSessionInsert = null;
    }
    if (currentSessionId && userId) {
      const found = await query('SELECT * FROM chat_sessions WHERE id = $1 AND user_id = $2', [currentSessionId, userId]);
      const session = found.rows[0];
      if (session) {
        const msgs = extractMessages(session);
        msgs.push({ role: 'user', text: message, timestamp: new Date().toISOString() });
        msgs.push({ role: 'assistant', text: full, timestamp: new Date().toISOString() });
        await dbAdmin.update('chat_sessions', currentSessionId, { messages: msgs.length > 100 ? msgs.slice(-100) : msgs, updated_at: new Date().toISOString() });
      }
    }

    // Award XP for authenticated users — through the shared helper (see the
    // non-streaming chat route above for why inline crediting ended).
    // Non-fatal: never fail a streamed reply over the XP credit.
    let xpGained = 0;
    if (userId) {
      try {
        const award = await awardXP(userId, 5, {
          source: 'ai_tutor',
          source_id: currentSessionId || null,
          description: 'Used AI Tutor',
          // Every chat message awards XP and chat is unlimited: without the
          // shared daily pool, "hi" x200 mints a level. Past the pool the
          // award trims to zero; the reply itself is unaffected.
          dailyCap: DAILY_AI_GENERATION_XP_CAP,
          dailyCapSources: AI_GENERATION_XP_SOURCES,
        });
        xpGained = award.xpGained;
      } catch (xpError) {
        console.error('Failed to award AI tutor XP:', xpError);
      }
    }

    send('done', {
      sessionId: currentSessionId,
      xpGained,
      ...(documentId ? {
        grounded: docResult.grounded,
        partial: docResult.partial,
        ...(docResult.notice ? { notice: docResult.notice } : {}),
      } : {}),
    });
    await logAiUsage({
      route: 'chat-stream',
      userId,
      ok: !quotaExceeded,
      errorCode: quotaExceeded ? 'AI_QUOTA_EXCEEDED' : null,
      latencyMs: Date.now() - t0,
    });
  } catch (error) {
    console.error('AI chat stream error:', error);
    const streamQuotaErr = error instanceof AIQuotaExceededError;
    await logAiUsage({
      route: 'chat-stream',
      userId,
      ok: false,
      errorCode: streamQuotaErr ? 'AI_QUOTA_EXCEEDED' : 'AI_ERROR',
      latencyMs: Date.now() - t0,
    });
    if (streamQuotaErr) {
      // No content was streamed (partial content would have returned normally).
      // Send the quota message as content so the user sees an explanation,
      // not a blank bubble.
      send('delta', { text: AI_QUOTA_MESSAGE });
      send('done', { sessionId: currentSessionId, xpGained: 0, quotaExceeded: true });
    } else {
      send('error', { message: 'Failed to generate AI response' });
    }
  } finally {
    res.end();
  }
});

// Generate practice quiz questions
router.post('/generate-practice-quiz', [
  authenticateToken,
  body('subject').isString().trim().isLength({ min: 1, max: 100 }).withMessage('Subject is required'),
  body('grade').isInt({ min: 0, max: 12 }).toInt().withMessage('Grade must be between 0 and 12'),
  body('difficulty').optional().isIn(['Easy', 'Medium', 'Hard']).withMessage('Difficulty must be Easy, Medium, or Hard'),
  body('count').optional().isInt({ min: 1, max: 10 }).toInt().withMessage('Count must be between 1 and 10')
], validateRequest, async (req: express.Request, res: express.Response): Promise<void> => {
  // Metering clock (see generate-study-plan): one ai_usage row per outcome.
  const quizT0 = Date.now();
  try {
    const { subject, grade, difficulty = 'Medium', count = 5 } = req.body;
    const userId = req.user!.id;

    // One indexed lookup for both the premium gate and the free daily gate
    // (was two sequential SELECTs on the same row — on a 400ms/query link
    // every round trip counts toward the client's abort timeout). The window
    // math stays in SQL so day rollover still uses the DB date, not the
    // server's timezone guess.
    const userRows = await query(
      `SELECT id, is_premium,
        CASE WHEN daily_quiz_date = ${EAT_TODAY_SQL} THEN COALESCE(daily_quiz_count, 0) ELSE 0 END AS used_today
       FROM users WHERE id = $1`,
      [userId]
    );
    const user = userRows.rows[0];

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      } as ApiResponse);
      return;
    }

    // Server-side daily gate for free users. Postgres compares the window
    // date so day rollover needs no cron and no timezone guessing.
    if (!user.is_premium) {
      const usedToday = Number(user.used_today || 0);
      if (usedToday >= FREE_DAILY_QUIZ_LIMIT) {
        res.status(429).json({
          success: false,
          message: "You've used your free daily practice session. Upgrade to Student Pro for unlimited AI-generated quizzes.",
          code: 'DAILY_LIMIT_REACHED'
        } as ApiResponse);
        return;
      }
    }

    // Generate questions via the dedicated Gemini quiz generator
    const { generatePracticeQuiz } = await import('../services/aiTutor');
    const questions = await generatePracticeQuiz(subject, Number(grade), difficulty, Math.min(Number(count) || 5, 10));

    // Award XP for generating practice questions + consume one daily window
    // slot (free users). Charged only on success — failed generations are free.
    // Credited through the shared helper (previously an inline update with no
    // history entry and no badge checks).
    const award = await awardXP(userId, 5, {
      source: 'practice_generation',
      source_id: null,
      description: `Generated practice quiz: ${subject}`,
      // Unlimited generations for Pro: capped via the shared AI pool.
      dailyCap: DAILY_AI_GENERATION_XP_CAP,
      dailyCapSources: AI_GENERATION_XP_SOURCES,
    });
    await query(
      `UPDATE users
       SET daily_quiz_count = CASE WHEN daily_quiz_date = ${EAT_TODAY_SQL} THEN COALESCE(daily_quiz_count, 0) + 1 ELSE 1 END,
           daily_quiz_date = ${EAT_TODAY_SQL},
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [userId]
    );

    res.json({
      success: true,
      data: { questions, xpGained: award.xpGained }
    } as ApiResponse);
    await logAiUsage({ route: 'generate-practice-quiz', userId, ok: true, latencyMs: Date.now() - quizT0 });
  } catch (error) {
    console.error('Generate practice quiz error:', error);
    const { status, message } = aiErrorResponse(error);
    await logAiUsage({
      route: 'generate-practice-quiz',
      userId: req.user?.id,
      ok: false,
      errorCode: error instanceof AIQuotaExceededError ? 'AI_QUOTA_EXCEEDED' : 'AI_ERROR',
      latencyMs: Date.now() - quizT0,
    });
    res.status(status).json({
      success: false,
      message
    } as ApiResponse);
  }
});

// Public AI usage status (aggregate counts only — no users, no prompts).
// Exists so the unattended quota watcher can ask "is the shared key
// exhausted?" without credentials. Coarse by design: 24h totals only.
router.get('/usage-status', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const r = await query(
      `SELECT COUNT(*) AS calls,
              COUNT(*) FILTER (WHERE ok IS NOT TRUE) AS failures,
              COUNT(*) FILTER (WHERE error_code = 'AI_QUOTA_EXCEEDED') AS quota_errors
       FROM ai_usage WHERE created_at >= NOW() - INTERVAL '24 hours'`
    );
    const row = r.rows[0] || {};
    res.json({
      success: true,
      data: {
        calls24h: Number(row.calls || 0),
        failures24h: Number(row.failures || 0),
        quotaErrors24h: Number(row.quota_errors || 0),
      },
    } as ApiResponse);
  } catch (error) {
    // Table missing (migration not run) or DB down: report unknown, not 500
    // noise — the health endpoint already covers DB reachability.
    res.json({ success: true, data: { calls24h: 0, failures24h: 0, quotaErrors24h: 0, unknown: true } } as ApiResponse);
  }
});

export default router;
