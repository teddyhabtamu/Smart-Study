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

    // Never fabricate quiz content: placeholder questions with a hardcoded
    // "Option A" answer would teach wrong answers and count as a fake
    // success downstream. Surface the failure so the UI can explain it.
    // (Limit/quota errors carry a machine-readable code for the UI.)
    throw error;
  }
};


export const generateSpeech = async (text: string): Promise<string | null> => {
  // TTS functionality not available in current API version
  return null;
};