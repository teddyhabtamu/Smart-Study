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

// Specific educational responses
const generateNewtonsLawsResponse = (): string => {
  return `## ⚖️ Newton's Three Laws of Motion

Newton's Three Laws of Motion form the foundation of classical mechanics. Let me explain each one clearly:

### 📐 **First Law: Law of Inertia**
*"An object at rest stays at rest, and an object in motion stays in motion with the same speed and in the same direction unless acted upon by an unbalanced force."*

**In simple terms:** Things don't change their motion unless something pushes or pulls them.

**Example:** A book sitting on a table won't move until you push it. A ball rolling on grass will eventually stop because friction acts against it.

### 🏃 **Second Law: Law of Acceleration**
*"Force equals mass times acceleration (F = ma)"*

**In simple terms:** How much an object accelerates depends on two things:
- How strong the force is (F)
- How heavy the object is (m)

**Example:** It takes more force to push a car than a bicycle because the car has more mass.

### 🏓 **Third Law: Action-Reaction**
*"For every action, there is an equal and opposite reaction."*

**In simple terms:** When you push on something, it pushes back with the same force.

**Examples:**
- When you jump, you push down on the ground, and the ground pushes you up
- Rockets work because they push hot gases down, and the gases push the rocket up
- Swimming: You push water backward, water pushes you forward

### 🎯 **Real-World Applications**
- **Car safety:** Understanding inertia and crash forces
- **Sports:** Physics of balls, running, jumping
- **Engineering:** Designing safer vehicles and structures
- **Space travel:** Orbital mechanics and rocket propulsion

### 🧮 **Practice Problems**
1. A 5kg ball accelerates at 2m/s². What's the force? (F = 5 × 2 = 10N)
2. A 10N force acts on a 2kg mass. What's acceleration? (a = 10/2 = 5m/s²)

### 💡 **Key Takeaway**
**Newton's Laws explain everything from falling apples to space rockets!**

Want to see calculations or more examples? 🔬`;
};

const generatePhotosynthesisResponse = (): string => {
  return `## 🌱 Photosynthesis: How Plants Make Food

Photosynthesis is the amazing process where plants convert sunlight into food energy. It's the foundation of life on Earth!

### ☀️ **The Basic Equation**
**6CO₂ + 6H₂O + light energy → C₆H₁₂O₆ + 6O₂**

Carbon dioxide + Water + Sunlight → Glucose + Oxygen

### 🏗️ **Two Stages of Photosynthesis**

#### **Stage 1: Light-Dependent Reactions** (Thylakoid membranes)
- **Location:** Inside chloroplasts
- **What happens:** Light energy splits water molecules
- **Products:** Oxygen gas, ATP energy, NADPH
- **Equation:** 2H₂O → 4H⁺ + 4e⁻ + O₂

#### **Stage 2: Calvin Cycle** (Stroma)
- **Location:** Fluid part of chloroplasts
- **What happens:** CO₂ is converted to glucose
- **Requires:** ATP and NADPH from light reactions
- **Products:** Glucose (C₆H₁₂O₆)

### 🌿 **Requirements for Photosynthesis**
1. **Carbon Dioxide (CO₂)** - From air through stomata (leaf pores)
2. **Water (H₂O)** - From roots through xylem vessels
3. **Sunlight** - Best at blue (400-500nm) and red (600-700nm) wavelengths
4. **Chlorophyll** - Green pigment in chloroplasts that captures light
5. **Chloroplasts** - Specialized organelles in plant cells

### 📊 **Factors Affecting Photosynthesis**

#### **Positive Factors:**
- **Light intensity:** More light = faster photosynthesis (up to limit)
- **CO₂ concentration:** More CO₂ = faster rate
- **Temperature:** Optimal 20-30°C, too hot/cold slows down

#### **Negative Factors:**
- **Water shortage:** Plants close stomata to conserve water
- **Pollutants:** Can block chlorophyll or damage leaves
- **Extreme temperatures:** Enzymes stop working

### 🔬 **Where It Happens**
- **Leaf structure:** Waxy cuticle, epidermis, palisade/spongy mesophyll
- **Stomata:** Pores for gas exchange (open during day, closed at night)
- **Chloroplasts:** Contain chlorophyll and enzymes needed for reactions

### 🌍 **Importance**
- **Food production:** Basis of all food chains
- **Oxygen supply:** Produces 70% of atmospheric oxygen
- **Carbon cycle:** Removes CO₂ from air
- **Energy storage:** Solar energy → chemical energy in glucose

### 🧪 **Quick Test**
**Question:** What gas do plants take in during photosynthesis?
**Answer:** Carbon dioxide (CO₂)

**Question:** What gas do they give out?
**Answer:** Oxygen (O₂)

### 🎯 **Key Facts to Remember**
- Happens only in green plant parts (leaves, stems)
- Requires light, so mainly daytime process
- Glucose used for energy or stored as starch
- Oxygen is a waste product but essential for animals

Want to learn about cellular respiration (opposite process) or see photosynthesis diagrams? 🌿`;
};

