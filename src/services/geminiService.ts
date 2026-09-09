// AI service that integrates with backend Gemini API

interface TutorOptions {
  context?: string;
  subject?: string;
  deepThinking?: boolean;
}

export const generateTutorResponse = async (
  sessionId: string | undefined,
  message: string,
  subject: string,
  grade: number
): Promise<{ response: string; sessionId?: string }> => {
  console.log("Frontend AI Tutor called with message:", message.substring(0, 50) + "...");

  try {
    // Import the API service
    const { aiTutorAPI } = await import('./api');

    // Call the backend API with correct parameters
    const apiResponse = await aiTutorAPI.chat(message, subject, grade, sessionId);

    return {
      response: apiResponse.response,
      sessionId: apiResponse.sessionId || sessionId
    };
  } catch (error) {
    console.error('AI Tutor API error:', error);

    // Fallback message if the API fails
    return {
      response: `## 🤖 AI Tutor Temporarily Unavailable

I'm currently unable to connect to the AI service. This is usually temporary.

Please check your internet connection and try again in a few moments.`,
      sessionId: sessionId
    };
  }
};


export const generatePracticeQuiz = async (subject: string, grade: string, difficulty: string, count: number): Promise<{ questions: any[]; xpGained: number }> => {
  try {
    // Import the API service
    const { aiTutorAPI } = await import('./api');

    // Call the backend API to generate practice questions
    const apiResponse = await aiTutorAPI.generatePracticeQuiz(subject, grade, difficulty, count);

    const questions = apiResponse.data || [];
    const xpGained = apiResponse.xpGained || 0;

    return { questions, xpGained };

  } catch (error) {
    console.error('Practice quiz generation error:', error);

    // Fallback to basic questions if API fails
    const fallbackQuestions = [];
    for (let i = 0; i < Math.min(count, 3); i++) {
      fallbackQuestions.push({
        question: `Practice question ${i + 1} for ${subject} (Grade ${grade})`,
        options: ["Option A", "Option B", "Option C", "Option D"],
        correctAnswer: "Option A",
        explanation: "This is a practice question. The AI service is currently unavailable."
      });
    }

    return { questions: fallbackQuestions, xpGained: 0 };
  }
};


export const generateSpeech = async (text: string): Promise<string | null> => {
  // TTS functionality not available in current API version
  return null;
};