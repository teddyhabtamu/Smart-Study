import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { ChevronLeft, ThumbsUp, Share2, Lock, Bookmark, PlayCircle, FileText, Download, UserPlus, LogIn, CheckCircle, MessageSquare, HelpCircle, Bot, Loader2 } from 'lucide-react';
import ChatInput from '../components/ChatInput';
import { videosAPI, aiTutorAPI } from '../services/api';
import { Video } from '../types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useData } from '../context/DataContext';
import MarkdownRenderer from '../components/MarkdownRenderer';
import TTSButton from '../components/TTSButton';
import { stripForSpeech, decodeHtmlEntities } from '../utils/textUtils';
import { formatCompact } from '../utils/format';
import { VideoWatchSkeleton } from '../components/Skeletons';
import { convertGoogleDriveImageUrl } from '../utils/imageUtils';
import { useSEO, videoSEO } from '../utils/seoUtils';

const VideoWatch: React.FC = () => {
  const { user, toggleBookmark, refreshUser } = useAuth();
  const { id } = useParams();
  const location = useLocation();
  const { addToast } = useToast();
  const { updateVideoStats } = useData();

  const [video, setVideo] = useState<Video | null>(null);
  const [relatedVideos, setRelatedVideos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasLiked, setHasLiked] = useState(false);
  const viewRecordedRef = useRef<string | null>(null); // Track which video ID has had its view recorded
  const { updateSEO } = useSEO();

  // Per-video SEO: "{topic} — Grade {grade} {subject}" is the long-tail
  // query this page can actually rank for; a generic site title cannot.
  useEffect(() => {
    if (!video || !id) return;
    updateSEO(videoSEO({
      id,
      title: decodeHtmlEntities(video.title),
      description: video.description,
      subject: video.subject,
      grade: video.grade,
      image: video.thumbnail ? convertGoogleDriveImageUrl(video.thumbnail) : undefined,
      createdAt: (video as any).created_at,
    }));
  }, [id, video, updateSEO]);

  // Fetch video and related videos on mount
  useEffect(() => {
    const fetchVideoData = async () => {
      if (!id) return;

      try {
        setLoading(true);
        setError(null);
        // Reset state when switching videos to prevent showing old video data
        setVideo(null);
        setChatHistory([]);
        setChatInput('');
        setNotes('');
        setQuizContent(null);
        setActiveTab('upNext');
        viewRecordedRef.current = null; // Reset view recording tracker when switching videos

        // Fetch the main video
        const videoData = await videosAPI.getById(id);
        setVideo(videoData);
        setHasLiked(videoData.user_has_liked || false);
        setIsCompleted(videoData.user_has_completed || false);

        // Record view (guests + authenticated), only once per video load.
        // - Authenticated users are deduped on the backend (1 view per user per video)
        // - Guests are deduped best-effort with localStorage (1 view per browser per video)
        if (id && viewRecordedRef.current !== id) {
          // Guest dedupe (browser-local)
          const isGuest = !user && typeof window !== 'undefined';
          const guestKey = isGuest ? `smartstudy_guest_viewed_video_${id}` : null;

          if (isGuest && guestKey && window.localStorage.getItem(guestKey) === '1') {
            // Already counted for this guest in this browser
            viewRecordedRef.current = id;
          } else {
            try {
              const viewResponse = await videosAPI.recordView(id);
              viewRecordedRef.current = id; // Mark this video as having its view recorded

              // Persist guest view marker after a successful call
              if (isGuest && guestKey) {
                window.localStorage.setItem(guestKey, '1');
              }

              // Update local video state with the updated view count from server
              if (viewResponse && typeof viewResponse === 'object' && 'views' in viewResponse) {
                const updatedViews = (viewResponse as { views: number }).views;
                setVideo((prev: any) => prev ? { ...prev, views: updatedViews } : prev);
                // Also update the video in the list
                updateVideoStats(id, { views: updatedViews });
              } else {
                // Fallback: refetch video if response doesn't include views
                const updatedVideoData = await videosAPI.getById(id);
                setVideo(updatedVideoData);
                updateVideoStats(id, { views: updatedVideoData.views });
              }
            } catch (err) {
              console.error('Failed to record view:', err);
              // Don't show error to user, just log it
            }
          }
        }

        // Fetch related videos (same subject, limit 3)
        const relatedResponse = await videosAPI.getAll({
          subject: videoData.subject,
          limit: 4 // Get 4 to filter out the current one
        });

        const filteredRelated = relatedResponse.videos.filter(v => v.id !== id).slice(0, 3);
        setRelatedVideos(filteredRelated);

      } catch (err: any) {
        console.error('Failed to fetch video:', err);
        setError(err.message || 'Failed to load video');
      } finally {
        setLoading(false);
      }
    };

    fetchVideoData();
  }, [id, user?.id]); // Only depend on user ID, not the entire user object

  // Update completion/like status when user changes (only if video is already loaded)
  useEffect(() => {
    if (!user) {
      // Reset user-specific data when logged out
      setHasLiked(false);
      setIsCompleted(false);
    }
    // Note: User-specific data (liked/completed) is already fetched in the main useEffect
    // This effect only handles the logout case to avoid duplicate API calls
  }, [user?.id]);
  const [activeTab, setActiveTab] = useState<'upNext' | 'notes' | 'chat' | 'quiz'>('upNext');
  const [notes, setNotes] = useState('');
  const [isRestricted, setIsRestricted] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);

  const [chatInput, setChatInput] = useState('');
  const [chatHistory, setChatHistory] = useState<{ role: string, text: string }[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  // Image attach + OCR lives in the shared ChatInput; imageBusy mirrors
  // its OCR activity for send guards and placeholders.
  const [imageBusy, setImageBusy] = useState(false);
  const [quizContent, setQuizContent] = useState<string | null>(null);
  const [isQuizLoading, setIsQuizLoading] = useState(false);
  const [isLiking, setIsLiking] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isBookmarking, setIsBookmarking] = useState(false);
  
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Per-feature session counter (see DocumentView note): video previews
    // must not consume document previews and vice versa. sessionStorage
    // matches the "for this session" copy shown on the gate.
    if (!user) {
      const views = parseInt(sessionStorage.getItem('smartstudy_guest_video_views') || '0');
      if (views >= 1) {
        setIsRestricted(true);
      } else {
        sessionStorage.setItem('smartstudy_guest_video_views', (views + 1).toString());
      }
    } else {
      setIsRestricted(false);
    }
  }, [user?.id, id]); // Only depend on user ID, not the entire user object

  useEffect(() => {
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

  // Image attach + OCR lives in the shared ChatInput (see AITutor wiring).
  // Preview retires with the emptied field on send.

  const handleAskAI = async () => {
    if (!chatInput.trim() || !video) return;

    const userMsg = chatInput;
    setChatInput('');
    // Image preview retires with the emptied field (owned by ChatInput).
    setChatHistory(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsChatLoading(true);

    try {
      const context = `About this video lesson: "${video.title}" - ${video.description} (Grade ${video.grade}, Subject: ${video.subject}).`;
      const fullPrompt = `${context}\n\nQuestion: ${userMsg}`;

      const response = await aiTutorAPI.chat(fullPrompt, video.subject, video.grade);
      setChatHistory(prev => [...prev, { role: 'model', text: response.response }]);
    } catch (error: any) {
      // Toast only: persisting an "Error: ..." string as a model message
      // would re-render it as a tutor answer on every revisit.
      console.error('AI chat error in VideoWatch:', error);
      addToast(error.message || 'Sorry, I encountered an error. Please try again.', 'error');
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleGenerateQuiz = async () => {
    if (!video) return;
    setIsQuizLoading(true);

    try {
      const prompt = `Generate a 5-question quiz based on this video lesson: "${video.title}" - ${video.description}. Include multiple choice questions with answers.`;
      const response = await aiTutorAPI.chat(prompt, video.subject, video.grade);
      setQuizContent(response.response);
    } catch (error: any) {
      console.error('Quiz generation error in VideoWatch:', error);
      setQuizContent(`Could not generate quiz: ${error.message || 'Please try again.'}`);
    } finally {
      setIsQuizLoading(false);
    }
  };

  // Helper function to extract video ID from URL
  const getVideoId = (url: string) => {
    if (!url) return null;
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  // Memoize videoId and embedUrl to prevent unnecessary iframe re-renders
  // These must be called before any early returns to follow Rules of Hooks
  const videoId = useMemo(() => {
    return video ? getVideoId(video.video_url) : null;
  }, [video?.video_url]);
  
  const embedUrl = useMemo(() => {
    if (!videoId) return '';
    return `https://www.youtube.com/embed/${videoId}?rel=0&modestbranding=1&origin=${window.location.origin}`;
  }, [videoId]);

  // Loading state
  if (loading) {
    return <VideoWatchSkeleton />;
  }

  // Error state
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-danger mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-zinc-900 text-onink rounded-lg hover:bg-zinc-800"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!video) return <div className="p-12 text-center text-zinc-500">Video not found.</div>;

  if (isRestricted) {
    return (
      <div className="max-w-4xl mx-auto py-8 sm:py-12 px-4 sm:px-6 animate-fade-in text-center">
        <div className="bg-surface border border-zinc-200 rounded-2xl p-6 sm:p-8 md:p-12 shadow-sm max-w-lg mx-auto">
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6 text-zinc-400">
            <Lock size={24} className="sm:w-8 sm:h-8" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-ink mb-2">Free Preview Limit Reached</h2>
          <p className="text-zinc-500 mb-6 sm:mb-8 leading-relaxed text-sm sm:text-base">
            You've viewed your free video lesson for this session. <br/>
            Create a free account to continue accessing our classroom, AI tutor, and more.
          </p>

          <div className="space-y-3">
             <Link
               to="/register"
               className="block w-full py-3 bg-zinc-900 text-onink font-medium rounded-xl hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2 text-sm sm:text-base"
             >
               <UserPlus size={16} className="sm:w-[18px] sm:h-[18px]" /> Create Free Account
             </Link>
             <Link
               to="/login"
               className="block w-full py-3 bg-surface border border-zinc-200 text-inksoft font-medium rounded-xl hover:bg-zinc-50 transition-colors flex items-center justify-center gap-2 text-sm sm:text-base"
             >
               <LogIn size={16} className="sm:w-[18px] sm:h-[18px]" /> Sign In
             </Link>
          </div>
          <p className="mt-4 sm:mt-6 text-xs text-zinc-400 px-2">
            Join students across Ethiopia learning smarter today.
          </p>
        </div>
      </div>
    );
  }

  const isPremiumVideo = (video as any).is_premium ?? (video as any).isPremium ?? false;
  const canWatch = !isPremiumVideo || (user && user.isPremium);
  const isBookmarked = user?.bookmarks?.includes(video.id);

  const handleLike = async () => {
    if (!user) {
      addToast('Please sign in to like videos', 'error');
      return;
    }
    // Optimistic: flip instantly, sync in the background (YouTube-grade
    // responsiveness on slow links). Rolls back only if the server refuses.
    if (isLiking) return;
    const newLikedState = !hasLiked;
    const previousLikes = typeof video.likes === 'number' ? video.likes : 0;
    setIsLiking(true);
    setHasLiked(newLikedState);
    setVideo((prev: any) => ({
      ...prev,
      likes: previousLikes + (newLikedState ? 1 : -1),
      user_has_liked: newLikedState
    }));
    try {
      const response = await videosAPI.like(video.id, newLikedState);

      // Reconcile with the server count (source of truth under racing taps).
      if (response) {
        setVideo((prev: any) => ({
          ...prev,
          likes: response.likes,
          user_has_liked: newLikedState
        }));
        updateVideoStats(video.id, { likes: response.likes });
        addToast(newLikedState ? 'Video liked!' : 'Video unliked', 'success');
      }
    } catch (error: any) {
      console.error('Failed to like video:', error);
      // Roll back the optimistic flip so the UI never lies.
      setHasLiked(!newLikedState);
      setVideo((prev: any) => ({
        ...prev,
        likes: previousLikes,
        user_has_liked: !newLikedState
      }));
      addToast('Couldn\'t update like. Please try again.', 'error');
    } finally {
      setIsLiking(false);
    }
  };

  const handleShare = async () => {
    const url = window.location.href;
    // Prefer the native share sheet on mobile; fall back to clipboard.
    // Only toast on actual success — the old code always claimed success.
    try {
      if (navigator.share) {
        await navigator.share({ title: video?.title || 'SmartStudy lesson', url });
        return;
      }
      await navigator.clipboard.writeText(url);
      addToast("Link copied to clipboard!", "success");
    } catch (error: any) {
      if (error?.name === 'AbortError') return; // user dismissed the sheet
      console.error('Share failed:', error);
      addToast("Could not share. Copy the address bar link manually.", "error");
    }
  };
  
  const handleCompleteLesson = async () => {
    if (!user) {
      addToast('Please sign in to complete lessons', 'error');
      return;
    }

    if (isCompleted) return;

    setIsCompleting(true);
    try {
      const response = await videosAPI.complete(video.id, true);

      if (response) {
        // Update video state with server response
        setVideo((prev: Video | null) => prev ? { ...prev, user_has_completed: response.user_has_completed } : null);
        setIsCompleted(response.user_has_completed || false);
      } else {
        setIsCompleted(true);
      }

      // XP is credited server-side on the first payout per video (the
      // response carries it) — never minted from the client. Sync the header.
      const xp = response?.xpGained ?? 0;
      if (xp > 0) {
        refreshUser(true).catch((error) => console.error('Background user refresh failed:', error));
        addToast(`+${xp} XP Lesson Completed!`, "success");
        if (response?.leveledUp && response?.newLevel) {
          const newLevel = response.newLevel;
          setTimeout(() => addToast(`Level Up! You are now Level ${newLevel}`, "info"), 500);
        }
      } else {
        addToast("Lesson completed!", "success");
      }
    } catch (error: any) {
      console.error('Failed to complete lesson:', error);
      addToast(error.message || 'Failed to complete lesson', 'error');
    } finally {
      setIsCompleting(false);
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
    // Release the blob URL — otherwise every download leaks until reload
    setTimeout(() => URL.revokeObjectURL(element.href), 1000);
    addToast("Notes downloaded successfully.", "success");
  };

  return (
    <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6 animate-fade-in relative pb-8 sm:pb-12">
       <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-zinc-500">
          <Link to="/videos" className="hover:text-ink transition-colors flex items-center gap-1">
             <ChevronLeft size={14} className="sm:w-4 sm:h-4" /> <span className="hidden sm:inline">Back to Classroom</span><span className="sm:hidden">Back</span>
          </Link>
          <span className="text-zinc-300">/</span>
          <span className="truncate">{video.subject}</span>
          <span className="text-zinc-300 hidden sm:inline">/</span>
          <span className="text-ink font-medium truncate max-w-[120px] sm:max-w-[200px]">{decodeHtmlEntities(video.title)}</span>
       </div>

       <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
          <div className="lg:col-span-2 space-y-4 sm:space-y-6">
             <div className="aspect-video bg-black rounded-xl overflow-hidden shadow-lg relative">
                {canWatch && videoId ? (
                   <iframe
                     key={videoId} // Key prevents unnecessary iframe recreation
                     width="100%"
                     height="100%"
                     src={embedUrl}
                     title={decodeHtmlEntities(video.title)}
                     frameBorder="0"
                     allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                     referrerPolicy="strict-origin-when-cross-origin"
                     allowFullScreen
                     className="w-full h-full"
                   ></iframe>
                ) : (
                   <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900 text-onink p-4 sm:p-6 text-center">
                      <div className="w-12 h-12 sm:w-16 sm:h-16 bg-surface/10 rounded-full flex items-center justify-center mb-3 sm:mb-4">
                         <Lock size={24} className="sm:w-8 sm:h-8" />
                      </div>
                       {/* Locked premium shows the upsell even though the content URL
                           is redacted server-side (videoId null) — the lock
                           check comes first so it never reads as an error. */}
                       <h3 className="text-lg sm:text-xl font-bold mb-2">
                         {isPremiumVideo && !canWatch ? 'Premium Lesson' : !videoId ? 'Video Error' : 'Premium Lesson'}
                       </h3>
                       <p className="text-zinc-400 max-w-sm mb-4 sm:mb-6 text-sm sm:text-base">
                         {isPremiumVideo && !canWatch
                           ? 'Upgrade your account to Student Pro to watch this lesson and access hundreds more.'
                           : 'This video source is invalid.'}
                       </p>
                      {canWatch ? null : (
                        <Link
                          to="/subscription"
                          state={{ from: location.pathname }}
                          className="px-4 sm:px-6 py-2 bg-surface text-ink font-bold rounded-lg hover:bg-zinc-100 transition-colors text-sm sm:text-base"
                        >
                           Upgrade Plan
                        </Link>
                      )}
                   </div>
                )}
             </div>

             <div>
                 <div className="flex flex-col md:flex-row md:items-start justify-between gap-3 sm:gap-4 mb-3 sm:mb-4">
                   <div className="min-w-0 flex-1">
                    <div className="flex items-start gap-2 flex-wrap mb-2">
                      <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-ink leading-tight">{decodeHtmlEntities(video.title)}</h1>
                      {isPremiumVideo && (
                        <div className="mt-0.5 bg-zinc-900/90 text-onink px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md text-[10px] sm:text-[11px] font-bold uppercase tracking-wider flex items-center gap-1 backdrop-blur-sm shadow-sm">
                          <Lock size={8} className="sm:w-2.5 sm:h-2.5" /> Premium
                        </div>
                      )}
                    </div>
                  </div>
                   <div className="flex gap-2 flex-shrink-0">
                      {user && canWatch && (
                       <button
                         onClick={handleCompleteLesson}
                         disabled={isCompleted || isCompleting}
                         className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-lg transition-all flex items-center gap-1.5 sm:gap-2 flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed ${
                           isCompleted
                             ? 'bg-emerald-100 text-emerald-700 border border-emerald-200 cursor-default'
                             : 'bg-zinc-900 text-onink border border-zinc-900 hover:bg-zinc-800 shadow-md'
                         }`}
                       >
                         {isCompleting ? (
                           <>
                             <Loader2 size={14} className="sm:w-4 sm:h-4 animate-spin" />
                             <span className="hidden sm:inline">Completing...</span>
                             <span className="sm:hidden">...</span>
                           </>
                         ) : (
                           <>
                             {isCompleted ? <CheckCircle size={14} className="sm:w-4 sm:h-4" /> : <CheckCircle size={14} className="sm:w-4 sm:h-4" />}
                             <span className="hidden sm:inline">{isCompleted ? 'Completed' : 'Complete Lesson'}</span>
                             <span className="sm:hidden">{isCompleted ? 'Done' : 'Complete'}</span>
                           </>
                         )}
                       </button>
                     )}
                     <button
                       onClick={async () => {
                         if (!user) return;
                         setIsBookmarking(true);
                         try {
                           await toggleBookmark(video.id, 'video');
                         } catch (error) {
                           console.error('Failed to toggle bookmark:', error);
                         } finally {
                           setIsBookmarking(false);
                         }
                       }}
                       className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5 sm:gap-2 flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed ${
                         isBookmarked
                           ? 'bg-amber-100 text-amber-800 border border-amber-200'
                           : 'bg-surface text-inksoft border border-zinc-200 hover:bg-zinc-50'
                       }`}
                       disabled={!user || isBookmarking}
                     >
                       {isBookmarking ? (
                         <Loader2 size={14} className="animate-spin" />
                       ) : (
                         <Bookmark size={14} className={isBookmarked ? "fill-current text-amber-600" : ""} />
                       )}
                       <span className="hidden sm:inline">{isBookmarked ? 'Saved' : 'Save'}</span>
                     </button>
                   </div>
                </div>
                
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-100 pb-4">
                   <div className="flex items-center gap-4 text-sm text-zinc-500">
                      <span>{(video.views || 0).toLocaleString()} {(video.views || 0) === 1 ? 'view' : 'views'}</span>
                      <span className="w-1 h-1 bg-zinc-300 rounded-full"></span>
                      {/* uploadedAt arrives as a raw ISO string from the API —
                          never render it verbatim (microseconds + offset on
                          screen). Guarded: unparseable stays 'Unknown date'. */}
                      <span>{(() => {
                        const raw = video.uploadedAt || video.created_at;
                        if (!raw) return 'Unknown date';
                        const d = new Date(raw);
                        return Number.isNaN(d.getTime())
                          ? 'Unknown date'
                          : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
                      })()}</span>
                   </div>
                   <div className="flex items-center gap-2 relative">
                      <button
                        onClick={handleLike}
                        title={hasLiked ? 'Unlike' : 'Like'}
                        className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                          hasLiked ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-zinc-100 text-inksoft hover:bg-zinc-200'
                        }`}
                      >
                         <ThumbsUp size={16} className={hasLiked ? "fill-current text-emerald-600" : ""} />
                         {formatCompact(video.likes)}
                      </button>
                      <button
                        onClick={handleShare}
                        className="flex items-center gap-2 px-4 py-2 bg-zinc-100 text-inksoft rounded-full text-sm font-medium hover:bg-zinc-200 transition-colors"
                      >
                         <Share2 size={16} /> Share
                      </button>
                    </div>
                </div>

                <div className="pt-6 flex gap-4">
                   <div className="w-12 h-12 bg-zinc-100 rounded-full flex items-center justify-center text-ink font-bold text-lg flex-shrink-0">
                      {video.instructor?.charAt(0) || '?'}
                   </div>
                    <div>
                       <h3 className="font-bold text-ink">{video.instructor || 'SmartStudy'}</h3>
                       <p className="text-xs text-zinc-500 mb-3">{video.subject} • {video.grade === 0 ? 'General' : `Grade ${video.grade}`}</p>
                      {/* Empty descriptions rendered an empty bordered box
                          (ghost placeholder). Render only when text exists. */}
                      {video.description ? (
                      <p className="text-sm text-inksoft leading-relaxed bg-zinc-50 p-4 rounded-lg border border-zinc-100">
                         {decodeHtmlEntities(video.description)}
                      </p>
                      ) : null}
                   </div>
                </div>
             </div>
          </div>

          <div className="flex flex-col h-[400px] sm:h-[500px] md:h-[600px] bg-surface border border-zinc-200 rounded-xl overflow-hidden shadow-sm">
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
                    className={`flex-1 py-2.5 sm:py-3 text-xs font-medium flex flex-col items-center justify-center gap-1 transition-colors relative ${
                      activeTab === tab.id
                        ? 'bg-surface text-ink'
                        : 'text-zinc-500 hover:text-inksoft hover:bg-zinc-50'
                    }`}
                  >
                    <tab.icon size={14} className="sm:w-4 sm:h-4" />
                    <span className="text-[10px] sm:text-xs">{tab.label}</span>
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
                                 <img src={convertGoogleDriveImageUrl(rv.thumbnail)} alt={rv.title} loading="lazy" decoding="async" className="w-full h-full object-cover" />
                                 {((rv as any).isPremium ?? (rv as any).is_premium) && (
                                   <div className="absolute top-1.5 right-1.5 bg-zinc-900/90 text-onink px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 backdrop-blur-sm shadow-sm">
                                     <Lock size={8} /> Premium
                                   </div>
                                 )}
                              </div>
                              <div className="flex flex-col min-w-0">
                                 <h4 className="text-xs font-semibold text-ink line-clamp-2 leading-snug group-hover:text-inksoft transition-colors">
                                    {rv.title}
                                 </h4>
                                 <p className="text-[10px] text-zinc-500 mt-1 truncate">{rv.instructor}</p>
                                 <div className="flex items-center gap-1 mt-auto">
                                   {((rv as any).isPremium ?? (rv as any).is_premium) && <span className="text-[10px] bg-amber-100 text-amber-700 px-1 rounded font-bold">PRO</span>}
                                 </div>
                              </div>
                           </Link>
                        ))
                    ) : (
                        <p className="text-sm text-zinc-500 text-center py-8">No related videos found.</p>
                    )}

                    <div className="pt-6 border-t border-zinc-100 mt-6">
                      <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-5 text-center">
                         <h4 className="font-bold text-ink mb-2">Need help?</h4>
                         <p className="text-xs text-inksoft mb-4">Ask our AI Tutor to verify what you've learned.</p>
                         <button onClick={() => setActiveTab('chat')} className="block w-full py-2 bg-zinc-900 text-onink text-sm font-medium rounded-lg hover:bg-zinc-800 transition-colors">
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
                       className="p-1.5 text-zinc-400 hover:text-ink hover:bg-zinc-100 rounded transition-colors"
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
                                msg.role === 'user' ? 'bg-zinc-200 text-inksoft' : 'bg-zinc-900 text-onink'
                             }`}>
                                {msg.role === 'user' ? 'U' : 'AI'}
                             </div>
                             <div className={`max-w-[85%] px-3 py-2 rounded-lg text-xs relative group ${
                                msg.role === 'user' ? 'bg-zinc-100 text-ink' : 'text-inksoft bg-surface border border-zinc-100 shadow-sm'
                             }`}>
                                {msg.role === 'user' ? msg.text : (
                                  <>
                                    <MarkdownRenderer content={msg.text} />
                                    <div className="absolute -top-1 -right-7 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                       <TTSButton text={stripForSpeech(msg.text)} size={14} quality="high" className="bg-surface border border-zinc-100 shadow-sm p-1" />
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

                     <div className="pt-2 border-t border-zinc-100 relative">
                        <ChatInput
                          value={chatInput}
                          onChange={setChatInput}
                          onSend={() => void handleAskAI()}
                          placeholder="Ask a question or paste an image…"
                          disabled={isChatLoading}
                          onProcessingChange={setImageBusy}
                          imageInputId="video-image-upload-input"
                          notify={(message, kind) => addToast(message, kind)}
                        />
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
                          <p className="text-sm text-inksoft mb-4">Test your understanding of this lesson.</p>
                          <button 
                             onClick={handleGenerateQuiz}
                             disabled={isQuizLoading}
                             className="px-4 py-2 bg-zinc-900 text-onink text-sm font-medium rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                          >
                             {isQuizLoading ? (
                               <>
                                 <Loader2 size={14} className="animate-spin" />
                                 Generating...
                               </>
                             ) : (
                               'Generate Quiz'
                             )}
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
                             <TTSButton text={stripForSpeech(quizContent)} size={16} quality="high" className="bg-zinc-50 hover:bg-zinc-100" />
                          </div>
                          <MarkdownRenderer content={quizContent} />
                          <button 
                             onClick={handleGenerateQuiz}
                             disabled={isQuizLoading}
                             className="mt-6 w-full py-2 bg-zinc-100 text-inksoft text-xs font-medium rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                          >
                             {isQuizLoading ? (
                               <>
                                 <Loader2 size={12} className="animate-spin" />
                                 Regenerating...
                               </>
                             ) : (
                               'Regenerate Quiz'
                             )}
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