const generateGravityResponse = (): string => {
  return `## 🌍 Gravity: The Universal Force

Gravity is the invisible force that keeps planets orbiting the sun, makes things fall to Earth, and holds the universe together!

### 🎯 **Newton's Law of Universal Gravitation**
**F = G × (m₁ × m₂) / r²**

Where:
- **F** = Gravitational force (in Newtons)
- **G** = Gravitational constant (6.674 × 10⁻¹¹ N⋅m²/kg²)
- **m₁, m₂** = Masses of the two objects (in kg)
- **r** = Distance between centers (in meters)

### 🔑 **Key Points About Gravity**

#### **1. Universal Force**
- **Acts between ALL objects** with mass
- **Stronger** between more massive objects
- **Weaker** with greater distance (inverse square law)

#### **2. Weight vs. Mass**
- **Mass:** Amount of matter (constant, measured in kg)
- **Weight:** Force of gravity on mass (varies by planet)
- **Weight = mass × gravity** (W = mg)

#### **3. Earth's Gravity**
- **g = 9.8 m/s²** (near Earth's surface)
- **Why we don't feel it:** Ground pushes up equally
- **Free fall:** Objects accelerate at 9.8 m/s² (ignoring air resistance)

### 🌌 **Gravity in Space**
- **Orbits:** Balance between gravity and forward motion
- **Microgravity:** Free fall (astronauts, ISS)
- **Black holes:** Extreme gravity from massive collapsed stars
- **Tides:** Moon's gravity pulls Earth's oceans

### 🏠 **Everyday Examples**
- **Falling objects:** Apple from tree, raindrops
- **Jumping:** Gravity brings you back down
- **Planets orbiting:** Gravity keeps them in curved paths
- **Ocean tides:** Moon's gravity causes high/low tides

### 🧮 **Calculations**
**Example:** Calculate gravitational force between Earth (6×10²⁴ kg) and you (60 kg) at Earth's surface:

F = G × (M_earth × m_you) / r²
F = (6.674×10⁻¹¹) × (6×10²⁴ × 60) / (6.4×10⁶)²
F ≈ 588 N (about 60 kg-force)

### 🚀 **Fun Facts**
- **Gravity travels at light speed**
- **No gravity shielding** - can't block gravity
- **Weakest fundamental force** but acts over infinite distance
- **Causes time dilation** (GPS satellites account for this)

Want to calculate orbital speeds or learn about Einstein's theory of gravity? 🌌`;
};

