// Gemini AI service for educational responses
import { GoogleGenerativeAI, SchemaType as Type } from '@google/generative-ai';

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

export const generateStudyPlan = async (
  userRequest: string,
  grade?: number
): Promise<any[]> => {
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
  const subjects = ['aptitude', 'physics', 'chemistry', 'biology', 'mathematics', 'math', 'english', 'history', 'geography'];
  
  for (const subject of subjects) {
    if (request.includes(subject)) {
      // Determine event type
      let eventType: 'Exam' | 'Assignment' | 'Revision' = 'Revision';
      if (request.includes('exam') || request.includes('test')) {
        eventType = 'Exam';
      } else if (request.includes('assignment') || request.includes('homework') || request.includes('project')) {
        eventType = 'Assignment';
      }

      // Extract date for this subject
      // Look for patterns like "subject after X days" or "subject exam after X days"
      const subjectPattern = new RegExp(`${subject}[^.]*?(?:after|in)\\s+(\\d+)\\s+days?`, 'i');
      const match = request.match(subjectPattern);
      
      if (match && match[1]) {
        const days = parseInt(match[1]);
        const eventDate = new Date(today);
        eventDate.setDate(today.getDate() + days);
        
        const subjectName = subject === 'math' ? 'Mathematics' : 
                           subject === 'aptitude' ? 'Aptitude' :
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
        // Try to find date in nearby context
        const daysMatch = request.match(/(?:after|in)\s+(\d+)\s+days?/i);
        if (daysMatch && daysMatch[1]) {
          const days = parseInt(daysMatch[1]);
          const eventDate = new Date(today);
          eventDate.setDate(today.getDate() + days);
          
          const subjectName = subject === 'math' ? 'Mathematics' : 
                             subject === 'aptitude' ? 'Aptitude' :
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

  // Find the earliest and latest dates
  // TypeScript safety: we've already checked events.length > 0 above
  const firstDate = events[0]!.date;
  const lastDate = events[events.length - 1]!.date;
  const totalDays = Math.ceil((lastDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  // Generate daily study plan from today to the last event
  for (let day = 0; day <= totalDays; day++) {
    const currentDate = new Date(today);
    currentDate.setDate(today.getDate() + day);
    const dateStr = currentDate.toISOString().split('T')[0];

    // Check if this is an event day
    const eventOnThisDay = events.find(e => {
      const eventDateStr = e.date.toISOString().split('T')[0];
      return eventDateStr === dateStr;
    });

    if (eventOnThisDay) {
      // Generate AI-powered study guide for this event (only for main events, not daily sessions)
      const daysUntilEvent = Math.ceil((eventOnThisDay.date.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
      
      try {
        const studyGuide = await generateEventStudyGuide({
          title: eventOnThisDay.title,
          subject: eventOnThisDay.subject,
          type: eventOnThisDay.type,
          date: eventOnThisDay.date
        }, daysUntilEvent);
        
        // Add the main event with AI-generated guide
        studyPlan.push({
          title: eventOnThisDay.title,
          subject: eventOnThisDay.subject,
          date: dateStr,
          type: eventOnThisDay.type,
          notes: JSON.stringify(studyGuide) // Store AI-generated guide as JSON in notes
        });
      } catch (error) {
        console.error('Error generating study guide, using fallback:', error);
        // Fallback if AI fails
        studyPlan.push({
          title: eventOnThisDay.title,
          subject: eventOnThisDay.subject,
          date: dateStr,
          type: eventOnThisDay.type,
          notes: eventOnThisDay.type === 'Exam' ? `${eventOnThisDay.subject} exam day` :
                 eventOnThisDay.type === 'Assignment' ? `Complete and submit ${eventOnThisDay.subject.toLowerCase()} assignment` :
                 `Review ${eventOnThisDay.subject.toLowerCase()} materials`
        });
      }
    } else {
      // Create daily study sessions leading up to upcoming events
      const upcomingEvents = events.filter(e => e.date > currentDate);
      
      if (upcomingEvents.length > 0) {
        // Find the next event
        const nextEvent = upcomingEvents[0];
        if (!nextEvent) {
          // Skip if no next event (shouldn't happen, but TypeScript safety)
          continue;
        }
        
        const daysUntilNextEvent = Math.ceil((nextEvent.date.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
        
        // Create study sessions based on proximity to next event
        // Generate AI guide only for intensive reviews (close to event) to avoid too many API calls
        if (daysUntilNextEvent <= 3) {
          // Intensive study when close to event - generate AI guide
          try {
            const studyGuide = await generateEventStudyGuide({
              subject: nextEvent.subject,
              type: nextEvent.type,
              title: `${nextEvent.subject} Intensive Review`,
              date: nextEvent.date
            }, daysUntilNextEvent);
            
            studyPlan.push({
              title: `${nextEvent.subject} Intensive Review`,
              subject: nextEvent.subject,
              date: dateStr,
              type: "Revision",
              notes: JSON.stringify(studyGuide)
            });
          } catch (error) {
            // Fallback if AI fails
            studyPlan.push({
              title: `${nextEvent.subject} Intensive Review`,
              subject: nextEvent.subject,
              date: dateStr,
              type: "Revision",
              notes: `Focus on ${nextEvent.subject.toLowerCase()} - ${nextEvent.type === 'Exam' ? 'exam' : 'assignment'} in ${daysUntilNextEvent} day${daysUntilNextEvent > 1 ? 's' : ''}`
            });
          }
        } else if (daysUntilNextEvent <= 7) {
          // Moderate study - simple notes
          studyPlan.push({
            title: `${nextEvent.subject} Study Session`,
            subject: nextEvent.subject,
            date: dateStr,
            type: "Revision",
            notes: `Review ${nextEvent.subject.toLowerCase()} concepts and practice problems`
          });
        } else {
          // Light study for events far away - only create study sessions every 2-3 days to avoid overwhelming
          if (day % 2 === 0 || day === 0) {
            studyPlan.push({
              title: `${nextEvent.subject} Preparation`,
              subject: nextEvent.subject,
              date: dateStr,
              type: "Revision",
              notes: `Start preparing for upcoming ${nextEvent.type === 'Exam' ? 'exam' : 'assignment'}`
            });
          }
        }
      } else {
        // All events have passed, create general review sessions
        if (day % 3 === 0) {
          studyPlan.push({
            title: "General Review Session",
            subject: "General",
            date: dateStr,
            type: "Revision",
            notes: "Review completed materials and consolidate learning"
          });
        }
      }
    }
  }

  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 1500));

  return studyPlan;
};

// Generate AI-powered study guide for a specific event
const generateEventStudyGuide = async (
  event: { title: string; subject: string; type: 'Exam' | 'Assignment' | 'Revision'; date: Date },
  daysUntil: number
): Promise<{
  howToComplete: string[];
  guides: string[];
  suggestions: string;
  motivation: string[];
}> => {
  try {
    const today = new Date();
    const isUpcoming = daysUntil > 0;
    const isToday = daysUntil === 0;
    
    // Use AI to generate contextual study guide - natural, human-like language
    const prompt = `You are a friendly, experienced study coach helping a student prepare for: "${event.title}" in ${event.subject}.

Event Details:
- Type: ${event.type}
- Subject: ${event.subject}
- Days until event: ${daysUntil} ${isToday ? '(TODAY!)' : isUpcoming ? 'days' : 'days ago'}

Generate a JSON response with these fields. Write in a natural, conversational tone - like a real teacher talking to a student. Avoid excessive punctuation, formal language, or AI-sounding phrases. Be warm, practical, and direct.

1. "howToComplete": Array of 4-6 step-by-step instructions. Write them naturally, like you're explaining to a friend. Use simple language. For example, instead of "Review all Physics key concepts and formulas. Create summary notes." write "Start by reviewing the main Physics concepts you've learned. Make quick summary notes of formulas and key points."

2. "guides": Array of 4-5 practical study tips. Write them as simple, actionable advice. Avoid bullet-point style language. Make each tip a complete, natural sentence.

3. "suggestions": One friendly, encouraging sentence. Write it like you're giving personal advice, not a formal instruction. Be warm and supportive.

4. "motivation": Array of 3 encouraging messages. Write them like a real person would - natural, genuine, and supportive. Avoid clichés or overly formal language.

Remember: Write like a human, not an AI. Use natural language, avoid excessive punctuation, and be conversational.`;

    const response = await model.generateContent(prompt);
    const responseText = response.response.text();
    
    // Try to parse JSON response
    let aiGuide;
    try {
      // Remove markdown code blocks if present
      const cleanedText = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      aiGuide = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError, responseText);
      throw new Error('Failed to parse AI response');
    }
    
    // Validate AI response structure
    if (!aiGuide.howToComplete || !Array.isArray(aiGuide.howToComplete) ||
        !aiGuide.guides || !Array.isArray(aiGuide.guides) ||
        !aiGuide.suggestions || typeof aiGuide.suggestions !== 'string' ||
        !aiGuide.motivation || !Array.isArray(aiGuide.motivation)) {
      throw new Error('Invalid AI response structure');
    }
    
    return aiGuide;
  } catch (error) {
    console.error('Error generating AI study guide:', error);
    // Return detailed fallback guide
    const isUpcoming = daysUntil > 0;
    const isToday = daysUntil === 0;
    
    if (event.type === 'Exam') {
      return {
        howToComplete: isUpcoming ? [
          `Day 1-${Math.max(1, Math.floor(daysUntil * 0.3))}: Review all ${event.subject} key concepts and formulas. Create summary notes.`,
          `Day ${Math.max(2, Math.floor(daysUntil * 0.3) + 1)}-${Math.max(2, Math.floor(daysUntil * 0.7))}: Practice ${event.subject} exam questions. Identify and focus on weak areas.`,
          `Day ${Math.max(3, Math.floor(daysUntil * 0.7) + 1)}-${daysUntil - 1}: Intensive review. Take timed practice tests and review difficult ${event.subject} topics.`,
          `Day ${daysUntil} (Exam Day): Light review (30 min), stay calm, and trust your ${event.subject} preparation.`
        ] : isToday ? [
          `Morning: Quick review of ${event.subject} key formulas (30 minutes max)`,
          `Before exam: Stay calm, breathe, and trust your ${event.subject} knowledge`,
          `During exam: Read carefully, manage time, show your work`,
          `After exam: Reflect on performance and areas to improve`
        ] : [
          `Review your ${event.subject} exam results and identify strengths`,
          `Note areas needing improvement for future ${event.subject} exams`,
          `Update your study strategy based on this ${event.subject} exam experience`
        ],
        guides: [
          `Review ${event.subject} concepts systematically - don't skip fundamentals`,
          `Practice ${event.subject} exam-style questions under timed conditions`,
          `Create concise ${event.subject} summary notes for quick revision`,
          `Take full-length ${event.subject} practice tests to build confidence`,
          `Focus on weak ${event.subject} areas but maintain strong topics too`
        ],
        suggestions: isUpcoming 
          ? `You have ${daysUntil} day${daysUntil > 1 ? 's' : ''} to prepare for your ${event.subject} exam. Start with comprehensive review, then focus on practice. Allocate time wisely for each ${event.subject} topic.`
          : isToday
          ? `Today's your ${event.subject} exam! Review notes briefly (30 min max), stay hydrated, get good sleep, and approach with confidence. You've prepared well!`
          : `Reflect on your ${event.subject} exam. What went well? What would you improve? Use this experience to grow.`,
        motivation: [
          `You've been preparing for this ${event.subject} exam. Trust your preparation and stay calm!`,
          `Every ${event.subject} study session has built your knowledge. You're ready for this exam!`,
          `Remember: ${event.subject} exams test what you know, not who you are. Give it your best effort!`
        ]
      };
    } else if (event.type === 'Assignment') {
      return {
        howToComplete: [
          `Step 1: Understand requirements. Read the ${event.subject} assignment brief carefully. Note all deliverables, deadlines, and formatting requirements.`,
          `Step 2: Research thoroughly. Gather ${event.subject} materials, textbooks, credible online resources, and relevant examples.`,
          `Step 3: Create detailed outline. Organize your ${event.subject} assignment structure with main points and supporting evidence.`,
          `Step 4: Write systematically. Work on each ${event.subject} section one at a time. Focus on clarity and coherence.`,
          `Step 5: Review and refine. Check for errors, ensure all ${event.subject} requirements are met, and polish your writing.`,
          `Step 6: Final submission. Double-check formatting, citations, and submit your ${event.subject} assignment before the deadline.`
        ],
        guides: [
          `Break your ${event.subject} assignment into smaller, manageable daily tasks`,
          `Research ${event.subject} topics using credible academic sources`,
          `Create a detailed outline before writing your ${event.subject} assignment`,
          `Write in focused sections, completing one ${event.subject} part at a time`,
          `Review and edit your ${event.subject} work for clarity, accuracy, and completeness`
        ],
        suggestions: isUpcoming
          ? `You have ${daysUntil} day${daysUntil > 1 ? 's' : ''} to complete your ${event.subject} assignment. Start today by understanding requirements and gathering ${event.subject} resources. Work on it daily to avoid stress.`
          : isToday
          ? `Finalize your ${event.subject} assignment today! Review all requirements, check for errors, ensure proper formatting, and submit with confidence.`
          : `Great job completing your ${event.subject} assignment! Reflect on what you learned and how you can apply it.`,
        motivation: [
          `You're making progress on your ${event.subject} assignment. Keep going, one step at a time!`,
          `Quality ${event.subject} work takes time and effort. You're doing great - keep pushing forward!`,
          `Every section you complete brings you closer to finishing your ${event.subject} assignment. You've got this!`
        ]
      };
    } else {
      return {
        howToComplete: [
          `Step 1: Gather materials. Collect your ${event.subject} notes, textbooks, and previous work related to "${event.title}".`,
          `Step 2: Review concepts. Focus on understanding ${event.subject} material deeply, not just memorizing.`,
          `Step 3: Practice actively. Test yourself on ${event.subject} topics without looking at notes to strengthen memory.`,
          `Step 4: Make connections. Link new ${event.subject} concepts to what you already know to build understanding.`,
          `Step 5: Create summaries. Make brief notes or mind maps for "${event.title}" for quick future reference.`,
          `Step 6: Consolidate learning. Review everything one more time to reinforce your ${event.subject} knowledge.`
        ],
        guides: [
          `Review your ${event.subject} notes and previous materials systematically`,
          `Focus on understanding ${event.subject} concepts deeply, not just memorizing`,
          `Practice active recall by testing yourself on ${event.subject} topics`,
          `Connect new ${event.subject} concepts to what you already know`,
          `Create visual aids like diagrams or mind maps for ${event.subject}`
        ],
        suggestions: isUpcoming
          ? `You have ${daysUntil} day${daysUntil > 1 ? 's' : ''} for this ${event.subject} study session. Use this time to build a strong foundation. Review ${event.subject} materials daily and consolidate understanding.`
          : isToday
          ? `Make the most of today's ${event.subject} study session! Set specific goals, eliminate distractions, and take regular breaks. Quality over quantity!`
          : `Excellent work on completing this ${event.subject} study session! Keep the momentum going with your next study plan.`,
        motivation: [
          `Every ${event.subject} revision session strengthens your understanding. You're building knowledge that lasts!`,
          `Consistent ${event.subject} study creates strong foundations. You're doing amazing work!`,
          `Small daily efforts in ${event.subject} lead to big achievements. Keep going, you're on the right track!`
        ]
      };
    }
  }
};

const generateEducationalResponse = async (userMessage: string, context: string): Promise<string> => {
  try {
    // Create focused educational context prompt for direct, helpful responses
    const systemPrompt = `You are Smart Tutor, an AI assistant for Ethiopian high school students (grades 9-12).

IMPORTANT: Answer questions directly and specifically. Do NOT give generic educational support messages. Focus on the actual question asked.

Guidelines:
- Answer the specific question asked about the topic
- Use clear, age-appropriate language
- Include Ethiopian context when relevant
- Use markdown formatting for readability
- Keep responses focused and informative
- Be encouraging and helpful

If asked about a specific topic (like Ethiopian history), provide factual information about that topic directly.`;

    // Combine context if provided
    const fullPrompt = context && context.trim()
      ? `${systemPrompt}\n\nAdditional Context: ${context}\n\nStudent Question: ${userMessage}`
      : `${systemPrompt}\n\nStudent Question: ${userMessage}`;

    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    let aiResponse = response.text();

    // Clean up and format the response
    aiResponse = aiResponse.trim();

    // Check if response is valid and not generic
    if (!aiResponse || aiResponse.length < 10) {
      throw new Error('Empty or invalid AI response');
    }

    // Only add formatting if the response is a direct answer (not already formatted)
    if (!aiResponse.includes('#') && !aiResponse.includes('##') && aiResponse.length > 100) {
      // Add basic structure for longer responses
      const lines = aiResponse.split('\n');
      const firstLine = lines[0];
      if (firstLine && firstLine.length < 100) {
        aiResponse = `## ${firstLine}\n\n${lines.slice(1).join('\n')}`;
      }
    }

    return aiResponse;

  } catch (error) {
    console.error('Gemini AI Error:', error);
    console.error('User message that failed:', userMessage);
    console.error('Context provided:', context);

    // Intelligent fallback based on question type
    return generateIntelligentFallback(userMessage);
  }
};

// Intelligent fallback for when AI fails
const generateIntelligentFallback = (userMessage: string): string => {
  const message = userMessage.toLowerCase();

  // Analyze question type and provide intelligent fallback
  if (message.includes('history') || message.includes('historical') || message.includes('past')) {
    return `## 📜 Ethiopian History Overview

Ethiopia has one of the longest and most fascinating histories in the world, dating back thousands of years. Here's a brief overview:

### 🏛️ **Ancient Ethiopia (Pre-960 AD)**
- **Axum Kingdom** (100-960 AD): Major trading empire, first major kingdom to adopt Christianity
- **Obelisks and monuments** still stand as testament to Axum's power
- **Trade connections** with Roman Empire, India, and China

### 👑 **Medieval Period (960-1855)**
- **Zagwe Dynasty** (960-1270): Moved capital to Lalibela, built famous rock-hewn churches
- **Solomonic Dynasty** (1270-1974): Claimed descent from King Solomon and Queen of Sheba
- **Famous emperors** like Haile Selassie I (last emperor of this line)

### ⚔️ **Modern Era (1855-1974)**
- **Emperor Tewodros II**: Unified Ethiopia, fought against European colonization
- **Battle of Adwa (1896)**: Ethiopia defeated Italy, became only African nation to remain independent
- **Emperor Haile Selassie**: Modernized Ethiopia, founded African Union

### 🏛️ **Key Historical Sites**
- **Axum**: Ancient capital with obelisks and Queen of Sheba's palace
- **Lalibela**: 11 rock-hewn churches, UNESCO World Heritage site
- **Gondar**: Medieval castles and imperial compounds

### 🎯 **Why Ethiopia's History Matters**
- **Longest independent history** in Africa
- **Rich cultural heritage** with unique alphabet, calendar, and traditions
- **Resistance to colonization** - never fully colonized by European powers
- **Ancient Christian kingdom** - one of the oldest Christian nations in the world

What specific period or aspect of Ethiopian history interests you most?`;
  }

  if ((message.includes('math') || message.includes('calculate') || message.includes('solve')) &&
      !message.includes('sample') && !message.includes('practice') && !message.includes('example') &&
      !message.includes('give me') && !message.includes('questions') && !message.includes('problems')) {
    return `## 🧮 Mathematics Problem

I understand you're working on a math problem! Let's approach this systematically:

### 📝 **Problem-Solving Framework**
1. **Read carefully** - Identify what's given and what's asked
2. **Choose method** - Select appropriate mathematical approach
3. **Show work** - Write clear, step-by-step calculations
4. **Check answer** - Verify result makes sense

### 🛠️ **Common Math Strategies**
- **Draw diagrams** for geometry and word problems
- **Substitute values** to test equations
- **Work backwards** from the answer
- **Use estimation** to check reasonableness

### 💡 **Pro Tip**
Math is about logical thinking and clear communication of your reasoning.

Could you share the specific problem or concept you're working on? I'll guide you through it step by step! 🔢`;
  }

  if (message.includes('science') || message.includes('physics') || message.includes('chemistry') || message.includes('biology')) {
    return `## 🔬 Science Inquiry

You're exploring a fascinating science topic! Science is about understanding how the natural world works through observation, experimentation, and evidence-based reasoning.

### 🔍 **Scientific Thinking**
- **Observe patterns** in the natural world
- **Ask questions** about how and why things happen
- **Design investigations** to test ideas
- **Analyze evidence** to draw conclusions

### 📊 **Key Science Skills**
- **Measurement accuracy** and proper units
- **Data interpretation** and graph analysis
- **Experimental design** and controlled variables
- **Critical evaluation** of results and methods

### 💡 **Science Study Approach**
- **Connect theory to real-world applications**
- **Draw diagrams** and label components
- **Understand processes** step-by-step
- **Relate concepts** across different areas of science

What specific science concept or experiment are you working on? I'd love to help you understand it better! 🧪`;
  }

  // General educational fallback
  return `## 🎓 Learning Support

I see you're engaged with your studies! As your Smart Tutor, I'm here to help you master any academic topic for grades 9-12.

### 📚 **How I Can Help**
- **Explain concepts** clearly and step-by-step
- **Provide examples** and real-world applications
- **Guide problem-solving** with systematic approaches
- **Suggest study strategies** for better retention
- **Answer questions** about any subject area

### 🎯 **Available Support Areas**
- **Mathematics:** From basic algebra to advanced calculus
- **Sciences:** Physics, Chemistry, Biology with practical applications
- **Languages:** Grammar, literature analysis, writing skills
- **Social Sciences:** History, geography, civics, economics
- **Study Skills:** Time management, exam preparation, memory techniques

What specific topic or challenge are you working on? Share your question and I'll provide targeted, helpful guidance! 🌟`;
};

// Main export function
export const generateTutorResponse = async (
  history: { role: string; text: string }[],
  userMessage: string,
  context: string = ""
): Promise<string> => {
  console.log("AI Tutor called with message:", userMessage.substring(0, 50) + "...");
  console.log("Context provided:", context.substring(0, 100) + (context.length > 100 ? "..." : ""));

  const message = userMessage.toLowerCase();

  // PRIORITY 1: Specific high-demand educational topics (keep these for quality)
  if (message.includes('newton') && message.includes('law')) {
    return `## ⚖️ Newton's Three Laws of Motion

Newton's Three Laws form the foundation of classical physics. Let me explain each one:

### 📐 **First Law: Inertia**
*"An object at rest stays at rest, and an object in motion stays in motion with the same speed and direction unless acted upon by an unbalanced force."*

**Simply:** Objects don't change their motion unless something pushes or pulls them.

**Example:** A book on a table won't move until you push it. A ball stops due to friction.

### 🏃 **Second Law: F = ma**
*"Force equals mass times acceleration"*

**Simply:** How fast something speeds up depends on force applied and object mass.

**Example:** Same force accelerates a tennis ball much faster than a bowling ball.

### 🏓 **Third Law: Action-Reaction**
*"For every action, there is an equal and opposite reaction."*

**Simply:** When you push something, it pushes back equally.

**Examples:** Rockets launch because they push exhaust gases down, gases push rocket up.

### 🎯 **Why Important?**
- Explains car safety, sports, space travel
- Foundation for engineering and technology

Want examples or calculations? 🔬`;
  }

  if (message.includes('photosynthesis')) {
    return `## 🌱 Photosynthesis Process

Photosynthesis is how plants make their own food using sunlight, carbon dioxide, and water.

### ☀️ **The Equation**
**6CO₂ + 6H₂O + light energy → C₆H₁₂O₆ + 6O₂**

### 🏗️ **Two Stages**

#### **Light-Dependent Reactions** (Thylakoid membranes)
- **Location:** Chloroplasts in leaves
- **Process:** Light splits water, produces oxygen
- **Products:** ATP (energy), NADPH, O₂

#### **Calvin Cycle** (Stroma)
- **Location:** Fluid inside chloroplasts
- **Process:** CO₂ converted to glucose
- **Requires:** ATP and NADPH from light reactions

### 🌿 **Requirements**
- **CO₂** from air through stomata
- **Water** from roots through xylem
- **Sunlight** (chlorophyll captures light)
- **Chlorophyll** (green pigment)

### 📊 **Affecting Factors**
- **Light intensity:** More light = faster photosynthesis
- **CO₂ levels:** Higher CO₂ = faster rate
- **Temperature:** Optimal 20-30°C
- **Water:** Drought closes stomata, limiting CO₂ intake

### 🎯 **Importance**
- Produces food for all life
- Releases oxygen for animals
- Removes CO₂ from atmosphere
- Stores solar energy as chemical energy

Where in the process are you confused? 🌿`;
  }

  // PRIORITY 2: Study tips and exam preparation (high demand)
  if ((message.includes('study tip') || message.includes('study tips') || message.includes('how to study')) ||
      (message.includes('exam') || message.includes('finals') || message.includes('test prep') ||
       message.includes('revision') || message.includes('review'))) {
    return `## 📚 Effective Study Strategies for Finals

Smart study techniques can dramatically improve your exam performance. Here's what research shows works best:

### 🎯 **Active Learning Techniques**

#### **1. Active Recall**
- **Test yourself** without looking at notes
- **Use flashcards** for key terms and formulas
- **Teach concepts** to a friend or record explanations
- **Weekly quizzes** on covered material

#### **2. Spaced Repetition**
- **Review material at increasing intervals:** Day 1, Day 3, Day 7, Day 14
- **Focus extra** on difficult concepts
- **Use apps** like Anki for automated scheduling

#### **3. Interleaved Practice**
- **Mix different topics** instead of studying one subject for hours
- **Practice problems** from different chapters
- **Prevents "illusions of competence"**

### 🧠 **Memory Enhancement**

#### **4. Feynman Technique**
- **Explain concepts simply** as if teaching a child
- **Identify gaps** in your understanding
- **Simplify complex ideas** into basic terms

#### **5. Mind Mapping**
- **Visual connections** between concepts
- **Hierarchical organization** of information
- **Color coding** for different topics

### ⏰ **Time Management**

#### **6. Pomodoro Technique**
- **25 minutes focused study** + 5-minute break
- **After 4 cycles:** 15-minute longer break
- **Prevents burnout** and maintains concentration

#### **7. Weekly Study Schedule**
- **Sunday:** Full review of week's material
- **Monday-Wednesday:** Deep focus on weak areas
- **Thursday:** Mixed practice and review
- **Friday:** Light review and confidence building
- **Saturday:** Full mock exams

### 📝 **Exam-Day Strategies**

#### **8. Pre-Exam Preparation**
- **Sleep well** the night before (7-8 hours)
- **Eat brain food** with protein and complex carbs
- **Arrive early** to reduce stress
- **Read instructions** carefully twice

#### **9. During Exam**
- **Read questions twice** before answering
- **Manage time:** Don't spend too long on one question
- **Show your work** for partial credit
- **Flag difficult questions** and return to them
- **Stay calm** and breathe if feeling anxious

### 🎨 **Subject-Specific Tips**

#### **Mathematics:**
- **Daily problem practice** - focus on understanding methods
- **Memorize formulas** but understand derivations
- **Draw diagrams** for geometry problems

#### **Sciences:**
- **Understand concepts** before memorizing facts
- **Create summary sheets** with key diagrams
- **Practice numerical problems** regularly

#### **Languages & Humanities:**
- **Active reading** with annotations
- **Practice writing** under timed conditions
- **Vocabulary building** through context

#### **Programming/Computer Science:**
- **Code regularly** - practice > theory
- **Debug systematically** - don't guess
- **Understand algorithms** conceptually

### 💊 **Wellness & Balance**

#### **10. Physical Health**
- **Exercise regularly** - even 20-minute walks help
- **Balanced nutrition** - brain food: nuts, fruits, vegetables
- **Hydration** - 8 glasses of water daily minimum

#### **11. Mental Health**
- **Adequate sleep** (7-9 hours/night)
- **Stress management** - meditation, deep breathing
- **Positive mindset** - focus on progress, not perfection
- **Study breaks** - prevent burnout

### 🔍 **Common Mistakes to Avoid**
- **Cramming:** Last-minute studying hurts retention
- **All-nighters:** Destroy cognitive function
- **Passive reading:** Highlighting ≠ learning
- **Perfectionism:** Done is better than perfect
- **Isolation:** Study with peers when possible

### 📊 **Track Your Progress**
- **Keep a study journal** - note what works/doesn't
- **Grade your practice tests** to see improvement
- **Celebrate small wins** - maintain motivation
- **Adjust strategies** based on results

### 🎯 **Final Motivation**
**Study smarter, not harder!** Consistent, focused study beats last-minute cramming every time.

What subject are you studying for? I can give you specific strategies! 📚✨`;
  }

  // PRIORITY 3: Check for specific educational requests that need fallback handling
  if (message.includes('sample') || message.includes('practice') || message.includes('example') ||
      message.includes('give me') || message.includes('questions') || message.includes('problems')) {
    // These are specific content requests - let Gemini handle them
    return await generateEducationalResponse(userMessage, context);
  }

  // PRIORITY 4: Use Gemini AI for all other educational questions
  // This ensures intelligent, contextual responses for any topic
  return await generateEducationalResponse(userMessage, context);
};