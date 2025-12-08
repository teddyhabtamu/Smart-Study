import express from 'express';
import { dbAdmin } from '../database/config';
import { authenticateToken } from '../middleware/auth';
import { ApiResponse, ChatSession } from '../types';

const router = express.Router();

// Get user's chat sessions
router.get('/sessions', authenticateToken, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const userId = req.user!.id;

    const sessions = await dbAdmin.get('chat_sessions');
    const filteredSessions = sessions.filter((s: any) => s.user_id === userId);

    // Sort by creation date (newest first)
    filteredSessions.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    res.json({
      success: true,
      data: filteredSessions
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
      data: session
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
    const messages = session.messages || [];
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
    const { prompt, grade } = req.body;
    const userId = req.user!.id;

    // Import the specialized study plan generator
    const { generateStudyPlan } = await import('../services/geminiService');

    // Generate structured study plan
    const studyPlan = await generateStudyPlan(prompt, grade);

    // Award XP for using AI planner
    const user = await dbAdmin.findOne('users', (u: any) => u.id === userId);
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

// AI Chat endpoint using Groq with Llama 3.1
router.post('/chat', async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { message, subject, grade, sessionId } = req.body;
    const userId = req.user?.id;

    let currentSessionId = sessionId;
    let history: any[] = [];

    // For authenticated users, handle sessions normally
    if (userId) {
      // Get chat history if session exists
      if (sessionId) {
        const session = await dbAdmin.findOne('chat_sessions', (s: any) =>
          s.id === sessionId && s.user_id === userId
        );
        if (session && session.messages) {
          history = session.messages;
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
      const session = await dbAdmin.findOne('chat_sessions', (s: any) =>
        s.id === currentSessionId && s.user_id === userId
      );

      if (session) {
        const messages = session.messages || [];
        messages.push({ role: 'user', text: message, timestamp: new Date().toISOString() });
        messages.push({ role: 'model', text: reply, timestamp: new Date().toISOString() });

        await dbAdmin.update('chat_sessions', currentSessionId, {
          messages,
          updated_at: new Date().toISOString()
        });
      }
    }

    // Award XP for using AI tutor (only for authenticated users)
    let xpGained = 0;
    if (userId) {
      const user = await dbAdmin.findOne('users', (u: any) => u.id === userId);
      if (user) {
        const newXp = (user.xp || 0) + 5;
        const newLevel = Math.floor(newXp / 1000) + 1;
        await dbAdmin.update('users', userId, { xp: newXp, level: newLevel });
        xpGained = 5;
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
    res.status(500).json({
      success: false,
      message: 'Failed to generate AI response'
    } as ApiResponse);
    return;
  }
});

// Generate practice quiz questions
router.post('/generate-practice-quiz', authenticateToken, async (req: express.Request, res: express.Response): Promise<void> => {
  try {
    const { subject, grade, difficulty = 'Medium', count = 5 } = req.body;
    const userId = req.user!.id;

    // Check if user is premium (practice quizzes might be premium feature)
    const users = await dbAdmin.get('users');
    const user = users.find(u => u.id === userId);

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      } as ApiResponse);
      return;
    }

    // Generate practice questions using AI
    const { getTutorResponse } = await import('../services/aiTutor');

    const prompt = `Generate ${count} ${difficulty.toLowerCase()} practice questions for ${subject} at Grade ${grade} level. Each question should be multiple choice with 4 options, one correct answer, and a brief explanation.

Format your response as a valid JSON array of objects with this exact structure:
[
  {
    "question": "Question text here?",
    "options": ["First option text", "Second option text", "Third option text", "Fourth option text"],
    "correctAnswer": "First option text",
    "explanation": "Brief explanation why this is correct."
  }
]

IMPORTANT: The correctAnswer must be the EXACT text of one of the options, not a letter (A, B, C, D). Make sure the questions are appropriate for Grade ${grade} ${subject}, cover important concepts, and test key understanding.`;

    console.log('Generating practice quiz with prompt:', prompt.substring(0, 100) + '...');

    const aiResponse = await getTutorResponse([], prompt, subject, grade);
    console.log('AI response for practice quiz:', aiResponse.substring(0, 200) + '...');

    // Parse the JSON response
    let questions = [];
    try {
      // Try to extract JSON from the response
      const jsonMatch = aiResponse.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        questions = JSON.parse(jsonMatch[0]);
      } else {
        // Fallback: try to parse the entire response as JSON
        questions = JSON.parse(aiResponse);
      }

      // Validate the structure
      if (!Array.isArray(questions)) {
        throw new Error('Response is not an array');
      }

      // Validate and fix each question
      questions = questions.map((q: any, index: number) => {
        if (!q.question || !Array.isArray(q.options) || q.options.length !== 4 || !q.correctAnswer || !q.explanation) {
          throw new Error(`Question ${index + 1} has invalid structure`);
        }

        // Convert letter answers (A, B, C, D) to actual option text
        let correctAnswer = q.correctAnswer;
        if (typeof correctAnswer === 'string' && correctAnswer.length === 1) {
          const letter = correctAnswer.toUpperCase();
          const index = letter.charCodeAt(0) - 'A'.charCodeAt(0);
          if (index >= 0 && index < q.options.length) {
            correctAnswer = q.options[index];
          }
        }

        return {
          question: q.question,
          options: q.options,
          correctAnswer: correctAnswer,
          explanation: q.explanation
        };
      });

      // Award XP for generating practice questions
      const newXp = (user.xp || 0) + 5;
      const newLevel = Math.floor(newXp / 1000) + 1;
      await dbAdmin.update('users', userId, { xp: newXp, level: newLevel });

      res.json({
        success: true,
        data: questions,
        xpGained: 5
      } as ApiResponse);

    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError);
      console.error('AI Response was:', aiResponse);

      // Return fallback questions if parsing fails
      const fallbackQuestions = [];
      for (let i = 0; i < Math.min(count, 3); i++) {
        fallbackQuestions.push({
          question: `Sample ${difficulty} question about ${subject} for Grade ${grade}`,
          options: ["Option A", "Option B", "Option C", "Option D"],
          correctAnswer: "Option A",
          explanation: "This is a sample answer explanation."
        });
      }

      res.json({
        success: true,
        data: fallbackQuestions,
        xpGained: 0,
        message: 'Generated basic practice questions due to AI parsing issues'
      } as ApiResponse);
    }

  } catch (error) {
    console.error('Generate practice quiz error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate practice quiz'
    } as ApiResponse);
  }
});

export default router;
