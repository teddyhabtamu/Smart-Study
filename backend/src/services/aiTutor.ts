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
// NOTE: verified 2026-09-09 via live generate probes (models.list LIES —
// it still advertises retired models). gemini-2.0-flash and
// gemini-2.5-flash-lite both 404 with "no longer available". Do NOT add
// version-pinned models back without probing them first.
const MODEL_FALLBACKS = [
  process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  'gemini-3.5-flash-lite',
].filter((m, i, arr) => m && arr.indexOf(m) === i);

// Last model that served successfully — tried first on the next request so a
// quota-exhausted primary doesn't waste a round-trip every time. Resets on
// process restart (safe: worst case is one extra fallback attempt).
let preferredModel: string | null = null;

// Models proven dead (404 retired) with timestamp — skipped for an hour so a
// stale chain entry costs nothing after the first failure. Retried hourly in
// case of transient API-side issues.
const deadModels = new Map<string, number>();
const DEAD_MODEL_TTL_MS = 60 * 60 * 1000;

const isModelKnownDead = (model: string): boolean => {
  const since = deadModels.get(model);
  if (since === undefined) return false;
  if (Date.now() - since > DEAD_MODEL_TTL_MS) {
    deadModels.delete(model);
    return false;
  }
  return true;
};

const markModelDead = (model: string): void => {
  deadModels.set(model, Date.now());
};

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

