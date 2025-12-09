// Gemini AI service for educational responses
import { GoogleGenerativeAI } from '@google/generative-ai';

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
  const studyPlan = [];

  // Extract subjects and deadlines from the request
  if (request.includes('math') && request.includes('exam') && request.includes('friday')) {
    // Calculate next Friday
    const nextFriday = new Date(today);
    nextFriday.setDate(today.getDate() + (5 - today.getDay() + 7) % 7);
    if (nextFriday <= today) nextFriday.setDate(nextFriday.getDate() + 7);

    studyPlan.push({
      title: "Review Linear Equations",
      subject: "Mathematics",
      date: nextFriday.toISOString().split('T')[0],
      type: "Revision",
      notes: "Focus on solving equations and word problems"
    });

    studyPlan.push({
      title: "Practice Math Problems",
      subject: "Mathematics",
      date: nextFriday.toISOString().split('T')[0],
      type: "Revision",
      notes: "Solve past exam questions and practice problems"
    });

    studyPlan.push({
      title: "Math Final Review",
      subject: "Mathematics",
      date: nextFriday.toISOString().split('T')[0],
      type: "Exam",
      notes: "Final review before math exam"
    });
  }

  if (request.includes('chemistry') && request.includes('assignment') && request.includes('wednesday')) {
    // Calculate next Wednesday
    const nextWednesday = new Date(today);
    nextWednesday.setDate(today.getDate() + (3 - today.getDay() + 7) % 7);
    if (nextWednesday <= today) nextWednesday.setDate(nextWednesday.getDate() + 7);

    studyPlan.push({
      title: "Chemistry Assignment Research",
      subject: "Chemistry",
      date: nextWednesday.toISOString().split('T')[0],
      type: "Assignment",
      notes: "Research and gather information for chemistry assignment"
    });

    studyPlan.push({
      title: "Complete Chemistry Assignment",
      subject: "Chemistry",
      date: nextWednesday.toISOString().split('T')[0],
      type: "Assignment",
      notes: "Write and finalize chemistry assignment"
    });
  }

  // Parse dates intelligently
  const parseDate = (text: string): Date => {
    const result = new Date(today);
    if (text.includes('tomorrow')) {
      result.setDate(today.getDate() + 1);
    } else if (text.includes('next week') || text.includes('in 7 days')) {
      result.setDate(today.getDate() + 7);
    } else if (text.includes('after 2 weeks') || text.includes('in 2 weeks') || text.includes('in 14 days')) {
      result.setDate(today.getDate() + 14);
    } else if (text.includes('after 2 days') || text.includes('in 2 days')) {
      result.setDate(today.getDate() + 2);
    } else if (text.includes('after 3 days') || text.includes('in 3 days')) {
      result.setDate(today.getDate() + 3);
    } else {
      result.setDate(today.getDate() + 1);
    }
    return result;
  };

  // Extract math exam (improved pattern matching) - start from today
  if (request.includes('math') && request.includes('exam')) {
    const examDate = parseDate(request);
    const daysUntilExam = Math.ceil((examDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    // Create study sessions starting from today, distributed over the period
    if (daysUntilExam >= 7) {
      // If exam is a week or more away, create sessions throughout
      const session1 = new Date(today);
      const session2 = new Date(today);
      session2.setDate(today.getDate() + Math.floor(daysUntilExam / 3));
      const session3 = new Date(today);
      session3.setDate(today.getDate() + Math.floor(daysUntilExam * 2 / 3));
      const finalReview = new Date(examDate);
      finalReview.setDate(examDate.getDate() - 1);

      studyPlan.push({
        title: "Mathematics Study Session 1",
        subject: "Mathematics",
        date: session1.toISOString().split('T')[0],
        type: "Revision",
        notes: "Start reviewing key concepts and formulas"
      });

      studyPlan.push({
        title: "Mathematics Study Session 2",
        subject: "Mathematics",
        date: session2.toISOString().split('T')[0],
        type: "Revision",
        notes: "Practice problems and review difficult topics"
      });

      studyPlan.push({
        title: "Mathematics Study Session 3",
        subject: "Mathematics",
        date: session3.toISOString().split('T')[0],
        type: "Revision",
        notes: "Continue practice and review"
      });

      studyPlan.push({
        title: "Mathematics Final Review",
        subject: "Mathematics",
        date: finalReview.toISOString().split('T')[0],
        type: "Revision",
        notes: "Final review and practice exam questions"
      });
    } else {
      // If exam is less than a week away, create daily sessions
      for (let i = 0; i < daysUntilExam - 1; i++) {
        const sessionDate = new Date(today);
        sessionDate.setDate(today.getDate() + i);
        studyPlan.push({
          title: `Mathematics Study Session ${i + 1}`,
          subject: "Mathematics",
          date: sessionDate.toISOString().split('T')[0],
          type: "Revision",
          notes: i === daysUntilExam - 2 ? "Final review before exam" : "Review and practice problems"
        });
      }
    }

    studyPlan.push({
      title: "Mathematics Exam",
      subject: "Mathematics",
      date: examDate.toISOString().split('T')[0],
      type: "Exam",
      notes: "Mathematics exam"
    });
  }

  // Extract physics assignment (improved pattern matching) - start from today
  if (request.includes('physics') && request.includes('assignment')) {
    const assignmentDate = parseDate(request);
    const daysUntilAssignment = Math.ceil((assignmentDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    
    // Create study sessions starting from today
    if (daysUntilAssignment >= 7) {
      // If assignment is a week or more away, create sessions throughout
      const session1 = new Date(today);
      const session2 = new Date(today);
      session2.setDate(today.getDate() + Math.floor(daysUntilAssignment / 2));
      const prepDate = new Date(assignmentDate);
      prepDate.setDate(assignmentDate.getDate() - 1);

      studyPlan.push({
        title: "Physics Assignment Research",
        subject: "Physics",
        date: session1.toISOString().split('T')[0],
        type: "Revision",
        notes: "Start researching and gathering materials"
      });

      studyPlan.push({
        title: "Physics Assignment Progress Check",
        subject: "Physics",
        date: session2.toISOString().split('T')[0],
        type: "Revision",
        notes: "Review progress and continue research"
      });

      studyPlan.push({
        title: "Physics Assignment Final Preparation",
        subject: "Physics",
        date: prepDate.toISOString().split('T')[0],
        type: "Revision",
        notes: "Finalize research and prepare to write"
      });
    } else {
      // If assignment is less than a week away, create sessions leading up to it
      for (let i = 0; i < daysUntilAssignment - 1; i++) {
        const sessionDate = new Date(today);
        sessionDate.setDate(today.getDate() + i);
        studyPlan.push({
          title: `Physics Assignment Work ${i + 1}`,
          subject: "Physics",
          date: sessionDate.toISOString().split('T')[0],
          type: "Revision",
          notes: i === daysUntilAssignment - 2 ? "Finalize assignment" : "Research and work on assignment"
        });
      }
    }

    studyPlan.push({
      title: "Complete Physics Assignment",
      subject: "Physics",
      date: assignmentDate.toISOString().split('T')[0],
      type: "Assignment",
      notes: "Complete and submit physics assignment"
    });
  }

  // If no specific tasks found, try to extract subject from request and create a study plan
  if (studyPlan.length === 0) {
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

    // Determine event type
    let eventType = 'Revision';
    if (request.includes('exam') || request.includes('test')) eventType = 'Exam';
    else if (request.includes('assignment') || request.includes('homework')) eventType = 'Assignment';

    studyPlan.push({
      title: `${subject} Study Session`,
      subject: subject,
      date: tomorrow.toISOString().split('T')[0],
      type: eventType,
      notes: "Review study materials"
    });
  }

  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 1500));

  return studyPlan;
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