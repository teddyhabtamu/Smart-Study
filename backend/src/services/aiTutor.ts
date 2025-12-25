// AI Tutor service using Groq with Llama 3.1
import Groq from "groq-sdk";
import type { ChatCompletionMessageParam } from "groq-sdk/resources/chat/completions";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Study Plan Generation using Groq
export async function generateStudyPlan(userRequest: string): Promise<any[]> {
  console.log("Study Plan AI called with request:", userRequest.substring(0, 100) + "...");

  // Parse the user request to extract study tasks
  const request = userRequest.toLowerCase();

  const today = new Date();
  today.setHours(0, 0, 0, 0); // Normalize to start of day
  const studyPlan = [];

  // Enhanced date parsing function
  const parseDate = (text: string, baseDate: Date = today): Date => {
    const result = new Date(baseDate);

    // Parse "after X days" or "in X days" format
    const afterDaysMatch = text.match(/after\s+(\d+)\s+days?/i);
    const inDaysMatch = text.match(/in\s+(\d+)\s+days?/i);

    if (afterDaysMatch && afterDaysMatch[1]) {
      result.setDate(baseDate.getDate() + parseInt(afterDaysMatch[1]));
    } else if (inDaysMatch && inDaysMatch[1]) {
      result.setDate(baseDate.getDate() + parseInt(inDaysMatch[1]));
    } else if (text.includes('tomorrow')) {
      result.setDate(baseDate.getDate() + 1);
    } else if (text.includes('next week') || text.includes('in 7 days')) {
      result.setDate(baseDate.getDate() + 7);
    } else if (text.includes('after 2 weeks') || text.includes('in 2 weeks') || text.includes('in 14 days')) {
      result.setDate(baseDate.getDate() + 14);
    } else if (text.includes('after 2 days') || text.includes('in 2 days')) {
      result.setDate(baseDate.getDate() + 2);
    } else if (text.includes('after 3 days') || text.includes('in 3 days')) {
      result.setDate(baseDate.getDate() + 3);
    } else if (text.includes('after 4 days') || text.includes('in 4 days')) {
      result.setDate(baseDate.getDate() + 4);
    } else if (text.includes('after 5 days') || text.includes('in 5 days')) {
      result.setDate(baseDate.getDate() + 5);
    } else if (text.includes('after 6 days') || text.includes('in 6 days')) {
      result.setDate(baseDate.getDate() + 6);
    } else if (text.includes('after 7 days') || text.includes('in 7 days')) {
      result.setDate(baseDate.getDate() + 7);
    } else if (text.includes('after 8 days') || text.includes('in 8 days')) {
      result.setDate(baseDate.getDate() + 8);
    } else if (text.includes('after 9 days') || text.includes('in 9 days')) {
      result.setDate(baseDate.getDate() + 9);
    } else if (text.includes('after 10 days') || text.includes('in 10 days')) {
      result.setDate(baseDate.getDate() + 10);
    } else {
      result.setDate(baseDate.getDate() + 1);
    }
    return result;
  };

  // Extract all events from the request
  interface EventInfo {
    subject: string;
    type: 'Exam' | 'Assignment' | 'Revision';
    date: Date;
    title: string;
  }

  const events: EventInfo[] = [];

  // Extract subjects and their events
  const subjects = ['aptitude', 'physics', 'chemistry', 'biology', 'mathematics', 'math', 'english', 'history', 'geography', 'sat', 'act', 'gmat', 'gre', 'toefl', 'ielts'];

  // Split the request into parts to handle multiple subjects better
  const requestParts = request.split(/\s+and\s+/i);

  for (const subject of subjects) {
    if (request.includes(subject)) {
      // Find which part of the request contains this subject
      const relevantPart = requestParts.find(part => part.includes(subject)) || request;

      // Determine event type for this specific part
      let eventType: 'Exam' | 'Assignment' | 'Revision' = 'Revision';
      if (relevantPart.includes('exam') || relevantPart.includes('test')) {
        eventType = 'Exam';
      } else if (relevantPart.includes('assignment') || relevantPart.includes('homework') || relevantPart.includes('project')) {
        eventType = 'Assignment';
      }

      // Extract date for this subject from the relevant part
      const subjectPattern = new RegExp(`${subject}[^.]*?(?:after|in)\\s+(\\d+)\\s+days?`, 'i');
      const match = relevantPart.match(subjectPattern);

      if (match && match[1]) {
        const days = parseInt(match[1]);
        const eventDate = new Date(today);
        eventDate.setDate(today.getDate() + days);

        const subjectName = subject === 'math' ? 'Mathematics' :
                           subject === 'aptitude' ? 'Aptitude' :
                           subject === 'sat' ? 'SAT' :
                           subject === 'act' ? 'ACT' :
                           subject === 'gmat' ? 'GMAT' :
                           subject === 'gre' ? 'GRE' :
                           subject === 'toefl' ? 'TOEFL' :
                           subject === 'ielts' ? 'IELTS' :
                           subject.charAt(0).toUpperCase() + subject.slice(1);

        events.push({
          subject: subjectName,
          type: eventType,
          date: eventDate,
          title: eventType === 'Exam' ? `${subjectName} Exam` :
                eventType === 'Assignment' ? `${subjectName} Assignment` :
                `${subjectName} Study Session`
        });
      } else {
        // Try to find date patterns in this specific part
        const daysMatch = relevantPart.match(/(?:after|in)\s+(\d+)\s+days?/i);
        const nextWeekMatch = relevantPart.match(/next\s+week/i);

        if (daysMatch && daysMatch[1]) {
          const days = parseInt(daysMatch[1]);
          const eventDate = new Date(today);
          eventDate.setDate(today.getDate() + days);

          const subjectName = subject === 'math' ? 'Mathematics' :
                             subject === 'aptitude' ? 'Aptitude' :
                             subject === 'sat' ? 'SAT' :
                             subject === 'act' ? 'ACT' :
                             subject === 'gmat' ? 'GMAT' :
                             subject === 'gre' ? 'GRE' :
                             subject === 'toefl' ? 'TOEFL' :
                             subject === 'ielts' ? 'IELTS' :
                             subject.charAt(0).toUpperCase() + subject.slice(1);

          events.push({
            subject: subjectName,
            type: eventType,
            date: eventDate,
            title: eventType === 'Exam' ? `${subjectName} Exam` :
                  eventType === 'Assignment' ? `${subjectName} Assignment` :
                  `${subjectName} Study Session`
          });
        } else if (nextWeekMatch) {
          // Handle "next week" pattern
          const eventDate = new Date(today);
          eventDate.setDate(today.getDate() + 7);

          const subjectName = subject === 'math' ? 'Mathematics' :
                             subject === 'aptitude' ? 'Aptitude' :
                             subject === 'sat' ? 'SAT' :
                             subject === 'act' ? 'ACT' :
                             subject === 'gmat' ? 'GMAT' :
                             subject === 'gre' ? 'GRE' :
                             subject === 'toefl' ? 'TOEFL' :
                             subject === 'ielts' ? 'IELTS' :
                             subject.charAt(0).toUpperCase() + subject.slice(1);

          events.push({
            subject: subjectName,
            type: eventType,
            date: eventDate,
            title: eventType === 'Exam' ? `${subjectName} Exam` :
                  eventType === 'Assignment' ? `${subjectName} Assignment` :
                  `${subjectName} Study Session`
          });
        }
      }
    }
  }

  // If no events found, try the old parsing method
  if (events.length === 0) {
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    // Try to extract subject from the request
    let subject = 'Mathematics'; // Default to Mathematics
    if (request.includes('physics')) subject = 'Physics';
    else if (request.includes('chemistry')) subject = 'Chemistry';
    else if (request.includes('biology')) subject = 'Biology';
    else if (request.includes('english')) subject = 'English';
    else if (request.includes('history')) subject = 'History';
    else if (request.includes('math') || request.includes('mathematics')) subject = 'Mathematics';
    else if (request.includes('aptitude')) subject = 'Aptitude';
    else if (request.includes('sat')) subject = 'SAT';
    else if (request.includes('act')) subject = 'ACT';
    else if (request.includes('gmat')) subject = 'GMAT';
    else if (request.includes('gre')) subject = 'GRE';
    else if (request.includes('toefl')) subject = 'TOEFL';
    else if (request.includes('ielts')) subject = 'IELTS';

    // Determine event type
    let eventType: 'Exam' | 'Assignment' | 'Revision' = 'Revision';
    if (request.includes('exam') || request.includes('test')) eventType = 'Exam';
    else if (request.includes('assignment') || request.includes('homework')) eventType = 'Assignment';

    const eventDate = parseDate(request, today);
    events.push({
      subject: subject,
      type: eventType,
      date: eventDate,
      title: eventType === 'Exam' ? `${subject} Exam` :
            eventType === 'Assignment' ? `${subject} Assignment` :
            `${subject} Study Session`
    });
  }

  // Sort events by date
  events.sort((a, b) => a.date.getTime() - b.date.getTime());

  if (events.length === 0) {
    // Fallback: create a simple plan
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    studyPlan.push({
      title: "Study Session",
      subject: "General",
      date: tomorrow.toISOString().split('T')[0],
      type: "Revision",
      notes: "Review study materials"
    });
    return studyPlan;
  }

  // Create daily study tasks from today until each deadline
  const dailyTasks: Array<{
    date: Date;
    event: EventInfo;
    dayNumber: number;
    totalDays: number;
  }> = [];

  // For each event, create daily tasks from today until the deadline
  for (const event of events) {
    const daysUntilEvent = Math.ceil((event.date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (daysUntilEvent >= 0) {
      const totalDays = daysUntilEvent + 1; // Include the event day

      // Create a task for each day from today until the deadline
      for (let day = 0; day < totalDays; day++) {
        const taskDate = new Date(today);
        taskDate.setDate(today.getDate() + day);

        dailyTasks.push({
          date: taskDate,
          event,
          dayNumber: day + 1,
          totalDays: totalDays
        });
      }
    }
  }

  // Sort all daily tasks by date
  dailyTasks.sort((a, b) => a.date.getTime() - b.date.getTime());

  // Generate daily study tasks with unique AI-generated guides for each day
  for (const task of dailyTasks) {
    const dateStr = task.date.toISOString().split('T')[0];
    const isDeadlineDay = task.dayNumber === task.totalDays;
    const daysUntilDeadline = task.totalDays - task.dayNumber;

    try {
      // Generate unique AI study guide for this specific day
      const studyGuide = await generateDailyStudyGuide({
        subject: task.event.subject,
        type: task.event.type,
        deadlineTitle: task.event.title,
        dayNumber: task.dayNumber,
        totalDays: task.totalDays,
        daysUntilDeadline: daysUntilDeadline,
        isDeadlineDay: isDeadlineDay
      });

      // Create appropriate title based on the day
      let title: string;
      let eventType: 'Exam' | 'Assignment' | 'Revision';

      if (isDeadlineDay) {
        // Deadline day - use the original event type and title
        title = task.event.title;
        eventType = task.event.type;
      } else {
        // Study day - create a descriptive title
        const dayDescription = task.dayNumber === 1 ? 'Day 1' :
                              task.dayNumber === 2 ? 'Day 2' :
                              task.dayNumber === 3 ? 'Day 3' :
                              `Day ${task.dayNumber}`;
        title = `${task.event.subject} ${dayDescription} - ${daysUntilDeadline} days to ${task.event.type.toLowerCase()}`;
        eventType = 'Revision';
      }

      studyPlan.push({
        title,
        subject: task.event.subject,
        date: dateStr,
        type: eventType,
        notes: JSON.stringify(studyGuide)
      });

    } catch (error) {
      console.error('Error generating daily study guide:', task, error);
      // Simple fallback if AI fails
      const fallbackNotes = isDeadlineDay ?
        (task.event.type === 'Exam' ? `${task.event.subject} exam day` :
         task.event.type === 'Assignment' ? `Complete and submit ${task.event.subject.toLowerCase()} assignment` :
         `Review ${task.event.subject.toLowerCase()} materials`) :
        `Day ${task.dayNumber} preparation for ${task.event.subject.toLowerCase()} ${task.event.type.toLowerCase()}`;

      studyPlan.push({
        title: isDeadlineDay ? task.event.title : `${task.event.subject} Day ${task.dayNumber}`,
        subject: task.event.subject,
        date: dateStr,
        type: isDeadlineDay ? task.event.type : 'Revision',
        notes: fallbackNotes
      });
    }
  }

  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 1500));

  return studyPlan;
}