// An overloaded model (503 UNAVAILABLE) is transient and capacity-specific —
// the next model in the chain will usually serve fine.
const isOverloadedError = (err: any): boolean => {
  const msg = String(err?.message || '');
  const status = (err as any)?.status;
  return (
    status === 503 ||
    msg.includes('503') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('high demand') ||
    msg.includes('overloaded')
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
  // Adaptive ordering: the model that worked last goes first, known-dead
  // models are skipped, so a stale chain costs nothing after first failure.
  const ordered = preferredModel
    ? [preferredModel, ...MODEL_FALLBACKS.filter((m) => m !== preferredModel)]
    : [...MODEL_FALLBACKS];
  let lastQuotaError: any = null;
  let retryAfter = 60;
  for (const model of ordered) {
    if (isModelKnownDead(model)) {
      console.log(`[tutor] skipping known-dead model ${model}`);
      continue;
    }
    const tStart = Date.now();
    try {
      const result = await fn(model);
      preferredModel = model;
      console.log(`[tutor] model ${model} ok in ${Date.now() - tStart}ms`);
      return result;
    } catch (err) {
      console.log(`[tutor] model ${model} failed in ${Date.now() - tStart}ms`);
      if (isQuotaError(err)) {
        console.warn(`Gemini quota hit on ${model}, trying fallback...`);
        lastQuotaError = err;
        retryAfter = Math.max(retryAfter, quotaRetryAfter(err));
        continue;
      }
      if (isModelGoneError(err)) {
        console.warn(`Gemini model ${model} unavailable, trying fallback...`);
        markModelDead(model);
        continue;
      }
      if (isOverloadedError(err)) {
        console.warn(`Gemini model ${model} overloaded, trying fallback...`);
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
  temperature = 0.3,
  maxOutputTokens = 4096
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
        maxOutputTokens,
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
export interface TutorOptions {
  deepThinking?: boolean;
}

// Deep Think mode: the model reasons step-by-step out loud, verifies its
// answer, and goes deeper (formulas, edge cases, common mistakes). Costs more
// output tokens but stays on the same quota-safe flash model chain.
const DEEP_THINKING_INSTRUCTION = `
DEEP THINKING MODE is ON. Before your final answer:
1. Think through the problem step-by-step and SHOW key reasoning steps briefly.
2. Double-check formulas, calculations, and grammar rules as you go.
3. Point out the most common mistake students make on this topic.
4. Then give the final answer clearly.
Be thorough but stay focused — no rambling.`.trim();

const tutorSystemPrompt = (opts?: TutorOptions): string =>
  opts?.deepThinking ? `${TUTOR_SYSTEM_PROMPT}\n\n${DEEP_THINKING_INSTRUCTION}` : TUTOR_SYSTEM_PROMPT;

const tutorMaxTokens = (opts?: TutorOptions): number => (opts?.deepThinking ? 8192 : 4096);

export async function getTutorResponse(
  history: any[],
  message: string,
  subject: string,
  grade: number,
  opts?: TutorOptions
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
    return await complete(tutorSystemPrompt(opts), userMessage, history, 0.3, tutorMaxTokens(opts));
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
  onChunk: (delta: string) => void,
  opts?: TutorOptions
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
  const systemInstruction = tutorSystemPrompt(opts);
  const maxOutputTokens = tutorMaxTokens(opts);

  // Streaming can't retry mid-stream cleanly, so we attempt models in order
  // (preferred working model first — see withModelFallback).
  // `emitted` accumulates everything sent to the client across fallbacks so
  // the persisted session text always matches what the user actually saw.
  const ordered = preferredModel
    ? [preferredModel, ...MODEL_FALLBACKS.filter((m) => m !== preferredModel)]
    : [...MODEL_FALLBACKS];
  let lastQuotaError: any = null;
  let emitted = '';
  for (const model of ordered) {
    if (isModelKnownDead(model)) {
      console.log(`[tutor] skipping known-dead stream model ${model}`);
      continue;
    }
    const tStart = Date.now();
    try {
      const stream = await client.models.generateContentStream({
        model,
        contents,
        config: {
          systemInstruction,
          temperature: 0.3,
          maxOutputTokens,
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
      if (gotChunk || emitted) {
        preferredModel = model;
        console.log(`[tutor] stream ${model} ok in ${Date.now() - tStart}ms`);
        return emitted;
      }
      throw new Error('Empty stream from model ' + model);
    } catch (err) {
      console.log(`[tutor] stream ${model} failed in ${Date.now() - tStart}ms`);
      if (isQuotaError(err)) {
        console.warn(`Gemini streaming quota hit on ${model}, trying fallback...`);
        lastQuotaError = err;
        continue;
      }
      if (isModelGoneError(err)) {
        console.warn(`Gemini streaming model ${model} unavailable, trying fallback...`);
        markModelDead(model);
        continue;
      }
      if (isOverloadedError(err)) {
        console.warn(`Gemini streaming model ${model} overloaded, trying fallback...`);
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

// --- Study plan entries (shared shape with the frontend schedule) ----------
export interface StudyPlanEntry {
  title: string;
  subject: string;
  date: string;
  type: string;
  notes: string;
}

// --- Practice quiz generation --------------------------------------------
export async function generatePracticeQuiz(
  subject: string,
  grade: number,
  difficulty: string,
  count: number
): Promise<any[]> {
  const prompt = `Generate ${count} ${difficulty} practice questions for ${subject} at Grade ${grade} level (Ethiopian curriculum). Each question must be multiple choice with 4 options, exactly one correct answer, and a brief explanation of why it is correct.

Formatting rules (the app renders markdown + LaTeX, options get A/B/C/D chips automatically):
- Write ALL math with LaTeX: inline $...$ (e.g. $f(x) = x^2 + 1$, $\\frac{a}{b}$), display $$...$$ for standalone equations.
- NEVER prefix options with letters ("A. ", "B) ", ...) — chips are added by the app.
- Keep each option short (one line); make wrong options plausible (common student mistakes), not obviously absurd.
- Explanation: 1-2 sentences, plain words, LaTeX only where a formula is needed.

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

// --- Smart schedule generation (from scratch) -------------------------------
// ONE AI call plans the entire schedule: it understands natural language
// ("tomorrow physics assignment", "exam next week") natively, resolves
// relative dates against today, picks correct event types, and balances the
// daily load. The old regex-based extractor (split on "and", keyword match)
// is gone — it mislabeled assignments as exams, ignored relative dates, and
// spammed 3 sessions every day.
export async function generateSmartPlan(
  userRequest: string,
  grade: number = 10
): Promise<StudyPlanEntry[]> {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0] ?? '2026-01-01';
  const weekday = now.toLocaleDateString('en-US', { weekday: 'long' });

  const systemPrompt = `You are SmartStudy's expert study planner for Ethiopian secondary students (Grade ${grade}). You turn a student's plain-language description of upcoming deadlines into a concrete day-by-day study schedule.

Return ONLY valid JSON — no markdown fences, no commentary, no extra text.`;

  const userPrompt = `Today is ${weekday}, ${todayStr}. Grade ${grade} student writes:

"${userRequest}"

Build their study schedule as JSON in EXACTLY this shape:
{
  "days": [
    {
      "date": "YYYY-MM-DD",
      "subject": "Physics",
      "title": "Short specific session title",
      "type": "Revision",
      "guide": {
        "howToComplete": ["4 concrete steps for THIS session"],
        "guides": ["4 practical study tips"],
        "suggestions": "One encouraging sentence",
        "motivation": ["3 short motivational lines"]
      }
    }
  ]
}

Rules — follow ALL of them:
1. DATES: resolve every relative date from today (${todayStr}). "tomorrow" = the next calendar day, "day after tomorrow" = +2, "next week" = the same weekday next week (7 days out) unless the student names a day. NEVER invent dates in the past. Every "date" must be >= today.
2. TYPES (only these three, exactly spelled): "Exam" for exams/tests, "Assignment" for assignments, homework, projects, group work, presentations, "Revision" for everything else (study sessions, preparation, review).
3. DEADLINE DAYS hold only the deadline event(s) themselves — e.g. {"title": "Physics Assignment", "type": "Assignment"}. No extra revision sessions on a deadline day.
4. LOAD: at most 2 sessions per day, prefer 1. Spread subjects across days so each deadline gets preparation time. Closer deadlines get priority on shared days.
5. The day BEFORE a deadline is light: revision for that subject only, focused on readiness and confidence.
6. LENGTH: at most 14 days total. If deadlines stretch further, cover the first 14 days starting today.
7. TITLES are human and specific ("Physics: forces practice problems"), never mechanical ("Physics Day 3 - 5 days to exam").
8. HONESTY — NEVER invent specifics the student didn't state. If they didn't name chapters/topics (e.g. they said "maths exam" with no topic), keep guides at subject level ("review your class notes", "redo homework problems") — do NOT invent chapter names like "Algebra and Functions" or "Calculus and Vectors". Only use topics the student actually mentioned.
9. GUIDES must be concrete and grounded: reference the student's real deadline ("your Physics assignment is tomorrow"), their grade level, and actionable steps — never generic filler repeated across days ("open your textbook" every day is forbidden). Each day's guide must feel written for THAT day.
10. Sort days chronologically by date.
11. SUBJECTS must use exactly these canonical names: Mathematics, Physics, Chemistry, Biology, English, History, Geography, Aptitude, SAT, ACT, GMAT, GRE, TOEFL, IELTS. Never "Maths", "Math", "Bio", etc.`;

  const parsePlan = (raw: string): StudyPlanEntry[] | null => {
    try {
      let cleaned = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const start = cleaned.indexOf('{');
      const end = cleaned.lastIndexOf('}');
      if (start === -1 || end <= start) return null;
      cleaned = cleaned.substring(start, end + 1);
      const parsed = JSON.parse(cleaned);
      if (!parsed || !Array.isArray(parsed.days) || parsed.days.length === 0) return null;

      const validTypes = new Set(['Exam', 'Assignment', 'Revision']);
      const entries: StudyPlanEntry[] = [];
      for (const d of parsed.days.slice(0, 14)) {
        if (!d || typeof d !== 'object') continue;
        const date = String(d.date || '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
        if (date < todayStr) continue; // no past days, ever
        const subject = String(d.subject || '').trim();
        const title = String(d.title || '').trim();
        if (!subject || !title) continue;
        const type = validTypes.has(d.type) ? d.type : 'Revision';
        const g = d.guide && typeof d.guide === 'object' ? d.guide : {};
        entries.push({
          title: title.slice(0, 200),
          subject: subject.slice(0, 100),
          date,
          type,
          notes: JSON.stringify({
            howToComplete: Array.isArray(g.howToComplete) ? g.howToComplete.slice(0, 6).map(String) : [],
            guides: Array.isArray(g.guides) ? g.guides.slice(0, 6).map(String) : [],
            suggestions: String(g.suggestions || ''),
            motivation: Array.isArray(g.motivation) ? g.motivation.slice(0, 5).map(String) : [],
          }),
        });
      }
      return entries.length > 0 ? entries : null;
    } catch {
      return null;
    }
  };

  // Attempt 1: full plan with guides
  try {
    const raw = await complete(systemPrompt, userPrompt, [], 0.4, 8192);
    const parsed = parsePlan(raw);
    if (parsed) {
      console.log(`[study-plan] smart plan ok: ${parsed.length} days`);
      return parsed;
    }
    console.warn('[study-plan] first attempt unparseable, retrying with repair prompt');
  } catch (err) {
    console.error('[study-plan] first attempt failed:', (err as Error)?.message);
  }

  // Attempt 2: explicit repair — ask for the same JSON, stricter
  try {
    const raw = await complete(
      systemPrompt,
      `${userPrompt}\n\nYour previous reply was not valid JSON. Reply again with ONLY the JSON object in the exact shape specified — no other text whatsoever.`,
      [],
      0.2,
      8192
    );
    const parsed = parsePlan(raw);
    if (parsed) {
      console.log(`[study-plan] smart plan ok on repair: ${parsed.length} days`);
      return parsed;
    }
  } catch (err) {
    console.error('[study-plan] repair attempt failed:', (err as Error)?.message);
  }

  // Last resort: honest deterministic skeleton (7 light revision days). The
  // frontend tooltip generates fallback guidance for plain-text notes, so
  // these still render usefully.
  console.warn('[study-plan] AI planning failed twice — returning skeleton schedule');
  const skeleton: StudyPlanEntry[] = [];
  const subjects = ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'English'];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    const subject: string = subjects[i % subjects.length] ?? 'Mathematics';
    skeleton.push({
      title: `${subject} revision`,
      subject,
      date: d.toISOString().split('T')[0] ?? todayStr,
      type: 'Revision',
      notes: `Light revision session for ${subject}. Open your textbook, review recent topics, and solve a few practice problems.`,
    });
  }
  return skeleton;
}
