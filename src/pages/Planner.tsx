
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { CalendarDays, Plus, Sparkles, CheckCircle, Circle, Trash2, X, Clock, BookOpen, Lock, Trophy } from 'lucide-react';
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
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Fetch study events on mount
    fetchStudyEvents();
    return () => setMounted(false);
  }, [fetchStudyEvents]);

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
      if (statusFilter === 'pending') return !event.isCompleted;
      if (statusFilter === 'completed') return event.isCompleted;
      return true;
    })
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
  const upcomingEvents = studyEvents.filter(e => !e.isCompleted && new Date(e.date) >= new Date(new Date().setHours(0,0,0,0))).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const completedCount = studyEvents.filter(e => e.isCompleted).length;
  
  // Group events by date
  const groupedEvents: { [key: string]: StudyEvent[] } = {};
  sortedEvents.forEach(event => {
    if (!groupedEvents[event.date]) groupedEvents[event.date] = [];
    groupedEvents[event.date].push(event);
  });

  const handleTaskToggle = async (id: string, isCompleted: boolean) => {
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
    }
  };

  const handleAddManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !date) return;

    try {
      await createStudyEvent({
        title,
        subject,
        date,
        type,
        isCompleted: false,
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

  return (
    <div className="space-y-8 animate-fade-in pb-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Study Planner</h1>
          <p className="text-zinc-500">Organize your schedule and ace your exams.</p>
        </div>
        <div className="flex gap-2">
           <button 
             onClick={handleSmartScheduleClick}
             className="px-4 py-2 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:opacity-90 transition-all flex items-center gap-2 shadow-md group"
           >
             <Sparkles size={16} /> Smart Schedule
             {!user?.isPremium && <Lock size={14} className="ml-0.5 opacity-80 group-hover:scale-110 transition-transform" />}
           </button>
           <button 
             onClick={() => setIsManualModalOpen(true)}
             className="px-4 py-2 bg-white text-zinc-700 border border-zinc-200 text-sm font-medium rounded-lg hover:bg-zinc-50 transition-all flex items-center gap-2"
           >
             <Plus size={16} /> Add Task
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Col: Overview Cards */}
        <div className="lg:col-span-1 space-y-6">
           <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm">
              <h3 className="font-bold text-zinc-900 mb-4 flex items-center gap-2">
                <Clock size={18} className="text-zinc-600" /> Up Next
              </h3>
              {loading.studyEvents ? (
                <div className="space-y-4">
                  <TaskItemSkeleton />
                  <TaskItemSkeleton />
                  <TaskItemSkeleton />
                </div>
              ) : upcomingEvents.length > 0 ? (
                <div className="space-y-4">
                  {upcomingEvents.slice(0, 3).map(event => (
                    <div key={event.id} className="p-3 bg-zinc-50 rounded-lg border border-zinc-100">
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
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-zinc-400">
                  <p className="text-sm">No upcoming tasks.</p>
                </div>
              )}
           </div>

           <div className="bg-zinc-900 text-white p-6 rounded-xl shadow-sm relative overflow-hidden">
              <div className="relative z-10">
                <h3 className="font-bold mb-1">Progress Tracker</h3>
                <div className="flex items-end gap-2 mb-2">
                   <span className="text-4xl font-bold">{completedCount}</span>
                   <span className="text-zinc-400 text-sm mb-1.5">tasks completed</span>
                </div>
                <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
                   <div 
                     className="h-full bg-emerald-500 rounded-full transition-all duration-1000"
                     style={{ width: `${studyEvents.length > 0 ? (completedCount / studyEvents.length) * 100 : 0}%` }}
                   ></div>
                </div>
              </div>
              <div className="absolute top-0 right-0 p-6 opacity-10">
                 <CheckCircle size={80} />
              </div>
           </div>
           
           <div className="bg-gradient-to-br from-amber-50 to-orange-50 p-6 rounded-xl border border-amber-100 flex items-center gap-4">
               <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-amber-500 shadow-sm border border-amber-100">
                 <Trophy size={20} />
               </div>
               <div>
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
               className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                 statusFilter === 'all' 
                   ? 'bg-zinc-900 text-white border-zinc-900' 
                   : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
               }`}
             >
               All Tasks
             </button>
             <button 
               onClick={() => setStatusFilter('pending')}
               className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                 statusFilter === 'pending' 
                   ? 'bg-zinc-900 text-white border-zinc-900' 
                   : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
               }`}
             >
               Pending
             </button>
             <button 
               onClick={() => setStatusFilter('completed')}
               className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                 statusFilter === 'completed' 
                   ? 'bg-zinc-900 text-white border-zinc-900' 
                   : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
               }`}
             >
               Completed
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
                    {groupedEvents[dateKey].map(event => (
                      <div 
                        key={event.id} 
                        className={`group flex items-center gap-4 p-4 rounded-xl border transition-all ${
                          event.isCompleted 
                            ? 'bg-zinc-50 border-zinc-100 opacity-60' 
                            : 'bg-white border-zinc-200 shadow-sm hover:border-zinc-300'
                        }`}
                      >
                         <button 
                           onClick={() => handleTaskToggle(event.id, event.isCompleted)}
                           className={`flex-shrink-0 transition-colors ${event.isCompleted ? 'text-emerald-500' : 'text-zinc-300 hover:text-emerald-500'}`}
                           title={event.isCompleted ? "Mark as pending" : "Complete task (+50 XP)"}
                         >
                           {event.isCompleted ? <CheckCircle size={24} className="fill-current" /> : <Circle size={24} />}
                         </button>

                         <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                               <h4 className={`font-bold text-zinc-900 truncate ${event.isCompleted ? 'line-through text-zinc-500' : ''}`}>
                                 {event.title}
                               </h4>
                               {event.type === 'Exam' && (
                                 <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-bold">EXAM</span>
                               )}
                            </div>
                            <p className="text-xs text-zinc-500 flex items-center gap-2">
                               <span className="font-medium text-zinc-700">{event.subject}</span>
                               {event.notes && <span className="hidden sm:inline">• {event.notes}</span>}
                            </p>
                         </div>

                        <button
                          onClick={async () => {
                            try {
                              await deleteStudyEvent(event.id);
                              addToast("Study event deleted", "success");
                            } catch (error) {
                              console.error('Failed to delete event:', error);
                              addToast("Failed to delete event", "error");
                            }
                          }}
                          className="p-2 text-zinc-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    ))}
                  </div>
               </div>
             ))
           ) : (
             <div className="flex flex-col items-center justify-center py-20 bg-white border border-dashed border-zinc-200 rounded-xl text-center">
                <div className="w-16 h-16 bg-zinc-50 rounded-full flex items-center justify-center mb-4">
                   <CalendarDays size={32} className="text-zinc-300" />
                </div>
                <h3 className="font-bold text-zinc-900">Your schedule is empty</h3>
                <p className="text-zinc-500 text-sm max-w-xs mx-auto mt-2">
                  {statusFilter === 'all' 
                    ? 'Add tasks manually or use our AI to generate a personalized study plan.' 
                    : `No ${statusFilter} tasks found.`}
                </p>
                {statusFilter === 'all' && (
                  <button 
                    onClick={handleSmartScheduleClick}
                    className="mt-6 text-sm font-medium text-zinc-900 hover:text-black hover:underline flex items-center justify-center gap-1 mx-auto"
                  >
                    {!user?.isPremium && <Lock size={12} />} Generate Plan with AI
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
               <h3 className="font-bold text-zinc-900">Add Study Task</h3>
               <button onClick={() => setIsManualModalOpen(false)} className="p-1 text-zinc-400 hover:text-zinc-900 rounded hover:bg-zinc-200">
                 <X size={20} />
               </button>
            </div>
            <form onSubmit={handleAddManual} className="p-6 space-y-4">
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
               <div className="grid grid-cols-2 gap-4">
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
                 className="w-full py-2.5 bg-zinc-900 text-white font-medium rounded-lg hover:bg-zinc-800 transition-colors mt-2"
               >
                 Add to Schedule
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
               <h3 className="font-bold text-zinc-900 flex items-center gap-2">
                 <Sparkles size={18} className="text-zinc-600" /> Smart Schedule
               </h3>
               <button onClick={() => setIsAIModalOpen(false)} className="p-1 text-zinc-400 hover:text-zinc-900 rounded hover:bg-zinc-200">
                 <X size={20} />
               </button>
            </div>
            <div className="p-6 space-y-4">
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
                 className="w-full py-3 bg-zinc-900 text-white font-medium rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
               >
                 {isGenerating ? (
                   <>Generating Plan...</>
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

    </div>
  );
};

export default Planner;
