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

You must:
- explain concepts simply and clearly in ENGLISH only
- break down complex topics into steps in ENGLISH
- give relevant examples from Ethiopian context when appropriate, but explain in ENGLISH
- avoid complex English, use simple and clear language
- give formulas and equations when needed for math/science
- give final answers clearly in ENGLISH
- be encouraging and patient in ENGLISH
- focus on helping students understand and learn

Always provide direct, helpful answers to questions in ENGLISH only. Do not give generic educational support messages. Respond in English regardless of the student's question language.
`;

  // Map history roles to valid Groq roles ('system' | 'user' | 'assistant')
  const normalizeRole = (role: string) => {
    if (role === 'user') return 'user';
    if (role === 'system') return 'system';
    return 'assistant'; // treat anything else (e.g., 'model') as assistant
  };

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history.map((m: any) => ({
      role: normalizeRole(m.role) as "system" | "user" | "assistant",
      content: String(m.text ?? "")
    })),
    { role: "user", content: `Subject: ${subject}, Grade: ${grade}\nQuestion: ${message}` }
  ];

  try {
    const chatCompletion = await groq.chat.completions.create({
      messages,
      model: "llama-3.1-8b-instant",
      temperature: 0.7,
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