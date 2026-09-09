import express from 'express';
import multer from 'multer';
import { dbAdmin, query } from '../database/config';
import { authenticateToken, optionalAuth } from '../middleware/auth';
import { ApiResponse, ChatSession, User } from '../types';
import { extractTextFromImage } from '../services/ocrService';
import { AIQuotaExceededError, AI_QUOTA_MESSAGE } from '../services/aiTutor';

// Map AI errors to HTTP responses: quota exhaustion → 429 with a clear,
// user-friendly message; everything else → 500.
const aiErrorResponse = (error: any): { status: number; message: string } => {
  if (error instanceof AIQuotaExceededError) {
    return { status: 429, message: AI_QUOTA_MESSAGE };
  }
  return { status: 500, message: 'Failed to generate AI response' };
};

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
const extractMessages = (session: any): { role: string; text: string; timestamp?: string }[] => {
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

    const sessions = await dbAdmin.get('chat_sessions');
    const filteredSessions = sessions.filter((s: any) => s.user_id === userId);

    // Sort by creation date (newest first)
    filteredSessions.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // Normalize messages so clients always receive an array
    const normalized = filteredSessions.map((s: any) => ({ ...s, messages: extractMessages(s) }));

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
router.post('/sessions', authenticateToken, async (req: express.Request, res: express.Response): Promise<void> => {
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

    const session = await dbAdmin.findOne('chat_sessions', (s: any) =>
      s.id === sessionId && s.user_id === userId
    );

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

// Add message to chat session
router.post('/sessions/:id/messages', authenticateToken, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { role, text } = req.body;
    const userId = req.user!.id;
    const sessionId = id;

    // Verify session ownership
    const session = await dbAdmin.findOne('chat_sessions', (s: any) =>
      s.id === sessionId && s.user_id === userId
    );

    if (!session) {
      res.status(404).json({
        success: false,
        message: 'Chat session not found'
      } as ApiResponse);
      return;
    }

    // Add message to session
    const messages = extractMessages(session);
    const newMessage = {
      role,
      text,
      timestamp: new Date().toISOString()
    };

    messages.push(newMessage);

    // Update session
    await dbAdmin.update('chat_sessions', sessionId, {
      messages,
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
router.put('/sessions/:id', authenticateToken, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { title } = req.body;
    const userId = req.user!.id;
    const sessionId = id;

    // Verify session ownership
    const session = await dbAdmin.findOne('chat_sessions', (s: any) =>
      s.id === sessionId && s.user_id === userId
    );

    if (!session) {
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

    // Verify session ownership
    const session = await dbAdmin.findOne('chat_sessions', (s: any) =>
      s.id === sessionId && s.user_id === userId
    );

    if (!session) {
      res.status(404).json({
        success: false,
        message: 'Chat session not found'
      } as ApiResponse);
      return;
    }

    // Delete session
    await dbAdmin.delete('chat_sessions', sessionId);

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

// Generate Study Plan using AI
router.post('/generate-study-plan', authenticateToken, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { prompt } = req.body;
    const userId = req.user!.id;
    const userGrade = req.user!.grade ?? 10;

    // Import the smart schedule planner (single AI call, full structured plan)
    const { generateSmartPlan } = await import('../services/aiTutor');

    // Generate structured study plan
    const studyPlan = await generateSmartPlan(prompt, userGrade);

    // Award XP for using AI planner
    const userRows = await query('SELECT xp FROM users WHERE id = $1', [userId]);
    const user = userRows.rows[0];
    if (user) {
      const newXp = (user.xp || 0) + 5;
      const newLevel = Math.floor(newXp / 1000) + 1;
      await dbAdmin.update('users', userId, { xp: newXp, level: newLevel });
    }

    res.json({
      success: true,
      data: {
        plan: studyPlan,
        xpGained: 5
      },
      message: 'Study plan generated successfully'
    } as ApiResponse);
    return;
  } catch (error) {
    console.error('Generate study plan error:', error);
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
      message: errorMessage
    } as ApiResponse);
    return;
  }
});

// AI Chat endpoint using Groq with Llama 3.1
// Use optionalAuth so authenticated users get sessions saved; guests still allowed
// Now accepts both text messages and OCR text
router.post('/chat', optionalAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { message, subject, grade, sessionId } = req.body;
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

    // Generate AI response
    const reply = await getTutorResponse(history, message, subject || 'General', grade || 10);

    // Store conversation in session (only for authenticated users)
    if (currentSessionId && userId) {
      const found = await query('SELECT * FROM chat_sessions WHERE id = $1 AND user_id = $2', [currentSessionId, userId]);
      const session = found.rows[0];

      if (session) {
        const messages = extractMessages(session);
        messages.push({ role: 'user', text: message, timestamp: new Date().toISOString() });
        messages.push({ role: 'assistant', text: reply, timestamp: new Date().toISOString() });

        await dbAdmin.update('chat_sessions', currentSessionId, {
          messages,
          updated_at: new Date().toISOString()
        });
      }
    }

    // Award XP for using AI tutor (only for authenticated users)
    let xpGained = 0;
    if (userId) {
      const userRows = await query('SELECT xp FROM users WHERE id = $1', [userId]);
      const user = userRows.rows[0];
      if (user) {
        const xpGain = 5;
        const newXp = (user.xp || 0) + xpGain;
        const newLevel = Math.floor(newXp / 1000) + 1;
        await dbAdmin.update('users', userId, { xp: newXp, level: newLevel });
        
        // Record XP history
        await dbAdmin.insert('xp_history', {
          user_id: userId,
          amount: xpGain,
          source: 'ai_tutor',
          source_id: currentSessionId || null,
          description: 'Used AI Tutor'
        });
        
        xpGained = xpGain;
      }
    }

    res.json({
      success: true,
      data: {
        response: reply,
        sessionId: currentSessionId,
        ...(userId && { xpGained })
      },
      message: 'AI response generated successfully'
    } as ApiResponse);
    return;
  } catch (error) {
    console.error('AI chat error:', error);
    const { status, message } = aiErrorResponse(error);
    res.status(status).json({
      success: false,
      message
    } as ApiResponse);
    return;
  }
});

// Streaming AI chat via Server-Sent Events
// Sends incremental text deltas so the frontend can render as the model writes.
router.post('/chat/stream', optionalAuth, async (req: express.Request, res: express.Response): Promise<void> => {
  const { message, subject, grade, sessionId, deepThinking } = req.body;
  const userId = req.user?.id;
  const t0 = Date.now();
  const elapsed = () => `${Date.now() - t0}ms`;

  if (!message || typeof message !== 'string') {
    res.status(400).json({ success: false, message: 'Message is required' } as ApiResponse);
    return;
  }

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

    console.log(`[tutor] prep done in ${elapsed()} (history: ${history.length} msgs, deep: ${!!deepThinking})`);
    const tGen = Date.now();
    let full = '';
    let quotaExceeded = false;
    try {
      full = await streamTutorResponse(history, message, subject || 'General', grade || 10, (delta) => {
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
        full = await getTutorResponse(history, message, subject || 'General', grade || 10, { deepThinking: !!deepThinking });
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
        await dbAdmin.update('chat_sessions', currentSessionId, { messages: msgs, updated_at: new Date().toISOString() });
      }
    }

    // Award XP for authenticated users
    let xpGained = 0;
    if (userId) {
      const userRows = await query('SELECT xp FROM users WHERE id = $1', [userId]);
      const user = userRows.rows[0];
      if (user) {
        const xpGain = 5;
        const newXp = (user.xp || 0) + xpGain;
        const newLevel = Math.floor(newXp / 1000) + 1;
        await dbAdmin.update('users', userId, { xp: newXp, level: newLevel });
        await dbAdmin.insert('xp_history', {
          user_id: userId,
          amount: xpGain,
          source: 'ai_tutor',
          source_id: currentSessionId || null,
          description: 'Used AI Tutor',
        });
        xpGained = xpGain;
      }
    }

    send('done', { sessionId: currentSessionId, xpGained });
  } catch (error) {
    console.error('AI chat stream error:', error);
    if (error instanceof AIQuotaExceededError) {
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
router.post('/generate-practice-quiz', authenticateToken, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { subject, grade, difficulty = 'Medium', count = 5 } = req.body;
    const userId = req.user!.id;

    // Look up the requesting user directly (no full-table scan)
    const user = await dbAdmin.findOne('users', (u: any) => u.id === userId);

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      } as ApiResponse);
      return;
    }

    // Generate questions via the dedicated Gemini quiz generator
    const { generatePracticeQuiz } = await import('../services/aiTutor');
    const questions = await generatePracticeQuiz(subject, Number(grade), difficulty, Math.min(Number(count) || 5, 10));

    // Award XP for generating practice questions
    const newXp = (user.xp || 0) + 5;
    const newLevel = Math.floor(newXp / 1000) + 1;
    await dbAdmin.update('users', userId, { xp: newXp, level: newLevel });

    res.json({
      success: true,
      data: { questions, xpGained: 5 }
    } as ApiResponse);
  } catch (error) {
    console.error('Generate practice quiz error:', error);
    const { status, message } = aiErrorResponse(error);
    res.status(status).json({
      success: false,
      message
    } as ApiResponse);
  }
});

export default router;
