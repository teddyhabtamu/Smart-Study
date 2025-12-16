// AI Tutor service using Groq with Llama 3.1
import Groq from "groq-sdk";
import type { ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export async function getTutorResponse(history: any[], message: string, subject: string, grade: number) {
  const systemPrompt = `
You are SmartStudy AI Tutor for Ethiopian students (Grade 9–12).

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
- Give formulas and equations when needed for math/science
- Give final answers clearly and CORRECTLY in ENGLISH
- Be encouraging and patient in ENGLISH
- Focus on helping students understand and learn with ACCURATE information

When answering questions:
1. Read the question carefully
2. Apply the correct rules (grammar, math, science, etc.)
3. Verify your answer is correct before responding
4. Explain why the correct answer is correct and why incorrect options are wrong

Always provide direct, helpful, and ACCURATE answers to questions in ENGLISH only. Do not give generic educational support messages. Respond in English regardless of the student's question language.
`;

  // Map history roles to valid Groq roles ('system' | 'user' | 'assistant')
  const normalizeRole = (role: string) => {
    if (role === 'user') return 'user';
    if (role === 'system') return 'system';
    return 'assistant'; // treat anything else (e.g., 'model') as assistant
  };

  // Detect if this is a grammar/punctuation question
  const isGrammarQuestion = message.toLowerCase().includes('punctuation') || 
                            message.toLowerCase().includes('capitalization') ||
                            message.toLowerCase().includes('grammar') ||
                            message.toLowerCase().includes('correctly punctuated') ||
                            (subject.toLowerCase() === 'english' && message.includes('A.') && message.includes('B.'));

  // Add specific instructions for grammar questions
  let userMessage = `Subject: ${subject}, Grade: ${grade}\nQuestion: ${message}`;
  if (isGrammarQuestion) {
    userMessage += `\n\nIMPORTANT: This is a grammar/punctuation question. Apply standard English grammar rules strictly. For punctuation questions:
- Two independent clauses must be separated by a period (.), semicolon (;), or joined with a comma + conjunction
- A comma alone cannot join two independent clauses (this is a comma splice error)
- After a semicolon, the next clause should start with a lowercase letter unless it's a proper noun
- Carefully analyze each option and identify which follows correct grammar rules`;
  }

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history.map((m: any) => ({
      role: normalizeRole(m.role) as "system" | "user" | "assistant",
      content: String(m.text ?? "")
    })),
    { role: "user", content: userMessage }
  ];

  try {
    // Use lower temperature for more accurate, deterministic responses
    // Lower temperature = more focused and accurate answers
    // Try to use 70B model if available for better accuracy, fallback to 8B
    const model = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
    const chatCompletion = await groq.chat.completions.create({
      messages,
      model: model,
      temperature: 0.3, // Reduced from 0.7 for better accuracy
      max_tokens: 2048,
    });

    return chatCompletion.choices[0]?.message?.content || "I apologize, but I couldn't generate a response. Please try again.";
  } catch (error) {
    console.error('Groq AI Error:', error);

    // Fallback response
    return `## 🤖 AI Tutor Temporarily Unavailable

I'm currently unable to connect to the AI service. This might be because:

- Groq API key is not configured
- Network connectivity issues
- API rate limits

To fix this:
1. Make sure GROQ_API_KEY is set in your .env file
2. Check your internet connection
3. Try again in a few moments

Please try again in a few moments, or check your setup. If the issue persists, feel free to explore other study materials on the platform!`;
  }
}