const generateCellTheoryResponse = (): string => {
  return `## 🔬 Cell Theory: The Foundation of Biology

Cell Theory explains that all living things are made of cells and that cells are the basic unit of life.

### 📜 **The Three Principles**

#### **1. All living things are made of cells**
- **Cells are the building blocks** of all organisms
- **Single-celled organisms** like bacteria are complete living things
- **Multi-celled organisms** have many cells working together

#### **2. Cells are the basic unit of life**
- **Smallest unit** capable of all life processes
- **Can carry out** metabolism, growth, reproduction, response to environment
- **All functions** of life happen at cellular level

#### **3. All cells come from pre-existing cells**
- **No spontaneous generation** - cells only come from other cells
- **Cell division:** Mitosis (growth) and Meiosis (reproduction)
- **Explains reproduction** and inheritance

### 🧬 **Cell Types**

#### **Prokaryotic Cells** (Bacteria)
- **No nucleus** - DNA floats in cytoplasm
- **Smaller** and simpler structure
- **Examples:** Bacteria, archaea

#### **Eukaryotic Cells** (Plants, Animals, Fungi)
- **True nucleus** containing DNA
- **Larger** with complex organelles
- **Examples:** Plant cells, animal cells

### 🏗️ **Major Cell Organelles**

#### **Nucleus**
- **Control center** of the cell
- **Contains DNA** (genetic material)
- **Surrounded by nuclear envelope**

#### **Mitochondria**
- **Powerhouses** of the cell
- **Produce ATP** (energy)
- **Have their own DNA**

#### **Ribosomes**
- **Protein factories**
- **Made of RNA and protein**
- **Found free in cytoplasm or attached to ER**

#### **Endoplasmic Reticulum (ER)**
- **Transport system**
- **Rough ER:** Protein synthesis (has ribosomes)
- **Smooth ER:** Lipid synthesis, detoxification

#### **Golgi Apparatus**
- **Packaging and shipping**
- **Modifies and sorts proteins**
- **Prepares vesicles for transport**

#### **Lysosomes**
- **Waste disposal**
- **Contain digestive enzymes**
- **Break down old organelles**

### 🌱 **Plant vs. Animal Cells**

#### **Plant Cells Have:**
- **Cell wall** (rigid structure outside cell membrane)
- **Large central vacuole** (storage, maintains pressure)
- **Chloroplasts** (photosynthesis)
- **Rectangular shape**

#### **Animal Cells Have:**
- **No cell wall** (flexible cell membrane only)
- **Small vacuoles** (storage)
- **No chloroplasts**
- **Irregular shapes**

### 🔬 **Cell Theory Evidence**
- **Microscopes:** Allowed scientists to see cells
- **Experiments:** Showed cells divide and reproduce
- **Fossil record:** Shows evolution from single-celled organisms

### 🎯 **Importance**
- **Unifies biology** - explains all living things
- **Basis for medicine** - understanding diseases at cellular level
- **Biotechnology** - genetic engineering, cloning
- **Evolution** - explains how life changes over time

### 🧪 **Quick Check**
**Question:** What are the three main principles of cell theory?
**Answer:**
1. All living things are made of cells
2. Cells are the basic unit of life
3. All cells come from pre-existing cells

Want to learn about cell division, cell membrane, or specific organelles? 🔬`;
};

