import { GoogleGenerativeAI } from "@google/generative-ai";

const ai = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY || "");

const MODEL_NAME = 'gemini-2.5-flash';

interface TutorOptions {
  context?: string;
  subject?: string;
  deepThinking?: boolean;
}

// Helper to clean Markdown code blocks from JSON strings
const cleanJsonString = (text: string): string => {
  if (!text) return "[]";
  
  // Find the first '[' and the last ']' to extract the array
  const firstBracket = text.indexOf('[');
  const lastBracket = text.lastIndexOf(']');
  
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    return text.substring(firstBracket, lastBracket + 1);
  }

  // Fallback: Return original if no array structure found (or empty array)
  return "[]";
};

// Robust JSON parser helper
const safeJsonParse = <T>(jsonString: string, fallback: T): T => {
  try {
    const cleaned = cleanJsonString(jsonString);
    return JSON.parse(cleaned);
  } catch (error) {
    console.error("JSON Parse Error:", error);
    console.warn("Failed JSON Content:", jsonString);
    return fallback;
  }
};

export const generateTutorResponse = async (
  history: { role: string; text: string }[],
  userMessage: string,
  options: TutorOptions = {} 
): Promise<string> => {
  if (!import.meta.env.VITE_GEMINI_API_KEY) {
    return "Error: API Key is missing. Please check your configuration.";
  }

  const { context, subject, deepThinking } = options;

  try {
    let baseInstruction = "You are a helpful, encouraging, and knowledgeable AI Tutor for Ethiopian high school students (Grade 9-12). Format your responses using clear Markdown.";
    
    if (subject && subject !== 'General') {
      baseInstruction += ` You are an expert in ${subject}. Focus on explaining concepts clearly, providing examples related to ${subject}, and helping the student master this specific subject.`;
    }

    baseInstruction += "\n\nUse **bold** for key concepts, bulleted lists for steps or features, and headings (###) for sections. Keep explanations structured and easy to read. \n\nIMPORTANT: For mathematical equations, use LaTeX syntax. \n- Enclose inline math in single dollar signs (e.g., $E=mc^2$).\n- Enclose block math equations in double dollar signs (e.g., $$ \\sum F = ma $$).\n\nIf a context document is provided, use it to answer the question.";
    
    if (context) {
      baseInstruction += `\n\nContext Document Content/Summary:\n${context}`;
    }

    const model = ai.getGenerativeModel({ model: MODEL_NAME });

    const chat = model.startChat({
      history: history.map(h => ({
        role: h.role as "user" | "model",
        parts: [{ text: h.text }],
      })),
    });

    const fullMessage = baseInstruction + "\n\n" + userMessage;
    const result = await chat.sendMessage(fullMessage);

    return result.response.text() || "I'm sorry, I couldn't generate a response at this time.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "I'm having trouble connecting to the knowledge base right now. Please try again later.";
  }
};

export const summarizeDocument = async (title: string, description: string): Promise<string> => {
  if (!import.meta.env.VITE_GEMINI_API_KEY) return "API Key missing.";
  
  try {
    const prompt = `Please provide a concise study summary and 3 key learning points for a student document titled "${title}". Description: "${description}". The summary should help a student decide if this is useful for their revision. Format as Markdown with a list.`;

    const model = ai.getGenerativeModel({ model: MODEL_NAME });
    const response = await model.generateContent(prompt);

    return response.response.text() || "Summary unavailable.";
  } catch (error) {
    console.error("Gemini Summarize Error:", error);
    return "Could not generate summary.";
  }
}

export const generateQuiz = async (title: string, description: string): Promise<string> => {
  if (!import.meta.env.VITE_GEMINI_API_KEY) return "API Key missing.";

  try {
    const prompt = `Create a short 5-question multiple choice quiz based on the subject matter: "${title} - ${description}". 
    Format the output as Markdown:
    1. **Question**
       - A) Option
       - B) Option
       - C) Option
       - D) Option
       *Correct Answer: [Answer]*
    
    Make the questions challenging but appropriate for a high school student.`;

    const model = ai.getGenerativeModel({ model: MODEL_NAME });
    const response = await model.generateContent(prompt);

    return response.response.text() || "Could not generate quiz.";
  } catch (error) {
    console.error("Gemini Quiz Error:", error);
    return "Quiz generation failed.";
  }
}

export const generatePracticeQuiz = async (subject: string, grade: string, difficulty: string, count: number): Promise<any[]> => {
  if (!import.meta.env.VITE_GEMINI_API_KEY) return [];

  try {
    const prompt = `Generate a ${difficulty} difficulty practice quiz for Grade ${grade} ${subject}.
    Create exactly ${count} multiple choice questions.
    
    Return the response in JSON format matching this schema:
    [
      {
        "question": "Question text here",
        "options": ["Option A", "Option B", "Option C", "Option D"],
        "correctAnswer": "Option A",
        "explanation": "Brief explanation of why this is correct."
      }
    ]`;

    const model = ai.getGenerativeModel({ model: MODEL_NAME });

    const response = await model.generateContent(prompt);

    return safeJsonParse(response.response.text() || "[]", []);
  } catch (error) {
    console.error("Gemini Practice Quiz Error:", error);
    return [];
  }
};

export const generateStudyPlan = async (request: string): Promise<any[]> => {
  if (!import.meta.env.VITE_GEMINI_API_KEY) return [];

  try {
    const today = new Date().toISOString().split('T')[0];
    const prompt = `Generate a realistic study schedule based on the student's request: "${request}". 
    Today's date is ${today}.
    
    Create a list of study events. For "Exam" or "Test" mentions, verify if the user provided a date, otherwise assume a logical preparation timeline.
    Distribute "Revision" sessions logically before exams.
    `;

    const model = ai.getGenerativeModel({ model: MODEL_NAME });

    const response = await model.generateContent(prompt);

    return safeJsonParse(response.response.text() || "[]", []);
  } catch (error) {
    console.error("Gemini Planner Error:", error);
    return [];
  }
};

export const generateSpeech = async (text: string): Promise<string | null> => {
  // TTS functionality not available in current API version
  return null;
};