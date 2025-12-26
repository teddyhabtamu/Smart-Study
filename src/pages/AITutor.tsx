
// src/pages/AITutor.tsx

import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Send, Bot, User as UserIcon, Sparkles, Lightbulb, BookOpen, BrainCircuit, Eraser, MessageSquare, Plus, Trash2, Menu, Lock, Settings2, Brain, GraduationCap, X, Download, Mic, MicOff, Loader2, Image as ImageIcon } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import MarkdownRenderer from '../components/MarkdownRenderer';
import { ChatSession } from '../types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import TTSButton from '../components/TTSButton';
import { aiTutorAPI, usersAPI } from '../services/api';

const DEFAULT_WELCOME_MSG = {
  role: 'model',
  text: `### Hello! I'm your Smart Tutor. 
I can help you with:
* Solving complex problems
* Explaining difficult concepts
* Preparing for exams

What would you like to learn today?`
};

const MAX_FREE_PROMPTS = 5;
const SUBJECTS = ['General', 'Mathematics', 'Physics', 'Chemistry', 'Biology', 'English', 'Civics'];

const AITutor: React.FC = () => {
  const { user } = useAuth();
  const { addToast } = useToast();
  const location = useLocation();
  
  // Chat state
  const [messages, setMessages] = useState<{ role: string, text: string }[]>([DEFAULT_WELCOME_MSG]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  // Settings state
  const [showSettings, setShowSettings] = useState(false);
  const [subjectFocus, setSubjectFocus] = useState('General');
  const [deepThinking, setDeepThinking] = useState(false);
  const [userGrade, setUserGrade] = useState<number>(10); // Default to 10, will be updated from user profile

  // Guest usage tracking
  const [guestPromptCount, setGuestPromptCount] = useState(0);

  // History state
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  // Set sidebar open by default on desktop
  useEffect(() => {
    const checkScreenSize = () => {
      if (window.innerWidth >= 768) { // md breakpoint
        setIsHistoryOpen(true);
      }
    };
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false); // closed by default on mobile, open on desktop

  // Set mounted state
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Delete confirmation state
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    sessionId: string | null;
    sessionTitle: string;
  }>({ isOpen: false, sessionId: null, sessionTitle: '' });

  const [mounted, setMounted] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const hasProcessedInitialPrompt = useRef(false);

  // Load chat sessions from backend (for users) and usage count (for guests)
  useEffect(() => {
    const loadData = async () => {
      if (user) {
        try {
          const chatSessions = await aiTutorAPI.getChatSessions();
          setSessions(chatSessions);
        } catch (error) {
          console.error('Failed to load chat sessions:', error);
          // Fallback to localStorage if backend fails
          const savedSessions = localStorage.getItem(`chat_history_${user.id}`);
          if (savedSessions) setSessions(JSON.parse(savedSessions));
        }
      } else {
        // Load guest usage count
        const savedCount = localStorage.getItem('smartstudy_guest_prompts');
        if (savedCount) setGuestPromptCount(parseInt(savedCount, 10));
      }
    };

    loadData();
  }, [user]);

  // Load user's grade level based on their level
  useEffect(() => {
    const loadUserGrade = async () => {
      if (user) {
        try {
          const userProfile = await usersAPI.getProfile();
          // Calculate grade based on user level:
          // Level 1-3: Grade 8-9, Level 4-6: Grade 10-11, Level 7+: Grade 12
          const userLevel = userProfile.level || 1;
          let calculatedGrade = 10; // default

          if (userLevel <= 3) {
            calculatedGrade = 8 + (userLevel - 1); // Level 1 = Grade 8, Level 2 = Grade 9, Level 3 = Grade 9
          } else if (userLevel <= 6) {
            calculatedGrade = 10 + Math.floor((userLevel - 4) / 2); // Level 4-5 = Grade 10, Level 6 = Grade 11
          } else {
            calculatedGrade = 12; // Level 7+ = Grade 12
          }

          setUserGrade(calculatedGrade);
        } catch (error) {
          console.error('Failed to load user grade:', error);
          // Keep default grade of 10
        }
      }
    };

    loadUserGrade();
  }, [user]);

  // Cleanup image preview on unmount
  useEffect(() => {
    return () => {
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  // Handle Initial Prompt from Dashboard
  useEffect(() => {
    const state = location.state as { initialPrompt?: string };
    if (state?.initialPrompt && !hasProcessedInitialPrompt.current) {
      hasProcessedInitialPrompt.current = true;
      handleSend(state.initialPrompt);
      // Clear state to prevent re-sending on refresh
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // Speech Recognition Setup
  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0])
          .map((result) => result.transcript)
          .join('');
        setInput(transcript);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        setIsListening(false);
        addToast("Microphone error. Please check permissions.", "error");
      };
    }
  }, []);


  // Scroll to bottom on new message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  const toggleListening = () => {
    if (!recognitionRef.current) {
      addToast("Speech recognition not supported in this browser.", "info");
      return;
    }

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      setInput('');
      recognitionRef.current.start();
      setIsListening(true);
      inputRef.current?.focus();
    }
  };

  // Start new chat
  const handleNewChat = () => {
    setMessages([DEFAULT_WELCOME_MSG]);
    setActiveSessionId(null);
    if (window.innerWidth < 768) setIsHistoryOpen(false);
  };

  // Select existing session
  const handleSelectSession = (session: ChatSession) => {
    setMessages(session.messages || []);
    setActiveSessionId(session.id);
    if (window.innerWidth < 768) setIsHistoryOpen(false);
  };

  // Show delete confirmation
  const handleDeleteSession = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      setDeleteConfirmation({
        isOpen: true,
        sessionId,
        sessionTitle: session.title
      });
    }
  };

  // Confirm delete session
  const [isDeletingSession, setIsDeletingSession] = useState(false);
  
  const confirmDeleteSession = async () => {
    if (!deleteConfirmation.sessionId) return;

    setIsDeletingSession(true);
    try {
      await aiTutorAPI.deleteChatSession(deleteConfirmation.sessionId);
      const newSessions = sessions.filter(s => s.id !== deleteConfirmation.sessionId);
      setSessions(newSessions);
      if (activeSessionId === deleteConfirmation.sessionId) handleNewChat();
      addToast('Chat session deleted successfully', 'success');
    } catch (error) {
      console.error('Failed to delete session:', error);
      // Fallback: remove from local state
      const newSessions = sessions.filter(s => s.id !== deleteConfirmation.sessionId);
      setSessions(newSessions);
      if (activeSessionId === deleteConfirmation.sessionId) handleNewChat();
      addToast('Failed to delete chat session', 'error');
    } finally {
      setIsDeletingSession(false);
      setDeleteConfirmation({ isOpen: false, sessionId: null, sessionTitle: '' });
    }
  };

  // Save or update session (now simplified since backend handles this)
  const saveSession = async (newMessages: { role: string; text: string }[]) => {
    // The backend now handles session creation and message saving automatically
    // This function is kept for potential future use or fallback scenarios
    if (!user) return;

    try {
      // Just refresh the sessions list to ensure UI is up to date
      const chatSessions = await aiTutorAPI.getChatSessions();
      setSessions(chatSessions);
    } catch (error) {
      console.error('Failed to refresh sessions:', error);
    }
  };

  // Handle image upload and OCR
  const handleImageUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      addToast('Please upload an image file', 'error');
      return;
    }

    setIsProcessingImage(true);
    const previewUrl = URL.createObjectURL(file);
    setImagePreview(previewUrl);

    try {
      // Extract text from image using OCR
      const { text } = await aiTutorAPI.extractTextFromImage(file);
      
      // Put extracted text in input field instead of auto-sending
      if (text && text.trim()) {
        setInput(`[Image with text]\n\n${text}`);
        addToast('Text extracted from image. You can edit and send it.', 'success');
      } else {
        setInput('[Image uploaded - no text detected]');
        addToast('No text could be extracted from the image. You can still add a question.', 'info');
      }
    } catch (error: any) {
      console.error('OCR error:', error);
      addToast(error.message || 'Failed to extract text from image', 'error');
      setImagePreview(null);
    } finally {
      setIsProcessingImage(false);
    }
  };

  // Clear image preview
  const clearImagePreview = () => {
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
      setImagePreview(null);
    }
  };

  // Handle paste event for images
  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      // Check if the pasted item is an image
      if (item.type.indexOf('image') !== -1) {
        e.preventDefault();
        
        const blob = item.getAsFile();
        if (blob) {
          // Convert blob to File object
          const file = new File([blob], `pasted-image-${Date.now()}.png`, { type: blob.type });
          await handleImageUpload(file);
        }
        return;
      }
    }
  };

  // Send message
  const handleSend = async (text: string = input) => {
    if (!text.trim()) return;

    // Check limit for non-authenticated users
    if (!user && guestPromptCount >= MAX_FREE_PROMPTS) {
      return;
    }

    const userMsg = text;
    setInput('');
    clearImagePreview(); // Clear image preview when sending
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    }
    setShowSettings(false); // Close settings if open

    // Increment usage for guests
    if (!user) {
      const newCount = guestPromptCount + 1;
      setGuestPromptCount(newCount);
      localStorage.setItem('smartstudy_guest_prompts', newCount.toString());
    }

    const newHistory = [...messages, { role: 'user', text: userMsg }];
    setMessages(newHistory);
    setIsLoading(true);

    try {
      // Call backend AI tutor so sessions and messages are persisted
      const aiResponse = await aiTutorAPI.chat(
        userMsg,
        subjectFocus,
        userGrade,
        activeSessionId || undefined
      );

      // Set/refresh active session id from backend response
      const newSessionId = aiResponse.sessionId || activeSessionId || null;
      if (newSessionId) {
        setActiveSessionId(newSessionId);
      }

      const finalHistory = [...newHistory, { role: 'model', text: aiResponse.response }];
      // Response received — stop loader before updating UI to avoid lingering dots
      setIsLoading(false);
      setMessages(finalHistory);

      // Refresh sessions list to show saved chat history
      if (user && newSessionId) {
        try {
          const chatSessions = await aiTutorAPI.getChatSessions();
          setSessions(chatSessions);
        } catch (error) {
          console.error('Failed to refresh sessions:', error);
        }
      }
      return;
    } catch (error) {
      console.error('AI response error:', error);
      addToast('Failed to get AI response. Please try again.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportChat = () => {
    if (messages.length <= 1) return;
    
    const content = messages.map(m => `**${m.role === 'user' ? 'You' : 'Smart Tutor'}:**\n${m.text}\n\n`).join('---\n\n');
    const element = document.createElement("a");
    const file = new Blob([content], {type: 'text/markdown'});
    element.href = URL.createObjectURL(file);
    element.download = `tutor_chat_${new Date().toISOString().split('T')[0]}.md`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    
    addToast("Chat history downloaded.", "success");
    setShowSettings(false);
  };

  // Quick suggestion buttons
  const suggestions = [
    { label: "Explain Newton's Laws", icon: BookOpen },
    { label: "Quiz me on Biology", icon: BrainCircuit },
    { label: "Study tips for finals", icon: Lightbulb },
  ];

  const limitReached = !user && guestPromptCount >= MAX_FREE_PROMPTS;

  return (
    <div className="h-[calc(100vh-6rem)] flex gap-1 sm:gap-2 md:gap-4 animate-fade-in relative">
      {/* Mobile Sidebar Backdrop */}
      {user && isHistoryOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-10 md:hidden animate-fade-in"
          onClick={() => setIsHistoryOpen(false)}
        />
      )}

      {/* History Sidebar */}
      {user && (
        <div className={`
          fixed md:static inset-y-0 left-0 z-30 md:z-auto w-72 sm:w-72 md:w-64 bg-white border-r md:border border-zinc-200 rounded-r-2xl md:rounded-2xl shadow-2xl md:shadow-sm transform transition-transform duration-300 ease-in-out flex flex-col
          ${isHistoryOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          md:relative md:transform-none
        `}>
          <div className="p-4 sm:p-3 md:p-4 border-b border-zinc-100 flex items-center justify-between">
            <h3 className="font-bold text-zinc-900 text-sm sm:text-sm">Chat History</h3>
            <button onClick={() => setIsHistoryOpen(false)} className="md:hidden text-zinc-400 hover:text-zinc-900 p-2 rounded-lg hover:bg-zinc-100 transition-colors">
              <X size={18} className="sm:w-5 sm:h-5" />
            </button>
          </div>
          <div className="p-4 sm:p-3">
            <button
              onClick={handleNewChat}
              className="w-full flex items-center gap-2 px-3 sm:px-3 py-3 bg-zinc-900 text-white rounded-lg text-sm font-medium hover:bg-zinc-800 transition-colors"
            >
              <Plus size={16} className="sm:w-4 sm:h-4" /> New Chat
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 sm:px-3 pb-4 sm:pb-3 space-y-2">
            {sessions.length === 0 ? (
              <p className="text-sm text-zinc-400 text-center py-8">No saved chats yet.</p>
            ) : (
              sessions.map(session => (
                <div
                  key={session.id}
                  onClick={() => handleSelectSession(session)}
                  className={`group flex items-center justify-between px-3 sm:px-3 py-3 rounded-lg text-sm cursor-pointer transition-colors ${
                    activeSessionId === session.id
                      ? 'bg-zinc-100 text-zinc-900 font-medium border border-zinc-200'
                      : 'text-zinc-600 hover:bg-zinc-50'
                  }`}
                >
                  <div className="flex items-center gap-3 overflow-hidden min-w-0">
                    <MessageSquare size={14} className="sm:w-4 sm:h-4 flex-shrink-0 text-zinc-400" />
                    <span className="truncate text-sm">{session.title}</span>
                  </div>
                  <button
                    onClick={(e) => handleDeleteSession(e, session.id)}
                    className="opacity-0 group-hover:opacity-100 p-1.5 text-zinc-400 hover:text-red-600 rounded-lg hover:bg-red-50 flex-shrink-0 transition-all"
                  >
                    <Trash2 size={12} className="sm:w-3.5 sm:h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm relative md:ml-0">
        {/* Header */}
        <div className="p-3 sm:p-4 border-b border-zinc-100 flex items-center justify-between bg-white/80 backdrop-blur-md z-10 sticky top-0">
          <div className="flex items-center gap-2 sm:gap-3">
            {user && (
              <button
                onClick={() => setIsHistoryOpen(!isHistoryOpen)}
                className="md:hidden p-2 -ml-2 mr-1 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors border border-transparent hover:border-zinc-200"
                title="Open chat history"
              >
                <Menu size={18} className="sm:w-5 sm:h-5" />
              </button>
            )}
            <div className="w-8 h-8 sm:w-9 sm:h-9 bg-zinc-900 rounded-xl flex items-center justify-center text-white shadow-lg shadow-zinc-900/10">
              <Sparkles size={14} className="sm:w-[18px] sm:h-[18px]" />
            </div>
            <div>
              <h1 className="font-bold text-xs sm:text-sm text-zinc-900 flex items-center gap-1 sm:gap-2">
                Smart Tutor
                {deepThinking && (
                  <span className="flex items-center gap-1 text-[9px] sm:text-[10px] bg-zinc-100 text-zinc-800 px-1 sm:px-1.5 py-0.5 rounded border border-zinc-200">
                    <Brain size={8} className="sm:w-2.5 sm:h-2.5" /> Deep Think
                  </span>
                )}
                {subjectFocus !== 'General' && (
                  <span className="flex items-center gap-1 text-[9px] sm:text-[10px] bg-zinc-100 text-zinc-700 px-1 sm:px-1.5 py-0.5 rounded border border-zinc-200">
                    <GraduationCap size={8} className="sm:w-2.5 sm:h-2.5" /> {subjectFocus}
                  </span>
                )}
              </h1>
              <div className="flex items-center gap-1 sm:gap-1.5">
                <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <p className="text-[9px] sm:text-[10px] text-zinc-500 font-medium">Online</p>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            <div className="relative">
              <button 
                onClick={() => setShowSettings(!showSettings)}
                className={`p-2 rounded-lg transition-colors ${showSettings ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-400 hover:text-zinc-900 hover:bg-zinc-50'}`}
                title="Tutor Settings"
              >
                <Settings2 size={18} />
              </button>
              
              {showSettings && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-zinc-200 rounded-xl shadow-xl z-30 p-4 animate-fade-in-fast">
                   <div className="flex justify-between items-center mb-4">
                     <h3 className="font-bold text-sm text-zinc-900">Tutor Settings</h3>
                     <button onClick={() => setShowSettings(false)} className="text-zinc-400 hover:text-zinc-900"><X size={16} /></button>
                   </div>
                   
                   <div className="space-y-4">
                      <div>
                        <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 block">Subject Focus</label>
                        <div className="grid grid-cols-2 gap-2">
                           {SUBJECTS.map(sub => (
                             <button
                               key={sub}
                               onClick={() => setSubjectFocus(sub)}
                               className={`text-xs px-2 py-1.5 rounded-md border transition-all text-left ${
                                 subjectFocus === sub 
                                   ? 'bg-zinc-900 text-white border-zinc-900' 
                                   : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
                               }`}
                             >
                               {sub}
                             </button>
                           ))}
                        </div>
                      </div>

                      <div className="pt-2 border-t border-zinc-100">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                             <Brain size={16} className={deepThinking ? "text-zinc-900" : "text-zinc-400"} />
                             <div>
                               <p className="text-sm font-medium text-zinc-900">Deep Reasoning</p>
                               <p className="text-[10px] text-zinc-500">For complex STEM problems</p>
                             </div>
                          </div>
                          <button 
                            onClick={() => setDeepThinking(!deepThinking)}
                            className={`w-10 h-6 rounded-full transition-colors relative ${deepThinking ? 'bg-zinc-900' : 'bg-zinc-200'}`}
                          >
                             <div className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${deepThinking ? 'translate-x-4' : ''}`}></div>
                          </button>
                        </div>
                      </div>

                      {messages.length > 1 && (
                        <div className="pt-2 border-t border-zinc-100">
                           <button 
                             onClick={handleExportChat}
                             className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 rounded-lg text-xs font-medium transition-colors"
                           >
                             <Download size={14} /> Export Chat
                           </button>
                        </div>
                      )}
                   </div>
                </div>
              )}
            </div>

            <button 
              onClick={handleNewChat}
              className="p-2 text-zinc-400 hover:text-zinc-900 transition-colors"
              title="Clear Chat"
            >
              <Eraser size={18} />
            </button>
          </div>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-8 space-y-4 sm:space-y-6 md:space-y-8 bg-zinc-50/50" ref={scrollRef}>
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex gap-2 sm:gap-3 md:gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'model' && (
                <div className="flex flex-col gap-2">
                  <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg bg-white border border-zinc-200 flex items-center justify-center flex-shrink-0 shadow-sm mt-1">
                    <Bot size={12} className="sm:w-4 sm:h-4 text-zinc-900" />
                  </div>
                </div>
              )}

              <div className={`max-w-[90%] sm:max-w-[85%] md:max-w-[70%] rounded-2xl p-3 sm:p-4 md:p-5 shadow-sm relative group ${
                msg.role === 'user'
                  ? 'bg-zinc-900 text-white rounded-br-sm'
                  : 'bg-white border border-zinc-200 text-zinc-800 rounded-bl-sm'
              }`}>
                {msg.role === 'user' ? (
                  <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                ) : (
                  <>
                    <MarkdownRenderer content={msg.text} />
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                       <TTSButton text={msg.text} size={12} className="sm:w-3.5 sm:h-3.5 bg-white/80 hover:bg-white shadow-sm" />
                    </div>
                  </>
                )}
              </div>

              {msg.role === 'user' && (
                <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg bg-zinc-200 flex items-center justify-center flex-shrink-0 mt-1">
                  <UserIcon size={12} className="sm:w-4 sm:h-4 text-zinc-600" />
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-2 sm:gap-3 md:gap-4 justify-start animate-fade-in">
              <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-lg bg-white border border-zinc-200 flex items-center justify-center flex-shrink-0 shadow-sm">
                <Bot size={12} className="sm:w-4 sm:h-4 text-zinc-900" />
              </div>
              <div className="px-3 sm:px-4 md:px-5 py-3 sm:py-4 bg-white border border-zinc-200 rounded-2xl rounded-bl-sm shadow-sm flex items-center gap-1 sm:gap-1.5">
                <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 bg-zinc-400 rounded-full animate-bounce"></span>
                <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 bg-zinc-400 rounded-full animate-bounce delay-100"></span>
                <span className="w-1 h-1 sm:w-1.5 sm:h-1.5 bg-zinc-400 rounded-full animate-bounce delay-200"></span>
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-3 sm:p-4 bg-white border-t border-zinc-100">
          <div className="max-w-3xl mx-auto space-y-3 sm:space-y-4">
            {!isLoading && messages.length < 3 && !limitReached && (
              <div className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-2 hide-scrollbar">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(s.label)}
                    className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 sm:py-1.5 bg-zinc-50 border border-zinc-200 rounded-full text-xs font-medium text-zinc-600 hover:bg-zinc-100 hover:border-zinc-300 transition-all whitespace-nowrap"
                  >
                    <s.icon size={10} className="sm:w-3 sm:h-3" />
                    {s.label}
                  </button>
                ))}
              </div>
            )}

            {limitReached ? (
               <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 sm:p-6 text-center">
                 <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm border border-zinc-100">
                    <Lock size={16} className="sm:w-5 sm:h-5 text-zinc-900" />
                 </div>
                 <h3 className="font-bold text-zinc-900 mb-2 text-sm sm:text-base">Free Limit Reached</h3>
                 <p className="text-xs sm:text-sm text-zinc-500 mb-4 sm:mb-6 max-w-sm mx-auto">
                   You've used your 5 free AI Tutor questions. Sign in to your account to continue chatting unlimitedly.
                 </p>
                 <div className="flex flex-col sm:flex-row justify-center gap-2 sm:gap-3">
                    <Link to="/login" className="px-4 sm:px-6 py-2 bg-white border border-zinc-200 text-zinc-700 font-medium rounded-lg hover:bg-zinc-50 transition-colors text-sm">
                      Log In
                    </Link>
                    <Link to="/register" className="px-4 sm:px-6 py-2 bg-zinc-900 text-white font-medium rounded-lg hover:bg-zinc-800 transition-colors text-sm">
                      Create Account
                    </Link>
                 </div>
               </div>
            ) : (
              <form
                onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                className="relative flex gap-1.5 sm:gap-2 items-center"
              >
                {/* Image Preview */}
                {imagePreview && (
                  <div className="absolute bottom-full left-0 mb-2 p-2 bg-white border border-zinc-200 rounded-lg shadow-lg z-10">
                    <div className="relative">
                      <img src={imagePreview} alt="Preview" className="max-w-[200px] max-h-[200px] rounded" />
                      <button
                        type="button"
                        onClick={clearImagePreview}
                        className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                        title="Remove image"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                )}
                <div className="relative flex-1">
                  <input
                    ref={inputRef}
                    type="text"
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl pl-3 sm:pl-4 pr-10 sm:pr-12 py-3 sm:py-3.5 focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-500 transition-all font-medium text-sm placeholder-zinc-400 shadow-sm"
                    placeholder={isListening ? "Listening..." : isProcessingImage ? "Extracting text from image..." : "Ask a question or paste an image..."}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onPaste={handlePaste}
                    disabled={isLoading || isProcessingImage}
                    autoFocus
                  />
                  <div className="absolute right-1.5 sm:right-2 top-1.5 sm:top-2 flex gap-1">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageUpload(file);
                        e.target.value = ''; // Reset input
                      }}
                      className="hidden"
                      id="image-upload-input"
                      disabled={isLoading || isProcessingImage}
                    />
                    <label
                      htmlFor="image-upload-input"
                      className={`p-1 sm:p-1.5 rounded-lg transition-all cursor-pointer ${
                        isProcessingImage
                          ? 'bg-blue-50 text-blue-600 animate-pulse'
                          : 'text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100'
                      } ${isLoading || isProcessingImage ? 'opacity-50 cursor-not-allowed' : ''}`}
                      title="Upload Image with Text"
                    >
                      {isProcessingImage ? (
                        <Loader2 size={14} className="sm:w-4 sm:h-4 animate-spin" />
                      ) : (
                        <ImageIcon size={14} className="sm:w-4 sm:h-4" />
                      )}
                    </label>
                    <button
                      type="button"
                      onClick={toggleListening}
                      className={`p-1 sm:p-1.5 rounded-lg transition-all ${
                        isListening
                          ? 'bg-red-50 text-red-600 animate-pulse'
                          : 'text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100'
                      }`}
                      title="Voice Input"
                    >
                      {isListening ? <MicOff size={14} className="sm:w-4 sm:h-4" /> : <Mic size={14} className="sm:w-4 sm:h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  className="p-3 sm:p-3.5 bg-zinc-900 text-white rounded-xl hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm flex items-center justify-center"
                >
                  {isLoading ? (
                    <Loader2 size={16} className="sm:w-[18px] sm:h-[18px] animate-spin" />
                  ) : (
                    <Send size={16} className="sm:w-[18px] sm:h-[18px]" />
                  )}
                </button>
              </form>
            )}

            <div className="text-center flex flex-col items-center gap-1">
              {!user && !limitReached && (
                 <p className="text-[9px] sm:text-[10px] bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded-full font-medium">
                    {MAX_FREE_PROMPTS - guestPromptCount} free messages remaining
                 </p>
              )}
              <p className="text-xs sm:text-sm text-zinc-400">AI can make mistakes. Please verify important information.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Delete Chat Session Confirmation Modal */}
      {deleteConfirmation.isOpen && mounted && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 bg-zinc-900/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md relative animate-slide-up">
            <div className="p-4 sm:p-6">
              <div className="flex items-start gap-4 mb-4">
                <div className="p-3 rounded-full bg-red-100 text-red-600">
                  <Trash2 size={24} />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-zinc-900 text-lg mb-2">
                    Delete Chat Session?
                  </h3>
                  <p className="text-sm text-zinc-600">
                    Are you sure you want to delete <strong>"{deleteConfirmation.sessionTitle}"</strong>? This action cannot be undone.
                  </p>
                </div>
              </div>
              <div className="flex gap-3 pt-4 border-t border-zinc-100">
                <button
                  onClick={() => setDeleteConfirmation({ isOpen: false, sessionId: null, sessionTitle: '' })}
                  className="flex-1 px-4 py-2.5 bg-white border border-zinc-200 text-zinc-700 font-medium rounded-lg hover:bg-zinc-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeleteSession}
                  disabled={isDeletingSession}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isDeletingSession ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    'Delete'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default AITutor;
