
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { CalendarDays, Plus, Sparkles, CheckCircle, Circle, Trash2, X, Clock, BookOpen, Lock, Trophy, Loader2, Lightbulb, Target, TrendingUp, Archive, ArchiveRestore } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { StudyEvent } from '../types';
import { aiTutorAPI, plannerAPI } from '../services/api';
import CustomSelect from '../components/CustomSelect';
import DatePicker from '../components/DatePicker';
import { SUBJECTS } from '../constants';
import { PlannerEventSkeleton, TaskItemSkeleton } from '../components/Skeletons';


const Planner: React.FC = () => {
  const { studyEvents, fetchStudyEvents, createStudyEvent, updateStudyEvent, deleteStudyEvent, loading } = useData();
  const { user, gainXP } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isDeletingEvent, setIsDeletingEvent] = useState<string | null>(null);
  const [isArchivingEvent, setIsArchivingEvent] = useState<string | null>(null);
  const [isCompletingEvent, setIsCompletingEvent] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed' | 'archived'>('all');
  const [mounted, setMounted] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number } | null>(null);
  const eventRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});
  
  // Function to handle event click and show tooltip
  const handleEventClick = (eventId: string, element: HTMLElement) => {
    // If clicking the same event, close the tooltip
    if (selectedEventId === eventId) {
      setSelectedEventId(null);
      setTooltipPosition(null);
      return;
    }
    
    const rect = element.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const scrollY = window.scrollY;
    
    // Responsive tooltip width - increased for better readability
    const tooltipWidth = viewportWidth < 640 ? Math.min(viewportWidth - 32, 360) : 400;
    // Use dynamic height based on viewport for better positioning calculations
    const tooltipHeight = Math.min(500, viewportHeight * 0.8); // Max 500px or 80% of viewport
    
    // Calculate available space
    const spaceOnRight = viewportWidth - rect.right;
    const spaceOnLeft = rect.left;
    const spaceBelow = viewportHeight - (rect.top - scrollY);
    const spaceAbove = rect.top - scrollY;
    
    // Position horizontally: prefer right, fallback to left
    let left: number;
    if (spaceOnRight >= tooltipWidth + 16) {
      left = rect.right + 12; // Right side
    } else if (spaceOnLeft >= tooltipWidth + 16) {
      left = rect.left - tooltipWidth - 12; // Left side
    } else {
      // Center if neither side has enough space (mobile)
      left = Math.max(16, (viewportWidth - tooltipWidth) / 2);
    }
    
    // Position vertically to ensure modal is always fully visible
    let top: number;

    if (viewportWidth < 640) {
      // Mobile: Always center the modal vertically
      top = scrollY + Math.max(16, (viewportHeight - 500) / 2);
    } else {
      // Desktop: Position near the clicked element but ensure full visibility
      const modalHeight = Math.min(500, viewportHeight * 0.8);
      const preferredTop = rect.bottom + scrollY + 8;

      // Check if modal fits below the element
      if (preferredTop + modalHeight <= scrollY + viewportHeight - 16) {
        top = preferredTop; // Position below
      } else {
        // Position above if it fits
        const aboveTop = rect.top + scrollY - modalHeight - 8;
        if (aboveTop >= scrollY + 16) {
          top = aboveTop; // Position above
        } else {
          // Center vertically as fallback
          top = scrollY + Math.max(16, (viewportHeight - modalHeight) / 2);
        }
      }
    }
    
    // Final adjustment to ensure modal stays within viewport bounds
    const modalHeight = Math.min(500, viewportHeight * 0.8);
    const maxTop = scrollY + viewportHeight - modalHeight - 16;
    const minTop = scrollY + 16;

    top = Math.max(minTop, Math.min(top, maxTop));

    // Set position and event ID
    setTooltipPosition({ top, left });
    setSelectedEventId(eventId);
  };
  
  // Close tooltip function
  const closeTooltip = () => {
    setSelectedEventId(null);
    setTooltipPosition(null);
  };

  // Track if we've fetched events to prevent duplicate calls
  const hasFetchedEventsRef = useRef(false);
  
  useEffect(() => {
    setMounted(true);
    // Fetch study events only once on mount
    if (!hasFetchedEventsRef.current) {
      hasFetchedEventsRef.current = true;
      fetchStudyEvents();
    }
  }, [fetchStudyEvents]);

  // Fetch events when archive filter changes
  useEffect(() => {
    if (!hasFetchedEventsRef.current) return; // Don't run on initial mount
    
    if (statusFilter === 'archived') {
      fetchStudyEvents({ archived: true });
    } else {
      fetchStudyEvents({ archived: false });
    }
  }, [statusFilter, fetchStudyEvents]);

  // Separate effect for click outside handler
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (selectedEventId && !target.closest('[data-tooltip-container]') && !target.closest('[data-event-card]')) {
        closeTooltip();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [selectedEventId]);

  // Handle viewport changes (mobile keyboard, rotation)
  useEffect(() => {
    const handleResize = () => {
      if (selectedEventId) {
        // Close modal on viewport changes to prevent layout issues
        closeTooltip();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [selectedEventId, closeTooltip]);

  // Manual Form State
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('Mathematics');
  const [date, setDate] = useState('');
  const [type, setType] = useState<'Revision' | 'Exam' | 'Assignment'>('Revision');

  // AI Form State
  const [aiPrompt, setAiPrompt] = useState('');

  // Derived State
  const sortedEvents = [...studyEvents]
    .filter(event => {
      if (statusFilter === 'pending') return !event.isCompleted && !event.isArchived;
      if (statusFilter === 'completed') return event.isCompleted && !event.isArchived;
      if (statusFilter === 'archived') return event.isArchived;
      return !event.isArchived; // 'all' shows non-archived events
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
  const upcomingEvents = studyEvents.filter(e => !e.isCompleted && !e.isArchived && new Date(e.date) >= new Date(new Date().setHours(0,0,0,0))).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const completedCount = studyEvents.filter(e => e.isCompleted && !e.isArchived).length;
  
  // Group events by date
  const groupedEvents: { [key: string]: StudyEvent[] } = {};
  sortedEvents.forEach(event => {
    if (!groupedEvents[event.date]) groupedEvents[event.date] = [];
    groupedEvents[event.date].push(event);
  });

  const handleTaskToggle = async (id: string, isCompleted: boolean) => {
    setIsCompletingEvent(id);
    try {
      await updateStudyEvent(id, { isCompleted: !isCompleted });
      if (!isCompleted) { // If marking as complete
        const { leveledUp, newLevel } = await gainXP(50);
        addToast("+50 XP Task Completed!", "success");
        if (leveledUp) {
          setTimeout(() => addToast(`Level Up! You are now Level ${newLevel}`, "info"), 500);
        }
      }
    } catch (error) {
      console.error('Failed to toggle task:', error);
      addToast("Failed to update task status", "error");
    } finally {
      setIsCompletingEvent(null);
    }
  };

  const handleArchiveToggle = async (id: string, isArchived: boolean) => {
    setIsArchivingEvent(id);
    try {
      await updateStudyEvent(id, { isArchived: !isArchived });
      addToast(isArchived ? "Event unarchived" : "Event archived", "success");
      // Refresh events to update the view based on current filter
      if (statusFilter === 'archived') {
        await fetchStudyEvents({ archived: true });
      } else {
        await fetchStudyEvents({ archived: false });
      }
    } catch (error) {
      console.error('Failed to archive/unarchive event:', error);
      addToast("Failed to update archive status", "error");
    } finally {
      setIsArchivingEvent(null);
    }
  };

  const handleAddManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !date) return;

    setIsAdding(true);
    try {
      await createStudyEvent({
        title,
        subject,
        date,
        type,
        isCompleted: false,
        isArchived: false,
        notes: ''
      });

      // Refresh the study events to ensure they're displayed
      await fetchStudyEvents();

      setIsManualModalOpen(false);
      resetManualForm();
      addToast("Study event added successfully!", "success");
    } catch (error) {
      console.error('Failed to add study event:', error);
      addToast("Failed to add study event", "error");
    } finally {
      setIsAdding(false);
    }
  };

  const handleSmartScheduleClick = () => {
    if (!user) {
      navigate('/login');
      return;
    }
    if (!user.isPremium) {
      navigate('/subscription', { state: { from: location.pathname } });
      return;
    }
    setIsAIModalOpen(true);
  };

  const handleGenerateAI = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiPrompt.trim()) return;

    setIsGenerating(true);
    try {
      const response = await aiTutorAPI.generateStudyPlan(aiPrompt);

      // The response already contains parsed JSON
      const plan = response.plan;

      // Create events from the plan
      for (const item of plan) {
        if (item.title && item.subject && item.date && item.type) {
          await createStudyEvent({
            title: item.title,
            subject: item.subject,
            date: item.date,
            type: item.type,
            isCompleted: false,
            isArchived: false,
            notes: item.notes || ''
          });
        }
      }

      // Refresh the study events to ensure they're displayed
      await fetchStudyEvents();

      addToast("Study plan generated successfully!", "success");
    } catch (error) {
      console.error('AI generation error:', error);
      addToast("Failed to generate study plan. Please try again.", "error");
    } finally {
      setIsGenerating(false);
      setIsAIModalOpen(false);
      setAiPrompt('');
    }
  };

  const resetManualForm = () => {
    setTitle('');
    setSubject('Mathematics');
    setDate('');
    setType('Revision');
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'Exam': return 'bg-red-100 text-red-700 border-red-200';
      case 'Assignment': return 'bg-amber-100 text-amber-700 border-amber-200';
      default: return 'bg-zinc-100 text-zinc-900 border-zinc-200';
    }
  };

  const subjectOptions = SUBJECTS.map(s => ({ label: s, value: s }));
  const typeOptions = [
    { label: 'Revision', value: 'Revision' },
    { label: 'Assignment', value: 'Assignment' },
    { label: 'Exam', value: 'Exam' }
  ];

  // Get study guide content - try to parse AI-generated content from notes, fallback to generated guide
  const getStudyGuide = (event: StudyEvent) => {
    // Try to parse AI-generated guide from notes (stored as JSON)
    try {
      if (event.notes && typeof event.notes === 'string') {
        // Check if notes is a JSON string
        const trimmedNotes = event.notes.trim();
        if (trimmedNotes.startsWith('{') && trimmedNotes.endsWith('}')) {
          const parsed = JSON.parse(trimmedNotes);
          // Validate that it has the required structure
          if (parsed && 
              Array.isArray(parsed.howToComplete) && parsed.howToComplete.length > 0 &&
              Array.isArray(parsed.guides) && parsed.guides.length > 0 &&
              typeof parsed.suggestions === 'string' &&
              Array.isArray(parsed.motivation) && parsed.motivation.length > 0) {
            return parsed; // Return AI-generated guide
          }
        }
      }
    } catch (e) {
      // Notes is not valid JSON, will use fallback
    }
    
    // Fallback to generated guide if AI content not available
    const daysUntil = Math.ceil((new Date(event.date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    const isUpcoming = daysUntil > 0;
    const isToday = daysUntil === 0;
    const isPast = daysUntil < 0;
    const eventTitle = event.title.toLowerCase();
    const subject = event.subject;

    // Generate specific "how to complete" steps based on event
    let howToCompleteSteps: string[] = [];
    
    if (event.type === 'Exam') {
      if (isUpcoming && daysUntil > 0) {
        const day1End = Math.max(1, Math.floor(daysUntil * 0.3));
        const day2Start = Math.max(2, day1End + 1);
        const day2End = Math.max(2, Math.floor(daysUntil * 0.7));
        const day3Start = Math.max(3, day2End + 1);
        
        howToCompleteSteps = [
          `Day 1-${day1End}: Review all ${subject} concepts. Focus on understanding fundamentals and key formulas.`,
          `Day ${day2Start}-${day2End}: Practice ${subject} problems. Work on past exam questions and identify weak areas.`,
          `Day ${day3Start}-${daysUntil - 1}: Intensive review. Focus on difficult topics and take timed practice tests.`,
          `Day ${daysUntil} (Exam Day): Final review. Go through key formulas (30 min), get good sleep, and stay confident.`
        ];
      } else if (isToday) {
        howToCompleteSteps = [
          `Do a quick 30-minute review of ${subject} formulas and main concepts this morning`,
          `Stay calm and trust what you've learned. Take deep breaths if you feel nervous`,
          `Read each question carefully during the exam. Watch your time and show your work clearly`,
          `After the exam, think about what went well and what you could improve next time`
        ];
      } else {
        howToCompleteSteps = [
          `Review your ${subject} exam performance and identify strengths`,
          `Note areas that need improvement for future ${subject} exams`,
          `Update your study plan based on what you learned from this ${subject} exam`
        ];
      }
    } else if (event.type === 'Assignment') {
      howToCompleteSteps = [
        `Step 1: Understand requirements. Read the ${subject} assignment brief carefully and note all deliverables and deadlines.`,
        `Step 2: Research and gather. Collect ${subject} materials, textbooks, credible online resources, and examples.`,
        `Step 3: Create outline. Organize your thoughts and structure your ${subject} assignment logically with main points.`,
        `Step 4: Write systematically. Work on each section of your ${subject} assignment one at a time.`,
        `Step 5: Review and refine. Check for errors, ensure all ${subject} requirements are met, and polish your work.`,
        `Step 6: Final check. Double-check formatting, citations, and submit your ${subject} assignment before deadline.`
      ];
    } else {
        howToCompleteSteps = [
          `Get your ${subject} notes and materials ready for this study session`,
          `Go through the ${eventTitle.includes('review') ? "topics you've covered before" : "new material"} and make sure you understand the main ideas`,
          `Test yourself on ${subject} without looking at your notes to see what you really remember`,
          `Try connecting what you're learning now to things you already know about ${subject}`,
          `Make quick summary notes or a simple mind map to help you remember key points`,
          `Do one final review to make sure everything sticks in your memory`
        ];
    }

    if (event.type === 'Exam') {
      return {
        howToComplete: howToCompleteSteps,
        guides: [
          `Go through all the main ${subject} concepts and formulas in an organized way`,
          `Try doing ${subject} practice questions with a timer to get used to the pace`,
          `Make short summary notes that you can quickly review later`,
          `Take full practice tests to see how you'll do under exam conditions`,
          `Spend extra time on topics you find hard, but don't forget to review what you're good at too`
        ],
        suggestions: isUpcoming 
          ? `You have ${daysUntil} day${daysUntil > 1 ? 's' : ''} to get ready for your ${subject} exam. Start with a good review of everything, then spend time practicing problems. Make sure to give each topic the time it needs.`
          : isToday
          ? `It's your ${subject} exam today! Do a quick 30-minute review of your notes, drink plenty of water, get enough sleep, and go in feeling confident. You've got this!`
          : `Think about how your ${subject} exam went. What did you do well? What would you change? Use this to do even better next time.`,
        motivation: [
          `You've been preparing for this ${subject} exam. Trust your preparation and stay calm!`,
          `Every study session you've done has built your ${subject} knowledge. You're ready!`,
          `Remember: exams test what you know, not who you are. Give your ${subject} exam your best effort!`
        ]
      };
    } else if (event.type === 'Assignment') {
      return {
        howToComplete: howToCompleteSteps,
        guides: [
          `Break your ${subject} assignment into smaller tasks you can do each day`,
          `Look up information from reliable sources to support your work`,
          `Plan out your assignment structure before you start writing`,
          `Work on one section at a time so you can focus and do your best`,
          `Go through your work to make sure it's clear and correct`,
          `Double-check that you've done everything the assignment asked for before you submit`
        ],
        suggestions: isUpcoming
          ? `You have ${daysUntil} day${daysUntil > 1 ? 's' : ''} to finish your ${subject} assignment. Start by making sure you understand what's needed and gathering your materials. Work on it a bit each day so you're not rushing at the end.`
          : isToday
          ? `Finish up your ${subject} assignment today! Check that you've met all the requirements, fix any mistakes, make sure the formatting looks good, and submit it feeling confident.`
          : `Nice work finishing your ${subject} assignment! Think about what you learned and how you can use it going forward.`,
        motivation: [
          `You're making progress on your ${subject} assignment. Keep going, one step at a time!`,
          `Quality ${subject} work takes time and effort. You're doing great - keep pushing forward!`,
          `Every section you complete brings you closer to finishing your ${subject} assignment. You've got this!`
        ]
      };
    } else {
      return {
        howToComplete: howToCompleteSteps,
        guides: [
          `Go through your ${subject} notes and materials in an organized way`,
          `Try to really understand the ${subject} ideas, not just memorize them`,
          `Test yourself on ${subject} topics without looking at your notes`,
          `See how new ${subject} ideas connect to things you already know`,
          `Make diagrams or mind maps to help visualize ${subject} concepts`,
          `Try explaining ${subject} concepts to someone else or just out loud to yourself`
        ],
        suggestions: isUpcoming
          ? `You have ${daysUntil} day${daysUntil > 1 ? 's' : ''} for this ${subject} study session. Use this time to build a solid understanding. Review your ${subject} materials regularly and make sure everything makes sense.`
          : isToday
          ? `Make today's ${subject} study session count! Set clear goals, find a quiet place to focus, and remember to take breaks when you need them.`
          : `Great job finishing this ${subject} study session! Keep up the good work with your next study plan.`,
        motivation: [
          `Every ${subject} revision session strengthens your understanding. You're building knowledge that lasts!`,
          `Consistent ${subject} study creates strong foundations. You're doing amazing work!`,
          `Small daily efforts in ${subject} lead to big achievements. Keep going, you're on the right track!`
        ]
      };
    }
  };

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900">Study Planner</h1>
            <p className="text-zinc-500 text-sm sm:text-base">Organize your schedule and ace your exams.</p>
          </div>
          <div className="flex gap-2 self-start sm:self-auto">
             <button
               onClick={handleSmartScheduleClick}
               className="px-3 sm:px-4 py-2 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:opacity-90 transition-all flex items-center gap-1.5 sm:gap-2 shadow-md group"
             >
               <Sparkles size={14} className="sm:w-4 sm:h-4" /> Smart Schedule
               {!user?.isPremium && <Lock size={12} className="sm:w-3.5 sm:h-3.5 ml-0.5 opacity-80 group-hover:scale-110 transition-transform" />}
             </button>
             <button
               onClick={() => setIsManualModalOpen(true)}
               className="px-3 sm:px-4 py-2 bg-white text-zinc-700 border border-zinc-200 text-sm font-medium rounded-lg hover:bg-zinc-50 transition-all flex items-center gap-1.5 sm:gap-2"
             >
               <Plus size={14} className="sm:w-4 sm:h-4" /> Add Task
             </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Col: Overview Cards */}
        <div className="lg:col-span-1 space-y-6">
           <div className="bg-white p-4 sm:p-6 rounded-xl border border-zinc-200 shadow-sm">
              <h3 className="font-bold text-zinc-900 mb-3 sm:mb-4 flex items-center gap-2">
                <Clock size={16} className="sm:w-[18px] sm:h-[18px] text-zinc-600" /> Up Next
              </h3>
              {loading.studyEvents ? (
                <div className="space-y-4">
                  <TaskItemSkeleton />
                  <TaskItemSkeleton />
                  <TaskItemSkeleton />
                </div>
              ) : upcomingEvents.length > 0 ? (
                <div className="space-y-4">
                  {upcomingEvents.slice(0, 3).map(event => {
                    const guide = getStudyGuide(event);
                    return (
                    <div 
                      key={event.id} 
                      data-event-card
                      ref={(el) => { if (el) eventRefs.current[event.id] = el; }}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEventClick(event.id, e.currentTarget);
                      }}
                      className={`p-3 bg-zinc-50 rounded-lg border transition-all cursor-pointer ${
                        selectedEventId === event.id 
                          ? 'border-zinc-900 shadow-md bg-zinc-100' 
                          : 'border-zinc-100 hover:border-zinc-200 hover:shadow-sm'
                      }`}
                    >
                       <div className="flex justify-between items-start mb-1">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider ${getTypeColor(event.type)}`}>
                             {event.type}
                          </span>
                          <span className="text-xs font-medium text-zinc-500">
                             {new Date(event.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                          </span>
                       </div>
                       <h4 className="font-semibold text-zinc-900 text-sm line-clamp-1">{event.title}</h4>
                       <p className="text-xs text-zinc-500">{event.subject}</p>
                       {(() => {
                         // Only show simple text notes, not JSON
                         if (!event.notes) return null;
                         try {
                           const trimmed = event.notes.trim();
                           if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                             return null; // It's JSON, don't display
                           }
                           return <p className="text-[10px] text-zinc-400 mt-0.5 line-clamp-1">{event.notes}</p>;
                         } catch {
                           return <p className="text-[10px] text-zinc-400 mt-0.5 line-clamp-1">{event.notes}</p>;
                         }
                       })()}
                    </div>
                  )})}
                </div>
              ) : (
                <div className="text-center py-8 text-zinc-400">
                  <p className="text-sm">No upcoming tasks.</p>
                </div>
              )}
           </div>

           <div className="bg-zinc-900 text-white p-4 sm:p-6 rounded-xl shadow-sm relative overflow-hidden">
              <div className="relative z-10">
                <h3 className="font-bold mb-1 text-sm sm:text-base">Progress Tracker</h3>
                <div className="flex items-end gap-2 mb-2">
                   <span className="text-3xl sm:text-4xl font-bold">{completedCount}</span>
                   <span className="text-zinc-400 text-xs sm:text-sm mb-1.5">tasks completed</span>
                </div>
                <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
                   <div
                     className="h-full bg-emerald-500 rounded-full transition-all duration-1000"
                     style={{ width: `${studyEvents.length > 0 ? (completedCount / studyEvents.length) * 100 : 0}%` }}
                   ></div>
                </div>
              </div>
              <div className="absolute top-0 right-0 p-4 sm:p-6 opacity-10">
                 <CheckCircle size={60} className="sm:w-20 sm:h-20" />
              </div>
           </div>
           
           <div className="bg-gradient-to-br from-amber-50 to-orange-50 p-4 sm:p-6 rounded-xl border border-amber-100 flex items-center gap-3 sm:gap-4">
               <div className="w-9 h-9 sm:w-10 sm:h-10 bg-white rounded-full flex items-center justify-center text-amber-500 shadow-sm border border-amber-100 flex-shrink-0">
                 <Trophy size={18} className="sm:w-5 sm:h-5" />
               </div>
               <div className="min-w-0">
                 <p className="text-xs font-bold text-amber-700 uppercase tracking-wide">XP Reward</p>
                 <p className="text-sm text-zinc-700">Complete tasks to earn <span className="font-bold">50 XP</span> each!</p>
               </div>
           </div>
        </div>

        {/* Right Col: Timeline */}
        <div className="lg:col-span-2 space-y-6">
           {/* Filters */}
           <div className="flex items-center gap-2 pb-2 overflow-x-auto hide-scrollbar">
             <button
               onClick={() => setStatusFilter('all')}
               className={`px-3 sm:px-4 py-2 sm:py-1.5 rounded-full text-xs sm:text-sm font-medium border transition-colors whitespace-nowrap ${
                 statusFilter === 'all'
                   ? 'bg-zinc-900 text-white border-zinc-900'
                   : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
               }`}
             >
               All Tasks
             </button>
             <button
               onClick={() => setStatusFilter('pending')}
               className={`px-3 sm:px-4 py-2 sm:py-1.5 rounded-full text-xs sm:text-sm font-medium border transition-colors whitespace-nowrap ${
                 statusFilter === 'pending'
                   ? 'bg-zinc-900 text-white border-zinc-900'
                   : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
               }`}
             >
               Pending
             </button>
             <button
               onClick={() => setStatusFilter('completed')}
               className={`px-3 sm:px-4 py-2 sm:py-1.5 rounded-full text-xs sm:text-sm font-medium border transition-colors whitespace-nowrap ${
                 statusFilter === 'completed'
                   ? 'bg-zinc-900 text-white border-zinc-900'
                   : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
               }`}
             >
               Completed
             </button>
             <button
               onClick={() => setStatusFilter('archived')}
               className={`px-3 sm:px-4 py-2 sm:py-1.5 rounded-full text-xs sm:text-sm font-medium border transition-colors whitespace-nowrap ${
                 statusFilter === 'archived'
                   ? 'bg-zinc-900 text-white border-zinc-900'
                   : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
               }`}
             >
               Archived
             </button>
           </div>

           {loading.studyEvents ? (
             <div className="space-y-6">
               {[1, 2, 3].map((i) => (
                 <div key={i} className="animate-pulse">
                   <div className="h-6 bg-zinc-200 rounded w-48 mb-3"></div>
                   <div className="space-y-3">
                     <PlannerEventSkeleton />
                     <PlannerEventSkeleton />
                     <PlannerEventSkeleton />
                   </div>
                 </div>
               ))}
             </div>
           ) : Object.keys(groupedEvents).length > 0 ? (
             Object.keys(groupedEvents).sort().map(dateKey => (
               <div key={dateKey} className="animate-slide-up">
                  <h3 className="text-sm font-bold text-zinc-500 uppercase tracking-wider mb-3 sticky top-0 bg-zinc-50/95 py-2 backdrop-blur-sm z-10 flex items-center justify-between">
                    {new Date(dateKey).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
                    <span className="text-[10px] bg-zinc-100 px-2 py-0.5 rounded-full text-zinc-400 font-medium">
                      {groupedEvents[dateKey].length} Tasks
                    </span>
                  </h3>
                  <div className="space-y-3">
                    {groupedEvents[dateKey].map(event => {
                      const guide = getStudyGuide(event);
                      return (
                      <div
                        key={event.id}
                        data-event-card
                        ref={(el) => { if (el) eventRefs.current[event.id] = el; }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEventClick(event.id, e.currentTarget);
                        }}
                        className={`group flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl border transition-all cursor-pointer ${
                          event.isCompleted
                            ? 'bg-zinc-50 border-zinc-100 opacity-60'
                            : selectedEventId === event.id
                            ? 'bg-white border-zinc-900 shadow-lg'
                            : 'bg-white border-zinc-200 shadow-sm hover:border-zinc-300 hover:shadow-md'
                        }`}
                      >
                         <button
                           onClick={(e) => {
                             e.stopPropagation();
                             handleTaskToggle(event.id, event.isCompleted);
                           }}
                           disabled={isCompletingEvent === event.id}
                           className={`flex-shrink-0 transition-colors p-1 ${
                             event.isCompleted
                               ? 'text-emerald-500'
                               : 'text-zinc-300 hover:text-emerald-500'
                           } disabled:opacity-50 disabled:cursor-not-allowed`}
                           title={event.isCompleted ? "Mark as pending" : "Complete task (+50 XP)"}
                         >
                           {isCompletingEvent === event.id ? (
                             <Loader2 size={20} className="sm:w-6 sm:h-6 animate-spin" />
                           ) : event.isCompleted ? (
                             <CheckCircle size={20} className="sm:w-6 sm:h-6 fill-current" />
                           ) : (
                             <Circle size={20} className="sm:w-6 sm:h-6" />
                           )}
                         </button>

                         <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                               <h4 className={`font-bold text-zinc-900 truncate text-sm sm:text-base ${event.isCompleted ? 'line-through text-zinc-500' : ''}`}>
                                 {event.title}
                               </h4>
                               {event.type === 'Exam' && (
                                 <span className="text-[9px] sm:text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-bold flex-shrink-0">EXAM</span>
                               )}
                               {event.type === 'Assignment' && (
                                 <span className="text-[9px] sm:text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold flex-shrink-0">ASSIGNMENT</span>
                               )}
                            </div>
                            <p className="text-xs text-zinc-500 flex items-center gap-2">
                               <span className="font-medium text-zinc-700">{event.subject}</span>
                               {(() => {
                                 // Only show simple text notes, not JSON
                                 if (!event.notes) return null;
                                 try {
                                   // Check if notes is JSON
                                   const trimmed = event.notes.trim();
                                   if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                                     // It's JSON, don't display it - tooltip will show it on hover
                                     return null;
                                   }
                                   // It's plain text, show it
                                   return <span className="hidden sm:inline">• {event.notes}</span>;
                                 } catch {
                                   // Not JSON, show it
                                   return <span className="hidden sm:inline">• {event.notes}</span>;
                                 }
                               })()}
                            </p>
                         </div>

                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {statusFilter === 'archived' ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleArchiveToggle(event.id, event.isArchived);
                              }}
                              disabled={isArchivingEvent === event.id}
                              className="p-1.5 sm:p-2 text-zinc-300 hover:text-emerald-500 hover:bg-emerald-50 rounded-lg transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                              title="Unarchive"
                            >
                              {isArchivingEvent === event.id ? (
                                <Loader2 size={16} className="sm:w-[18px] sm:h-[18px] animate-spin" />
                              ) : (
                                <ArchiveRestore size={16} className="sm:w-[18px] sm:h-[18px]" />
                              )}
                            </button>
                          ) : event.isCompleted ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleArchiveToggle(event.id, event.isArchived);
                              }}
                              disabled={isArchivingEvent === event.id}
                              className="p-1.5 sm:p-2 text-zinc-300 hover:text-amber-500 hover:bg-amber-50 rounded-lg transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                              title="Archive"
                            >
                              {isArchivingEvent === event.id ? (
                                <Loader2 size={16} className="sm:w-[18px] sm:h-[18px] animate-spin" />
                              ) : (
                                <Archive size={16} className="sm:w-[18px] sm:h-[18px]" />
                              )}
                            </button>
                          ) : null}
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              setIsDeletingEvent(event.id);
                              try {
                                await deleteStudyEvent(event.id);
                                addToast("Study event deleted", "success");
                              } catch (error) {
                                console.error('Failed to delete event:', error);
                                addToast("Failed to delete event", "error");
                              } finally {
                                setIsDeletingEvent(null);
                              }
                            }}
                            disabled={isDeletingEvent === event.id}
                            className="p-1.5 sm:p-2 text-zinc-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                          >
                            {isDeletingEvent === event.id ? (
                              <Loader2 size={16} className="sm:w-[18px] sm:h-[18px] animate-spin" />
                            ) : (
                              <Trash2 size={16} className="sm:w-[18px] sm:h-[18px]" />
                            )}
                          </button>
                        </div>
                      </div>
                    )})}
                  </div>
               </div>
             ))
           ) : (
             <div className="flex flex-col items-center justify-center py-12 sm:py-20 bg-white border border-dashed border-zinc-200 rounded-xl text-center px-4">
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-zinc-50 rounded-full flex items-center justify-center mb-3 sm:mb-4">
                   <CalendarDays size={24} className="sm:w-8 sm:h-8 text-zinc-300" />
                </div>
                <h3 className="font-bold text-zinc-900 text-sm sm:text-base">Your schedule is empty</h3>
                <p className="text-zinc-500 text-xs sm:text-sm max-w-xs mx-auto mt-2 px-2">
                  {statusFilter === 'all'
                    ? 'Add tasks manually or use our AI to generate a personalized study plan.'
                    : `No ${statusFilter} tasks found.`}
                </p>
                {statusFilter === 'all' && (
                  <button
                    onClick={handleSmartScheduleClick}
                    className="mt-4 sm:mt-6 text-xs sm:text-sm font-medium text-zinc-900 hover:text-black hover:underline flex items-center justify-center gap-1 mx-auto"
                  >
                    {!user?.isPremium && <Lock size={10} className="sm:w-3 sm:h-3" />} Generate Plan with AI
                  </button>
                )}
             </div>
           )}
        </div>
      </div>

      {/* Manual Add Modal */}
      {isManualModalOpen && mounted && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-zinc-900/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md relative animate-slide-up">
            <div className="p-4 border-b border-zinc-100 flex justify-between items-center bg-zinc-50 rounded-t-xl">
               <h3 className="font-bold text-zinc-900 text-sm sm:text-base">Add Study Task</h3>
               <button onClick={() => setIsManualModalOpen(false)} className="p-1 text-zinc-400 hover:text-zinc-900 rounded hover:bg-zinc-200">
                 <X size={18} className="sm:w-5 sm:h-5" />
               </button>
            </div>
            <form onSubmit={handleAddManual} className="p-4 sm:p-6 space-y-4">
               <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Task Title</label>
                  <input 
                    type="text" 
                    required
                    placeholder="e.g. Algebra Chapter 1 Review"
                    className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-500"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
               </div>
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Subject</label>
                    <CustomSelect 
                      options={subjectOptions}
                      value={subject}
                      onChange={setSubject}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Type</label>
                    <CustomSelect
                      options={typeOptions}
                      value={type}
                      onChange={(value) => setType(value as 'Revision' | 'Exam' | 'Assignment')}
                    />
                  </div>
               </div>
               <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Date</label>
                  <DatePicker 
                    value={date}
                    onChange={setDate}
                    required
                    placeholder="Select Date"
                  />
               </div>
               <button
                 type="submit"
                 disabled={isAdding}
                 className="w-full py-3 sm:py-2.5 bg-zinc-900 text-white font-medium rounded-lg hover:bg-zinc-800 transition-colors mt-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
               >
                 {isAdding ? (
                   <>
                     <Loader2 size={16} className="animate-spin" />
                     Adding...
                   </>
                 ) : (
                   'Add to Schedule'
                 )}
               </button>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* AI Generate Modal */}
      {isAIModalOpen && mounted && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-zinc-900/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg relative animate-slide-up">
            <div className="p-4 border-b border-zinc-100 flex justify-between items-center bg-zinc-50 rounded-t-xl">
               <h3 className="font-bold text-zinc-900 flex items-center gap-2 text-sm sm:text-base">
                 <Sparkles size={16} className="sm:w-[18px] sm:h-[18px] text-zinc-600" /> Smart Schedule
               </h3>
               <button onClick={() => setIsAIModalOpen(false)} className="p-1 text-zinc-400 hover:text-zinc-900 rounded hover:bg-zinc-200">
                 <X size={18} className="sm:w-5 sm:h-5" />
               </button>
            </div>
            <div className="p-4 sm:p-6 space-y-4">
               <div className="bg-zinc-50 border border-zinc-200 p-4 rounded-lg flex gap-3">
                  <BookOpen className="text-zinc-600 flex-shrink-0 mt-0.5" size={18} />
                  <p className="text-xs text-zinc-800 leading-relaxed">
                    Tell us what exams or assignments you have coming up. Our AI will generate a balanced study plan for you, distributing revision sessions logically before your deadlines.
                  </p>
               </div>
               
               <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Your Goal / Deadlines</label>
                  <textarea 
                    rows={4}
                    placeholder="e.g. I have a Math exam on Quadratic Equations next Friday, and a Physics test on Newton's Laws next Monday. I want to study 2 hours a day."
                    className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500/20 focus:border-zinc-500 resize-none"
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                  />
               </div>

               <button
                 onClick={handleGenerateAI}
                 disabled={isGenerating || !aiPrompt.trim()}
                 className="w-full py-3.5 sm:py-3 bg-zinc-900 text-white font-medium rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
               >
                 {isGenerating ? (
                   <>
                     <Loader2 size={16} className="animate-spin" />
                     Generating...
                   </>
                 ) : (
                   <>
                     <Sparkles size={16} /> Generate Schedule
                   </>
                 )}
               </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Study Guide Tooltip - Shows on click */}
      {selectedEventId && tooltipPosition && (() => {
        const event = studyEvents.find(e => e.id === selectedEventId);
        if (!event) return null;
        
        const guide = getStudyGuide(event);
        
        // Show tooltip for all events (fallback guide is always generated)
        if (!guide || !guide.howToComplete || !guide.guides || !guide.suggestions) {
          return null; // Safety check - should rarely happen
        }
        
        const randomMotivation = guide.motivation && Array.isArray(guide.motivation) && guide.motivation.length > 0
          ? guide.motivation[Math.floor(Math.random() * guide.motivation.length)]
          : "Keep up the great work!";
        
        // Responsive tooltip width - increased for better readability
        const viewportWidth = window.innerWidth;
        const tooltipWidth = viewportWidth < 640 ? Math.min(viewportWidth - 32, 360) : 400;
        
        return createPortal(
          <>
            {/* Mobile backdrop */}
            {viewportWidth < 640 && (
              <div
                className="fixed inset-0 bg-black/60 z-[9998]"
                onClick={closeTooltip}
              />
            )}
            <div
              data-tooltip-container
              className={`fixed z-[9999] ${
                viewportWidth < 640
                  ? 'inset-4 flex items-center justify-center'
                  : 'inset-auto'
              }`}
              style={viewportWidth < 640 ? {} : {
                top: `${tooltipPosition.top}px`,
                left: `${tooltipPosition.left}px`,
                width: `${tooltipWidth}px`,
                maxWidth: 'calc(100vw - 32px)',
                pointerEvents: 'auto'
              }}
              onClick={(e) => e.stopPropagation()}
            >
            <div
              className={`bg-white rounded-xl shadow-2xl border border-zinc-200 overflow-y-auto custom-scrollbar pointer-events-auto ${
                viewportWidth < 640 ? 'w-full max-h-[85vh]' : ''
              }`}
              style={{
                animation: 'fadeIn 0.2s ease-out forwards',
                opacity: 1,
                maxHeight: viewportWidth < 640 ? '85vh' : '80vh'
              }}>
              
              {/* Header with brand colors and close button */}
              <div className="p-4 sm:p-3 sm:p-4 rounded-t-xl bg-zinc-900 border-b border-zinc-800 relative">
                <button
                  onClick={closeTooltip}
                  className="absolute top-4 right-4 sm:top-3 sm:right-3 sm:top-4 sm:right-4 p-2 sm:p-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white transition-colors touch-manipulation"
                  aria-label="Close tooltip"
                >
                  <X size={18} className="sm:w-4" />
                </button>
                <div className="flex items-start gap-3 pr-12">
                  <div className="p-2.5 sm:p-2 sm:p-2.5 rounded-lg bg-white text-zinc-900 shadow-sm flex-shrink-0">
                    {event.type === 'Exam' ? <Target size={20} className="sm:w-5 sm:h-5" /> :
                     event.type === 'Assignment' ? <BookOpen size={20} className="sm:w-5 sm:h-5" /> :
                     <TrendingUp size={20} className="sm:w-5 sm:h-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-bold text-white text-base sm:text-sm sm:text-base mb-1 leading-tight">{event.title}</h4>
                    <p className="text-sm font-medium text-zinc-400">{event.subject}</p>
                    <span className="inline-block mt-2 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-zinc-800 text-zinc-200">
                      {event.type}
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-4 sm:p-3 sm:p-4 space-y-4 sm:space-y-3 sm:space-y-4">
                {/* How to Complete This Plan */}
                <div>
                  <div className="flex items-center gap-3 mb-3 sm:mb-2 sm:mb-3">
                    <div className="p-2 bg-zinc-100 rounded-lg">
                      <Target size={14} className="sm:w-3.5 sm:h-3.5 text-zinc-900" />
                    </div>
                    <h5 className="text-xs sm:text-[10px] sm:text-xs font-bold text-zinc-900 uppercase tracking-wider">How to Complete This Plan</h5>
                  </div>
                  <div className="space-y-3 sm:space-y-2 sm:space-y-2.5">
                    {guide.howToComplete && Array.isArray(guide.howToComplete) && guide.howToComplete.map((step: string, idx: number) => (
                      <div key={idx} className="flex items-start gap-3 sm:gap-2 sm:gap-3 p-3 sm:p-2.5 sm:p-3 bg-zinc-50 rounded-lg border border-zinc-200 hover:border-zinc-300 transition-colors touch-manipulation">
                        <div className="flex-shrink-0 w-6 h-6 sm:w-5 sm:h-5 sm:w-6 sm:h-6 rounded-full bg-zinc-900 text-white text-xs sm:text-[10px] sm:text-[11px] font-bold flex items-center justify-center mt-0.5 shadow-sm">
                          {idx + 1}
                        </div>
                        <p className="text-sm sm:text-[11px] sm:text-xs text-zinc-700 leading-relaxed flex-1 font-medium">{step}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Quick Tips / Guides */}
                <div>
                  <div className="flex items-center gap-3 mb-3 sm:mb-2 sm:mb-3">
                    <div className="p-2 bg-zinc-100 rounded-lg">
                      <Lightbulb size={14} className="sm:w-3.5 sm:h-3.5 text-zinc-900" />
                    </div>
                    <h5 className="text-xs sm:text-[10px] sm:text-xs font-bold text-zinc-900 uppercase tracking-wider">Quick Tips</h5>
                  </div>
                  <div className="space-y-2 sm:space-y-1.5 sm:space-y-2">
                    {guide.guides && Array.isArray(guide.guides) && guide.guides.map((item: string, idx: number) => (
                      <div key={idx} className="flex items-start gap-3 sm:gap-2 sm:gap-2.5 p-3 sm:p-2 sm:p-2.5 bg-zinc-50 rounded-lg border border-zinc-200">
                        <div className="flex-shrink-0 w-2 h-2 rounded-full bg-zinc-900 mt-2"></div>
                        <p className="text-sm sm:text-[11px] sm:text-xs text-zinc-700 leading-relaxed flex-1">{item}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Suggestion */}
                {guide.suggestions && (
                  <div className="p-4 sm:p-3 sm:p-3.5 bg-zinc-50 rounded-lg border border-zinc-200 shadow-sm">
                    <div className="flex items-start gap-3">
                      <span className="text-lg sm:text-sm sm:text-base flex-shrink-0">💡</span>
                      <div>
                        <p className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2 sm:mb-1 sm:mb-1.5">Suggestion</p>
                        <p className="text-sm sm:text-[11px] sm:text-xs text-zinc-700 leading-relaxed font-medium">{guide.suggestions}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Motivation */}
                {randomMotivation && (
                  <div className="pt-3 sm:pt-2 sm:pt-3 border-t border-zinc-200">
                    <div className="flex items-start gap-3 sm:gap-2 sm:gap-2.5 p-3 sm:p-2.5 sm:p-2.5 bg-zinc-900 rounded-lg">
                      <span className="text-lg sm:text-sm sm:text-base flex-shrink-0">✨</span>
                      <p className="text-sm sm:text-[11px] sm:text-xs text-white italic leading-relaxed flex-1 font-medium">{randomMotivation}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
          </>,
          document.body
        );
      })()}

    </div>
  );
};

export default Planner;
