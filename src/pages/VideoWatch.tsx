import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { ChevronLeft, ThumbsUp, Share2, MoreHorizontal, Lock, Bookmark, ExternalLink, PlayCircle, FileText, Download, UserPlus, LogIn, CheckCircle, MessageSquare, HelpCircle, Send, Bot } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { generateTutorResponse, generateQuiz } from '../services/geminiService';
import MarkdownRenderer from '../components/MarkdownRenderer';
import TTSButton from '../components/TTSButton';

const VideoWatch: React.FC = () => {
  const { user, toggleBookmark, gainXP } = useAuth();
  const { id } = useParams();
  const location = useLocation();
  const { videos, updateVideo } = useData();
  const { addToast } = useToast();
  
  const video = videos.find(v => v.id === id);
  const relatedVideos = videos.filter(v => v.id !== id && v.subject === video?.subject).slice(0, 3);

  const [hasLiked, setHasLiked] = useState(false);
  const [activeTab, setActiveTab] = useState<'upNext' | 'notes' | 'chat' | 'quiz'>('upNext');
  const [notes, setNotes] = useState('');
  const [isRestricted, setIsRestricted] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: string, text: string }[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [quizContent, setQuizContent] = useState<string | null>(null);
  const [isQuizLoading, setIsQuizLoading] = useState(false);
  
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!user) {
      const views = parseInt(localStorage.getItem('smartstudy_guest_views') || '0');
      if (views >= 1) {
        setIsRestricted(true);
      } else {
        localStorage.setItem('smartstudy_guest_views', (views + 1).toString());
      }
    } else {
      setIsRestricted(false);
    }
  }, [user, id]);

  useEffect(() => {
    setIsCompleted(false);
    setQuizContent(null);
    if (id) {
      const savedNotes = localStorage.getItem(`video_notes_${id}`);
      if (savedNotes) setNotes(savedNotes);
      else setNotes('');

      // Load chat history for this video
      const savedChat = localStorage.getItem(`video_chat_${id}`);
      if (savedChat) {
        try {
          setChatHistory(JSON.parse(savedChat));
        } catch(e) { setChatHistory([]); }
      } else {
        setChatHistory([]);
      }
    }
  }, [id]);

  // Persist chat history
  useEffect(() => {
    if (id && chatHistory.length > 0) {
      localStorage.setItem(`video_chat_${id}`, JSON.stringify(chatHistory));
    }
  }, [chatHistory, id]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatHistory, activeTab]);

  const handleNoteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newNotes = e.target.value;
    setNotes(newNotes);
    if (id) {
      localStorage.setItem(`video_notes_${id}`, newNotes);
    }
  };

  const handleAskAI = async () => {
    if (!chatInput.trim() || !video) return;

    const userMsg = chatInput;
    setChatInput('');
    setChatHistory(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsChatLoading(true);

    const context = `Video Lesson: ${video.title}\nSubject: ${video.subject}\nGrade: ${video.grade}\nDescription: ${video.description}`;
    
    const aiRes = await generateTutorResponse(chatHistory, userMsg, { 
      context,
      subject: video.subject 
    });

    setChatHistory(prev => [...prev, { role: 'model', text: aiRes }]);
    setIsChatLoading(false);
  };

  const handleGenerateQuiz = async () => {
    if (!video) return;
    setIsQuizLoading(true);
    const quiz = await generateQuiz(video.title, video.description);
    setQuizContent(quiz);
    setIsQuizLoading(false);
  };

  if (!video) return <div className="p-12 text-center text-zinc-500">Video not found.</div>;

  if (isRestricted) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-6 animate-fade-in text-center">
        <div className="bg-white border border-zinc-200 rounded-2xl p-12 shadow-sm max-w-lg mx-auto">
          <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-6 text-zinc-400">
            <Lock size={32} />
          </div>
          <h2 className="text-2xl font-bold text-zinc-900 mb-2">Free Preview Limit Reached</h2>
          <p className="text-zinc-500 mb-8 leading-relaxed">
            You've viewed your free video lesson for this session. <br/>
            Create a free account to continue accessing our classroom, AI tutor, and more.
          </p>
          
          <div className="space-y-3">
             <Link 
               to="/register" 
               className="block w-full py-3 bg-zinc-900 text-white font-medium rounded-xl hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2"
             >
               <UserPlus size={18} /> Create Free Account
             </Link>
             <Link 
               to="/login" 
               className="block w-full py-3 bg-white border border-zinc-200 text-zinc-700 font-medium rounded-xl hover:bg-zinc-50 transition-colors flex items-center justify-center gap-2"
             >
               <LogIn size={18} /> Sign In
             </Link>
          </div>
          <p className="mt-6 text-xs text-zinc-400">
            Join thousands of Ethiopian students learning smarter today.
          </p>
        </div>
      </div>
    );
  }

  const canWatch = !video.isPremium || (user && user.isPremium);
  const isBookmarked = user?.bookmarks?.includes(video.id);

  const getVideoId = (url: string) => {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const videoId = getVideoId(video.videoUrl);
  
  const embedUrl = videoId 
    ? `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&origin=${window.location.origin}`
    : '';

  const handleLike = () => {
    if (hasLiked) {
      updateVideo(video.id, { likes: Math.max(0, video.likes - 1) });
    } else {
      updateVideo(video.id, { likes: video.likes + 1 });
    }
    setHasLiked(!hasLiked);
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    addToast("Link copied to clipboard!", "success");
  };
  
  const handleCompleteLesson = () => {
    if (!user || isCompleted) return;
    setIsCompleted(true);
    const { leveledUp, newLevel } = gainXP(100);
    addToast("+100 XP Lesson Completed!", "success");
    if (leveledUp) {
      setTimeout(() => addToast(`Level Up! You are now Level ${newLevel}`, "info"), 500);
    }
  };

  const handleDownloadNotes = () => {
    if (!notes.trim()) {
      addToast("No notes to download.", "error");
      return;
    }
    const element = document.createElement("a");
    const file = new Blob([`Notes for: ${video.title}\n\n${notes}`], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = `${video.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_notes.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    addToast("Notes downloaded successfully.", "success");
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fade-in relative pb-12">
       <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Link to="/videos" className="hover:text-zinc-900 transition-colors flex items-center gap-1">
             <ChevronLeft size={16} /> Back to Classroom
          </Link>
          <span className="text-zinc-300">/</span>
          <span>{video.subject}</span>
          <span className="text-zinc-300">/</span>
          <span className="text-zinc-900 font-medium truncate max-w-[200px]">{video.title}</span>
       </div>

       <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
             <div className="aspect-video bg-black rounded-xl overflow-hidden shadow-lg relative">
                {canWatch && videoId ? (
                   <iframe 
                     width="100%" 
                     height="100%" 
                     src={embedUrl}
                     title={video.title}
                     frameBorder="0" 
                     allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                     referrerPolicy="strict-origin-when-cross-origin"
                     allowFullScreen
                     className="w-full h-full"
                   ></iframe>
                ) : (
                   <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900 text-white p-6 text-center">
                      <div className="w-16 h-16 bg-white/10 rounded-full flex items-center justify-center mb-4">
                         <Lock size={32} />
                      </div>
                      <h3 className="text-xl font-bold mb-2">
                        {!videoId ? 'Video Error' : 'Premium Lesson'}
                      </h3>
                      <p className="text-zinc-400 max-w-sm mb-6">
                        {!videoId 
                          ? 'This video source is invalid.' 
                          : 'Upgrade your account to Student Pro to watch this lesson and access hundreds more.'}
                      </p>
                      {canWatch ? null : (
                        <Link 
                          to="/subscription" 
                          state={{ from: location.pathname }}
                          className="px-6 py-2 bg-white text-zinc-900 font-bold rounded-lg hover:bg-zinc-100 transition-colors"
                        >
                           Upgrade Plan
                        </Link>
                      )}
                   </div>
                )}
             </div>

             <div>
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-4">
                  <div>
                    <h1 className="text-xl md:text-2xl font-bold text-zinc-900 leading-tight mb-2">{video.title}</h1>
                    {canWatch && videoId && (
                      <div className="flex gap-4">
                        <a 
                          href={`https://www.youtube.com/watch?v=${videoId}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-xs font-medium text-zinc-500 hover:text-zinc-800 flex items-center gap-1"
                        >
                          <ExternalLink size={12} /> Watch directly on YouTube
                        </a>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                     {user && canWatch && (
                       <button
                         onClick={handleCompleteLesson}
                         disabled={isCompleted}
                         className={`px-4 py-2 text-sm font-medium rounded-lg transition-all flex items-center gap-2 flex-shrink-0 ${
                           isCompleted 
                             ? 'bg-emerald-100 text-emerald-700 border border-emerald-200 cursor-default' 
                             : 'bg-zinc-900 text-white border border-zinc-900 hover:bg-zinc-800 shadow-md'
                         }`}
                       >
                         {isCompleted ? <CheckCircle size={16} /> : <CheckCircle size={16} />}
                         {isCompleted ? 'Completed' : 'Complete Lesson'}
                       </button>
                     )}
                     <button 
                       onClick={() => user && toggleBookmark(video.id)}
                       className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 flex-shrink-0 ${
                         isBookmarked 
                           ? 'bg-zinc-100 text-zinc-900 border border-zinc-200' 
                           : 'bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-50'
                       }`}
                       disabled={!user}
                     >
                       <Bookmark size={16} className={isBookmarked ? "fill-current" : ""} />
                       {isBookmarked ? 'Saved' : 'Save'}
                     </button>
                   </div>
                </div>
                
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-100 pb-4">
                   <div className="flex items-center gap-4 text-sm text-zinc-500">
                      <span>{video.views.toLocaleString()} views</span>
                      <span className="w-1 h-1 bg-zinc-300 rounded-full"></span>
                      <span>{video.uploadedAt}</span>
                   </div>
                   <div className="flex items-center gap-2 relative">
                      <button 
                        onClick={handleLike}
                        className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                          hasLiked ? 'bg-zinc-200 text-zinc-900' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                        }`}
                      >
                         <ThumbsUp size={16} className={hasLiked ? "fill-current" : ""} /> 
                         {video.likes}
                      </button>
                      <button 
                        onClick={handleShare}
                        className="flex items-center gap-2 px-4 py-2 bg-zinc-100 text-zinc-700 rounded-full text-sm font-medium hover:bg-zinc-200 transition-colors"
                      >
                         <Share2 size={16} /> Share
                      </button>
                      
                      <button className="p-2 bg-zinc-100 rounded-full hover:bg-zinc-200 transition-colors">
                         <MoreHorizontal size={16} />
                      </button>
                   </div>
                </div>

                <div className="pt-6 flex gap-4">
                   <div className="w-12 h-12 bg-zinc-100 rounded-full flex items-center justify-center text-zinc-900 font-bold text-lg flex-shrink-0">
                      {video.instructor.charAt(0)}
                   </div>
                   <div>
                      <h3 className="font-bold text-zinc-900">{video.instructor}</h3>
                      <p className="text-xs text-zinc-500 mb-3">Verified Educational Channel • 100+ Lessons</p>
                      <p className="text-sm text-zinc-700 leading-relaxed bg-zinc-50 p-4 rounded-lg border border-zinc-100">
                         {video.description}
                      </p>
                   </div>
                </div>
             </div>
          </div>

          <div className="flex flex-col h-[600px] bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm">
             <div className="flex border-b border-zinc-100 bg-zinc-50/50">
               {[
                 { id: 'upNext', icon: PlayCircle, label: 'Up Next' },
                 { id: 'notes', icon: FileText, label: 'Notes' },
                 { id: 'chat', icon: MessageSquare, label: 'Chat' },
                 { id: 'quiz', icon: HelpCircle, label: 'Quiz' },
               ].map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex-1 py-3 text-xs font-medium flex flex-col items-center justify-center gap-1 transition-colors relative ${
                      activeTab === tab.id 
                        ? 'bg-white text-zinc-900' 
                        : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50'
                    }`}
                  >
                    <tab.icon size={16} />
                    {tab.label}
                    {activeTab === tab.id && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-zinc-900"></div>}
                  </button>
               ))}
             </div>

             <div className="flex-1 p-4 overflow-y-auto" ref={chatScrollRef}>
               {activeTab === 'upNext' && (
                 <div className="space-y-4">
                    {relatedVideos.length > 0 ? (
                        relatedVideos.map((rv) => (
                           <Link key={rv.id} to={`/video/${rv.id}`} className="flex gap-3 group">
                              <div className="relative w-28 aspect-video bg-zinc-200 rounded-lg overflow-hidden flex-shrink-0">
                                 <img src={rv.thumbnail} alt={rv.title} className="w-full h-full object-cover" />
                                 <span className="absolute bottom-1 right-1 bg-black/80 text-white text-[9px] px-1 rounded">
                                    {rv.duration}
                                 </span>
                              </div>
                              <div className="flex flex-col min-w-0">
                                 <h4 className="text-xs font-semibold text-zinc-900 line-clamp-2 leading-snug group-hover:text-zinc-700 transition-colors">
                                    {rv.title}
                                 </h4>
                                 <p className="text-[10px] text-zinc-500 mt-1 truncate">{rv.instructor}</p>
                                 <div className="flex items-center gap-1 mt-auto">
                                   {rv.isPremium && <span className="text-[9px] bg-amber-100 text-amber-700 px-1 rounded font-bold">PRO</span>}
                                 </div>
                              </div>
                           </Link>
                        ))
                    ) : (
                        <p className="text-sm text-zinc-500 text-center py-8">No related videos found.</p>
                    )}

                    <div className="pt-6 border-t border-zinc-100 mt-6">
                      <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-5 text-center">
                         <h4 className="font-bold text-zinc-900 mb-2">Need help?</h4>
                         <p className="text-xs text-zinc-600 mb-4">Ask our AI Tutor to verify what you've learned.</p>
                         <button onClick={() => setActiveTab('chat')} className="block w-full py-2 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 transition-colors">
                            Open Chat
                         </button>
                      </div>
                    </div>
                 </div>
               )}

               {activeTab === 'notes' && (
                 <div className="h-full flex flex-col">
                   <div className="mb-2 flex justify-between items-center">
                     <span className="text-xs text-zinc-500 font-medium">Auto-saved</span>
                     <button 
                       onClick={handleDownloadNotes}
                       title="Download Notes"
                       className="p-1.5 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded transition-colors"
                     >
                       <Download size={14} />
                     </button>
                   </div>
                   <textarea
                     value={notes}
                     onChange={handleNoteChange}
                     placeholder="Take notes here while you watch..."
                     className="w-full flex-1 p-3 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500/20 focus:border-zinc-500 resize-none"
                   ></textarea>
                 </div>
               )}

               {activeTab === 'chat' && (
                 <div className="flex flex-col h-full">
                    <div className="flex-1 space-y-4 pb-4">
                       {chatHistory.length === 0 && (
                          <div className="text-center py-10 opacity-50">
                             <Bot size={32} className="mx-auto mb-2 text-zinc-300" />
                             <p className="text-xs text-zinc-400">Ask questions about this video.</p>
                          </div>
                       )}
                       {chatHistory.map((msg, i) => (
                          <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                             <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold ${
                                msg.role === 'user' ? 'bg-zinc-200 text-zinc-600' : 'bg-zinc-900 text-white'
                             }`}>
                                {msg.role === 'user' ? 'U' : 'AI'}
                             </div>
                             <div className={`max-w-[85%] px-3 py-2 rounded-lg text-xs relative group ${
                                msg.role === 'user' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-700 bg-white border border-zinc-100 shadow-sm'
                             }`}>
                                {msg.role === 'user' ? msg.text : (
                                  <>
                                    <MarkdownRenderer content={msg.text} />
                                    <div className="absolute -top-1 -right-7 opacity-0 group-hover:opacity-100 transition-opacity">
                                       <TTSButton text={msg.text} size={14} quality="high" className="bg-white border border-zinc-100 shadow-sm p-1" />
                                    </div>
                                  </>
                                )}
                             </div>
                          </div>
                       ))}
                       {isChatLoading && (
                          <div className="flex gap-2 items-center text-zinc-400 text-xs pl-9">
                             <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce"></span>
                             <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce delay-100"></span>
                          </div>
                       )}
                    </div>

                    <div className="pt-2 border-t border-zinc-100">
                       <form onSubmit={(e) => { e.preventDefault(); handleAskAI(); }} className="relative">
                          <input
                             type="text"
                             className="w-full pl-3 pr-10 py-2.5 bg-zinc-50 border border-zinc-200 rounded-lg text-xs focus:outline-none focus:border-zinc-900 transition-all placeholder-zinc-400"
                             placeholder="Ask a question..."
                             value={chatInput}
                             onChange={(e) => setChatInput(e.target.value)}
                             disabled={isChatLoading}
                          />
                          <button 
                             type="submit" 
                             disabled={!chatInput.trim() || isChatLoading}
                             className="absolute right-2 top-2 p-1 text-zinc-400 hover:text-zinc-900 disabled:opacity-50 transition-colors"
                          >
                             <Send size={14} />
                          </button>
                       </form>
                    </div>
                 </div>
               )}

               {activeTab === 'quiz' && (
                 <div className="space-y-4">
                    {!quizContent && !isQuizLoading && (
                       <div className="text-center py-12">
                          <div className="w-12 h-12 bg-zinc-100 rounded-xl flex items-center justify-center mx-auto mb-3 text-zinc-500">
                             <HelpCircle size={24} />
                          </div>
                          <p className="text-sm text-zinc-600 mb-4">Test your understanding of this lesson.</p>
                          <button 
                             onClick={handleGenerateQuiz}
                             className="px-4 py-2 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 transition-colors"
                          >
                             Generate Quiz
                          </button>
                       </div>
                    )}

                    {isQuizLoading && (
                       <div className="flex flex-col items-center justify-center py-10 gap-3">
                          <div className="w-6 h-6 border-2 border-zinc-200 border-t-zinc-900 rounded-full animate-spin"></div>
                          <p className="text-xs text-zinc-400">Generating questions...</p>
                       </div>
                    )}

                    {quizContent && (
                       <div className="prose prose-sm prose-zinc text-xs relative">
                          <div className="flex justify-end mb-2">
                             <TTSButton text={quizContent} size={16} quality="high" className="bg-zinc-50 hover:bg-zinc-100" />
                          </div>
                          <MarkdownRenderer content={quizContent} />
                          <button 
                             onClick={handleGenerateQuiz}
                             className="mt-6 w-full py-2 bg-zinc-100 text-zinc-600 text-xs font-medium rounded-lg hover:bg-zinc-200 transition-colors"
                          >
                             Regenerate Quiz
                          </button>
                       </div>
                    )}
                 </div>
               )}
             </div>
          </div>
       </div>
    </div>
  );
};

export default VideoWatch;