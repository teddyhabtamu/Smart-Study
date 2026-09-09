// AI Tutor service — Google Gemini 2.x via @google/genai
// Replaces the previous Groq/Llama implementation (weak for math/science tutoring)
// and the three dead geminiService* variants.

import { GoogleGenAI } from '@google/genai';

// --- Client -------------------------------------------------------------
let ai: GoogleGenAI | null = null;

const getClient = (): GoogleGenAI => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }
  if (!ai) {
    ai = new GoogleGenAI({ apiKey });
  }
  return ai;
};

export const AI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

// Fallback chain: each model has a separate free-tier quota. If the primary
// model is rate-limited, we try the next one before giving up.
// NOTE: verified 2026-09-09 via models.list — gemini-2.0-flash is RETIRED (404),
// do NOT add it back. Lite models carry much higher free quotas.
const MODEL_FALLBACKS = [
  process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-3.5-flash-lite',
].filter((m, i, arr) => m && arr.indexOf(m) === i);

// Typed error for quota exhaustion so routes can return 429 (not 500)
export class AIQuotaExceededError extends Error {
  retryAfterSeconds: number;
  constructor(message: string, retryAfterSeconds = 60) {
    super(message);
    this.name = 'AIQuotaExceededError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

const isQuotaError = (err: any): boolean => {
  const msg = String(err?.message || '');
  const status = (err as any)?.status;
  return (
    status === 429 ||
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('Quota exceeded') ||
    msg.includes('quota')
  );
};

// A retired/unknown model (404 NOT_FOUND) should also fall through to the
// next model rather than failing the request.
const isModelGoneError = (err: any): boolean => {
  const msg = String(err?.message || '');
  const status = (err as any)?.status;
  return (
    status === 404 ||
    (msg.includes('404') && msg.includes('model')) ||
    msg.includes('is no longer available') ||
    msg.includes('NOT_FOUND')
  );
};

const quotaRetryAfter = (err: any): number => {
  try {
    const details = (err as any)?.error?.details || [];
    for (const d of details) {
      const retry = d?.retryDelay;
      if (retry) {
        const m = String(retry).match(/(\d+)/);
        if (m?.[1]) return parseInt(m[1], 10);
      }
    }
  } catch { /* ignore */ }
  const m = String(err?.message || '').match(/retry in ([\d.]+)s/i);
  if (m?.[1]) return Math.ceil(parseFloat(m[1]));
  return 60;
};

// Run fn against each model in the fallback chain. Quota errors move to the
// next model; if all are exhausted, throw AIQuotaExceededError.
const withModelFallback = async <T>(fn: (model: string) => Promise<T>): Promise<T> => {
  let lastQuotaError: any = null;
  let retryAfter = 60;
  for (const model of MODEL_FALLBACKS) {
    try {
      return await fn(model);
    } catch (err) {
      if (isQuotaError(err)) {
        console.warn(`Gemini quota hit on ${model}, trying fallback...`);
        lastQuotaError = err;
        retryAfter = Math.max(retryAfter, quotaRetryAfter(err));
        continue;
      }
      if (isModelGoneError(err)) {
        console.warn(`Gemini model ${model} unavailable, trying fallback...`);
        continue;
      }
      throw err;
    }
  }
  throw new AIQuotaExceededError(
    'Daily AI limit reached. Please try again later — limits reset daily.',
    retryAfter
  );
};

export const AI_QUOTA_MESSAGE =
  '## ⏳ Daily AI Limit Reached\n\nWe have used up today\'s free AI responses. The limit resets daily — please try again later, or explore the library, videos, and practice materials in the meantime!';

// --- Shared prompts ------------------------------------------------------
const TUTOR_SYSTEM_PROMPT = `
You are SmartStudy AI Tutor for Ethiopian students (Grade 9-12).

CRITICAL: You MUST respond ONLY in ENGLISH. Do not use Amharic, Arabic, or any other language. All responses must be in English.

MOST IMPORTANT: ACCURACY IS CRITICAL. You must provide CORRECT and ACCURATE answers. If you are unsure, say so rather than guessing.

You must:
- Provide ACCURATE and CORRECT answers - double-check your reasoning before responding
- For grammar, punctuation, and language questions: Apply standard English grammar rules correctly
- For multiple choice questions: Carefully analyze each option and identify the CORRECT answer based on established rules
- Explain concepts simply and clearly in ENGLISH only
- Break down complex topics into steps in ENGLISH
- Give relevant examples from Ethiopian context when appropriate, but explain in ENGLISH
- Avoid complex English, use simple and clear language
- Give formulas and equations when needed for math/science (use LaTeX: $...$ inline, $$...$$ display)
- Give final answers clearly and CORRECTLY in ENGLISH
- Be encouraging and patient in ENGLISH
- Focus on helping students understand and learn with ACCURATE information

When answering questions:
1. Read the question carefully
2. Apply the correct rules (grammar, math, science, etc.)
3. Verify your answer is correct before responding
4. Explain why the correct answer is correct and why incorrect options are wrong

Always provide direct, helpful, and ACCURATE answers to questions in ENGLISH only. Do not give generic educational support messages. Respond in English regardless of the student's question language.
`.trim();

// Normalize chat history to Gemini contents format. Tolerates legacy
// session rows where messages is an object/record rather than an array.
const toContents = (
  history: any,
  userPrompt: string
): Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> => {
  const safeHistory = Array.isArray(history) ? history : [];
  const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

  for (const m of safeHistory) {
    if (!m) continue;
    const text = String((m as any).text ?? '');
    if (!text) continue;
    const role = (m as any).role === 'user' ? ('user' as const) : ('model' as const);
    contents.push({ role, parts: [{ text }] });
  }

  contents.push({ role: 'user', parts: [{ text: userPrompt }] });
  return contents;
};

// --- Core non-streaming completion --------------------------------------
const complete = async (
  systemPrompt: string,
  userPrompt: string,
  history: { role: string; text: string }[] = [],
  temperature = 0.3
): Promise<string> => {
  const client = getClient();

  const contents = toContents(history, userPrompt);

  return withModelFallback(async (model) => {
    const response = await client.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction: systemPrompt,
        temperature,
        maxOutputTokens: 4096,
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error('Empty response from Gemini');
    }
    return text;
  });
};

// --- Tutor chat (non-streaming fallback) --------------------------------
export async function getTutorResponse(
  history: any[],
  message: string,
  subject: string,
  grade: number
): Promise<string> {
  // Detect if this is a grammar/punctuation question
  const lower = message.toLowerCase();
  const isGrammarQuestion =
    lower.includes('punctuation') ||
    lower.includes('capitalization') ||
    lower.includes('grammar') ||
    lower.includes('correctly punctuated') ||
    (subject.toLowerCase() === 'english' && message.includes('A.') && message.includes('B.'));

  let userMessage = `Subject: ${subject}, Grade: ${grade}\nQuestion: ${message}`;
  if (isGrammarQuestion) {
    userMessage += `

IMPORTANT: This is a grammar/punctuation question. Apply standard English grammar rules strictly. For punctuation questions:
- Two independent clauses must be separated by a period (.), semicolon (;), or joined with a comma + conjunction
- A comma alone cannot join two independent clauses (this is a comma splice error)
- After a semicolon, the next clause should start with a lowercase letter unless it's a proper noun
- Carefully analyze each option and identify which follows correct grammar rules`;
  }

  try {
    return await complete(TUTOR_SYSTEM_PROMPT, userMessage, history);
  } catch (error) {
    // Quota errors must propagate so routes can return 429 with a clear
    // message — swallowing them here would show a misleading generic error.
    if (error instanceof AIQuotaExceededError) throw error;
    console.error('Gemini AI Error:', error);
    return `## 🤖 AI Tutor Temporarily Unavailable

I'm currently unable to connect to the AI service. This might be because:

- The AI service is temporarily down
- Network connectivity issues
- API rate limits

Please try again in a few moments, or explore other study materials on the platform in the meantime!`;
  }
}

// --- Tutor chat (streaming) ----------------------------------------------
// Calls onChunk with incremental text deltas; returns the full text at the end.
export async function streamTutorResponse(
  history: any[],
  message: string,
  subject: string,
  grade: number,
  onChunk: (delta: string) => void
): Promise<string> {
  const client = getClient();

  const lower = message.toLowerCase();
  const isGrammarQuestion =
    lower.includes('punctuation') ||
    lower.includes('capitalization') ||
    lower.includes('grammar') ||
    lower.includes('correctly punctuated') ||
    (subject.toLowerCase() === 'english' && message.includes('A.') && message.includes('B.'));

  let userMessage = `Subject: ${subject}, Grade: ${grade}\nQuestion: ${message}`;
  if (isGrammarQuestion) {
    userMessage += `

IMPORTANT: This is a grammar/punctuation question. Apply standard English grammar rules strictly. For punctuation questions:
- Two independent clauses must be separated by a period (.), semicolon (;), or joined with a comma + conjunction
- A comma alone cannot join two independent clauses (this is a comma splice error)
- After a semicolon, the next clause should start with a lowercase letter unless it's a proper noun
- Carefully analyze each option and identify which follows correct grammar rules`;
  }

  const contents = toContents(history, userMessage);

  // Streaming can't retry mid-stream cleanly, so we attempt models in order.
  // `emitted` accumulates everything sent to the client across fallbacks so
  // the persisted session text always matches what the user actually saw.
  let lastQuotaError: any = null;
  let emitted = '';
  for (const model of MODEL_FALLBACKS) {
    try {
      const stream = await client.models.generateContentStream({
        model,
        contents,
        config: {
          systemInstruction: TUTOR_SYSTEM_PROMPT,
          temperature: 0.3,
          maxOutputTokens: 4096,
        },
      });

      let gotChunk = false;
      for await (const chunk of stream) {
        const delta = chunk.text;
        if (delta) {
          emitted += delta;
          gotChunk = true;
          onChunk(delta);
        }
      }
      // A quota error can surface mid-stream as an exception; an empty stream
      // with no chunks means this model failed — try the next one.
      if (gotChunk || emitted) return emitted;
      throw new Error('Empty stream from model ' + model);
    } catch (err) {
      if (isQuotaError(err)) {
        console.warn(`Gemini streaming quota hit on ${model}, trying fallback...`);
        lastQuotaError = err;
        continue;
      }
      if (isModelGoneError(err)) {
        console.warn(`Gemini streaming model ${model} unavailable, trying fallback...`);
        continue;
      }
      throw err;
    }
  }
  // If we already streamed partial content, return it (better than an error);
  // the route persists exactly what the user saw.
  if (emitted) return emitted;
  throw new AIQuotaExceededError(
    'Daily AI limit reached. Please try again later — limits reset daily.',
    lastQuotaError ? quotaRetryAfter(lastQuotaError) : 60
  );
}

// --- Study plan generation ------------------------------------------------
// Parses a natural-language request ("physics exam after 5 days and math
// assignment in 3 days") into a day-by-day study plan. Event extraction is
// deterministic (regex-based, no AI) — the AI only writes each day's guide
// via generateDayGuide (Gemini).
export interface StudyPlanEntry {
  title: string;
  subject: string;
  date: string;
  type: string;
  notes: string;
}

interface EventInfo {
  subject: string;
  type: 'Exam' | 'Assignment' | 'Revision';
  date: Date;
  title: string;
}

const SUBJECT_ALIASES: Record<string, string> = {
  math: 'Mathematics',
  aptitude: 'Aptitude',
  sat: 'SAT',
  act: 'ACT',
  gmat: 'GMAT',
  gre: 'GRE',
  toefl: 'TOEFL',
  ielts: 'IELTS',
};

const canonicalSubject = (s: string): string =>
  SUBJECT_ALIASES[s] ?? s.charAt(0).toUpperCase() + s.slice(1);

const KNOWN_SUBJECTS = [
  'aptitude', 'physics', 'chemistry', 'biology', 'mathematics', 'math',
  'english', 'history', 'geography', 'sat', 'act', 'gmat', 'gre', 'toefl', 'ielts',
];

const parseDate = (text: string, baseDate: Date): Date => {
  const result = new Date(baseDate);
  const daysMatch = text.match(/(?:after|in)\s+(\d+)\s+days?/i);
  if (daysMatch && daysMatch[1]) {
    result.setDate(baseDate.getDate() + parseInt(daysMatch[1]));
    return result;
  }
  if (text.includes('tomorrow')) { result.setDate(baseDate.getDate() + 1); return result; }
  if (text.includes('next week') || text.includes('in 7 days')) { result.setDate(baseDate.getDate() + 7); return result; }
  if (/in 2 weeks|after 2 weeks|in 14 days/i.test(text)) { result.setDate(baseDate.getDate() + 14); return result; }
  result.setDate(baseDate.getDate() + 1);
  return result;
};

export async function generateStudyPlan(userRequest: string): Promise<StudyPlanEntry[]> {
  const request = userRequest.toLowerCase();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const events: EventInfo[] = [];
  const requestParts = request.split(/\s+and\s+/i);

  for (const subject of KNOWN_SUBJECTS) {
    if (request.includes(subject)) {
      const relevantPart = requestParts.find((part) => part.includes(subject)) || request;

      let eventType: 'Exam' | 'Assignment' | 'Revision' = 'Revision';
      if (/exam|test/.test(relevantPart)) eventType = 'Exam';
      else if (/assignment|homework|project/.test(relevantPart)) eventType = 'Assignment';

      const subjectPattern = new RegExp(`${subject}[^.]*?(?:after|in)\\s+(\\d+)\\s+days?`, 'i');
      const match = relevantPart.match(subjectPattern);
      const subjectName = canonicalSubject(subject);

      if (match && match[1]) {
        const eventDate = new Date(today);
        eventDate.setDate(today.getDate() + parseInt(match[1]));
        events.push({
          subject: subjectName,
          type: eventType,
          date: eventDate,
          title: `${subjectName} ${eventType === 'Exam' ? 'Exam' : eventType === 'Assignment' ? 'Assignment' : 'Study Session'}`,
        });
      } else {
        const daysMatch = relevantPart.match(/(?:after|in)\s+(\d+)\s+days?/i);
        const nextWeekMatch = relevantPart.match(/next\s+week/i);
        if (daysMatch && daysMatch[1]) {
          const eventDate = new Date(today);
          eventDate.setDate(today.getDate() + parseInt(daysMatch[1]));
          events.push({ subject: subjectName, type: eventType, date: eventDate, title: `${subjectName} ${eventType}` });
        } else if (nextWeekMatch) {
          const eventDate = new Date(today);
          eventDate.setDate(today.getDate() + 7);
          events.push({ subject: subjectName, type: eventType, date: eventDate, title: `${subjectName} ${eventType}` });
        }
      }
    }
  }

  // Fallback: single generic event
  if (events.length === 0) {
    let subject = 'Mathematics';
    if (request.includes('physics')) subject = 'Physics';
    else if (request.includes('chemistry')) subject = 'Chemistry';
    else if (request.includes('biology')) subject = 'Biology';
    else if (request.includes('english')) subject = 'English';
    else if (request.includes('history')) subject = 'History';

    let eventType: 'Exam' | 'Assignment' | 'Revision' = 'Revision';
    if (/exam|test/.test(request)) eventType = 'Exam';
    else if (/assignment|homework/.test(request)) eventType = 'Assignment';

    events.push({
      subject,
      type: eventType,
      date: parseDate(request, today),
      title: `${subject} ${eventType === 'Revision' ? 'Study Session' : eventType}`,
    });
  }

  events.sort((a, b) => a.date.getTime() - b.date.getTime());

  // Build daily tasks from today until each deadline
  const dailyTasks: Array<{ date: Date; event: EventInfo; dayNumber: number; totalDays: number }> = [];
  for (const event of events) {
    const daysUntilEvent = Math.ceil((event.date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntilEvent >= 0) {
      const totalDays = daysUntilEvent + 1;
      for (let day = 0; day < totalDays; day++) {
        const taskDate = new Date(today);
        taskDate.setDate(today.getDate() + day);
        dailyTasks.push({ date: taskDate, event, dayNumber: day + 1, totalDays });
      }
    }
  }
  dailyTasks.sort((a, b) => a.date.getTime() - b.date.getTime());

  const studyPlan: StudyPlanEntry[] = [];
  for (const task of dailyTasks) {
    const dateStr = task.date.toISOString().split('T')[0] ?? String(task.date.getTime());
    const isDeadlineDay = task.dayNumber === task.totalDays;
    const daysUntilDeadline = task.totalDays - task.dayNumber;

    try {
      const studyGuide = await generateDayGuide({
        subject: task.event.subject,
        type: task.event.type,
        deadlineTitle: task.event.title,
        dayNumber: task.dayNumber,
        totalDays: task.totalDays,
        daysUntilDeadline,
        isDeadlineDay,
      });

      let title: string;
      let eventType: 'Exam' | 'Assignment' | 'Revision';
      if (isDeadlineDay) {
        title = task.event.title;
        eventType = task.event.type;
      } else {
        title = `${task.event.subject} Day ${task.dayNumber} - ${daysUntilDeadline} days to ${task.event.type.toLowerCase()}`;
        eventType = 'Revision';
      }

      studyPlan.push({
        title,
        subject: task.event.subject,
        date: dateStr,
        type: eventType,
        notes: JSON.stringify(studyGuide),
      });
    } catch (error) {
      console.error('Error generating daily study guide:', task, error);
      const fallbackNotes = isDeadlineDay
        ? (task.event.type === 'Exam'
            ? `${task.event.subject} exam day`
            : task.event.type === 'Assignment'
              ? `Complete and submit ${task.event.subject.toLowerCase()} assignment`
              : `Review ${task.event.subject.toLowerCase()} materials`)
        : `Day ${task.dayNumber} preparation for ${task.event.subject.toLowerCase()} ${task.event.type.toLowerCase()}`;

      studyPlan.push({
        title: isDeadlineDay ? task.event.title : `${task.event.subject} Day ${task.dayNumber}`,
        subject: task.event.subject,
        date: dateStr,
        type: isDeadlineDay ? task.event.type : 'Revision',
        notes: fallbackNotes,
      });
    }
  }

  return studyPlan;
}

// --- Practice quiz generation --------------------------------------------
export async function generatePracticeQuiz(
  subject: string,
  grade: number,
  difficulty: string,
  count: number
): Promise<any[]> {
  const prompt = `Generate ${count} ${difficulty} practice questions for ${subject} at Grade ${grade} level (Ethiopian curriculum). Each question must be multiple choice with 4 options, exactly one correct answer, and a brief explanation of why it is correct.

Return ONLY a valid JSON array in exactly this format, with no markdown fences and no extra text:
[
  {
    "question": "The question text",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctAnswer": "The exact text of the correct option",
    "explanation": "One or two sentences explaining the answer"
  }
]`;

  const raw = await complete(
    'You are a helpful AI that generates JSON responses for practice quizzes. Always respond with valid JSON only. Do not include any text before or after the JSON.',
    prompt,
    [],
    0.4
  );

  // Parse and validate
  let cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start !== -1 && end > start) {
    cleaned = cleaned.substring(start, end + 1);
  }

  const questions = JSON.parse(cleaned);
  if (!Array.isArray(questions)) {
    throw new Error('AI returned non-array quiz');
  }
  return questions;
}

// --- Study plan day-guide generation -------------------------------------
// Used by the planner's AI study plan feature.
export async function generateDayGuide(task: {
  subject: string;
  type: string;
  dayNumber: number;
  totalDays: number;
  daysUntilDeadline: number;
  isDeadlineDay: boolean;
  deadlineTitle: string;
}): Promise<{
  howToComplete: string[];
  guides: string[];
  suggestions: string;
  motivation: string[];
}> {
  const sessionContext = task.isDeadlineDay
    ? `This is the FINAL DAY (Day ${task.dayNumber} of ${task.totalDays}) — the ${task.type.toLowerCase()} is TODAY.`
    : `This is Day ${task.dayNumber} of ${task.totalDays} in your ${task.subject} study plan. You have ${task.daysUntilDeadline} days until your ${task.type.toLowerCase()}. Focus on building knowledge progressively.`;

  const specificInstructions = task.isDeadlineDay
    ? `For the deadline day, focus on mental preparation, time management, staying calm, and confident execution.`
    : `For day ${task.dayNumber} of preparation, provide specific, actionable steps that build on previous days. Include a mix of review, new learning, and practice. Make it feel like a natural progression in the study journey.`;

  const prompt = `Generate a JSON object for Day ${task.dayNumber} of a ${task.subject} study plan.

Subject: ${task.subject}
Deadline: ${task.deadlineTitle} (${task.type})
Progress: Day ${task.dayNumber} of ${task.totalDays} (${task.isDeadlineDay ? 'DEADLINE DAY' : task.daysUntilDeadline + ' days remaining'})
Context: ${sessionContext}

${specificInstructions}

Return ONLY this JSON structure:
{
  "howToComplete": ["step 1", "step 2", "step 3", "step 4"],
  "guides": ["tip 1", "tip 2", "tip 3", "tip 4"],
  "suggestions": "One encouraging sentence for today",
  "motivation": ["message 1", "message 2", "message 3"]
}

Write naturally like a teacher. Create specific, unique content for this exact day in the ${task.subject} study journey. Make each day feel different and progressive.

Return ONLY the JSON object, nothing else.`;

  const raw = await complete(
    'You are a helpful AI that generates JSON responses for study planning. Always respond with valid JSON only. Do not include any text before or after the JSON.',
    prompt,
    [],
    0.3
  );

  let cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end > start) {
    cleaned = cleaned.substring(start, end + 1);
  }

  const parsed = JSON.parse(cleaned);
  return {
    howToComplete: Array.isArray(parsed.howToComplete) ? parsed.howToComplete : [],
    guides: Array.isArray(parsed.guides) ? parsed.guides : [],
    suggestions: String(parsed.suggestions || ''),
    motivation: Array.isArray(parsed.motivation) ? parsed.motivation : [],
  };
}
