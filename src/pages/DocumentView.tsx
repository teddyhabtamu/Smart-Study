import React, { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Download, MessageSquare, ChevronLeft, Lock, FileText, Send, Bot,
  HelpCircle, Bookmark, LogIn, UserPlus, Sparkles, Eye,
  Maximize, Minimize, CheckCircle, Loader2, Image as ImageIcon, X,
  ExternalLink, Share2, CalendarDays
} from 'lucide-react';
import { documentsAPI, aiTutorAPI } from '../services/api';
import MarkdownRenderer from '../components/MarkdownRenderer';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import TTSButton from '../components/TTSButton';
import { stripForSpeech } from '../utils/textUtils';
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
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const [quizContent, setQuizContent] = useState<string | null>(null);
  const [isQuizLoading, setIsQuizLoading] = useState(false);

  const [notes, setNotes] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [isRestricted, setIsRestricted] = useState(false);
  const [isBookmarking, setIsBookmarking] = useState(false);

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
        // Fresh doc: drop the previous doc's AI summary immediately so it
        // never renders under the new title (regenerated below on success)
        setSummary(null);
        setIsSummaryLoading(false);
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

  // --- GUEST RESTRICTION LOGIC (per-feature session counter) ---
  // NOTE: docs and videos use SEPARATE keys. They previously shared one
  // localStorage counter, so watching a video consumed document previews
  // and vice versa. sessionStorage matches the "for this session" copy —
  // localStorage would persist the lock across sessions.
  useEffect(() => {
    if (!doc) return;
    if (!user) {
      const views = parseInt(sessionStorage.getItem('smartstudy_guest_doc_views') || '0');
      if (views >= 2) { // Allow 2 free views
        setIsRestricted(true);
      } else {
        sessionStorage.setItem('smartstudy_guest_doc_views', (views + 1).toString());
      }
    } else {
      setIsRestricted(false);
    }
  }, [user, doc]);

  // --- LOAD FEATURES (Notes, Chat) ---
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
    }
  }, [doc, isRestricted]);

  // --- AI SUMMARY (separate effect: cancellable, correct grade) ---
  // Uses the DOCUMENT's grade (a hardcoded 10 was sent before) and ignores
  // late responses from a previous doc (stale summary under a new title).
  useEffect(() => {
    if (!doc || isRestricted || summary) return;
    let cancelled = false;
    setIsSummaryLoading(true);
    aiTutorAPI.chat(`Provide a concise 3-sentence summary of the document titled: "${doc.title}". Description: ${doc.description}`, doc.subject, doc.grade)
      .then(res => {
        if (cancelled) return;
        setSummary(res.response);
        setIsSummaryLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setSummary('Summary unavailable.');
        setIsSummaryLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, isRestricted]);

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

  // Cleanup image preview on unmount
  useEffect(() => {
    return () => {
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

  // --- HANDLERS ---
  const handleImageUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      addToast('Please upload an image file', 'error');
      return;
    }

    if (!doc) return;

    setIsProcessingImage(true);
    const previewUrl = URL.createObjectURL(file);
    setImagePreview(previewUrl);

    try {
      // Extract text from image using OCR
      const { text } = await aiTutorAPI.extractTextFromImage(file);
      
      // Put extracted text in input field instead of auto-sending
      if (text && text.trim()) {
        setChatInput(`[Image with text]\n\n${text}`);
        addToast('Text extracted from image. You can edit and send it.', 'success');
      } else {
        // Leave the input empty: sending a literal placeholder to the model
        // would waste the user's message on junk text.
        setChatInput('');
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

  const handleAskAI = async () => {
    if (!chatInput.trim() || !doc) return;
    const userMsg = chatInput;
    setChatInput('');
    clearImagePreview(); // Clear image preview when sending
    setChatHistory(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsChatLoading(true);

    try {
      const context = `Context: Document "${doc.title}" (Grade ${doc.grade}, Subject: ${doc.subject}). Desc: ${doc.description}`;
      const fullPrompt = `${context}\n\nQuestion: ${userMsg}`;
      const response = await aiTutorAPI.chat(fullPrompt, doc.subject, doc.grade);
      setChatHistory(prev => [...prev, { role: 'model', text: response.response }]);
    } catch (error: any) {
      // Toast only: persisting an "Error: ..." string as a model message
      // would re-render it as a tutor answer on every revisit.
      console.error('AI chat error in DocumentView:', error);
      addToast(error.message || 'I encountered an error processing your request.', 'error');
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleGenerateQuiz = async () => {
    if (!doc) return;
    setIsQuizLoading(true);
    try {
      const prompt = `Create a 5-question multiple choice quiz based on: "${doc.title}" - ${doc.description}. Format with Markdown.`;
      const response = await aiTutorAPI.chat(prompt, doc.subject, doc.grade);
      setQuizContent(response.response);
    } catch (error: any) {
      console.error('Quiz generation error in DocumentView:', error);
      setQuizContent(`Could not generate quiz: ${error.message || 'Please try again.'}`);
    } finally {
      setIsQuizLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!doc?.file_url && !doc?.id) {
      addToast("No file available.", "error");
      return;
    }
    setIsDownloading(true);
    try {
      if (user && doc) {
        // Authenticated: go through the download endpoint so the count
        // increments and premium is re-checked server-side. (Previously the
        // endpoint existed but nothing called it — counts were frozen.)
        const { downloadUrl } = await documentsAPI.download(doc.id);
        const opened = window.open(downloadUrl || doc.file_url, '_blank');
        if (!opened) {
          addToast("Pop-up blocked — allow pop-ups to download the file.", "error");
        } else {
          addToast("Download started.", "success");
        }
      } else if (doc?.file_url) {
        // Guests have no download endpoint (auth required): open directly.
        const opened = window.open(doc.file_url, '_blank');
        if (!opened) {
          addToast("Pop-up blocked — allow pop-ups to download the file.", "error");
        } else {
          addToast("Download started.", "success");
        }
      }
    } catch (error: any) {
      console.error('Download failed:', error);
      addToast(error.message || "Download failed.", "error");
    } finally {
      setIsDownloading(false);
    }
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
    // Release the blob URL — otherwise every download leaks until reload
    setTimeout(() => URL.revokeObjectURL(element.href), 1000);
    addToast("Notes saved to device.", "success");
  };

  // --- RENDER HELPERS ---
  const handleShare = async () => {
    const shareUrl = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: doc?.title ?? 'SmartStudy document', url: shareUrl });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        addToast('Link copied to clipboard.', 'success');
      }
    } catch {
      // User dismissed the share sheet — not an error worth surfacing.
    }
  };

  const handleToggleBookmark = async () => {
    if (!user || !doc) {
      addToast('Sign in to save documents.', 'info');
      return;
    }
    setIsBookmarking(true);
    try {
      await toggleBookmark(doc.id, 'document');
    } catch (error) {
      console.error('Failed to toggle bookmark:', error);
    } finally {
      setIsBookmarking(false);
    }
  };

  if (loading) {
    return <DocumentViewSkeleton />;
  }

  if (error || !doc) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="bg-red-50 p-4 rounded-full mb-4"><FileText className="text-red-500" size={32} /></div>
        <h3 className="text-xl font-bold text-zinc-900 mb-2">Document Unavailable</h3>
        <p className="text-zinc-500 mb-6">{error || "This document could not be found."}</p>
        <Link to={doc?.tags && Array.isArray(doc.tags) && doc.tags.some((t: string) => t.toLowerCase() === 'past-exam') ? "/past-exams" : "/library"} className="px-6 py-2 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 transition-colors">
          Return to {doc?.tags && Array.isArray(doc.tags) && doc.tags.some((t: string) => t.toLowerCase() === 'past-exam') ? "Past Exams" : "Library"}
        </Link>
      </div>
    );
  }

  if (isRestricted) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-6 animate-fade-in text-center">
        <div className="bg-white border border-zinc-200 rounded-3xl p-12 shadow-xl max-w-lg mx-auto relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-2 bg-zinc-900"></div>
          <div className="w-20 h-20 bg-zinc-50 rounded-full flex items-center justify-center mx-auto mb-6 text-zinc-900 shadow-inner">
            <Lock size={32} />
          </div>
          <h2 className="text-2xl font-bold text-zinc-900 mb-3">Preview Limit Reached</h2>
          <p className="text-zinc-500 mb-8 leading-relaxed">
            You've viewed your free documents for this session. <br />
            Sign in to unlock full access to our library and AI tools.
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
    <div className="min-h-screen bg-zinc-100">
      {/* 1. HEADER BAR */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-zinc-200">
        <div className="max-w-[1440px] mx-auto flex items-center gap-2 sm:gap-3 px-3 sm:px-5 py-2.5">
          <Link
            to={doc.tags && Array.isArray(doc.tags) && doc.tags.some((t: string) => t.toLowerCase() === 'past-exam') ? "/past-exams" : "/library"}
            className="p-2 -ml-1 rounded-xl hover:bg-zinc-100 text-zinc-500 hover:text-zinc-900 transition-colors flex-shrink-0"
            aria-label="Back to library"
          >
            <ChevronLeft size={20} />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="text-sm sm:text-lg font-bold text-zinc-900 truncate leading-tight">{doc.title}</h1>
            <div className="flex items-center gap-1.5 mt-1 text-[11px] sm:text-xs text-zinc-500">
              <span className="px-2 py-0.5 bg-zinc-900 text-white rounded-full font-semibold truncate max-w-[140px] sm:max-w-none">{doc.subject}</span>
              <span className="hidden min-[420px]:inline text-zinc-300">•</span>
              <span className="hidden min-[420px]:inline whitespace-nowrap">{doc.grade === 0 ? 'General' : `Grade ${doc.grade}`}</span>
              <span className="hidden md:inline text-zinc-300">•</span>
              <span className="hidden md:inline px-2 py-0.5 bg-zinc-100 rounded-full font-semibold text-zinc-600">{doc.file_type}</span>
              {doc.is_premium && (
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full font-semibold">
                  <Lock size={10} /> Pro
                </span>
              )}
            </div>
          </div>

          {/* Actions — icon buttons on all sizes, labels on desktop */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={handleShare}
              className="p-2.5 rounded-xl text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
              title="Share this document"
              aria-label="Share this document"
            >
              <Share2 size={18} />
            </button>
            <button
              onClick={handleToggleBookmark}
              disabled={isBookmarking}
              className={`p-2.5 rounded-xl transition-colors border disabled:opacity-50 disabled:cursor-not-allowed ${
                isBookmarked
                  ? 'bg-amber-50 border-amber-200 text-amber-600'
                  : 'bg-white border-zinc-200 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900'
              }`}
              title={isBookmarked ? "Remove from saved" : "Save for later"}
              aria-label={isBookmarked ? "Remove from saved" : "Save for later"}
            >
              {isBookmarking ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Bookmark size={18} className={isBookmarked ? "fill-current" : ""} />
              )}
            </button>
            {canDownload ? (
              <button
                onClick={handleDownload}
                disabled={isDownloading}
                className="flex items-center gap-2 pl-3 pr-3 sm:pl-4 sm:pr-5 py-2.5 bg-zinc-900 text-white rounded-xl hover:bg-zinc-700 disabled:opacity-70 transition-all shadow-sm text-sm"
              >
                {isDownloading ? <span className="animate-spin w-4 h-4 border-2 border-white/30 border-t-white rounded-full" /> : <Download size={17} />}
                <span className="font-semibold hidden sm:inline">Download</span>
              </button>
            ) : (
              <Link to="/subscription" className="flex items-center gap-1.5 px-3 sm:px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl hover:opacity-90 transition-all shadow-sm text-sm font-semibold">
                <Lock size={15} /> <span className="hidden sm:inline">Unlock</span><span className="sm:hidden">Pro</span>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* 2. MOBILE VIEW TOGGLE */}
      <div className="lg:hidden sticky top-[57px] sm:top-[65px] z-20 px-3 py-2 bg-zinc-100/95 backdrop-blur">
        <div className="flex p-1 bg-white border border-zinc-200 rounded-xl shadow-sm">
          <button
            onClick={() => setMobileView('doc')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[13px] font-semibold rounded-lg transition-all ${
              mobileView === 'doc' ? 'bg-zinc-900 text-white shadow' : 'text-zinc-500'
            }`}
          >
            <Eye size={15} /> Read
          </button>
          <button
            onClick={() => setMobileView('tools')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[13px] font-semibold rounded-lg transition-all ${
              mobileView === 'tools' ? 'bg-zinc-900 text-white shadow' : 'text-zinc-500'
            }`}
          >
            <Sparkles size={15} /> AI Tools
          </button>
        </div>
      </div>

      {/* 3. MAIN CONTENT */}
      <main className="max-w-[1440px] mx-auto w-full px-3 sm:px-5 py-4 sm:py-6 grid gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_400px] items-start">

        {/* LEFT: VIEWER + ABOUT */}
        <section className={`min-w-0 space-y-4 sm:space-y-6 ${mobileView === 'tools' ? 'hidden lg:block' : 'block'}`}>

          {/* Viewer card */}
          <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden">
            {/* Viewer toolbar */}
            <div className="flex items-center gap-2 px-3 sm:px-4 h-12 border-b border-zinc-100">
              <span className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-500 uppercase tracking-wider">
                <Eye size={13} /> Preview
              </span>
              <span className="px-2 py-0.5 bg-zinc-100 rounded-md text-[11px] font-bold text-zinc-600">{doc.file_type}</span>
              <div className="flex-1" />
              {previewUrl && (
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 rounded-lg text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
                  title="Open in new tab"
                  aria-label="Open preview in new tab"
                >
                  <ExternalLink size={16} />
                </a>
              )}
              <button
                onClick={toggleFullScreen}
                className="p-2 rounded-lg text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 transition-colors"
                title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              >
                {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
              </button>
            </div>

            {/* Preview area */}
            <div
              ref={docPreviewRef}
              className={isFullscreen ? 'fixed inset-0 z-[100] bg-zinc-950 flex flex-col' : 'relative bg-zinc-200/60'}
            >
              {isFullscreen && (
                <div className="flex items-center justify-between gap-3 px-4 sm:px-6 h-14 bg-zinc-950 text-white flex-shrink-0">
                  <span className="font-semibold text-sm truncate">{doc.title}</span>
                  <button onClick={toggleFullScreen} className="p-2 hover:bg-white/10 rounded-full flex-shrink-0" aria-label="Exit fullscreen">
                    <Minimize size={20} />
                  </button>
                </div>
              )}

              {previewUrl ? (
                <iframe
                  src={previewUrl}
                  className={`w-full border-0 bg-white ${isFullscreen ? 'flex-1' : 'h-[62vh] sm:h-[68vh] lg:h-[74vh]'}`}
                  allowFullScreen
                  title={`${doc.title} preview`}
                />
              ) : (
                <div className="w-full h-[50vh] sm:h-[60vh] flex flex-col items-center justify-center bg-white p-8 text-center">
                  <div className="w-20 h-20 bg-zinc-100 rounded-3xl flex items-center justify-center mb-4">
                    <FileText size={36} className="text-zinc-400" />
                  </div>
                  <h3 className="text-lg font-bold text-zinc-900">Preview unavailable</h3>
                  <p className="text-zinc-500 max-w-xs mt-2 text-sm">This file type can't be previewed in the browser. Download it to read the full document.</p>
                  {canDownload && (
                    <button onClick={handleDownload} className="mt-6 px-5 py-2.5 bg-zinc-900 hover:bg-zinc-700 text-white text-sm font-semibold rounded-xl transition-colors">
                      Download file
                    </button>
                  )}
                </div>
              )}

              {/* Premium gate: one rule for everyone. Premium documents require
                  Pro to preview — guests AND free accounts alike. (Previously
                  only guests were blocked while free users could read the full
                  text, contradicting the locks everywhere else.) */}
              {!canDownload && previewUrl && (
                <div className="absolute inset-0 bg-white/85 backdrop-blur-md flex flex-col items-center justify-center z-20 p-6 text-center">
                  <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-200 mb-4">
                    <Lock size={26} className="text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-zinc-900">Premium document</h3>
                  <p className="text-zinc-500 mb-6 mt-1 max-w-xs text-sm">This document is exclusive to Student Pro members.</p>
                  <div className="flex flex-col sm:flex-row gap-2.5 w-full sm:w-auto">
                    {!user && (
                      <Link to="/login" className="px-8 py-3 bg-white border border-zinc-300 text-zinc-900 rounded-xl font-semibold hover:bg-zinc-50 transition-colors flex items-center justify-center gap-2 text-sm">
                        <LogIn size={16} /> Sign in
                      </Link>
                    )}
                    <Link to="/subscription" className="px-8 py-3 bg-zinc-900 text-white rounded-xl font-semibold hover:bg-zinc-700 transition-colors text-sm">
                      Go Pro to unlock
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* About this document */}
          <div className="bg-white border border-zinc-200 rounded-2xl shadow-sm p-4 sm:p-6">
            <h2 className="text-base sm:text-lg font-bold text-zinc-900">{doc.title}</h2>
            {doc.description && (
              <p className="text-sm text-zinc-600 leading-relaxed mt-2">{doc.description}</p>
            )}
            <div className="flex flex-wrap gap-x-5 gap-y-2 mt-4 text-[13px] text-zinc-500">
              <span className="inline-flex items-center gap-1.5">
                <Download size={14} className="text-zinc-400" />
                {doc.downloads ?? 0} downloads
              </span>
              {doc.uploadedAt && (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays size={14} className="text-zinc-400" />
                  {new Date(doc.uploadedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
                </span>
              )}
              {doc.author && (
                <span className="inline-flex items-center gap-1.5">
                  <FileText size={14} className="text-zinc-400" />
                  {doc.author}
                </span>
              )}
            </div>
            {doc.tags && doc.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-4">
                {doc.tags.map((tag) => (
                  <span key={tag} className="px-2.5 py-1 bg-zinc-100 text-zinc-600 rounded-full text-xs font-medium">
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* RIGHT: AI TOOLS */}
        <aside className={`min-w-0 lg:sticky lg:top-[136px] flex-col bg-white border border-zinc-200 rounded-2xl shadow-sm overflow-hidden ${mobileView === 'doc' ? 'hidden lg:flex' : 'flex'}`}>

          {/* Tool tabs */}
          <div className="p-2.5 pb-0">
            <div className="flex p-1 bg-zinc-100 rounded-xl" role="tablist" aria-label="Study tools">
              {[
                { id: 'chat', icon: MessageSquare, label: 'Tutor' },
                { id: 'quiz', icon: HelpCircle, label: 'Quiz' },
                { id: 'notes', icon: FileText, label: 'Notes' }
              ].map((tab) => (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex-1 py-2 text-[13px] font-semibold flex items-center justify-center gap-1.5 rounded-lg transition-all ${
                    activeTab === tab.id
                      ? 'bg-white text-zinc-900 shadow-sm'
                      : 'text-zinc-500 hover:text-zinc-800'
                  }`}
                >
                  <tab.icon size={15} /> {tab.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tool Content Area */}
          <div className="h-[54vh] lg:h-[58vh] overflow-y-auto" ref={scrollRef}>
            
            {/* --- CHAT TAB --- */}
            {activeTab === 'chat' && (
              <div className="flex flex-col min-h-full px-4 py-4">
                {/* Summary Card */}
                <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3.5 mb-4">
                  <div className="flex justify-between items-center mb-1.5">
                    <h4 className="text-[11px] font-bold text-zinc-700 uppercase tracking-wider flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-lg bg-zinc-900 flex items-center justify-center">
                        <Sparkles size={11} className="text-amber-400" />
                      </span>
                      AI Summary
                    </h4>
                    {summary && <TTSButton text={stripForSpeech(summary)} size={14} className="text-zinc-400 hover:text-zinc-900" />}
                  </div>
                  {isSummaryLoading ? (
                    <div className="space-y-2 animate-pulse py-1">
                      <div className="h-2 bg-zinc-200 rounded w-full"></div>
                      <div className="h-2 bg-zinc-200 rounded w-3/4"></div>
                    </div>
                  ) : (
                    <div className="text-[13px] text-zinc-700 leading-relaxed">
                      <MarkdownRenderer content={summary || ''} />
                    </div>
                  )}
                </div>

                {/* Messages */}
                <div className="flex-1 space-y-4">
                  {chatHistory.length === 0 && (
                    <div className="text-center py-8">
                      <div className="w-12 h-12 bg-zinc-900 rounded-2xl flex items-center justify-center mx-auto mb-3">
                        <Bot size={22} className="text-amber-400" />
                      </div>
                      <p className="text-sm font-semibold text-zinc-800">Ask about this document</p>
                      <p className="text-xs text-zinc-500 mt-1 mb-4">Explanations, key points, summaries.</p>
                      <div className="flex flex-wrap justify-center gap-2">
                        {["Explain the main concept", "List key dates", "Summarize in bullets"].map(q => (
                          <button key={q} onClick={() => setChatInput(q)} className="text-xs bg-white border border-zinc-200 px-3 py-1.5 rounded-full hover:border-zinc-900 hover:text-zinc-900 text-zinc-600 transition-colors">
                            {q}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {chatHistory.map((msg, i) => (
                    msg.role === 'user' ? (
                      <div key={i} className="flex justify-end animate-fade-in">
                        <div className="max-w-[88%] px-3.5 py-2.5 rounded-2xl rounded-br-md bg-zinc-900 text-white text-sm leading-relaxed shadow-sm">
                          <MarkdownRenderer content={msg.text} />
                        </div>
                      </div>
                    ) : (
                      <div key={i} className="flex gap-2.5 animate-fade-in">
                        <div className="w-7 h-7 rounded-full bg-zinc-900 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Bot size={14} className="text-amber-400" />
                        </div>
                        <div className="max-w-[88%] px-3.5 py-2.5 rounded-2xl rounded-tl-md bg-white text-zinc-800 border border-zinc-200 text-sm leading-relaxed shadow-sm">
                          <MarkdownRenderer content={msg.text} />
                        </div>
                      </div>
                    )
                  ))}

                  {isChatLoading && (
                    <div className="flex gap-2 items-center text-zinc-400 text-xs pl-10">
                      <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce" />
                      <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce delay-75" />
                      <span className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce delay-150" />
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* --- QUIZ TAB --- */}
            {activeTab === 'quiz' && (
              <div className="px-4 py-4">
                {!quizContent && !isQuizLoading && (
                  <div className="text-center py-10 px-4 bg-zinc-50 rounded-2xl border border-dashed border-zinc-300">
                    <div className="p-3.5 bg-amber-100 rounded-2xl inline-flex items-center justify-center mb-3 text-amber-600">
                      <HelpCircle size={26} />
                    </div>
                    <h3 className="text-zinc-900 font-bold">Test your knowledge</h3>
                    <p className="text-[13px] text-zinc-500 mb-5 mt-1">Generate an instant 5-question quiz from this document.</p>
                    <button
                      onClick={handleGenerateQuiz}
                      disabled={isQuizLoading}
                      className="mx-auto px-6 py-2.5 bg-zinc-900 text-white text-sm font-semibold rounded-xl hover:bg-zinc-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {isQuizLoading ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          Generating...
                        </>
                      ) : (
                        'Generate quiz'
                      )}
                    </button>
                  </div>
                )}

                {isQuizLoading && (
                  <div className="text-center py-16">
                    <div className="w-8 h-8 border-[3px] border-zinc-200 border-t-amber-500 rounded-full animate-spin mx-auto mb-3" />
                    <p className="text-sm text-zinc-500">Crafting questions...</p>
                  </div>
                )}

                {quizContent && (
                  <div className="bg-white rounded-2xl border border-zinc-200 p-5 shadow-sm">
                    <div className="prose prose-sm prose-zinc max-w-none prose-headings:text-zinc-800 prose-p:text-zinc-600 prose-li:text-zinc-600">
                      <MarkdownRenderer content={quizContent} />
                    </div>
                    <div className="mt-6 pt-4 border-t border-zinc-100 flex gap-2">
                      <button onClick={() => setQuizContent(null)} className="flex-1 py-2.5 text-sm text-zinc-500 font-semibold hover:bg-zinc-100 rounded-xl transition-colors">
                        Clear
                      </button>
                      <button
                        onClick={handleGenerateQuiz}
                        disabled={isQuizLoading}
                        className="flex-1 py-2.5 bg-zinc-900 text-white text-sm font-semibold rounded-xl hover:bg-zinc-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {isQuizLoading ? (
                          <>
                            <Loader2 size={16} className="animate-spin" />
                            Generating...
                          </>
                        ) : (
                          'New quiz'
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* --- NOTES TAB --- */}
            {activeTab === 'notes' && (
              <div className="h-full flex flex-col px-4 py-4">
                <div className="bg-amber-50/60 border border-amber-200/60 rounded-2xl flex-1 min-h-[280px] flex flex-col overflow-hidden">
                  <div className="flex justify-between items-center px-3.5 py-2.5 border-b border-amber-200/50">
                    <span className="text-[11px] font-bold text-amber-800 uppercase tracking-wider">Notepad</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-amber-700/70 flex items-center gap-1"><CheckCircle size={11} /> Saved</span>
                      <button onClick={handleDownloadNotes} disabled={!notes.trim()} className="p-1.5 hover:bg-amber-100 rounded-lg text-amber-800 disabled:opacity-40 transition-colors" title="Download notes">
                        <Download size={14} />
                      </button>
                    </div>
                  </div>
                  <textarea
                    value={notes}
                    onChange={handleNoteChange}
                    placeholder="Take notes while you read..."
                    className="flex-1 w-full bg-transparent p-4 text-sm text-zinc-800 placeholder-zinc-400 focus:outline-none resize-none leading-relaxed min-h-[240px]"
                    spellCheck={false}
                  ></textarea>
                </div>
                <p className="text-center text-[11px] text-zinc-400 mt-2.5">Notes are stored locally in your browser.</p>
              </div>
            )}
          </div>

          {/* Chat Input Area */}
          {activeTab === 'chat' && (
            <div className="p-3 bg-white border-t border-zinc-100 flex-shrink-0">
              <form onSubmit={(e) => { e.preventDefault(); handleAskAI(); }} className="relative flex items-end gap-1.5 bg-zinc-100 border border-transparent rounded-2xl p-1.5 transition-all focus-within:bg-white focus-within:border-zinc-300 focus-within:shadow-sm">
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
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImageUpload(file);
                    e.target.value = ''; // Reset input
                  }}
                  className="hidden"
                  id="document-image-upload-input"
                  disabled={isChatLoading || isProcessingImage}
                />
                <label
                  htmlFor="document-image-upload-input"
                  className={`p-2 mb-0.5 rounded-lg transition-colors flex items-center justify-center cursor-pointer ${
                    isProcessingImage
                      ? 'bg-zinc-100 text-zinc-900'
                      : 'text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100'
                  } ${isChatLoading || isProcessingImage ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title="Upload Image with Text"
                >
                  {isProcessingImage ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <ImageIcon size={16} />
                  )}
                </label>
                <textarea
                  rows={1}
                  className="w-full bg-transparent text-sm p-2 focus:outline-none resize-none max-h-32 text-zinc-700 placeholder-zinc-400"
                  placeholder={isProcessingImage ? "Extracting text from image..." : "Ask follow-up question or paste an image..."}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onPaste={handlePaste}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleAskAI();
                    }
                  }}
                  disabled={isChatLoading || isProcessingImage}
                  style={{ minHeight: '40px' }}
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim() || isChatLoading || isProcessingImage}
                  aria-label="Send question"
                  className="p-2.5 mb-0.5 bg-zinc-900 text-white rounded-xl hover:bg-zinc-700 disabled:bg-zinc-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center flex-shrink-0"
                >
                  {isChatLoading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Send size={16} />
                  )}
                </button>
              </form>
            </div>
          )}
        </aside>
      </main>
    </div>
  );
};

export default DocumentView;