// Generate AI-powered study guide for daily tasks using Groq
async function generateDailyStudyGuide(
  task: {
    subject: string;
    type: 'Exam' | 'Assignment' | 'Revision';
    deadlineTitle: string;
    dayNumber: number;
    totalDays: number;
    daysUntilDeadline: number;
    isDeadlineDay: boolean;
  }
) {
  try {
    // Create context based on whether this is a deadline day or study day
    let sessionContext = '';
    let specificInstructions = '';

    if (task.isDeadlineDay) {
      // Deadline day - exam or assignment day
      sessionContext = `This is the ${task.type.toUpperCase()} DAY for ${task.subject}. Focus on execution, staying calm, and performing well.`;
      specificInstructions = task.type === 'Exam' ?
        `For exam day, focus on mental preparation, time management, staying calm during the test, and confident execution.` :
        `For assignment day, focus on final checks, organization, confident submission, and completion.`;
    } else {
      // Study day - preparation day
      const progressPercent = Math.round((task.dayNumber / task.totalDays) * 100);
      sessionContext = `This is Day ${task.dayNumber} of ${task.totalDays} in your ${task.subject} study plan (${progressPercent}% complete). You have ${task.daysUntilDeadline} days until your ${task.type.toLowerCase()}. Focus on building knowledge progressively.`;
      specificInstructions = `For day ${task.dayNumber} of preparation, provide specific, actionable steps that build on previous days. Include a mix of review, new learning, and practice. Make it feel like a natural progression in the study journey.`;
    }

    const prompt = `Generate a JSON object for Day ${task.dayNumber} of a ${task.subject} study plan.

Subject: ${task.subject}
Deadline: ${task.deadlineTitle} (${task.type})
Progress: Day ${task.dayNumber} of ${task.totalDays} (${task.isDeadlineDay ? 'DEADLINE DAY' : task.daysUntilDeadline + ' days remaining'})
Context: ${sessionContext}

Return ONLY this JSON structure:
{
  "howToComplete": ["step 1", "step 2", "step 3", "step 4"],
  "guides": ["tip 1", "tip 2", "tip 3", "tip 4"],
  "suggestions": "One encouraging sentence for today",
  "motivation": ["message 1", "message 2", "message 3"]
}

Write naturally like a teacher. Create specific, unique content for this exact day in the ${task.subject} study journey. Make each day feel different and progressive.

Return ONLY the JSON object, nothing else.`;

    const messages: ChatCompletionMessageParam[] = [
      { role: "system", content: "You are a helpful AI that generates JSON responses for study planning. Always respond with valid JSON only. Do not include any text before or after the JSON." },
      { role: "user", content: prompt }
    ];

    const model = process.env.GROQ_MODEL || "llama-3.1-8b-instant";
    const chatCompletion = await groq.chat.completions.create({
      messages,
      model: model,
      temperature: 0.3,
      max_tokens: 2048,
    });

    const responseText = chatCompletion.choices[0]?.message?.content || '';
    console.log('AI Response for', task.subject, 'Day', task.dayNumber, ':', responseText.substring(0, 200) + '...');

    // Try to parse JSON response
    let aiGuide;
    try {
      // Remove markdown code blocks if present
      let cleanedText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

      // Try to extract the first complete JSON object if there are multiple
      const jsonStart = cleanedText.indexOf('{');
      const jsonEnd = cleanedText.lastIndexOf('}');

      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        cleanedText = cleanedText.substring(jsonStart, jsonEnd + 1);
      }

      aiGuide = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error('Failed to parse Groq response:', parseError, 'Response:', responseText);
      throw new Error('Failed to parse AI response');
    }

    // Validate Groq response structure - be more flexible
    if (!aiGuide || typeof aiGuide !== 'object') {
      console.error('AI response is not an object:', aiGuide);
      throw new Error('Invalid AI response structure - not an object');
    }

    // Extract required fields, allowing for some flexibility
    const requiredFields = {
      howToComplete: aiGuide.howToComplete,
      guides: aiGuide.guides,
      suggestions: aiGuide.suggestions,
      motivation: aiGuide.motivation
    };

    // Check if required fields exist and have correct types
    if (!Array.isArray(requiredFields.howToComplete) ||
        !Array.isArray(requiredFields.guides) ||
        typeof requiredFields.suggestions !== 'string' ||
        !Array.isArray(requiredFields.motivation)) {
      console.error('Missing or invalid required fields:', {
        howToComplete: Array.isArray(requiredFields.howToComplete),
        guides: Array.isArray(requiredFields.guides),
        suggestions: typeof requiredFields.suggestions === 'string',
        motivation: Array.isArray(requiredFields.motivation)
      });
      throw new Error('Invalid AI response structure - missing required fields');
    }

    return aiGuide;
  } catch (error) {
    console.error('Error generating daily study guide:', error);
    // Return detailed fallback guide based on task type
    const progressPercent = Math.round((task.dayNumber / task.totalDays) * 100);

    if (task.isDeadlineDay) {
      // Deadline day fallback
      if (task.type === 'Exam') {
        return {
          howToComplete: [
            `Morning: Quick review of ${task.subject} key formulas and concepts (30 minutes max)`,
            `Before exam: Stay calm, breathe deeply, and trust your ${task.subject} preparation`,
            `During exam: Read questions carefully, manage your time wisely, show your work`,
            `After exam: Reflect on what went well and areas for future improvement`
          ],
          guides: [
            `Trust the preparation you've done - you've put in the ${task.subject} work`,
            `Stay calm and focused during the ${task.subject} exam`,
            `Manage your time wisely throughout the exam`,
            `Don't panic if you encounter difficult questions`,
            `Remember that consistent effort leads to better results`
          ],
          suggestions: `Today's your ${task.subject} exam! Review notes briefly, stay hydrated, get good sleep, and approach with confidence.`,
          motivation: [
            `You've been preparing for this ${task.subject} exam. Trust your preparation and stay calm!`,
            `Every ${task.subject} study session has built your knowledge. You're ready for this exam!`,
            `Remember: ${task.subject} exams test what you know, not who you are. Give it your best effort!`
          ]
        };
      } else if (task.type === 'Assignment') {
        return {
          howToComplete: [
            `Review all ${task.subject} assignment requirements one final time`,
            `Double-check your ${task.subject} work for any errors or incomplete sections`,
            `Ensure proper formatting, citations, and submission guidelines are followed`,
            `Submit your ${task.subject} assignment before the deadline`,
            `Celebrate completing another ${task.subject} assignment milestone`
          ],
          guides: [
            `Take your time with final checks - better to catch mistakes now`,
            `Make sure all ${task.subject} requirements have been addressed`,
            `Double-check calculations, references, and formatting`,
            `Save multiple copies of your ${task.subject} work`,
            `Submit early if possible to avoid technical issues`
          ],
          suggestions: `Finalize your ${task.subject} assignment today! Review all requirements, check for errors, ensure proper formatting, and submit with confidence.`,
          motivation: [
            `You're making progress on your ${task.subject} assignment. Keep going, one step at a time!`,
            `Quality ${task.subject} work takes time and effort. You're doing great - keep pushing forward!`,
            `Every section you complete brings you closer to finishing your ${task.subject} assignment. You've got this!`
          ]
        };
      }
    } else {
      // Study day fallback - progressive daily tasks
      return {
        howToComplete: [
          `Review ${task.subject} material covered so far in your study journey`,
          `Focus on ${task.dayNumber === 1 ? 'building foundations' : 'reinforcing previous learning'} in ${task.subject}`,
          `Practice ${task.subject} problems or exercises appropriate for day ${task.dayNumber}`,
          `Identify and address any ${task.subject} topics that need extra attention`,
          `Plan your next ${task.subject} study session based on today's progress`
        ],
        guides: [
          `Make daily ${task.subject} study a consistent habit`,
          `Focus on understanding rather than just memorization`,
          `Connect new ${task.subject} concepts to what you've already learned`,
          `Take regular breaks to maintain focus and retention`,
          `Track your ${task.subject} progress to stay motivated`
        ],
        suggestions: `Day ${task.dayNumber} of your ${task.subject} journey! Focus on steady progress and building confidence for your upcoming ${task.type.toLowerCase()}.`,
        motivation: [
          `Consistent daily effort in ${task.subject} leads to remarkable results!`,
          `You're ${progressPercent}% of the way through your ${task.subject} preparation - keep going!`,
          `Every ${task.subject} study day brings you closer to mastery. You're doing amazing work!`
        ]
      };
    }
  }
}

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