import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { BrainCircuit, Check, X, Trophy, ArrowRight, Loader2, RotateCcw, AlertCircle, Crown, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { aiTutorAPI, plannerAPI } from '../services/api';
import { generatePracticeQuiz } from '../services/geminiService';
import CustomSelect from '../components/CustomSelect';
import { SUBJECTS, GRADES } from '../constants';
import { useToast } from '../context/ToastContext';
import TTSButton from '../components/TTSButton';

interface Question {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
}

const STORAGE_KEY = 'smartstudy_practice_state';

const Practice: React.FC = () => {
  const { user, gainXP, updateUser } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();

  // State: 'config' | 'loading' | 'quiz' | 'result' | 'limit'
  const [view, setView] = useState<'config' | 'loading' | 'quiz' | 'result' | 'limit'>('config');
  const [isStarting, setIsStarting] = useState(false);
  
  // Config State
  const [subject, setSubject] = useState('Mathematics');
  const [grade, setGrade] = useState('9');
  const [difficulty, setDifficulty] = useState('Medium');
  const [qCount, setQCount] = useState('5');

  // Quiz State
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [answers, setAnswers] = useState<{[key: number]: string}>({}); // Index -> Selected Option
  const [score, setScore] = useState(0);
  const [startTime, setStartTime] = useState<Date | null>(null);

  // Restore State on Mount
  useEffect(() => {
    const savedState = localStorage.getItem(STORAGE_KEY);
    if (savedState) {
      try {
        const parsed = JSON.parse(savedState);
        // Only restore if user is still in a quiz session
        if (parsed.view === 'quiz' || parsed.view === 'result') {
          setQuestions(parsed.questions || []);
          setCurrentQIndex(parsed.currentQIndex || 0);
          setAnswers(parsed.answers || {});
          setScore(parsed.score || 0);
          setView(parsed.view);
          
          // Restore config too just in case
          if (parsed.config) {
            setSubject(parsed.config.subject);
            setGrade(parsed.config.grade);
            setDifficulty(parsed.config.difficulty);
          }
        }
      } catch (e) {
        console.error("Failed to restore practice state", e);
      }
    }
  }, []);

  // Save State on Change
  useEffect(() => {
    if (view === 'quiz' || view === 'result') {
      const stateToSave = {
        view,
        questions,
        currentQIndex,
        answers,
        score,
        config: { subject, grade, difficulty, qCount }
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
    }
  }, [view, questions, currentQIndex, answers, score, subject, grade, difficulty, qCount]);

  // Options
  const subjectOptions = SUBJECTS.filter(s => s !== 'All').map(s => ({ label: s, value: s }));
  const gradeOptions = GRADES.filter(g => g !== 'All').map(g => ({ label: `Grade ${g}`, value: g }));
  const difficultyOptions = [
    { label: 'Easy', value: 'Easy' },
    { label: 'Medium', value: 'Medium' },
    { label: 'Hard', value: 'Hard' }
  ];
  const countOptions = [
    { label: '5 Questions', value: '5' },
    { label: '10 Questions', value: '10' },
  ];

  const handleStartQuiz = async () => {
    if (!user) {
      addToast("Please log in to track your progress.", "info");
      navigate('/login');
      return;
    }

    // Check Limit: If not premium and has used >= 1 attempt
    if (!user.isPremium && (user.practiceAttempts || 0) >= 1) {
      setView('limit');
      return;
    }

    setIsStarting(true);
    setView('loading');
    
    try {
      const { questions: quizData, xpGained } = await generatePracticeQuiz(subject, grade, difficulty, parseInt(qCount));

      if (quizData && quizData.length > 0) {
        // Increment usage for free users
        if (!user.isPremium) {
          updateUser({ practiceAttempts: (user.practiceAttempts || 0) + 1 });
        }

        // Award XP for generating questions (handled by backend)
        if (gainXP && xpGained > 0) {
          gainXP(xpGained);
        }

        setQuestions(quizData);
        setView('quiz');
        setAnswers({});
        setCurrentQIndex(0);
        setStartTime(new Date()); // Start tracking time

        addToast(`Generated ${quizData.length} practice questions! (+${xpGained} XP)`, "success");
      } else {
        addToast("Failed to generate quiz. Please try again.", "error");
        setView('config');
      }
    } catch (e) {
      console.error(e);
      addToast("An error occurred while generating questions.", "error");
      setView('config');
    } finally {
      setIsStarting(false);
    }
  };

  const handleSelectOption = (option: string) => {
    setAnswers(prev => ({ ...prev, [currentQIndex]: option }));
  };

  const handleNext = () => {
    if (currentQIndex < questions.length - 1) {
      setCurrentQIndex(prev => prev + 1);
    } else {
      calculateResults();
    }
  };

  const calculateResults = async () => {
    let correctCount = 0;
    questions.forEach((q, idx) => {
      if (answers[idx] === q.correctAnswer) {
        correctCount++;
      }
    });
    setScore(correctCount);
    
    // Calculate time spent
    const endTime = new Date();
    const timeSpentMs = startTime ? endTime.getTime() - startTime.getTime() : 0;
    const minutes = Math.floor(timeSpentMs / 60000);
    const seconds = Math.floor((timeSpentMs % 60000) / 1000);
    const timeSpent = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
    
    // Award XP
    const xpEarned = correctCount * 10;
    if (xpEarned > 0) {
      const { leveledUp, newLevel } = await gainXP(xpEarned);
      if (leveledUp) {
        setTimeout(() => addToast(`Level Up! You are now Level ${newLevel}`, "success"), 1000);
      }
    }
    
    // Record quiz completion and send email (non-blocking)
    try {
      await plannerAPI.recordQuizCompletion({
        subject,
        score: correctCount,
        totalQuestions: questions.length,
        timeSpent,
        xpEarned,
        isHighScore: false // TODO: Implement high score tracking
      });
    } catch (error) {
      console.error('Failed to record quiz completion:', error);
      // Don't block the UI if this fails
    }
    
    setView('result');
  };

  const resetQuiz = () => {
    // If limit reached after this quiz, they will be blocked by handleStartQuiz next time
    setView('config');
    setQuestions([]);
    setAnswers({});
    setScore(0);
    // Clear persisted state
    localStorage.removeItem(STORAGE_KEY);
  };

  // --- RENDERERS ---

  if (view === 'limit') {
    return (
      <div className="max-w-2xl mx-auto py-12 sm:py-16 px-4 sm:px-6 animate-fade-in text-center">
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-zinc-200 shadow-xl p-6 sm:p-8 md:p-10 relative overflow-hidden">
           <div className="absolute top-0 right-0 w-48 h-48 sm:w-64 sm:h-64 bg-amber-100 rounded-full blur-3xl -mr-24 -mt-24 sm:-mr-32 sm:-mt-32 opacity-50"></div>

           <div className="w-16 h-16 sm:w-20 sm:h-20 bg-zinc-900 rounded-2xl flex items-center justify-center mx-auto mb-4 sm:mb-6 shadow-lg shadow-zinc-900/20 relative z-10">
              <Crown size={32} className="sm:w-10 sm:h-10 text-amber-400" />
           </div>

           <h2 className="text-xl sm:text-2xl font-bold text-zinc-900 mb-3 relative z-10">Practice Limit Reached</h2>
           <p className="text-zinc-500 mb-6 sm:mb-8 max-w-md mx-auto relative z-10 text-sm sm:text-base">
             You've used your free daily practice session. Upgrade to Student Pro for unlimited AI-generated quizzes and faster learning.
           </p>

           <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center relative z-10">
              <Link
                to="/subscription"
                state={{ from: '/practice' }}
                className="px-6 sm:px-8 py-3 bg-zinc-900 text-white font-bold rounded-xl hover:bg-zinc-800 transition-all shadow-lg flex items-center justify-center gap-2 text-sm sm:text-base"
              >
                Upgrade Now <ArrowRight size={16} className="sm:w-[18px] sm:h-[18px]" />
              </Link>
              <button
                onClick={() => setView('config')}
                className="px-6 sm:px-8 py-3 bg-white border border-zinc-200 text-zinc-600 font-medium rounded-xl hover:bg-zinc-50 transition-colors text-sm sm:text-base"
              >
                Back to Config
              </button>
           </div>
        </div>
      </div>
    );
  }

  if (view === 'config') {
    const attemptsLeft = user && !user.isPremium ? Math.max(0, 1 - (user.practiceAttempts || 0)) : '∞';

    return (
      <div className="max-w-2xl mx-auto py-8 sm:py-12 px-4 sm:px-6 animate-fade-in">
        <div className="text-center mb-8 sm:mb-10">
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-zinc-900 text-white rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-zinc-900/20">
            <BrainCircuit size={24} className="sm:w-8 sm:h-8" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-zinc-900 tracking-tight">Practice Center</h1>
          <p className="text-zinc-500 mt-2 text-sm sm:text-base">Generate unlimited quizzes powered by AI to master any subject.</p>

          {!user?.isPremium && user && (
             <div className="mt-4 inline-flex items-center gap-2 px-3 py-1 bg-zinc-100 rounded-full text-xs font-medium text-zinc-600 border border-zinc-200">
               <Lock size={12} /> Free Practices Left: {attemptsLeft}
             </div>
          )}
        </div>

        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-zinc-200 shadow-sm space-y-4 sm:space-y-6 relative">

          {user?.isPremium && (
            <div className="absolute inset-0 overflow-hidden rounded-2xl pointer-events-none">
                <div className="absolute top-4 right-4 text-amber-500 opacity-20">
                   <Crown size={80} className="sm:w-24 sm:h-24 rotate-12" />
                </div>
            </div>
          )}

          <div className="grid gap-4 sm:gap-6 relative z-20">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-2 uppercase tracking-wide">Subject</label>
              <CustomSelect options={subjectOptions} value={subject} onChange={setSubject} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-2 uppercase tracking-wide">Grade Level</label>
              <CustomSelect options={gradeOptions} value={grade} onChange={setGrade} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-2 uppercase tracking-wide">Difficulty</label>
              <CustomSelect options={difficultyOptions} value={difficulty} onChange={setDifficulty} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-2 uppercase tracking-wide">Length</label>
              <CustomSelect options={countOptions} value={qCount} onChange={setQCount} />
            </div>
          </div>

          <div className="pt-4 relative z-10">
            <button 
              onClick={handleStartQuiz}
              disabled={isStarting}
              className="w-full py-4 bg-zinc-900 text-white font-bold rounded-xl hover:bg-zinc-800 transition-all flex items-center justify-center gap-2 text-lg shadow-xl shadow-zinc-900/10 hover:shadow-2xl hover:scale-[1.01] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isStarting ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  Starting...
                </>
              ) : (
                <>
                  Start Practice Session <ArrowRight size={20} />
                </>
              )}
            </button>
            <p className="text-center text-xs text-zinc-400 mt-4">
              Each correct answer awards <strong>10 XP</strong>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'loading') {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center animate-fade-in">
        <Loader2 size={48} className="text-zinc-900 animate-spin mb-6" />
        <h2 className="text-xl font-bold text-zinc-900">Generating your quiz...</h2>
        <p className="text-zinc-500 mt-2">Our AI is crafting unique questions for you.</p>
      </div>
    );
  }

  if (view === 'quiz') {
    const question = questions[currentQIndex];
    const progress = ((currentQIndex) / questions.length) * 100;

    return (
      <div className="max-w-3xl mx-auto py-6 sm:py-8 px-4 sm:px-6 animate-fade-in">
        {/* Header / Progress */}
        <div className="mb-6 sm:mb-8">
           <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-2 mb-2">
             <span className="text-sm font-semibold text-zinc-500">Question {currentQIndex + 1} of {questions.length}</span>
             <span className="text-xs font-bold bg-zinc-100 px-2 py-1 rounded text-zinc-600">{subject} • {difficulty}</span>
           </div>
           <div className="h-2 w-full bg-zinc-100 rounded-full overflow-hidden">
             <div className="h-full bg-zinc-900 transition-all duration-300" style={{ width: `${progress}%` }}></div>
           </div>
        </div>

        {/* Question Card */}
        <div className="bg-white p-6 sm:p-8 rounded-2xl border border-zinc-200 shadow-sm mb-6 sm:mb-8">
           <div className="flex items-start gap-3 mb-4 sm:mb-6">
             <h2 className="text-lg sm:text-xl font-bold text-zinc-900 leading-relaxed flex-1">
               {question.question}
             </h2>
             <TTSButton text={question.question} size={16} className="sm:w-[18px] sm:h-[18px] text-zinc-400 hover:text-zinc-900 flex-shrink-0" />
           </div>

           <div className="space-y-3">
             {question.options.map((option, idx) => {
               const isSelected = answers[currentQIndex] === option;
               return (
                 <button
                   key={idx}
                   onClick={() => handleSelectOption(option)}
                   className={`w-full text-left p-3 sm:p-4 rounded-xl border-2 transition-all flex items-center justify-between group ${
                     isSelected
                       ? 'border-zinc-900 bg-zinc-50'
                       : 'border-zinc-100 hover:border-zinc-300 hover:bg-zinc-50'
                   }`}
                 >
                   <span className={`font-medium text-sm sm:text-base ${isSelected ? 'text-zinc-900' : 'text-zinc-600'}`}>
                     {option}
                   </span>
                   {isSelected && <div className="w-4 h-4 sm:w-5 sm:h-5 bg-zinc-900 rounded-full flex items-center justify-center"><Check size={10} className="sm:w-3 sm:h-3 text-white" /></div>}
                 </button>
               );
             })}
           </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center">
           <button
             onClick={() => {
               // Confirm quit and clear state
               if(window.confirm("Are you sure you want to quit? Progress will be lost.")) {
                 resetQuiz();
               }
             }}
             className="text-zinc-400 hover:text-zinc-600 text-sm font-medium px-3 sm:px-4"
           >
             Quit
           </button>
           <button
             onClick={handleNext}
             disabled={!answers[currentQIndex]}
             className="px-6 sm:px-8 py-3 bg-zinc-900 text-white font-bold rounded-xl hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-zinc-900/10 text-sm sm:text-base"
           >
             {currentQIndex === questions.length - 1 ? 'Finish Quiz' : 'Next Question'}
           </button>
        </div>
      </div>
    );
  }

  if (view === 'result') {
    const percentage = Math.round((score / questions.length) * 100);
    const passed = percentage >= 60;

    return (
      <div className="max-w-3xl mx-auto py-8 sm:py-12 px-4 sm:px-6 animate-fade-in">
        <div className="bg-white rounded-2xl sm:rounded-3xl border border-zinc-200 shadow-xl overflow-hidden mb-8 sm:mb-12">
           <div className={`p-8 sm:p-12 text-center text-white ${passed ? 'bg-zinc-900' : 'bg-zinc-700'}`}>
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6 backdrop-blur-sm">
                 <Trophy size={32} className="sm:w-10 sm:h-10" />
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold mb-2">{percentage}%</h1>
              <p className="text-zinc-300 text-base sm:text-lg mb-4 sm:mb-6">
                You answered {score} out of {questions.length} correctly.
              </p>

              <div className="inline-flex items-center gap-2 bg-white/10 px-3 sm:px-4 py-2 rounded-full text-sm font-medium backdrop-blur-md">
                 <span className="text-emerald-400">+{score * 10} XP</span> Earned
              </div>
           </div>

           <div className="p-6 sm:p-8 bg-zinc-50">
              <h3 className="font-bold text-zinc-900 mb-4 sm:mb-6 flex items-center gap-2 text-base sm:text-lg">
                 <AlertCircle size={18} className="sm:w-5 sm:h-5" /> Review Answers
              </h3>

              <div className="space-y-4 sm:space-y-6">
                 {questions.map((q, idx) => {
                   const userAnswer = answers[idx];
                   const isCorrect = userAnswer === q.correctAnswer;

                   return (
                     <div key={idx} className={`p-4 sm:p-6 rounded-xl border ${isCorrect ? 'bg-white border-zinc-200' : 'bg-red-50 border-red-100'}`}>
                        <div className="flex gap-3">
                           <div className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                             isCorrect ? 'bg-emerald-100 text-emerald-600' : 'bg-red-200 text-red-600'
                           }`}>
                              {isCorrect ? <Check size={12} className="sm:w-3.5 sm:h-3.5" /> : <X size={12} className="sm:w-3.5 sm:h-3.5" />}
                           </div>
                           <div className="flex-1">
                              <p className="font-bold text-zinc-900 mb-3 text-sm sm:text-base">{q.question}</p>
                              <div className="space-y-1 mb-3">
                                 <p className="text-xs text-zinc-500">
                                   Your Answer: <span className={isCorrect ? 'text-emerald-600 font-bold' : 'text-red-600 font-bold'}>{userAnswer}</span>
                                 </p>
                                 {!isCorrect && (
                                   <p className="text-xs text-zinc-500">
                                     Correct Answer: <span className="text-emerald-600 font-bold">{q.correctAnswer}</span>
                                   </p>
                                 )}
                              </div>
                              <div className="text-xs bg-black/5 p-3 rounded-lg text-zinc-600 leading-relaxed relative">
                                 <div className="flex justify-between items-start mb-1">
                                    <span className="font-bold">Explanation:</span>
                                    <TTSButton text={q.explanation} size={12} className="sm:w-3.5 sm:h-3.5 p-1 -mt-1 -mr-1" />
                                 </div>
                                 {q.explanation}
                              </div>
                           </div>
                        </div>
                     </div>
                   );
                 })}
              </div>
           </div>
        </div>

        <div className="text-center">
           <button
             onClick={resetQuiz}
             className="px-6 sm:px-8 py-3 bg-white border border-zinc-300 text-zinc-900 font-bold rounded-xl hover:bg-zinc-50 transition-colors inline-flex items-center gap-2 shadow-sm text-sm sm:text-base"
           >
             <RotateCcw size={16} className="sm:w-[18px] sm:h-[18px]" /> Practice Another Topic
           </button>
        </div>
      </div>
    );
  }

  return null;
};

export default Practice;