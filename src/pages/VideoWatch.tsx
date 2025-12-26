import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { ChevronLeft, ThumbsUp, Share2, MoreHorizontal, Lock, Bookmark, PlayCircle, FileText, Download, UserPlus, LogIn, CheckCircle, MessageSquare, HelpCircle, Send, Bot, Loader2, Image as ImageIcon, X } from 'lucide-react';
import { videosAPI, aiTutorAPI } from '../services/api';
import { Video } from '../types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useData } from '../context/DataContext';
import MarkdownRenderer from '../components/MarkdownRenderer';
import TTSButton from '../components/TTSButton';
import { VideoWatchSkeleton } from '../components/Skeletons';
import { convertGoogleDriveImageUrl } from '../utils/imageUtils';

const VideoWatch: React.FC = () => {
  const { user, toggleBookmark, gainXP } = useAuth();
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
        if (imagePreview) {
          URL.revokeObjectURL(imagePreview);
          setImagePreview(null);
        }

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
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [quizContent, setQuizContent] = useState<string | null>(null);
  const [isQuizLoading, setIsQuizLoading] = useState(false);
  const [isLiking, setIsLiking] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isBookmarking, setIsBookmarking] = useState(false);
  
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

  const handleImageUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      addToast('Please upload an image file', 'error');
      return;
    }

    if (!video) return;

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
        setChatInput('[Image uploaded - no text detected]');
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

  const handleAskAI = async () => {
    if (!chatInput.trim() || !video) return;

    const userMsg = chatInput;
    setChatInput('');
    clearImagePreview(); // Clear image preview when sending
    setChatHistory(prev => [...prev, { role: 'user', text: userMsg }]);
    setIsChatLoading(true);

    try {
      const context = `About this video lesson: "${video.title}" - ${video.description} (Grade ${video.grade}, Subject: ${video.subject}).`;
      const fullPrompt = `${context}\n\nQuestion: ${userMsg}`;

      const response = await aiTutorAPI.chat(fullPrompt, video.subject, video.grade);
      setChatHistory(prev => [...prev, { role: 'model', text: response.response }]);
    } catch (error: any) {
      console.error('AI chat error in VideoWatch:', error);
      setChatHistory(prev => [...prev, { role: 'model', text: `Error: ${error.message || 'Sorry, I encountered an error. Please try again.'}` }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleGenerateQuiz = async () => {
    if (!video) return;
    setIsQuizLoading(true);

    try {
      const prompt = `Generate a 5-question quiz based on this video lesson: "${video.title}" - ${video.description}. Include multiple choice questions with answers.`;
      console.log('Generating quiz for video:', { title: video.title, subject: video.subject, grade: video.grade });
      const response = await aiTutorAPI.chat(prompt, video.subject, video.grade);
      console.log('Quiz generation response (VideoWatch):', response);
      setQuizContent(response.response);
    } catch (error: any) {
      console.error('Quiz generation error in VideoWatch:', error);
      setQuizContent(`Could not generate quiz: ${error.message || 'Please try again.'}`);
    } finally {
      setIsQuizLoading(false);
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

  // Cleanup image preview on unmount
  useEffect(() => {
    return () => {
      if (imagePreview) {
        URL.revokeObjectURL(imagePreview);
      }
    };
  }, [imagePreview]);

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
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800"
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
        <div className="bg-white border border-zinc-200 rounded-2xl p-6 sm:p-8 md:p-12 shadow-sm max-w-lg mx-auto">
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6 text-zinc-400">
            <Lock size={24} className="sm:w-8 sm:h-8" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-zinc-900 mb-2">Free Preview Limit Reached</h2>
          <p className="text-zinc-500 mb-6 sm:mb-8 leading-relaxed text-sm sm:text-base">
            You've viewed your free video lesson for this session. <br/>
            Create a free account to continue accessing our classroom, AI tutor, and more.
          </p>

          <div className="space-y-3">
             <Link
               to="/register"
               className="block w-full py-3 bg-zinc-900 text-white font-medium rounded-xl hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2 text-sm sm:text-base"
             >
               <UserPlus size={16} className="sm:w-[18px] sm:h-[18px]" /> Create Free Account
             </Link>
             <Link
               to="/login"
               className="block w-full py-3 bg-white border border-zinc-200 text-zinc-700 font-medium rounded-xl hover:bg-zinc-50 transition-colors flex items-center justify-center gap-2 text-sm sm:text-base"
             >
               <LogIn size={16} className="sm:w-[18px] sm:h-[18px]" /> Sign In
             </Link>
          </div>
          <p className="mt-4 sm:mt-6 text-xs text-zinc-400 px-2">
            Join thousands of Ethiopian students learning smarter today.
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

    setIsLiking(true);
    try {
      const newLikedState = !hasLiked;
      const response = await videosAPI.like(video.id, newLikedState);

      // Update local state with server response
      if (response) {
        setVideo((prev: any) => ({
          ...prev,
          likes: response.likes,
          user_has_liked: newLikedState
        }));
        setHasLiked(newLikedState);
        // Also update the video in the list
        updateVideoStats(video.id, { likes: response.likes });
        addToast(newLikedState ? 'Video liked!' : 'Video unliked', 'success');
      }
    } catch (error: any) {
      console.error('Failed to like video:', error);
      addToast(error.message || 'Failed to like video', 'error');
    } finally {
      setIsLiking(false);
    }
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    addToast("Link copied to clipboard!", "success");
  };
  
  const handleCompleteLesson = async () => {
    if (!user) {
      addToast('Please sign in to complete lessons', 'error');
      return;
    }

    if (isCompleted) return;

    setIsCompleting(true);
    try {
      console.log('Completing lesson for video:', video.id);
      const response = await videosAPI.complete(video.id, true);
      console.log('Lesson completion API call successful', response);

      if (response) {
        // Update video state with server response
        setVideo((prev: Video | null) => prev ? { ...prev, user_has_completed: response.user_has_completed } : null);
        setIsCompleted(response.user_has_completed || false);
        console.log('isCompleted set to:', response.user_has_completed);
      } else {
        setIsCompleted(true);
      }

      // Only award XP if we successfully marked as complete
      const { leveledUp, newLevel } = await gainXP(100);
      addToast("+100 XP Lesson Completed!", "success");
      if (leveledUp) {
        setTimeout(() => addToast(`Level Up! You are now Level ${newLevel}`, "info"), 500);
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
    addToast("Notes downloaded successfully.", "success");
  };

  return (
    <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6 animate-fade-in relative pb-8 sm:pb-12">
       <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-zinc-500">
          <Link to="/videos" className="hover:text-zinc-900 transition-colors flex items-center gap-1">
             <ChevronLeft size={14} className="sm:w-4 sm:h-4" /> <span className="hidden xs:inline">Back to Classroom</span><span className="xs:hidden">Back</span>
          </Link>
          <span className="text-zinc-300">/</span>
          <span className="truncate">{video.subject}</span>
          <span className="text-zinc-300 hidden xs:inline">/</span>
          <span className="text-zinc-900 font-medium truncate max-w-[120px] xs:max-w-[200px]">{video.title}</span>
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
                     title={video.title}
                     frameBorder="0"
                     allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                     referrerPolicy="strict-origin-when-cross-origin"
                     allowFullScreen
                     className="w-full h-full"
                   ></iframe>
                ) : (
                   <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-900 text-white p-4 sm:p-6 text-center">
                      <div className="w-12 h-12 sm:w-16 sm:h-16 bg-white/10 rounded-full flex items-center justify-center mb-3 sm:mb-4">
                         <Lock size={24} className="sm:w-8 sm:h-8" />
                      </div>
                      <h3 className="text-lg sm:text-xl font-bold mb-2">
                        {!videoId ? 'Video Error' : 'Premium Lesson'}
                      </h3>
                      <p className="text-zinc-400 max-w-sm mb-4 sm:mb-6 text-sm sm:text-base">
                        {!videoId
                          ? 'This video source is invalid.'
                          : 'Upgrade your account to Student Pro to watch this lesson and access hundreds more.'}
                      </p>
                      {canWatch ? null : (
                        <Link
                          to="/subscription"
                          state={{ from: location.pathname }}
                          className="px-4 sm:px-6 py-2 bg-white text-zinc-900 font-bold rounded-lg hover:bg-zinc-100 transition-colors text-sm sm:text-base"
                        >
                           Upgrade Plan
                        </Link>
                      )}
                   </div>
                )}
             </div>

             <div>
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-3 sm:gap-4 mb-3 sm:mb-4">
                  <div>
                    <div className="flex items-start gap-2 flex-wrap mb-2">
                      <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-zinc-900 leading-tight">{video.title}</h1>
                      {isPremiumVideo && (
                        <div className="mt-0.5 bg-zinc-900/90 text-white px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md text-[9px] sm:text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 backdrop-blur-sm shadow-sm">
                          <Lock size={8} className="sm:w-2.5 sm:h-2.5" /> Premium
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2">
                     {user && canWatch && (
                       <button
                         onClick={handleCompleteLesson}
                         disabled={isCompleted || isCompleting}
                         className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-medium rounded-lg transition-all flex items-center gap-1.5 sm:gap-2 flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed ${
                           isCompleted
                             ? 'bg-emerald-100 text-emerald-700 border border-emerald-200 cursor-default'
                             : 'bg-zinc-900 text-white border border-zinc-900 hover:bg-zinc-800 shadow-md'
                         }`}
                       >
                         {isCompleting ? (
                           <>
                             <Loader2 size={14} className="sm:w-4 sm:h-4 animate-spin" />
                             <span className="hidden xs:inline">Completing...</span>
                             <span className="xs:hidden">...</span>
                           </>
                         ) : (
                           <>
                             {isCompleted ? <CheckCircle size={14} className="sm:w-4 sm:h-4" /> : <CheckCircle size={14} className="sm:w-4 sm:h-4" />}
                             <span className="hidden xs:inline">{isCompleted ? 'Completed' : 'Complete Lesson'}</span>
                             <span className="xs:hidden">{isCompleted ? 'Done' : 'Complete'}</span>
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
                           : 'bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-50'
                       }`}
                       disabled={!user || isBookmarking}
                     >
                       {isBookmarking ? (
                         <Loader2 size={14} className="animate-spin" />
                       ) : (
                         <Bookmark size={14} className={isBookmarked ? "fill-current text-amber-600" : ""} />
                       )}
                       <span className="hidden xs:inline">{isBookmarked ? 'Saved' : 'Save'}</span>
                     </button>
                   </div>
                </div>
                
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-100 pb-4">
                   <div className="flex items-center gap-4 text-sm text-zinc-500">
                      <span>{(video.views || 0).toLocaleString()} views</span>
                      <span className="w-1 h-1 bg-zinc-300 rounded-full"></span>
                      <span>{video.uploadedAt || (video.created_at ? new Date(video.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Unknown date')}</span>
                   </div>
                   <div className="flex items-center gap-2 relative">
                      <button
                        onClick={handleLike}
                        disabled={isLiking}
                        className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                          hasLiked ? 'bg-blue-100 text-blue-700 border border-blue-200' : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
                        }`}
                      >
                         {isLiking ? (
                           <Loader2 size={16} className="animate-spin" />
                         ) : (
                           <ThumbsUp size={16} className={hasLiked ? "fill-current text-blue-600" : ""} />
                         )}
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
                      {video.instructor?.charAt(0) || '?'}
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

          <div className="flex flex-col h-[400px] sm:h-[500px] md:h-[600px] bg-white border border-zinc-200 rounded-xl overflow-hidden shadow-sm">
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
                        ? 'bg-white text-zinc-900'
                        : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50'
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
                                 <img src={convertGoogleDriveImageUrl(rv.thumbnail)} alt={rv.title} className="w-full h-full object-cover" />
                                 {((rv as any).isPremium ?? (rv as any).is_premium) && (
                                   <div className="absolute top-1.5 right-1.5 bg-zinc-900/90 text-white px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 backdrop-blur-sm shadow-sm">
                                     <Lock size={8} /> Premium
                                   </div>
                                 )}
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

                    <div className="pt-2 border-t border-zinc-100 relative">
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
                       <form onSubmit={(e) => { e.preventDefault(); handleAskAI(); }} className="relative flex items-center gap-1">
                          <input
                             type="file"
                             accept="image/*"
                             onChange={(e) => {
                               const file = e.target.files?.[0];
                               if (file) handleImageUpload(file);
                               e.target.value = ''; // Reset input
                             }}
                             className="hidden"
                             id="video-image-upload-input"
                             disabled={isChatLoading || isProcessingImage}
                          />
                          <label
                             htmlFor="video-image-upload-input"
                             className={`p-1.5 rounded-lg transition-colors flex items-center justify-center cursor-pointer ${
                               isProcessingImage
                                 ? 'bg-blue-50 text-blue-600'
                                 : 'text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100'
                             } ${isChatLoading || isProcessingImage ? 'opacity-50 cursor-not-allowed' : ''}`}
                             title="Upload Image with Text"
                          >
                             {isProcessingImage ? (
                               <Loader2 size={14} className="animate-spin" />
                             ) : (
                               <ImageIcon size={14} />
                             )}
                          </label>
                          <input
                             type="text"
                             className="flex-1 pl-3 pr-10 py-2.5 bg-zinc-50 border border-zinc-200 rounded-lg text-xs focus:outline-none focus:border-zinc-900 transition-all placeholder-zinc-400"
                             placeholder={isProcessingImage ? "Extracting text from image..." : "Ask a question or paste an image..."}
                             value={chatInput}
                             onChange={(e) => setChatInput(e.target.value)}
                             onPaste={handlePaste}
                             disabled={isChatLoading || isProcessingImage}
                          />
                          <button 
                             type="submit" 
                             disabled={!chatInput.trim() || isChatLoading || isProcessingImage}
                             className="absolute right-2 top-2 p-1 text-zinc-400 hover:text-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                          >
                             {isChatLoading ? (
                               <Loader2 size={14} className="animate-spin" />
                             ) : (
                               <Send size={14} />
                             )}
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
                             disabled={isQuizLoading}
                             className="px-4 py-2 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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
                             <TTSButton text={quizContent} size={16} quality="high" className="bg-zinc-50 hover:bg-zinc-100" />
                          </div>
                          <MarkdownRenderer content={quizContent} />
                          <button 
                             onClick={handleGenerateQuiz}
                             disabled={isQuizLoading}
                             className="mt-6 w-full py-2 bg-zinc-100 text-zinc-600 text-xs font-medium rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
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