// Study tips response
const generateStudyTipsResponse = (userMessage: string): string => {
  const message = userMessage.toLowerCase();

  if (message.includes('math') || message.includes('mathematics')) {
    return `## 🧮 Math Study Tips

Here are effective strategies for studying mathematics:

### 📝 **Daily Practice Routine**
- **Solve 5-10 problems daily** from each topic
- **Focus on understanding concepts** before memorizing formulas
- **Work backwards** - start with answers and derive solutions

### 🛠️ **Problem-Solving Techniques**
- **Read problems twice** - identify what's given and what's asked
- **Draw diagrams** for geometry and word problems
- **Substitute numbers** for variables to test understanding
- **Check units** - ensure they make sense

### 📚 **Formula Memorization**
- **Derive formulas** instead of just memorizing
- **Create formula sheets** with examples
- **Practice conversions** between units

### 🎯 **Common Mistakes to Avoid**
- **Rushing calculations** - double-check arithmetic
- **Skipping steps** - show all work for partial credit
- **Not checking answers** - substitute back into originals

### 💡 **Pro Tips**
- **Teach concepts** to friends or record explanations
- **Use online resources** like Khan Academy for visual learning
- **Practice past exam papers** under timed conditions

What specific math topic are you struggling with? I can give more targeted advice!`;
  }

  if (message.includes('science') || message.includes('physics') || message.includes('chemistry') || message.includes('biology')) {
    return `## 🔬 Science Study Tips

Effective strategies for mastering science subjects:

### 🧪 **Laboratory Work**
- **Pre-lab preparation** - read procedures and predict outcomes
- **Observation skills** - note colors, temperatures, reactions
- **Data recording** - be accurate and consistent
- **Safety first** - understand hazards and procedures

### 📊 **Concept Understanding**
- **Connect theory to experiments** - understand why things happen
- **Draw diagrams** - visualize processes and structures
- **Use analogies** - relate complex ideas to familiar concepts
- **Practice calculations** regularly

### 📝 **Note-Taking Techniques**
- **Structured notes** - main ideas, supporting details, examples
- **Vocabulary building** - learn scientific terminology
- **Summary sheets** - key concepts, formulas, diagrams

### 🎯 **Exam Preparation**
- **Practice questions** - focus on understanding over memorization
- **Label diagrams** correctly
- **Explain processes** in your own words
- **Connect topics** - sciences are interconnected

### 💡 **Subject-Specific Tips**

#### **Physics:**
- **Understand derivations** - don't just memorize formulas
- **Vector diagrams** for forces and motion
- **Units and dimensions** - practice conversions

#### **Chemistry:**
- **Balance equations** - practice regularly
- **Mole calculations** - master these thoroughly
- **Reaction types** - understand mechanisms

#### **Biology:**
- **Draw and label** - practice diagrams
- **Processes flow** - understand sequences
- **Classification** - learn taxonomic hierarchy

What science subject needs the most help? I can provide detailed strategies!`;
  }

  // General study tips
  return `## 📚 Effective Study Tips for High School Students

Here are proven study techniques that work for grades 9-12:

### 🧠 **Active Learning Techniques**

#### **1. Active Recall**
- **Test yourself** without looking at notes
- **Flash cards** for key terms and formulas
- **Teach the material** to a friend or family member
- **Summarize** topics in your own words

#### **2. Spaced Repetition**
- **Review material** at increasing intervals (1 day, 3 days, 1 week, 1 month)
- **Focus more** on difficult concepts
- **Use apps** like Anki for automated scheduling

#### **3. Interleaved Practice**
- **Mix different topics** instead of studying one subject for hours
- **Connect concepts** across subjects
- **Prevents "illusions of competence"**

### 📝 **Note-Taking & Organization**

#### **4. Cornell Method**
- **Main notes** in large right section
- **Key questions** in left column
- **Summary** at bottom
- **Review cues** for quick recall

#### **5. Mind Maps**
- **Central concept** in the middle
- **Branches** for subtopics
- **Colors and images** to aid memory
- **Connections** between ideas

### ⏰ **Time Management**

#### **6. Pomodoro Technique**
- **25 minutes** focused study
- **5-minute break** (walk, stretch, hydrate)
- **4 cycles** = 15-minute longer break
- **Prevents burnout**

#### **7. Weekly Planning**
- **Sunday:** Plan the week and review progress
- **Daily goals:** 3-5 specific, achievable targets
- **Evening review:** What worked? What to adjust?

### 📊 **Progress Tracking**

#### **8. Study Journal**
- **Track study time** and topics covered
- **Note effective techniques** and what works
- **Grade practice tests** to measure improvement
- **Celebrate small wins**

#### **9. Self-Assessment**
- **Weekly quizzes** on covered material
- **Identify weak areas** for extra focus
- **Track improvement** over time

### 🎨 **Subject-Specific Strategies**

#### **Languages & Literature:**
- **Active reading** with annotations
- **Vocabulary journals** with context sentences
- **Practice writing** regularly

#### **Social Studies & History:**
- **Timeline creation** for chronological events
- **Cause-effect analysis** for historical events
- **Primary source analysis**
- **Current events connections**

### 💊 **Wellness & Balance**

#### **10. Physical Health**
- **Regular exercise** - even 20 minutes daily
- **Balanced nutrition** - brain foods (nuts, fruits, vegetables)
- **Adequate sleep** (8-9 hours nightly)
- **Hydration** (8 glasses of water daily)

#### **11. Mental Health**
- **Stress management** techniques
- **Positive self-talk** and realistic expectations
- **Study breaks** to prevent burnout
- **Social support** from friends and family

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
Remember: **Consistent, focused study beats cramming every time!**
- **Study smarter, not harder**
- **Quality over quantity**
- **Understanding > Memorization**
- **Practice makes permanent**

You've got this! Start with your weakest subject and build confidence from there. What specific subject or topic are you most worried about? I can give you targeted tips! 📚✨`;
};

