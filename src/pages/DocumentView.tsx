import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import {
  Download, MessageSquare, ChevronLeft, Lock, FileText, Send, Bot,
  HelpCircle, Bookmark, LogIn, UserPlus, Sparkles, Eye,
  Maximize, Minimize, Share2, MoreHorizontal, CheckCircle
} from 'lucide-react';
import { documentsAPI, aiTutorAPI } from '../services/api';
import MarkdownRenderer from '../components/MarkdownRenderer';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import TTSButton from '../components/TTSButton';
import { Document } from '../types';
import { DocumentViewSkeleton } from '../components/Skeletons';

// Helper to determine cleaner preview URLs
const getPreviewUrl = (url: string, fileType: string): string => {
  if (!url) return '';

  // Extract Google Drive file ID if present
  const match = url.match(/\/d\/([a-zA-Z0-9-_]+)\//) || url.match(/id=([a-zA-Z0-9-_]+)/);
  const fileId = match ? match[1] : null;

  if (fileId) {
    // Handle different file types for Google Drive
    if (fileType === 'PDF') {
      return `https://drive.google.com/file/d/${fileId}/preview`;
    }

    // Handle image files (JPG, PNG, etc.) - convert to direct image URL
    if (['JPG', 'JPEG', 'PNG', 'GIF', 'WEBP'].includes(fileType.toUpperCase())) {
      return `https://drive.google.com/uc?export=view&id=${fileId}`;
    }
  }

  // Microsoft Office files
  if (['DOCX', 'PPTX', 'XLSX'].includes(fileType)) {
    return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
  }

  return url;
};

const DocumentView: React.FC = () => {
  const { user, toggleBookmark } = useAuth();
  const { id } = useParams<{ id: string }>();
  const location = useLocation();
  const { addToast } = useToast();

  const [doc, setDoc] = useState<Document | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Layout State
  const [isFullscreen, setIsFullscreen] = useState(false);
  const docPreviewRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  // Mobile & Tab State
  const [activeTab, setActiveTab] = useState<'chat' | 'quiz' | 'notes'>('chat');
  const [mobileView, setMobileView] = useState<'doc' | 'tools'>('doc');

  // Feature State
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

  // --- FULL SCREEN HANDLERS ---
  const toggleFullScreen = () => {
    if (!docPreviewRef.current) return;

    if (!document.fullscreenElement) {
      docPreviewRef.current.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
        addToast("Could not enter fullscreen mode", "error");
      });
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    const handleScreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleScreenChange);
    return () => document.removeEventListener('fullscreenchange', handleScreenChange);
  }, []);

  // --- DATA FETCHING ---
  useEffect(() => {
    const fetchDocument = async () => {
      if (!id) return;
      try {
        setLoading(true);
        setError(null);
        const document = await documentsAPI.getById(id);
        setDoc(document);
      } catch (err: any) {
        console.error('Failed to fetch document:', err);
        setError(err.message || 'Failed to load document');
      } finally {
        setLoading(false);
      }
    };
    fetchDocument();
  }, [id]);

  // --- GUEST RESTRICTION LOGIC ---
  useEffect(() => {
    if (!doc) return;
    if (!user) {
      const views = parseInt(localStorage.getItem('smartstudy_guest_views') || '0');
      if (views >= 2) { // Allow 2 free views
        setIsRestricted(true);
      } else {
        localStorage.setItem('smartstudy_guest_views', (views + 1).toString());
      }
    } else {
      setIsRestricted(false);
    }
  }, [user, doc]);

  // --- LOAD FEATURES (Summary, Notes, Chat) ---
  useEffect(() => {
    if (doc && !isRestricted) {
      // Load Notes
      const savedNotes = localStorage.getItem(`doc_notes_${doc.id}`);
      if (savedNotes) setNotes(savedNotes);

      // Load Chat
      const savedChat = localStorage.getItem(`doc_chat_${doc.id}`);
      if (savedChat) {
        try {
          setChatHistory(JSON.parse(savedChat));
        } catch (e) { setChatHistory([]); }
      }

      // Generate Summary (If not already cached in a real app, typically we'd check if summary exists)
      if (!summary) {
        setIsSummaryLoading(true);
        aiTutorAPI.chat(`Provide a concise 3-sentence summary of the document titled: "${doc.title}". Description: ${doc.description}`, doc.subject, 10)
          .then(res => {
            setSummary(res.response);
            setIsSummaryLoading(false);
          })
          .catch(err => {
            setSummary('Summary unavailable.');
            setIsSummaryLoading(false);
          });
      }
    }
  }, [doc, isRestricted]); // Removed summary dependency to avoid loop if summary set elsewhere

  // Save Chat persistence
  useEffect(() => {
    if (doc && chatHistory.length > 0) {
      localStorage.setItem(`doc_chat_${doc.id}`, JSON.stringify(chatHistory));
    }
  }, [chatHistory, doc]);

  // Auto-scroll chat
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatHistory, quizContent, activeTab, isChatLoading]);

  // --- HANDLERS ---
  const handleAskAI = async () => {
    if (!chatInput.trim() || !doc) return;
    const userMsg = chatInput;
    setChatInput('');
    setChatHistory(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsChatLoading(true);

    try {
      const context = `Context: Document "${doc.title}" (Grade ${doc.grade}, Subject: ${doc.subject}). Desc: ${doc.description}`;
      const fullPrompt = `${context}\n\nQuestion: ${userMsg}`;
      console.log('Sending AI chat request:', { message: fullPrompt, subject: doc.subject, grade: doc.grade });
      const response = await aiTutorAPI.chat(fullPrompt, doc.subject, doc.grade);
      console.log('AI chat response:', response);
      setChatHistory(prev => [...prev, { role: 'model', text: response.response }]);
    } catch (error: any) {
      console.error('AI chat error in DocumentView:', error);
      setChatHistory(prev => [...prev, { role: 'model', text: `Error: ${error.message || 'I encountered an error processing your request.'}` }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleGenerateQuiz = async () => {
    if (!doc) return;
    setIsQuizLoading(true);
    try {
      const prompt = `Create a 5-question multiple choice quiz based on: "${doc.title}" - ${doc.description}. Format with Markdown.`;
      console.log('Generating quiz for document:', { title: doc.title, subject: doc.subject, grade: doc.grade });
      const response = await aiTutorAPI.chat(prompt, doc.subject, doc.grade);
      console.log('Quiz generation response:', response);
      setQuizContent(response.response);
    } catch (error: any) {
      console.error('Quiz generation error in DocumentView:', error);
      setQuizContent(`Could not generate quiz: ${error.message || 'Please try again.'}`);
    } finally {
      setIsQuizLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!doc?.file_url) {
      addToast("No file available.", "error");
      return;
    }
    setIsDownloading(true);
    // Simulate API delay or tracking
    setTimeout(() => {
      window.open(doc.file_url, '_blank');
      addToast("Download started.", "success");
      setIsDownloading(false);
    }, 800);
  };

  const handleNoteChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setNotes(val);
    if (doc) localStorage.setItem(`doc_notes_${doc.id}`, val);
  };

  const handleDownloadNotes = () => {
    if (!notes.trim() || !doc) return;
    const element = document.createElement("a");
    const file = new Blob([`Notes: ${doc.title}\n\n${notes}`], { type: 'text/plain' });
    element.href = URL.createObjectURL(file);
    element.download = `${doc.title.substring(0, 20)}_notes.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    addToast("Notes saved to device.", "success");
  };

  // --- RENDER HELPERS ---
  if (loading) {
    return <DocumentViewSkeleton />;
  }

  if (error || !doc) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="bg-red-50 p-4 rounded-full mb-4"><FileText className="text-red-500" size={32} /></div>
        <h3 className="text-xl font-bold text-zinc-900 mb-2">Document Unavailable</h3>
        <p className="text-zinc-500 mb-6">{error || "This document could not be found."}</p>
        <Link to="/library" className="px-6 py-2 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition-colors">
          Return to Library
        </Link>
      </div>
    );
  }

  if (isRestricted) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-6 animate-fade-in text-center">
        <div className="bg-white border border-zinc-200 rounded-3xl p-12 shadow-xl max-w-lg mx-auto relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500"></div>
          <div className="w-20 h-20 bg-zinc-50 rounded-full flex items-center justify-center mx-auto mb-6 text-zinc-900 shadow-inner">
            <Lock size={32} />
          </div>
          <h2 className="text-2xl font-bold text-zinc-900 mb-3">Preview Limit Reached</h2>
          <p className="text-zinc-500 mb-8 leading-relaxed">
            You've viewed your free documents for this session. <br />
            Sign in to unlock unlimited access to our library and AI tools.
          </p>
          <div className="space-y-3">
            <Link to="/register" className="block w-full py-3.5 bg-zinc-900 text-white font-medium rounded-xl hover:bg-zinc-800 hover:scale-[1.02] transition-all flex items-center justify-center gap-2 shadow-lg shadow-zinc-200">
              <UserPlus size={18} /> Create Free Account
            </Link>
            <Link to="/login" className="block w-full py-3.5 bg-white border border-zinc-200 text-zinc-700 font-medium rounded-xl hover:bg-zinc-50 transition-colors flex items-center justify-center gap-2">
              <LogIn size={18} /> Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const canDownload = !doc.is_premium || (user && user.isPremium);
  const isBookmarked = user?.bookmarks?.includes(doc.id);
  const previewUrl = doc.file_url ? getPreviewUrl(doc.file_url, doc.file_type) : null;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] md:h-[calc(100vh-5rem)] bg-zinc-50/50">
      
      {/* 1. HEADER BAR */}
      <header className="flex-shrink-0 bg-white border-b border-zinc-200 px-4 py-3 sm:px-6 shadow-sm z-20">
        <div className="max-w-[1920px] mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link to="/library" className="p-2 rounded-lg hover:bg-zinc-100 text-zinc-500 hover:text-zinc-900 transition-colors">
              <ChevronLeft size={20} />
            </Link>
            <div className="min-w-0">
              <h1 className="text-lg sm:text-xl font-bold text-zinc-900 truncate">{doc.title}</h1>
              <div className="flex items-center gap-2 text-xs sm:text-sm text-zinc-500">
                <span className="px-2 py-0.5 bg-zinc-100 rounded text-zinc-600 font-medium">{doc.subject}</span>
                <span>•</span>
                <span>Grade {doc.grade}</span>
              </div>
            </div>
          </div>

          {/* Desktop Actions */}
          <div className="hidden md:flex items-center gap-2">
             <button
              onClick={() => user && toggleBookmark(doc.id)}
              className={`p-2 rounded-lg transition-colors border ${
                isBookmarked
                  ? 'bg-amber-50 border-amber-200 text-amber-600'
                  : 'bg-white border-zinc-200 text-zinc-500 hover:bg-zinc-50'
              }`}
              title={isBookmarked ? "Remove from saved" : "Save for later"}
            >
              <Bookmark size={18} className={isBookmarked ? "fill-current" : ""} />
            </button>
            
            {canDownload ? (
              <button
                onClick={handleDownload}
                disabled={isDownloading}
                className="flex items-center gap-2 px-4 py-2 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 disabled:opacity-70 transition-all shadow-sm"
              >
                {isDownloading ? <span className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full"/> : <Download size={18} />}
                <span className="font-medium">Download</span>
              </button>
            ) : (
              <Link to="/pricing" className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg hover:opacity-90 transition-all shadow-sm">
                 <Lock size={16} /> <span className="font-medium">Unlock</span>
              </Link>
            )}
          </div>
          
          {/* Mobile Actions Menu */}
           <div className="md:hidden">
              <button className="p-2 text-zinc-600 hover:bg-zinc-100 rounded-lg">
                <MoreHorizontal size={20} />
              </button>
           </div>
        </div>
      </header>

      {/* 2. MOBILE VIEW TOGGLE */}
      <div className="md:hidden px-4 py-2 bg-white border-b border-zinc-200 flex-shrink-0">
        <div className="flex p-1 bg-zinc-100 rounded-lg">
          <button
            onClick={() => setMobileView('doc')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-all ${
              mobileView === 'doc' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500'
            }`}
          >
            <Eye size={16} /> Document
          </button>
          <button
            onClick={() => setMobileView('tools')}
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-md transition-all ${
              mobileView === 'tools' ? 'bg-white text-blue-600 shadow-sm' : 'text-zinc-500'
            }`}
          >
            <Sparkles size={16} /> AI Tools
          </button>
        </div>
      </div>

      {/* 3. MAIN CONTENT AREA (Split View) */}
      <div className="flex-1 overflow-hidden relative flex flex-row">
        
        {/* LEFT PANEL: DOCUMENT VIEWER */}
        <div className={`flex-1 bg-zinc-100/50 relative flex flex-col transition-all duration-300 ${mobileView === 'tools' ? 'hidden md:flex' : 'flex'}`}>
          
          {/* Viewer Toolbar */}
          <div className="h-12 flex items-center justify-between px-4 border-b border-zinc-200 bg-white flex-shrink-0">
             <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Preview Mode</span>
             <div className="flex gap-2">
                <button onClick={toggleFullScreen} className="p-1.5 hover:bg-zinc-100 rounded text-zinc-500 transition-colors" title="Toggle Fullscreen">
                  {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
                </button>
             </div>
          </div>

          {/* Iframe Container */}
          <div 
            ref={docPreviewRef}
            className={`flex-1 relative w-full h-full bg-zinc-200 overflow-hidden ${isFullscreen ? 'fixed inset-0 z-50 bg-black flex flex-col' : ''}`}
          >
             {isFullscreen && (
               <div className="absolute top-0 left-0 right-0 h-14 bg-zinc-900/90 backdrop-blur text-white flex items-center justify-between px-6 z-10 transition-opacity opacity-0 hover:opacity-100">
                  <span className="font-medium">{doc.title}</span>
                  <button onClick={toggleFullScreen} className="p-2 hover:bg-white/10 rounded-full"><Minimize size={20}/></button>
               </div>
             )}

             {previewUrl ? (
                <iframe
                  src={previewUrl}
                  className="w-full h-full border-0"
                  allowFullScreen
                  title="Document Preview"
                />
             ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-white p-8 text-center">
                   <div className="w-20 h-20 bg-zinc-50 rounded-2xl flex items-center justify-center mb-4">
                      <FileText size={40} className="text-zinc-300"/>
                   </div>
                   <h3 className="text-lg font-medium text-zinc-900">Preview Unavailable</h3>
                   <p className="text-zinc-500 max-w-xs mt-2 text-sm">The preview for this file type is not supported. Please download the file to view it.</p>
                   {canDownload && (
                     <button onClick={handleDownload} className="mt-6 px-5 py-2.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-900 text-sm font-medium rounded-lg transition-colors">
                       Download File
                     </button>
                   )}
                </div>
             )}

             {/* Premium Overlay for Documents that are locked but have no preview */}
             {!canDownload && !user && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-md flex flex-col items-center justify-center z-20">
                   <Lock size={48} className="text-zinc-300 mb-4" />
                   <h3 className="text-xl font-bold text-zinc-800">Premium Content</h3>
                   <p className="text-zinc-500 mb-6">Subscribe to view this document.</p>
                   <Link to="/pricing" className="px-8 py-3 bg-zinc-900 text-white rounded-xl font-medium hover:bg-zinc-800 transition-transform hover:scale-105 shadow-xl">
                      Upgrade Now
                   </Link>
                </div>
             )}
          </div>
        </div>

        {/* RIGHT PANEL: SMART TOOLS (Sidebar) */}
        <div className={`w-full md:w-[380px] lg:w-[420px] bg-white border-l border-zinc-200 flex flex-col shadow-xl z-30 transition-all ${mobileView === 'doc' ? 'hidden md:flex' : 'flex'}`}>
          
          {/* Tool Tabs */}
          <div className="flex border-b border-zinc-100">
            {[
              { id: 'chat', icon: MessageSquare, label: 'Tutor' },
              { id: 'quiz', icon: HelpCircle, label: 'Quiz' },
              { id: 'notes', icon: FileText, label: 'Notes' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex-1 py-4 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors ${
                  activeTab === tab.id 
                    ? 'border-blue-600 text-blue-600 bg-blue-50/10' 
                    : 'border-transparent text-zinc-500 hover:text-zinc-800 hover:bg-zinc-50'
                }`}
              >
                <tab.icon size={16} /> {tab.label}
              </button>
            ))}
          </div>

          {/* Tool Content Area */}
          <div className="flex-1 overflow-y-auto bg-zinc-50/30" ref={scrollRef}>
            
            {/* --- CHAT TAB --- */}
            {activeTab === 'chat' && (
              <div className="flex flex-col min-h-full">
                {/* Summary Card */}
                <div className="p-4 bg-gradient-to-br from-indigo-50 to-white border-b border-indigo-100">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="text-xs font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-1">
                      <Sparkles size={12} className="text-indigo-500"/> AI Summary
                    </h4>
                    {summary && <TTSButton text={summary} size={14} className="text-indigo-400 hover:text-indigo-600" />}
                  </div>
                  {isSummaryLoading ? (
                    <div className="space-y-2 animate-pulse">
                      <div className="h-2 bg-indigo-200/50 rounded w-full"></div>
                      <div className="h-2 bg-indigo-200/50 rounded w-3/4"></div>
                    </div>
                  ) : (
                    <div className="text-xs sm:text-sm text-indigo-900/80 leading-relaxed">
                      <MarkdownRenderer content={summary || ''} />
                    </div>
                  )}
                </div>

                {/* Messages */}
                <div className="flex-1 p-4 space-y-5">
                  {chatHistory.length === 0 && (
                    <div className="text-center py-10 opacity-60">
                      <div className="w-12 h-12 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-3">
                         <Bot size={24} className="text-zinc-400"/>
                      </div>
                      <p className="text-sm text-zinc-500">Ask questions about this document.</p>
                      <div className="mt-4 flex flex-wrap justify-center gap-2">
                        {["Explain the main concept", "List key dates", "Summarize in bullets"].map(q => (
                          <button key={q} onClick={() => setChatInput(q)} className="text-xs bg-white border border-zinc-200 px-3 py-1.5 rounded-full hover:border-blue-300 hover:text-blue-600 transition-colors">
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {chatHistory.map((msg, i) => (
                    <div key={i} className={`flex gap-3 animate-fade-in ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold shadow-sm ${msg.role === 'user' ? 'bg-zinc-800 text-white' : 'bg-blue-600 text-white'}`}>
                        {msg.role === 'user' ? 'You' : <Bot size={14}/>}
                      </div>
                      <div className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm shadow-sm ${
                        msg.role === 'user' 
                          ? 'bg-white text-zinc-800 border border-zinc-100 rounded-tr-none' 
                          : 'bg-white text-zinc-700 border border-zinc-100 rounded-tl-none'
                      }`}>
                         <MarkdownRenderer content={msg.text} />
                      </div>
                    </div>
                  ))}
                  
                  {isChatLoading && (
                     <div className="flex gap-2 items-center text-zinc-400 text-xs pl-10">
                        <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce"/>
                        <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce delay-75"/>
                        <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-bounce delay-150"/>
                     </div>
                  )}
                </div>
              </div>
            )}

            {/* --- QUIZ TAB --- */}
            {activeTab === 'quiz' && (
              <div className="p-5">
                {!quizContent && !isQuizLoading && (
                  <div className="text-center py-10 bg-white rounded-2xl border border-dashed border-zinc-300">
                    <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-amber-500">
                      <HelpCircle size={28} />
                    </div>
                    <h3 className="text-zinc-900 font-medium mb-1">Test Your Knowledge</h3>
                    <p className="text-sm text-zinc-500 mb-6 px-4">Generate an instant 5-question multiple choice quiz based on this document.</p>
                    <button onClick={handleGenerateQuiz} className="px-6 py-2.5 bg-zinc-900 text-white text-sm font-medium rounded-xl hover:bg-zinc-800 transition-colors shadow-lg shadow-zinc-200">
                      Generate Quiz
                    </button>
                  </div>
                )}
                
                {isQuizLoading && (
                   <div className="text-center py-20">
                      <div className="w-8 h-8 border-4 border-zinc-200 border-t-amber-500 rounded-full animate-spin mx-auto mb-3"/>
                      <p className="text-sm text-zinc-500">Crafting questions...</p>
                   </div>
                )}

                {quizContent && (
                  <div className="bg-white rounded-2xl p-6 shadow-sm border border-zinc-100">
                    <div className="prose prose-sm prose-zinc max-w-none prose-headings:text-zinc-800 prose-p:text-zinc-600 prose-li:text-zinc-600">
                      <MarkdownRenderer content={quizContent} />
                    </div>
                    <div className="mt-8 pt-6 border-t border-zinc-100 flex gap-3">
                       <button onClick={() => setQuizContent(null)} className="flex-1 py-2.5 text-sm text-zinc-600 font-medium hover:bg-zinc-50 rounded-lg transition-colors">
                          Clear
                       </button>
                       <button onClick={handleGenerateQuiz} className="flex-1 py-2.5 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 transition-colors">
                          New Quiz
                       </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* --- NOTES TAB --- */}
            {activeTab === 'notes' && (
              <div className="h-full flex flex-col p-4">
                <div className="bg-yellow-50/50 border border-yellow-100 rounded-xl flex-1 flex flex-col p-1 shadow-inner">
                   <div className="flex justify-between items-center px-3 py-2 border-b border-yellow-100/50">
                      <span className="text-xs font-bold text-yellow-700 uppercase tracking-wide">Notepad</span>
                      <div className="flex gap-1">
                         <span className="text-[10px] text-yellow-600/60 flex items-center gap-1 mr-2"><CheckCircle size={10}/> Saved</span>
                         <button onClick={handleDownloadNotes} className="p-1 hover:bg-yellow-100 rounded text-yellow-700" title="Download .txt">
                            <Download size={14} />
                         </button>
                      </div>
                   </div>
                   <textarea
                    value={notes}
                    onChange={handleNoteChange}
                    placeholder="Take notes here..."
                    className="flex-1 w-full bg-transparent p-4 text-sm text-zinc-800 placeholder-zinc-400 focus:outline-none resize-none leading-relaxed"
                    spellCheck={false}
                   ></textarea>
                </div>
                <p className="text-center text-[10px] text-zinc-400 mt-2">Notes are stored locally in your browser.</p>
              </div>
            )}
          </div>

          {/* Chat Input Area (Fixed at bottom of sidebar) */}
          {activeTab === 'chat' && (
            <div className="p-4 bg-white border-t border-zinc-100 flex-shrink-0">
              <form onSubmit={(e) => { e.preventDefault(); handleAskAI(); }} className="relative flex items-end gap-2 bg-zinc-50 border border-zinc-200 rounded-xl p-2 transition-shadow focus-within:ring-2 focus-within:ring-blue-100 focus-within:border-blue-300">
                <textarea
                  rows={1}
                  className="w-full bg-transparent text-sm p-2 focus:outline-none resize-none max-h-32 text-zinc-700 placeholder-zinc-400"
                  placeholder="Ask follow-up question..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleAskAI();
                    }
                  }}
                  disabled={isChatLoading}
                  style={{ minHeight: '40px' }}
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim() || isChatLoading}
                  className="p-2 mb-0.5 bg-zinc-900 text-white rounded-lg hover:bg-zinc-700 disabled:bg-zinc-300 disabled:cursor-not-allowed transition-colors"
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