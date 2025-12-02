import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { Download, MessageSquare, ChevronLeft, Lock, FileText, Send, Bot, HelpCircle, Bookmark, LogIn, UserPlus, Sparkles, Eye, PanelRightOpen, PanelLeftOpen } from 'lucide-react';
import { summarizeDocument, generateTutorResponse, generateQuiz } from '../services/geminiService';
import MarkdownRenderer from '../components/MarkdownRenderer';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import TTSButton from '../components/TTSButton';

const DocumentView: React.FC = () => {
  const { user, toggleBookmark } = useAuth();
  const { id } = useParams();
  const location = useLocation();
  const { documents } = useData();
  const { addToast } = useToast();
  
  const doc = documents.find(d => d.id === id);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const [activeTab, setActiveTab] = useState<'chat' | 'quiz' | 'notes'>('chat');
  const [mobileView, setMobileView] = useState<'doc' | 'tools'>('doc'); // New state for mobile toggle
  
  const [summary, setSummary] = useState<string | null>(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  
  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: string, text: string }[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);

  const [quizContent, setQuizContent] = useState<string | null>(null);
  const [isQuizLoading, setIsQuizLoading] = useState(false);
  
  const [notes, setNotes] = useState('');
  
  const [isDownloading, setIsDownloading] = useState(false);
  const [isRestricted, setIsRestricted] = useState(false);

  // Guest Access Control
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
    if (doc && !isRestricted) {
      // Summary
      setIsSummaryLoading(true);
      summarizeDocument(doc.title, doc.description).then(res => {
        setSummary(res);
        setIsSummaryLoading(false);
      });
      
      // Load notes
      const savedNotes = localStorage.getItem(`doc_notes_${doc.id}`);
      if (savedNotes) setNotes(savedNotes);
      else setNotes('');

      // Load specific chat history for this document
      const savedChat = localStorage.getItem(`doc_chat_${doc.id}`);
      if (savedChat) {
        try {
          setChatHistory(JSON.parse(savedChat));
        } catch(e) { setChatHistory([]); }
      } else {
        setChatHistory([]);
      }
    }
  }, [doc, isRestricted]);

  // Persist chat history
  useEffect(() => {
    if (doc && chatHistory.length > 0) {
      localStorage.setItem(`doc_chat_${doc.id}`, JSON.stringify(chatHistory));
    }
  }, [chatHistory, doc]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatHistory, quizContent, activeTab]);

  const handleAskAI = async () => {
    if (!chatInput.trim() || !doc) return;

    const userMsg = chatInput;
    setChatInput('');
    setChatHistory(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsChatLoading(true);

    const context = `Document Title: ${doc.title}\nDescription: ${doc.description}\nGrade: ${doc.grade}\nSubject: ${doc.subject}`;
    
    const aiRes = await generateTutorResponse(chatHistory, userMsg, { 
      context,
      subject: doc.subject 
    });

    setChatHistory(prev => [...prev, { role: 'model', text: aiRes }]);
    setIsChatLoading(false);
  };

  const handleGenerateQuiz = async () => {
    if (!doc) return;
    setIsQuizLoading(true);
    const quiz = await generateQuiz(doc.title, doc.description);
    setQuizContent(quiz);
    setIsQuizLoading(false);
  };

  const handleDownload = () => {
    if (!canDownload) return;
    setIsDownloading(true);
    setTimeout(() => {
      setIsDownloading(false);
      addToast("Download started successfully.", "success");
    }, 1500);
  };

  const handleNoteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newNotes = e.target.value;
    setNotes(newNotes);
    if (doc) {
      localStorage.setItem(`doc_notes_${doc.id}`, newNotes);
    }
  };

  const handleDownloadNotes = () => {
    if (!notes.trim()) {
      addToast("No notes to download.", "error");
      return;
    }
    const element = document.createElement("a");
    const file = new Blob([`Notes for: ${doc?.title}\n\n${notes}`], {type: 'text/plain'});
    element.href = URL.createObjectURL(file);
    element.download = `${doc?.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_notes.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    addToast("Notes downloaded successfully.", "success");
  };

  if (!doc) return <div className="p-8 text-center text-zinc-500">Document not found or has been removed.</div>;

  if (isRestricted) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-6 animate-fade-in text-center">
        <div className="bg-white border border-zinc-200 rounded-2xl p-12 shadow-sm max-w-lg mx-auto">
          <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-6 text-zinc-400">
            <Lock size={32} />
          </div>
          <h2 className="text-2xl font-bold text-zinc-900 mb-2">Free Preview Limit Reached</h2>
          <p className="text-zinc-500 mb-8 leading-relaxed">
            You've viewed your free document for this session. <br/>
            Create a free account to continue accessing our library, AI tutor, and more.
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
  
  const canDownload = !doc.isPremium || (user && user.isPremium);
  const isBookmarked = user?.bookmarks?.includes(doc.id);

  return (
    // Use dvh for mobile browsers to account for address bars
    <div className="h-[calc(100dvh-5rem)] lg:h-[calc(100vh-5rem)] flex flex-col gap-4 animate-fade-in relative">
      <div className="flex items-center gap-4 flex-shrink-0">
        <Link to="/library" className="p-2 rounded-lg hover:bg-zinc-100 text-zinc-500 transition-colors">
          <ChevronLeft size={20} />
        </Link>
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-zinc-900 leading-none mb-1 truncate">{doc.title}</h1>
          <p className="text-xs text-zinc-500 truncate">{doc.subject} • Grade {doc.grade}</p>
        </div>
        <div className="ml-auto flex gap-2">
           <button 
             onClick={() => user && toggleBookmark(doc.id)}
             className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
               isBookmarked 
                 ? 'bg-zinc-100 text-zinc-900 border border-zinc-200' 
                 : 'bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-50'
             }`}
             disabled={!user}
           >
             <Bookmark size={14} className={isBookmarked ? "fill-current" : ""} />
             <span className="hidden sm:inline">{isBookmarked ? 'Saved' : 'Save'}</span>
           </button>

           {canDownload && (
             <button 
              onClick={handleDownload}
              disabled={isDownloading}
              className="px-3 py-1.5 text-sm font-medium text-white bg-zinc-900 rounded-lg hover:bg-zinc-800 flex items-center gap-2 disabled:opacity-70"
             >
               {isDownloading ? <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></span> : <Download size={14} />} 
               <span className="hidden sm:inline">Download</span>
             </button>
           )}
        </div>
      </div>

      {/* Mobile Toggle Control */}
      <div className="lg:hidden flex bg-zinc-100 p-1 rounded-lg flex-shrink-0 mb-1">
        <button
          onClick={() => setMobileView('doc')}
          className={`flex-1 py-2 text-xs font-medium rounded-md transition-all flex items-center justify-center gap-2 ${
            mobileView === 'doc' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
          }`}
        >
          <Eye size={14} /> Document
        </button>
        <button
          onClick={() => setMobileView('tools')}
          className={`flex-1 py-2 text-xs font-medium rounded-md transition-all flex items-center justify-center gap-2 ${
            mobileView === 'tools' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
          }`}
        >
          <Sparkles size={14} /> Smart Tools
        </button>
      </div>

      <div className="flex-1 flex flex-col lg:flex-row gap-6 min-h-0">
        
        {/* Document Viewer Column */}
        <div className={`flex-1 bg-zinc-100 rounded-xl overflow-hidden flex flex-col border border-zinc-200 relative ${mobileView === 'doc' ? 'block h-full' : 'hidden'} lg:block lg:h-auto`}>
          <div className="flex-1 overflow-y-auto p-4 md:p-12 flex justify-center">
             <div className="bg-white shadow-sm border border-zinc-200 w-full max-w-2xl min-h-full md:min-h-[800px] p-6 md:p-12 text-zinc-900">
                <div className="flex flex-col items-center justify-center h-64 md:h-full border-2 border-dashed border-zinc-100 rounded-lg p-6 md:p-12">
                   <FileText size={48} className="text-zinc-200 mb-4" />
                   <h3 className="text-xl font-bold text-zinc-900 mb-2 text-center">{doc.title}</h3>
                   <p className="text-zinc-400 text-sm mb-6">Preview Mode</p>
                   
                   {!canDownload && (
                     <div className="bg-zinc-50 border border-zinc-100 p-6 rounded-lg text-center max-w-sm">
                       <Lock className="mx-auto text-zinc-400 mb-2" size={20} />
                       <p className="text-sm font-medium text-zinc-900 mb-1">
                         {user ? 'Premium Content' : 'Member Only Content'}
                       </p>
                       <p className="text-xs text-zinc-500 mb-4">
                         {user ? 'Upgrade to access this file.' : 'Sign in or create an account to view.'}
                       </p>
                       
                       {user ? (
                         <Link 
                           to="/subscription" 
                           state={{ from: location.pathname }}
                           className="block w-full bg-zinc-900 text-white py-2 rounded-md text-sm font-medium hover:bg-zinc-800 transition-colors"
                         >
                           Upgrade Plan
                         </Link>
                       ) : (
                         <Link to="/login" className="block w-full bg-zinc-900 text-white py-2 rounded-md text-sm font-medium hover:bg-zinc-800 transition-colors">
                           Sign In to Access
                         </Link>
                       )}
                     </div>
                   )}
                </div>
                
                <div className="mt-8 md:mt-12 space-y-4">
                  <h4 className="text-sm font-bold uppercase tracking-wider text-zinc-400">Description</h4>
                  <p className="text-sm leading-relaxed text-zinc-600">{doc.description}</p>
                </div>
             </div>
          </div>
        </div>

        {/* Smart Tools Column */}
        <div className={`w-full lg:w-[380px] flex-col bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm ${mobileView === 'tools' ? 'flex h-full' : 'hidden'} lg:flex lg:h-auto`}>
           <div className="h-12 border-b border-zinc-100 flex items-center bg-zinc-50/50 flex-shrink-0">
             <button 
               onClick={() => setActiveTab('chat')}
               className={`flex-1 h-full flex items-center justify-center gap-2 text-xs font-medium transition-colors border-b-2 ${
                 activeTab === 'chat' ? 'border-zinc-900 text-zinc-900 bg-white' : 'border-transparent text-zinc-500 hover:text-zinc-700'
               }`}
             >
               <MessageSquare size={14} /> Chat
             </button>
             <button 
               onClick={() => setActiveTab('quiz')}
               className={`flex-1 h-full flex items-center justify-center gap-2 text-xs font-medium transition-colors border-b-2 ${
                 activeTab === 'quiz' ? 'border-zinc-900 text-zinc-900 bg-white' : 'border-transparent text-zinc-500 hover:text-zinc-700'
               }`}
             >
               <HelpCircle size={14} /> Quiz
             </button>
             <button 
               onClick={() => setActiveTab('notes')}
               className={`flex-1 h-full flex items-center justify-center gap-2 text-xs font-medium transition-colors border-b-2 ${
                 activeTab === 'notes' ? 'border-zinc-900 text-zinc-900 bg-white' : 'border-transparent text-zinc-500 hover:text-zinc-700'
               }`}
             >
               <FileText size={14} /> Notes
             </button>
           </div>
           
           {activeTab === 'chat' && (
             <div className="p-4 border-b border-zinc-100 bg-zinc-50 relative group flex-shrink-0">
                <div className="flex justify-between items-center mb-2">
                   <h4 className="text-xs font-semibold text-zinc-900 uppercase tracking-wide">Summary</h4>
                   {summary && (
                     <div className="flex items-center gap-1">
                       <span className="text-[9px] text-zinc-400 uppercase tracking-wider font-bold">Listen</span>
                       <TTSButton text={summary} size={14} quality="high" className="p-1 bg-white hover:bg-zinc-100 shadow-sm" />
                     </div>
                   )}
                </div>
                
                {isSummaryLoading ? (
                  <div className="space-y-2 animate-pulse">
                    <div className="h-2 bg-zinc-200 rounded w-full"></div>
                    <div className="h-2 bg-zinc-200 rounded w-3/4"></div>
                  </div>
                ) : (
                  <div className="text-xs text-zinc-600 leading-relaxed line-clamp-3 hover:line-clamp-none transition-all cursor-default">
                    <MarkdownRenderer content={summary || ''} />
                  </div>
                )}
             </div>
           )}

           <div className="flex-1 overflow-y-auto bg-white flex flex-col" ref={scrollRef}>
             {activeTab === 'chat' && (
               <div className="p-4 space-y-4">
                 {chatHistory.length === 0 && (
                   <div className="text-center py-10 opacity-50">
                     <Bot size={32} className="mx-auto mb-2 text-zinc-300" />
                     <p className="text-xs text-zinc-400">Ask questions about this document.</p>
                   </div>
                 )}
                 {chatHistory.map((msg, i) => (
                   <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                     <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold ${
                       msg.role === 'user' ? 'bg-zinc-200 text-zinc-600' : 'bg-zinc-900 text-white'
                     }`}>
                       {msg.role === 'user' ? 'U' : 'AI'}
                     </div>
                     <div className={`max-w-[85%] px-3 py-2 rounded-lg text-sm ${
                       msg.role === 'user' ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-700'
                     }`}>
                       {msg.role === 'user' ? msg.text : <MarkdownRenderer content={msg.text} />}
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
             )}

             {activeTab === 'quiz' && (
               <div className="p-4 space-y-4">
                 {!quizContent && !isQuizLoading && (
                   <div className="text-center py-8">
                      <div className="w-12 h-12 bg-zinc-100 rounded-xl flex items-center justify-center mx-auto mb-3 text-zinc-500">
                        <HelpCircle size={24} />
                      </div>
                      <p className="text-sm text-zinc-600 mb-4">Test your knowledge on this topic.</p>
                      <button 
                        onClick={handleGenerateQuiz}
                        className="px-4 py-2 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 transition-colors"
                      >
                        Generate 5 Questions
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
                   <div className="prose prose-sm prose-zinc">
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

             {activeTab === 'notes' && (
               <div className="h-full flex flex-col p-4">
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
                   placeholder="Type your notes here..."
                   className="w-full flex-1 p-3 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-500/20 focus:border-zinc-500 resize-none"
                 ></textarea>
               </div>
             )}
           </div>

           {activeTab === 'chat' && (
             <div className="p-3 border-t border-zinc-100 flex-shrink-0">
               <form onSubmit={(e) => { e.preventDefault(); handleAskAI(); }} className="relative">
                 <input
                   type="text"
                   className="w-full pl-4 pr-10 py-2.5 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 transition-all placeholder-zinc-400"
                   placeholder="Ask a follow-up..."
                   value={chatInput}
                   onChange={(e) => setChatInput(e.target.value)}
                   disabled={isChatLoading}
                 />
                 <button 
                   type="submit" 
                   disabled={!chatInput.trim() || isChatLoading}
                   className="absolute right-2 top-2 p-1 text-zinc-400 hover:text-zinc-900 disabled:opacity-50 transition-colors"
                 >
                   <Send size={16} />
                 </button>
               </form>
             </div>
           )}
        </div>
      </div>
    </div>
  );
};

export default DocumentView;