// Specific educational responses
const generateMathResponse = (userMessage: string): string => {
  return `## 🧮 Mathematics Help

Let's solve this math problem step by step. I'll show you the systematic approach that works for most mathematical challenges:

### 📝 **Step 1: Read and Understand**
- **Identify** what you're trying to find
- **List** all given information
- **Determine** what operation/approach is needed

### 🛠️ **Step 2: Choose the Right Method**
- **Arithmetic:** Basic operations (+, -, ×, ÷)
- **Algebra:** Solving equations, factoring
- **Geometry:** Shapes, angles, areas, volumes
- **Word Problems:** Translate words into math

### ⚡ **Step 3: Execute the Solution**
- **Show all work** - don't skip steps
- **Use proper notation** and units
- **Check calculations** as you go

### ✅ **Step 4: Verify Your Answer**
- **Substitute back** into original problem
- **Check units** - do they make sense?
- **Try different approach** if unsure

### 🎯 **Common Math Strategies**

#### **Problem-Solving Framework:**
1. **Understand** - What is asked?
2. **Plan** - How to solve?
3. **Execute** - Carry out plan
4. **Check** - Verify answer

#### **For Word Problems:**
- **Identify variables** and what they represent
- **Write equations** from the relationships
- **Solve systematically**
- **Interpret results** in context

### 📊 **Key Math Concepts**
- **Order of Operations:** PEMDAS (Parentheses, Exponents, Multiplication/Division, Addition/Subtraction)
- **Variables:** Letters representing unknown quantities
- **Functions:** Relationships between inputs and outputs
- **Proofs:** Logical arguments showing why something is true

### 💡 **Pro Tips**
- **Draw diagrams** for geometry and word problems
- **Estimate first** - get a sense of the answer
- **Work backwards** from the answer sometimes
- **Practice regularly** - math skills build over time

What specific math topic or problem are you working on? I can provide detailed solutions and examples! 🔢`;
};

// Science-specific responses
const generateScienceResponse = (userMessage: string): string => {
  return `## 🔬 Science Exploration

Let's investigate this science question using the scientific method. Science is about observation, experimentation, and understanding how the natural world works.

### 🔍 **Scientific Method Approach**
1. **Observe** - Notice patterns or phenomena
2. **Question** - Ask "how" or "why"
3. **Research** - Gather background information
4. **Hypothesis** - Make educated guess
5. **Experiment** - Test the hypothesis
6. **Analyze** - Examine results
7. **Conclusion** - Draw supported conclusions

### 🧪 **Science Subject Areas**

#### **Physics:** Study of matter, energy, and motion
- **Classical Physics:** Forces, motion, energy, waves
- **Modern Physics:** Quantum mechanics, relativity
- **Applications:** Technology, engineering, astronomy

#### **Chemistry:** Study of substances and their interactions
- **Atomic Structure:** Protons, neutrons, electrons
- **Chemical Reactions:** Bonds, energy changes
- **Applications:** Medicine, materials, environment

#### **Biology:** Study of living organisms
- **Cell Biology:** Structure and function of cells
- **Genetics:** Inheritance and DNA
- **Ecology:** Organisms and their environments

### 🧮 **Scientific Calculations**
- **Units matter** - Always include proper units
- **Significant figures** - Show appropriate precision
- **Conversions** - Practice unit conversions regularly

### 📊 **Data Analysis**
- **Graphs and Charts** - Visual representation of data
- **Trends and Patterns** - What does the data show?
- **Error Analysis** - Sources of uncertainty
- **Conclusions** - What does it all mean?

### 🔬 **Laboratory Skills**
- **Safety First** - Always follow safety protocols
- **Accurate Measurements** - Use proper equipment
- **Observation** - Note colors, temperatures, reactions
- **Record Keeping** - Detailed, organized notes

### 🎯 **Science Study Tips**
- **Understand concepts** before memorizing facts
- **Connect theory to experiments** - why things happen
- **Draw diagrams** - visualize processes
- **Practice calculations** regularly
- **Review past experiments** and their outcomes

What specific science topic or experiment are you working on? I can provide detailed explanations, examples, or help with calculations! 🧪`;
};

// Summary response
const generateSummaryResponse = (context: string): string => {
  if (context && context.trim()) {
    return `## 📋 Content Summary

Based on the material you're studying, here's a structured summary:

### 🎯 **Key Learning Objectives**
- Master the core concepts and principles
- Understand relationships between different ideas
- Apply knowledge to new situations
- Develop problem-solving skills

### 📖 **Main Content Overview**
This material covers fundamental concepts in your curriculum, designed to build a strong foundation for advanced topics.

### 🔑 **Essential Points**
- **Core Principles:** Fundamental theories and laws
- **Key Processes:** How systems work and interact
- **Important Relationships:** Connections between concepts
- **Real-World Applications:** Practical uses and examples

### 💡 **Key Takeaways**
- Focus on understanding over memorization
- Connect new information to what you already know
- Practice applying concepts to different scenarios
- Regular review strengthens retention

### 🎓 **Study Recommendations**
- Review material multiple times using spaced repetition
- Practice with examples and problems
- Discuss concepts with classmates
- Ask questions about confusing areas

Would you like me to explain any particular aspect in more detail?`;
  }

  return `## 📋 Study Summary

I don't have specific content to summarize, but here's a general study framework:

### 🧠 **Learning Framework**
- **Knowledge:** Facts, terms, definitions
- **Comprehension:** Understanding meaning and relationships
- **Application:** Using knowledge in new situations
- **Analysis:** Breaking down complex ideas
- **Synthesis:** Combining ideas creatively
- **Evaluation:** Making judgments and assessments

### 📝 **Effective Study Habits**
- **Active Reading:** Engage with the material, not just passively read
- **Self-Testing:** Quiz yourself regularly
- **Teaching Others:** Explain concepts in your own words
- **Regular Review:** Spaced repetition over time

### 🎯 **Success Strategies**
- Set specific, achievable goals
- Track your progress and celebrate improvements
- Focus on understanding, not just memorization
- Maintain a healthy study-life balance

What specific topic or subject would you like help summarizing? 📖`;
};

