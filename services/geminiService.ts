import { GoogleGenerativeAI } from "@google/generative-ai";

const ai = new GoogleGenerativeAI(process.env.API_KEY || "");

const MODEL_NAME = 'gemini-2.5-flash';

export const generateTutorResponse = async (
  history: { role: string; text: string }[],
  userMessage: string,
  context?: string
): Promise<string> => {
  if (!process.env.API_KEY) {
    return "Error: API Key is missing. Please check your configuration.";
  }

  try {
    let systemInstruction = "You are a helpful, encouraging, and knowledgeable AI Tutor for Ethiopian high school students (Grade 9-12). Format your responses using clear Markdown. Use **bold** for key concepts, bulleted lists for steps or features, and headings (###) for sections. Keep explanations structured and easy to read. \n\nIMPORTANT: For mathematical equations, use LaTeX syntax. \n- Enclose inline math in single dollar signs (e.g., $E=mc^2$).\n- Enclose block math equations in double dollar signs (e.g., $$ \\sum F = ma $$).\n\nIf a context document is provided, use it to answer the question.";
    
    if (context) {
      systemInstruction += `\n\nContext Document Content/Summary:\n${context}`;
    }

    const chat = ai.chats.create({
      model: MODEL_NAME,
      config: {
        systemInstruction: systemInstruction,
      },
      history: history.map(h => ({
        role: h.role,
        parts: [{ text: h.text }],
      })),
    });

    const result = await chat.sendMessage({
      message: userMessage,
    });

    return result.text || "I'm sorry, I couldn't generate a response at this time.";
  } catch (error) {
    console.error("Gemini API Error:", error);
    return "I'm having trouble connecting to the knowledge base right now. Please try again later.";
  }
};

export const summarizeDocument = async (title: string, description: string): Promise<string> => {
  if (!process.env.API_KEY) return "API Key missing.";
  
  try {
    const prompt = `Please provide a concise study summary and 3 key learning points for a student document titled "${title}". Description: "${description}". The summary should help a student decide if this is useful for their revision. Format as Markdown with a list.`;

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
    });

    return response.text || "Summary unavailable.";
  } catch (error) {
    console.error("Gemini Summarize Error:", error);
    return "Could not generate summary.";
  }
}

export const generateQuiz = async (title: string, description: string): Promise<string> => {
  if (!process.env.API_KEY) return "API Key missing.";

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

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
    });

    return response.text || "Could not generate quiz.";
  } catch (error) {
    console.error("Gemini Quiz Error:", error);
    return "Quiz generation failed.";
  }
}

export const generateStudyPlan = async (request: string): Promise<any[]> => {
  if (!process.env.API_KEY) return [];

  try {
    const today = new Date().toISOString().split('T')[0];
    const prompt = `Generate a realistic study schedule based on the student's request: "${request}". 
    Today's date is ${today}.
    
    Create a list of study events. For "Exam" or "Test" mentions, verify if the user provided a date, otherwise assume a logical preparation timeline.
    Distribute "Revision" sessions logically before exams.
    `;

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              title: { 
                type: Type.STRING, 
                description: "Short title for the study session, e.g., 'Algebra Review' or 'Physics Exam'"
              },
              subject: { 
                type: Type.STRING,
                description: "The academic subject" 
              },
              date: { 
                type: Type.STRING, 
                description: "Date in YYYY-MM-DD format" 
              },
              type: { 
                type: Type.STRING, 
                enum: ["Exam", "Revision", "Assignment"],
                description: "The category of the event"
              },
              notes: { 
                type: Type.STRING, 
                description: "Brief tip or topic focus" 
              }
            },
            required: ["title", "subject", "date", "type"]
          }
        }
      }
    });

    return JSON.parse(response.text || "[]");
  } catch (error) {
    console.error("Gemini Planner Error:", error);
    return [];
  }
};