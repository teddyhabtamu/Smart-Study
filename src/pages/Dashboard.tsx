import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  Book, Clock, TrendingUp, PlayCircle, Bookmark, Sparkles, 
  Target, Calendar, ArrowRight, Flame, Trophy, CheckCircle2, 
  Circle, ChevronRight, Search, Star
} from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useLocation } from 'react-router-dom';
import { StudyEvent } from '../types';
import { BookmarkCardSkeleton, TaskItemSkeleton } from '../components/Skeletons';

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const { dashboardData, fetchDashboard, loading, errors } = useData();

  // Use dashboard user data if available, otherwise fall back to auth user
  const displayUser = dashboardData?.user || user;
  const navigate = useNavigate();
  const location = useLocation();
  const [greeting, setGreeting] = useState('');
  const [quickQuestion, setQuickQuestion] = useState('');

  // Fetch dashboard data on mount and when user changes
  useEffect(() => {
    if (user) {
      fetchDashboard();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);


  // Set greeting based on time
  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good morning');
    else if (hour < 18) setGreeting('Good afternoon');
    else setGreeting('Good evening');
  }, []);

  if (!user) return null;

  // Use dashboard data if available, otherwise fall back to user data
  const todaysTasks = dashboardData?.todaysEvents || [];
  const completedToday = dashboardData?.progress.todayCompleted || 0;
  const totalToday = dashboardData?.progress.todayTotal || 0;
  const progressPercentage = dashboardData?.progress.todayPercentage || 0;
  const recentSaved = dashboardData?.recentBookmarks.slice(0, 3) || [];
  const progressToNextLevel = dashboardData?.progress.levelProgress || Math.min(100, Math.round(((user.xp - (user.level - 1) * 1000) / 1000) * 100));
  const xpToNextLevel = dashboardData?.progress.xpToNextLevel || (user.level * 1000 - user.xp);

  const handleQuickAsk = (e: React.FormEvent) => {
    e.preventDefault();
    if (quickQuestion.trim()) {
      navigate('/ai-tutor', { state: { initialPrompt: quickQuestion } });
    }
  };

  return (
    <div className="space-y-8 animate-fade-in pb-12 max-w-7xl mx-auto">
      
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
         <div>
           <h1 className="text-3xl font-bold tracking-tight text-zinc-900 mb-1">
             {greeting}, {displayUser?.name?.split(' ')[0] || 'Student'}!
           </h1>
           <p className="text-zinc-500">
             Ready to make some progress? You have <span className="font-semibold text-zinc-900">{totalToday - completedToday} tasks</span> remaining today.
           </p>
         </div>
         <div className="flex items-center gap-3 bg-white p-2 rounded-xl border border-zinc-200 shadow-sm">
            <div className="px-3 py-1.5 bg-zinc-100 text-zinc-700 rounded-lg flex items-center gap-2 font-bold text-sm" title="Daily Streak">
                <Flame size={16} className={`fill-current ${(displayUser?.streak || 0) > 0 ? 'text-orange-500' : 'text-zinc-400'}`} /> {displayUser?.streak || 0} Day Streak
            </div>
            <div className="px-3 py-1.5 bg-zinc-900 text-white rounded-lg flex items-center gap-2 font-bold text-sm" title="Total XP">
                <Trophy size={16} className="fill-current" /> {displayUser?.xp || 0} XP
            </div>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* LEFT COLUMN (Main Content) */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Hero / Quick AI */}
          <div className="bg-zinc-900 rounded-2xl p-8 text-white relative overflow-hidden shadow-xl shadow-zinc-900/10">
             <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-zinc-800/50 rounded-full blur-3xl -mr-20 -mt-20"></div>
             <div className="absolute bottom-0 left-0 w-[200px] h-[200px] bg-zinc-700/30 rounded-full blur-3xl -ml-10 -mb-10"></div>
             
             <div className="relative z-10">
                <div className="flex items-center gap-2 text-zinc-300 font-medium text-xs uppercase tracking-wider mb-4">
                  <Sparkles size={14} /> AI Learning Assistant
                </div>
                <h2 className="text-2xl font-bold mb-6">Stuck on a concept? Ask me anything.</h2>
                
                <form onSubmit={handleQuickAsk} className="relative max-w-lg">
                  <input 
                    type="text" 
                    placeholder="e.g. Explain photosynthesis briefly..." 
                    className="w-full pl-5 pr-12 py-4 rounded-xl bg-white/10 border border-white/20 backdrop-blur-md text-white placeholder-zinc-400 focus:outline-none focus:bg-white/20 focus:border-white/30 transition-all"
                    value={quickQuestion}
                    onChange={(e) => setQuickQuestion(e.target.value)}
                  />
                  <button 
                    type="submit"
                    disabled={!quickQuestion.trim()}
                    className="absolute right-2 top-2 p-2 bg-white text-zinc-900 rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ArrowRight size={18} />
                  </button>
                </form>
             </div>
          </div>

          {/* XP Progress Section */}
          <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm flex items-center gap-6">
             <div className="relative flex-shrink-0">
               <div className="w-16 h-16 rounded-full bg-zinc-100 flex items-center justify-center border-4 border-zinc-50">
                   <span className="text-xl font-black text-zinc-900">{displayUser?.level || 1}</span>
               </div>
               <div className="absolute -bottom-2 -right-2 bg-emerald-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border-2 border-white">
                  LEVEL
               </div>
             </div>
             
             <div className="flex-1">
                <div className="flex justify-between items-end mb-2">
                   <div>
                      <h3 className="font-bold text-zinc-900">Level Progress</h3>
                       <p className="text-xs text-zinc-500">{xpToNextLevel} XP to Level {(displayUser?.level || 1) + 1}</p>
                   </div>
                   <span className="font-bold text-zinc-900 text-sm">{progressToNextLevel}%</span>
                </div>
                <div className="w-full h-3 bg-zinc-100 rounded-full overflow-hidden">
                   <div 
                     className="h-full bg-gradient-to-r from-zinc-900 to-zinc-700 rounded-full transition-all duration-1000"
                     style={{ width: `${progressToNextLevel}%` }}
                   ></div>
                </div>
             </div>
          </div>

          {/* Continue Learning (Saved Items) */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-zinc-900 flex items-center gap-2">
                <PlayCircle size={20} className="text-zinc-900" /> Continue Learning
              </h3>
              <Link to="/library" className="text-xs font-medium text-zinc-500 hover:text-zinc-900 flex items-center gap-1">
                View Library <ChevronRight size={14} />
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               {loading.dashboard ? (
                 <>
                   <BookmarkCardSkeleton />
                   <BookmarkCardSkeleton />
                   <BookmarkCardSkeleton />
                 </>
               ) : recentSaved.length > 0 ? (
                 recentSaved.map((item) => (
                   <Link 
                     key={item.id} 
                     to={item.type === 'video' ? `/video/${item.id}` : `/document/${item.id}`}
                     className="group bg-white p-4 rounded-xl border border-zinc-200 hover:border-zinc-400 hover:shadow-md transition-all flex gap-4 items-center"
                   >
                     <div className="w-16 h-16 rounded-lg bg-zinc-100 flex-shrink-0 overflow-hidden relative">
                        {item.type === 'video' ? (
                          <img src={(item as any).thumbnail} alt="" className="w-full h-full object-cover opacity-90 group-hover:scale-110 transition-transform" />
                        ) : (
                          <img src={(item as any).previewImage} alt="" className="w-full h-full object-cover opacity-90 group-hover:scale-110 transition-transform" />
                        )}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/10">
                           {item.type === 'video' ? <PlayCircle size={24} className="text-white drop-shadow-md" /> : <Book size={24} className="text-white drop-shadow-md" />}
                        </div>
                     </div>
                     <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-zinc-900 truncate text-sm mb-1 group-hover:text-zinc-700 transition-colors">{item.title}</h4>
                        <div className="flex items-center gap-2 text-xs text-zinc-500">
                           <span className="bg-zinc-100 px-1.5 py-0.5 rounded">{item.subject}</span>
                           <span>Grade {item.grade}</span>
                        </div>
                     </div>
                   </Link>
                 ))
               ) : (
                 <div className="col-span-2 py-12 bg-zinc-50 border border-dashed border-zinc-200 rounded-xl flex flex-col items-center justify-center text-center">
                    <Bookmark size={32} className="text-zinc-300 mb-3" />
                    <p className="text-sm font-medium text-zinc-900">No saved items yet</p>
                    <p className="text-xs text-zinc-500 mb-4">Bookmark videos or documents to access them quickly here.</p>
                    <Link to="/library" className="text-xs bg-zinc-900 text-white px-4 py-2 rounded-lg hover:bg-zinc-800 transition-colors">
                      Explore Content
                    </Link>
                 </div>
               )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN (Sidebar) */}
        <div className="space-y-8">
           
           {/* Daily Progress Card */}
           <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                 <h3 className="font-bold text-zinc-900 flex items-center gap-2">
                    <Target size={20} className="text-zinc-900" /> Daily Goal
                 </h3>
                 <span className="text-xs text-zinc-500 font-medium">{Math.round(progressPercentage)}%</span>
              </div>
              
              <div className="relative pt-2 pb-6 flex justify-center">
                 {/* CSS Radial Progress Mockup */}
                 <div className="w-32 h-32 rounded-full border-8 border-zinc-100 flex items-center justify-center relative">
                    <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 100 100">
                       <circle 
                         cx="50" cy="50" r="46" 
                         fill="none" stroke="currentColor" strokeWidth="8" 
                         className="text-zinc-900 transition-all duration-1000 ease-out"
                         strokeDasharray="289"
                         strokeDashoffset={289 - (289 * progressPercentage) / 100}
                         strokeLinecap="round"
                       />
                    </svg>
                    <div className="text-center">
                       <span className="text-3xl font-bold text-zinc-900">{completedToday}</span>
                       <span className="text-xs text-zinc-400 block uppercase">of {totalToday} tasks</span>
                    </div>
                 </div>
              </div>

              <div className="space-y-3">
                 <Link to="/planner" className="block w-full py-2.5 bg-zinc-900 text-white text-center text-sm font-medium rounded-xl hover:bg-zinc-800 transition-colors">
                    View Planner
                 </Link>
              </div>
           </div>

           {/* Today's Schedule */}
           <div className="bg-white rounded-2xl border border-zinc-200 p-6 shadow-sm flex flex-col h-[400px]">
              <div className="flex items-center justify-between mb-4">
                 <h3 className="font-bold text-zinc-900 flex items-center gap-2">
                    <Calendar size={18} className="text-zinc-500" /> Today's Plan
                 </h3>
                 <span className="text-xs text-zinc-400">
                    {new Date().toLocaleDateString(undefined, { weekday: 'long' })}
                 </span>
              </div>

              <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                 {loading.dashboard ? (
                   <>
                     <TaskItemSkeleton />
                     <TaskItemSkeleton />
                     <TaskItemSkeleton />
                     <TaskItemSkeleton />
                   </>
                 ) : todaysTasks.length > 0 ? (
                   todaysTasks.map(task => (
                     <div key={task.id} className="flex gap-3 items-start p-3 rounded-xl bg-zinc-50 border border-zinc-100">
                        <div className={`mt-1 flex-shrink-0 ${task.isCompleted ? 'text-emerald-500' : 'text-zinc-300'}`}>
                           {task.isCompleted ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                        </div>
                        <div>
                           <h4 className={`text-sm font-semibold text-zinc-900 leading-tight ${task.isCompleted ? 'line-through text-zinc-500' : ''}`}>
                              {task.title}
                           </h4>
                           <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">{task.subject}</span>
                              <span className={`text-[9px] px-1.5 rounded font-bold uppercase ${
                                 task.type === 'Exam' ? 'bg-red-100 text-red-600' : 'bg-zinc-200 text-zinc-600'
                              }`}>
                                 {task.type}
                              </span>
                           </div>
                        </div>
                     </div>
                   ))
                 ) : (
                   <div className="h-full flex flex-col items-center justify-center text-center text-zinc-400">
                      <div className="w-12 h-12 bg-zinc-50 rounded-full flex items-center justify-center mb-2">
                        <Calendar size={20} />
                      </div>
                      <p className="text-sm">No tasks for today.</p>
                      <Link to="/planner" className="text-xs text-zinc-600 font-medium mt-1 hover:underline">Add a task</Link>
                   </div>
                 )}
              </div>
           </div>

           {/* Pro Banner (if free) */}
            {!displayUser?.isPremium && (
             <div className="bg-zinc-900 rounded-2xl p-6 text-white relative overflow-hidden">
                <div className="relative z-10">
                   <h3 className="font-bold text-lg mb-1">Upgrade to Pro</h3>
                   <p className="text-zinc-300 text-sm mb-4">Get unlimited AI tutoring and offline access.</p>
                   <Link to="/subscription" className="inline-block px-4 py-2 bg-white text-zinc-900 font-bold rounded-lg text-sm hover:bg-zinc-200 transition-colors">
                      View Plans
                   </Link>
                </div>
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10"></div>
             </div>
           )}

        </div>
      </div>
    </div>
  );
};

export default Dashboard;