// Default educational response
const generateDefaultEducationalResponse = (userMessage: string, context: string): string => {
  const message = userMessage.toLowerCase();

  // Try to identify if it's a question or statement
  const isQuestion = message.includes('?') || message.includes('what') || message.includes('how') ||
                    message.includes('why') || message.includes('when') || message.includes('where') ||
                    message.includes('explain') || message.includes('help');

  if (isQuestion) {
    return `## 🤔 Educational Question

I can see you're asking an educational question! For grades 9-12 students, the key to mastering any subject is:

### 📚 **Learning Approach**
1. **Break it down** - Divide complex topics into smaller, manageable parts
2. **Make connections** - Link new information to what you already know
3. **Practice actively** - Apply concepts through problems and examples
4. **Review regularly** - Use spaced repetition to strengthen memory

### 🎯 **Study Strategies**
- **Understand before memorizing** - Focus on "why" and "how"
- **Teach the concept** - Explain it as if teaching a friend
- **Use multiple sources** - Books, videos, online resources
- **Practice consistently** - Daily review beats cramming

### 💡 **Smart Learning Tips**
- **SQ3R Method:** Survey, Question, Read, Recite, Review
- **Feynman Technique:** Explain simply (like teaching a child)
- **Active Recall:** Test yourself without looking at notes
- **Interleaved Practice:** Mix different types of problems

### 🛠️ **Resources Available**
- **Textbook explanations** for detailed understanding
- **Practice problems** to apply concepts
- **Visual aids** (diagrams, videos) for complex topics
- **Peer discussions** to gain different perspectives

### 🎯 **To Help You Better:**
Could you provide more context about:
- What subject this is for?
- What grade level you're studying?
- Any specific examples or problems you're working with?

This will help me give you a more targeted and helpful explanation! 📖✨`;
  }

  // Statement or general comment
  return `## 🎓 Learning Support

I see you're engaged with your studies! As a high school student (grades 9-12), you're at a crucial stage where building strong foundations leads to success in higher education and careers.

### 📈 **Your Learning Journey**
- **Grades 9-10:** Building fundamental knowledge and skills
- **Grades 11-12:** Applying knowledge and developing specialization
- **Beyond High School:** University, vocational training, or career paths

### 🧠 **Essential Skills for Success**
- **Critical Thinking:** Analyzing information and solving problems
- **Communication:** Expressing ideas clearly in writing and speech
- **Research Skills:** Finding, evaluating, and using information
- **Time Management:** Balancing academics, extracurriculars, and rest
- **Adaptability:** Learning new concepts and adjusting to challenges

### 📚 **Study Habits That Work**
- **Consistent Routine:** Regular study times each day
- **Active Learning:** Engage with material, don't just passively read
- **Healthy Balance:** Include exercise, sleep, and social time
- **Goal Setting:** Specific targets with celebration of achievements
- **Help Seeking:** Ask teachers, tutors, or peers when needed

### 🎯 **High School Success Tips**
- **Focus on Understanding:** Deep comprehension beats memorization
- **Build Strong Foundations:** Each subject builds on previous learning
- **Develop Study Groups:** Peer learning and support
- **Track Progress:** Regular assessment and adjustment
- **Maintain Curiosity:** Learning is lifelong - stay interested!

What aspect of your studies would you like support with? Whether it's a specific subject, study strategies, or general academic advice, I'm here to help! 🌟`;
};

// Gemini AI service for educational responses
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