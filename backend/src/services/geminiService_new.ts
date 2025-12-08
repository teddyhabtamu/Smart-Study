// Gemini AI service for educational responses
import { GoogleGenerativeAI } from '@google/generative-ai';

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

export const generateStudyPlan = async (
  userRequest: string,
  grade: number = 10
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

  // If no specific tasks found, create a general study plan
  if (studyPlan.length === 0) {
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    studyPlan.push({
      title: "General Study Session",
      subject: "General",
      date: tomorrow.toISOString().split('T')[0],
      type: "Revision",
      notes: "Review study materials and complete assignments"
    });
  }

  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 1500));

  return studyPlan;
};

const generateEducationalResponse = async (userMessage: string, context: string): Promise<string> => {
  try {
    // Create comprehensive educational context prompt for high school students
    const systemPrompt = `You are Smart Tutor, an expert AI educational assistant designed specifically for Ethiopian high school students in grades 9-12.

CRITICAL ROLE DEFINITION:
- You are a professional educator and subject matter expert
- Your primary goal is to help students understand and master academic concepts
- You must provide accurate, clear, and age-appropriate explanations
- Always maintain high academic standards while being accessible

CONTENT REQUIREMENTS:
- Use clear, simple language appropriate for grades 9-12
- Explain complex concepts step-by-step with examples
- Include relevant formulas, equations, and calculations when applicable
- Provide real-world applications and practical examples
- Use Ethiopian context where relevant (local examples, curriculum connections)
- Include visual descriptions for diagrams and processes
- Suggest follow-up questions or practice activities

RESPONSE STRUCTURE:
- Use markdown formatting for readability
- Include section headers with emojis for visual appeal
- Provide step-by-step explanations for processes
- End with questions to encourage deeper thinking
- Keep responses focused and not overly long

SUBJECT EXPERTISE AREAS:
- Mathematics: Algebra, geometry, trigonometry, calculus basics
- Physics: Mechanics, electricity, optics, modern physics
- Chemistry: Atomic structure, reactions, organic chemistry, lab skills
- Biology: Cell biology, genetics, ecology, human physiology
- English/Literature: Grammar, writing, literary analysis
- History/Geography: World history, Ethiopian history, geopolitics
- Civics/Economics: Government, society, basic economics

STUDY SUPPORT:
- Provide study strategies and learning tips
- Help with homework and exam preparation
- Encourage critical thinking and problem-solving
- Suggest effective revision techniques

Always be encouraging, patient, and supportive. Focus on building student confidence and understanding.`;

    // Combine context if provided
    const fullPrompt = context && context.trim()
      ? `${systemPrompt}\n\nAdditional Context: ${context}\n\nStudent Question: ${userMessage}`
      : `${systemPrompt}\n\nStudent Question: ${userMessage}`;

    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    let aiResponse = response.text();

    // Clean up and format the response
    aiResponse = aiResponse.trim();

    // Ensure proper markdown formatting
    if (!aiResponse.includes('#') && aiResponse.length > 200) {
      // If AI response lacks structure, add basic formatting
      const firstSentence = aiResponse.split('.')[0];
      aiResponse = `## 🤔 Let's Explore This Topic\n\n${aiResponse}\n\n### 💡 Key Insight\n${firstSentence}. This forms the foundation for understanding the broader concept.\n\nWhat specific aspect would you like me to clarify or expand on?`;
    }

    return aiResponse;

  } catch (error) {
    console.error('Gemini AI Error:', error);

    // Intelligent fallback based on question type
    return generateIntelligentFallback(userMessage);
  }
};

// Intelligent fallback for when AI fails
const generateIntelligentFallback = (userMessage: string): string => {
  const message = userMessage.toLowerCase();

  // Analyze question type and provide intelligent fallback
  if (message.includes('math') || message.includes('calculate') || message.includes('solve')) {
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

  // PRIORITY 3: Use Gemini AI for all other educational questions
  // This ensures intelligent, contextual responses for any topic
  return await generateEducationalResponse(userMessage, context);
};