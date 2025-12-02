
// src/pages/AITutor.tsx

import React, { useState, useRef, useEffect } from 'react';
import { generateTutorResponse } from '../services/geminiService';
import { Send, Bot, User as UserIcon, Sparkles, Lightbulb, BookOpen, BrainCircuit, Eraser, MessageSquare, Plus, Trash2, Menu, Lock, Settings2, Brain, GraduationCap, X, Download, Mic, MicOff } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import MarkdownRenderer from '../components/MarkdownRenderer';
import { ChatSession } from '../types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import TTSButton from '../components/TTSButton';

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

  // Settings state
  const [showSettings, setShowSettings] = useState(false);
  const [subjectFocus, setSubjectFocus] = useState('General');
  const [deepThinking, setDeepThinking] = useState(false);

  // Guest usage tracking
  const [guestPromptCount, setGuestPromptCount] = useState(0);

  // History state
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(true); // open by default on desktop

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const hasProcessedInitialPrompt = useRef(false);

  // Load history from localStorage (for users) and usage count (for guests)
  useEffect(() => {
    if (user) {
      const savedSessions = localStorage.getItem(`chat_history_${user.id}`);
      if (savedSessions) setSessions(JSON.parse(savedSessions));
    } else {
      // Load guest usage count
      const savedCount = localStorage.getItem('smartstudy_guest_prompts');
      if (savedCount) setGuestPromptCount(parseInt(savedCount, 10));
    }
  }, [user]);

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

  // Save history whenever sessions change
  useEffect(() => {
    if (user) {
      localStorage.setItem(`chat_history_${user.id}`, JSON.stringify(sessions));
    }
  }, [sessions, user]);

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
    setMessages(session.messages);
    setActiveSessionId(session.id);
    if (window.innerWidth < 768) setIsHistoryOpen(false);
  };

  // Delete session
  const handleDeleteSession = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (window.confirm("Delete this chat history?")) {
      const newSessions = sessions.filter(s => s.id !== sessionId);
      setSessions(newSessions);
      if (activeSessionId === sessionId) handleNewChat();
      localStorage.setItem(`chat_history_${user?.id}`, JSON.stringify(newSessions));
    }
  };

  // Save or update session
  const saveSession = (newMessages: { role: string; text: string }[]) => {
    if (!user) return;

    if (activeSessionId) {
      // Update existing session
      setSessions(prev => prev.map(s =>
        s.id === activeSessionId ? { ...s, messages: newMessages } : s
      ));
    } else {
      // Create new session (after first user message)
      if (newMessages.length === 2 && newMessages[1].role === 'user') {
        const firstUserMsg = newMessages[1].text;
        const title = firstUserMsg.length > 30 ? firstUserMsg.substring(0, 30) + '...' : firstUserMsg;

        const newSession: ChatSession = {
          id: Date.now().toString(),
          title: title,
          date: new Date().toISOString(),
          messages: newMessages
        };

        setSessions(prev => [newSession, ...prev]);
        setActiveSessionId(newSession.id);
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

    // Save session optimistically
    saveSession(newHistory);

    // Call AI service with options
    const response = await generateTutorResponse(messages, userMsg, {
      subject: subjectFocus,
      deepThinking: deepThinking
    });

    const finalHistory = [...newHistory, { role: 'model', text: response }];
    setMessages(finalHistory);
    setIsLoading(false);

    // Save final response
    saveSession(finalHistory);
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
    <div className="h-[calc(100vh-6rem)] flex gap-4 animate-fade-in relative">
      {/* History Sidebar */}
      {user && (
        <div className={`
          absolute md:static inset-y-0 left-0 z-20 w-64 bg-white border border-zinc-200 rounded-2xl shadow-lg md:shadow-sm transform transition-transform duration-300 flex flex-col
          ${isHistoryOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0 md:w-0 md:border-0 md:overflow-hidden'}
        `}>
          <div className="p-4 border-b border-zinc-100 flex items-center justify-between">
            <h3 className="font-bold text-zinc-900 text-sm">Chat History</h3>
            <button onClick={() => setIsHistoryOpen(false)} className="md:hidden text-zinc-400">
              <Menu size={18} />
            </button>
          </div>
          <div className="p-3">
            <button 
              onClick={handleNewChat}
              className="w-full flex items-center gap-2 px-3 py-2 bg-zinc-900 text-white rounded-lg text-sm font-medium hover:bg-zinc-800 transition-colors"
            >
              <Plus size={16} /> New Chat
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-1">
            {sessions.length === 0 ? (
              <p className="text-xs text-zinc-400 text-center py-4">No saved chats yet.</p>
            ) : (
              sessions.map(session => (
                <div 
                  key={session.id}
                  onClick={() => handleSelectSession(session)}
                  className={`group flex items-center justify-between px-3 py-2.5 rounded-lg text-sm cursor-pointer transition-colors ${
                    activeSessionId === session.id 
                      ? 'bg-zinc-100 text-zinc-900 font-medium' 
                      : 'text-zinc-600 hover:bg-zinc-50'
                  }`}
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <MessageSquare size={14} className="flex-shrink-0" />
                    <span className="truncate">{session.title}</span>
                  </div>
                  <button 
                    onClick={(e) => handleDeleteSession(e, session.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-zinc-400 hover:text-red-600 rounded"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm relative">
        {/* Header */}
        <div className="p-4 border-b border-zinc-100 flex items-center justify-between bg-white/80 backdrop-blur-md z-10 sticky top-0">
          <div className="flex items-center gap-3">
            {user && (
              <button 
                onClick={() => setIsHistoryOpen(!isHistoryOpen)}
                className="p-2 -ml-2 mr-1 text-zinc-500 hover:bg-zinc-100 rounded-lg md:hidden"
              >
                <Menu size={20} />
              </button>
            )}
            <div className="w-9 h-9 bg-zinc-900 rounded-xl flex items-center justify-center text-white shadow-lg shadow-zinc-900/10">
              <Sparkles size={18} />
            </div>
            <div>
              <h1 className="font-bold text-sm text-zinc-900 flex items-center gap-2">
                Smart Tutor
                {deepThinking && (
                  <span className="flex items-center gap-1 text-[10px] bg-zinc-100 text-zinc-800 px-1.5 py-0.5 rounded border border-zinc-200">
                    <Brain size={10} /> Deep Think
                  </span>
                )}
                {subjectFocus !== 'General' && (
                  <span className="flex items-center gap-1 text-[10px] bg-zinc-100 text-zinc-700 px-1.5 py-0.5 rounded border border-zinc-200">
                    <GraduationCap size={10} /> {subjectFocus}
                  </span>
                )}
              </h1>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                <p className="text-[10px] text-zinc-500 font-medium">Online</p>
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
        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 bg-zinc-50/50" ref={scrollRef}>
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'model' && (
                <div className="flex flex-col gap-2">
                  <div className="w-8 h-8 rounded-lg bg-white border border-zinc-200 flex items-center justify-center flex-shrink-0 shadow-sm mt-1">
                    <Bot size={16} className="text-zinc-900" />
                  </div>
                </div>
              )}
              
              <div className={`max-w-[85%] md:max-w-[70%] rounded-2xl p-5 shadow-sm relative group ${
                msg.role === 'user' 
                  ? 'bg-zinc-900 text-white rounded-br-sm' 
                  : 'bg-white border border-zinc-200 text-zinc-800 rounded-bl-sm'
              }`}>
                {msg.role === 'user' ? (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                ) : (
                  <>
                    <MarkdownRenderer content={msg.text} />
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                       <TTSButton text={msg.text} size={14} quality="high" className="bg-white/80 hover:bg-white shadow-sm" />
                    </div>
                  </>
                )}
              </div>

              {msg.role === 'user' && (
                <div className="w-8 h-8 rounded-lg bg-zinc-200 flex items-center justify-center flex-shrink-0 mt-1">
                  <UserIcon size={16} className="text-zinc-600" />
                </div>
              )}
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-4 justify-start animate-fade-in">
              <div className="w-8 h-8 rounded-lg bg-white border border-zinc-200 flex items-center justify-center flex-shrink-0 shadow-sm">
                <Bot size={16} className="text-zinc-900" />
              </div>
              <div className="px-5 py-4 bg-white border border-zinc-200 rounded-2xl rounded-bl-sm shadow-sm flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce"></span>
                <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce delay-100"></span>
                <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce delay-200"></span>
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 bg-white border-t border-zinc-100">
          <div className="max-w-3xl mx-auto space-y-4">
            {!isLoading && messages.length < 3 && !limitReached && (
              <div className="flex gap-2 overflow-x-auto pb-2 hide-scrollbar">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => handleSend(s.label)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-zinc-50 border border-zinc-200 rounded-full text-xs font-medium text-zinc-600 hover:bg-zinc-100 hover:border-zinc-300 transition-all whitespace-nowrap"
                  >
                    <s.icon size={12} />
                    {s.label}
                  </button>
                ))}
              </div>
            )}

            {limitReached ? (
               <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-6 text-center">
                 <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto mb-3 shadow-sm border border-zinc-100">
                    <Lock size={20} className="text-zinc-900" />
                 </div>
                 <h3 className="font-bold text-zinc-900 mb-2">Free Limit Reached</h3>
                 <p className="text-sm text-zinc-500 mb-6 max-w-sm mx-auto">
                   You've used your 5 free AI Tutor questions. Sign in to your account to continue chatting unlimitedly.
                 </p>
                 <div className="flex justify-center gap-3">
                    <Link to="/login" className="px-6 py-2 bg-white border border-zinc-200 text-zinc-700 font-medium rounded-lg hover:bg-zinc-50 transition-colors text-sm">
                      Log In
                    </Link>
                    <Link to="/register" className="px-6 py-2 bg-zinc-900 text-white font-medium rounded-lg hover:bg-zinc-800 transition-colors text-sm">
                      Create Account
                    </Link>
                 </div>
               </div>
            ) : (
              <form 
                onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                className="relative flex gap-2 items-center"
              >
                <div className="relative flex-1">
                  <input
                    ref={inputRef}
                    type="text"
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl pl-4 pr-12 py-3.5 focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-500 transition-all font-medium text-sm placeholder-zinc-400 shadow-sm"
                    placeholder={isListening ? "Listening..." : "Ask a question..."}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    disabled={isLoading}
                    autoFocus
                  />
                  <div className="absolute right-2 top-2 flex gap-1">
                    <button 
                      type="button"
                      onClick={toggleListening}
                      className={`p-1.5 rounded-lg transition-all ${
                        isListening 
                          ? 'bg-red-50 text-red-600 animate-pulse' 
                          : 'text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100'
                      }`}
                      title="Voice Input"
                    >
                      {isListening ? <MicOff size={16} /> : <Mic size={16} />}
                    </button>
                  </div>
                </div>
                
                <button 
                  type="submit"
                  disabled={isLoading || !input.trim()}
                  className="p-3.5 bg-zinc-900 text-white rounded-xl hover:bg-zinc-800 disabled:opacity-50 transition-all shadow-sm"
                >
                  <Send size={18} />
                </button>
              </form>
            )}

            <div className="text-center flex flex-col items-center gap-1">
              {!user && !limitReached && (
                 <p className="text-[10px] bg-zinc-100 text-zinc-700 px-2 py-0.5 rounded-full font-medium">
                    {MAX_FREE_PROMPTS - guestPromptCount} free messages remaining
                 </p>
              )}
              <p className="text-sm text-zinc-400">AI can make mistakes. Please verify important information.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AITutor;
