import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Search, PlayCircle, Lock, Filter, ArrowUpDown, Bookmark, Loader2 } from 'lucide-react';
import { SUBJECTS, GRADES } from '../constants';
import { VideoLesson } from '../types';
import CustomSelect, { Option } from '../components/CustomSelect';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { VideoCardSkeleton } from '../components/Skeletons';

const INITIAL_LIMIT = 16; // Load 16 videos initially
const LOAD_MORE_LIMIT = 12; // Load 12 more videos each time

const VideoLibrary: React.FC = () => {
  const { videos, fetchVideos, fetchMoreVideos, loading, errors } = useData();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('All');
  const [selectedGrade, setSelectedGrade] = useState('All');
  const [sortBy, setSortBy] = useState('newest');
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const observerTarget = useRef<HTMLDivElement>(null);

  // Fetch initial videos on mount and when filters change
  useEffect(() => {
    // Reset pagination state when filters change
    setHasMore(true);
    setLoadingMore(false);
    
    const params: any = {
      limit: INITIAL_LIMIT,
      offset: 0,
    };

    if (selectedSubject !== 'All') params.subject = selectedSubject;
    if (selectedGrade !== 'All') params.grade = parseInt(selectedGrade);
    if (searchTerm.trim()) params.search = searchTerm;
    if (showSavedOnly) params.bookmarked = true;
    if (sortBy !== 'newest') params.sort = sortBy;

    fetchVideos(params).then((result) => {
      if (result) {
        setHasMore(result.hasMore);
      }
    });
  }, [fetchVideos, selectedSubject, selectedGrade, searchTerm, showSavedOnly, sortBy]);

  // Load more videos function
  const loadMoreVideos = useCallback(async () => {
    if (loadingMore || !hasMore) return;

    setLoadingMore(true);
    const params: any = {
      limit: LOAD_MORE_LIMIT,
      offset: videos.length,
    };

    if (selectedSubject !== 'All') params.subject = selectedSubject;
    if (selectedGrade !== 'All') params.grade = parseInt(selectedGrade);
    if (searchTerm.trim()) params.search = searchTerm;
    if (showSavedOnly) params.bookmarked = true;
    if (sortBy !== 'newest') params.sort = sortBy;

    try {
      const result = await fetchMoreVideos(params);
      setHasMore(result.hasMore);
    } catch (error) {
      console.error('Failed to load more videos:', error);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, videos.length, selectedSubject, selectedGrade, searchTerm, showSavedOnly, sortBy, fetchMoreVideos]);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading.videos) {
          loadMoreVideos();
        }
      },
      { threshold: 0.1 }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [hasMore, loadingMore, loading.videos, loadMoreVideos]);

  // Use videos directly since filtering is now done on the backend
  const filteredVideos = videos;

  const subjectOptions: Option[] = SUBJECTS.map(s => ({ label: s === 'All' ? 'All Subjects' : s, value: s }));
  const gradeOptions: Option[] = GRADES.map(g => ({ label: g === 'All' ? 'All Grades' : `Grade ${g}`, value: g }));
  const sortOptions: Option[] = [
    { label: 'Newest First', value: 'newest' },
    { label: 'Most Popular', value: 'popular' },
    { label: 'A-Z Title', value: 'title' },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:gap-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900">Video Classroom</h1>
          <p className="text-zinc-500 text-sm sm:text-base">Watch expert-led lessons for every subject.</p>
        </div>

        {/* Search & Filters */}
        <div className="space-y-3 sm:space-y-4">
          <div className="relative">
             <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 sm:h-5 sm:w-5 text-zinc-400" />
             </div>
             <input
               type="text"
               className="block w-full pl-9 sm:pl-10 pr-3 py-2.5 sm:py-3 bg-white border border-zinc-200 rounded-lg text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-300 transition-all shadow-sm"
               placeholder="Search by title, instructor, or keyword..."
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
             />
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
            <div className="hidden lg:flex h-[42px] w-9 items-center justify-center bg-zinc-100 rounded-lg text-zinc-500 border border-zinc-200 flex-shrink-0">
               <Filter size={14} />
            </div>

            <div className="w-full sm:flex-1 lg:w-48">
              <CustomSelect
                options={subjectOptions}
                value={selectedSubject}
                onChange={setSelectedSubject}
                placeholder="Select Subject"
              />
            </div>

            <div className="w-full sm:flex-1 lg:w-40">
              <CustomSelect
                options={gradeOptions}
                value={selectedGrade}
                onChange={setSelectedGrade}
                placeholder="Select Grade"
              />
            </div>

            {user && (
              <button
                onClick={() => setShowSavedOnly(!showSavedOnly)}
                className={`flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg text-xs sm:text-sm font-medium border transition-colors whitespace-nowrap ${
                  showSavedOnly
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
                }`}
              >
                <Bookmark size={14} className={showSavedOnly ? "fill-current" : ""} />
                <span>Saved</span>
              </button>
            )}

            <div className="w-full sm:flex-1 lg:w-48 lg:ml-auto flex items-center gap-2">
               <div className="hidden lg:flex h-[42px] w-9 items-center justify-center bg-zinc-100 rounded-lg text-zinc-500 border border-zinc-200 flex-shrink-0">
                 <ArrowUpDown size={14} />
               </div>
               <CustomSelect
                  options={sortOptions}
                  value={sortBy}
                  onChange={setSortBy}
                  placeholder="Sort By"
                />
            </div>
          </div>
        </div>
      </div>

      {/* Error State */}
      {errors.videos && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-800 font-medium">Failed to load videos</p>
          <p className="text-red-600 text-sm mt-1">{errors.videos}</p>
          <button
            onClick={() => fetchVideos()}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Grid */}
      {loading.videos && videos.length === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <VideoCardSkeleton key={i} />
          ))}
        </div>
      ) : !errors.videos && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {filteredVideos.map((video) => (
              <VideoCard key={video.id} video={video} />
            ))}
          </div>

          {/* Loading more indicator */}
          {loadingMore && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6 mt-4">
              {[1, 2, 3, 4].map((i) => (
                <VideoCardSkeleton key={`loading-${i}`} />
              ))}
            </div>
          )}

          {/* Intersection Observer target */}
          {hasMore && !loadingMore && (
            <div ref={observerTarget} className="h-20 flex items-center justify-center">
              <div className="text-zinc-400 text-sm">Scroll to load more videos...</div>
            </div>
          )}

          {/* End of results message */}
          {!hasMore && videos.length > 0 && (
            <div className="text-center py-8 text-zinc-500 text-sm">
              You've reached the end of the video library
            </div>
          )}
        </>
      )}

      {filteredVideos.length === 0 && !loading.videos && (
        <div className="py-12 sm:py-20 text-center border border-dashed border-zinc-200 rounded-2xl bg-zinc-50/50 px-4">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-zinc-100 rounded-xl flex items-center justify-center mx-auto mb-3 text-zinc-400">
             <Search size={16} className="sm:w-5 sm:h-5" />
          </div>
          <p className="text-zinc-900 font-medium text-sm">No videos found</p>
          <p className="text-zinc-500 text-xs mt-1 px-2">
            {showSavedOnly ? "You haven't saved any videos matching these filters." : "Try adjusting your search or filters."}
          </p>
          <button
            onClick={() => {setSearchTerm(''); setSelectedSubject('All'); setSelectedGrade('All'); setShowSavedOnly(false);}}
            className="mt-4 text-xs font-medium text-zinc-900 hover:text-black bg-zinc-100 px-3 py-1.5 rounded-md transition-colors"
          >
            Clear all filters
          </button>
        </div>
      )}
    </div>
  );
};

const VideoCard: React.FC<{ video: VideoLesson }> = ({ video }) => {
  const { user, toggleBookmark } = useAuth();
  const isBookmarked = user?.bookmarks?.includes(video.id);
  const [isBookmarking, setIsBookmarking] = useState(false);

  const handleBookmarkClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (user) {
      setIsBookmarking(true);
      try {
        await toggleBookmark(video.id, 'video');
      } catch (error) {
        console.error('Failed to toggle bookmark:', error);
      } finally {
        setIsBookmarking(false);
      }
    }
  };

  return (
    <div className="group bg-white rounded-xl border border-zinc-200 overflow-hidden hover:border-zinc-300 hover:shadow-card transition-all flex flex-col h-full relative">
      {/* Bookmark Button */}
      {user && (
        <button
          onClick={handleBookmarkClick}
          disabled={isBookmarking}
          className={`absolute top-2 right-2 sm:top-3 sm:right-3 z-10 w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
            isBookmarked
              ? 'bg-amber-500 text-white shadow-lg hover:bg-amber-600'
              : 'bg-white/90 backdrop-blur-sm text-zinc-600 hover:bg-white shadow-md'
          }`}
        >
          {isBookmarking ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Bookmark size={12} className={isBookmarked ? "fill-current text-white" : ""} />
          )}
        </button>
      )}

      <Link to={`/video/${video.id}`} className="flex flex-col h-full">
        <div className="relative aspect-video bg-zinc-100 overflow-hidden">
          {video.thumbnail ? (
            <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover opacity-90 group-hover:scale-105 transition-transform duration-500" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-100 to-zinc-200">
              <PlayCircle size={36} className="sm:w-12 sm:h-12 text-zinc-400 opacity-60" />
            </div>
          )}

          {/* Play overlay - appears on hover */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-all duration-300">
            <div className="w-14 h-14 sm:w-20 sm:h-20 bg-white rounded-full flex items-center justify-center shadow-2xl opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100 transition-all duration-300">
              <div className="w-0 h-0 border-l-[12px] sm:border-l-[16px] border-l-zinc-900 border-t-[8px] sm:border-t-[10px] border-t-transparent border-b-[8px] sm:border-b-[10px] border-b-transparent ml-1"></div>
            </div>
          </div>

          {video.isPremium && (
            <div className="absolute top-2 left-2 sm:top-3 sm:left-3 bg-zinc-900/90 text-white px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md text-[9px] sm:text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 backdrop-blur-sm shadow-sm">
              <Lock size={8} className="sm:w-2.5 sm:h-2.5" /> Premium
            </div>
          )}
          <div className="absolute bottom-2 left-2 sm:bottom-3 sm:left-3 flex gap-1.5 sm:gap-2">
             <span className="bg-white/90 backdrop-blur-sm px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-zinc-800 border border-black/5 shadow-sm">
               {video.subject}
             </span>
             <span className="bg-white/90 backdrop-blur-sm px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-zinc-800 border border-black/5 shadow-sm">
               Grade {video.grade}
             </span>
          </div>
        </div>

        <div className="p-3 sm:p-5 flex-1 flex flex-col">
          <h3 className="font-semibold text-zinc-900 leading-snug mb-2 line-clamp-2 group-hover:text-zinc-600 transition-colors text-sm sm:text-base">{video.title}</h3>
          <p className="text-zinc-500 text-xs sm:text-sm mb-3 sm:mb-4 line-clamp-2 flex-1 font-light leading-relaxed">
            {video.description}
          </p>

          <div className="flex items-center justify-between pt-3 sm:pt-4 border-t border-zinc-50 mt-auto">
            <div className="flex items-center gap-3 text-[10px] sm:text-[11px] text-zinc-400 font-medium">
              <span className="flex items-center gap-1">
                <PlayCircle size={10} className="sm:w-3 sm:h-3" />
                {video.views.toLocaleString()}
              </span>
              <span className="w-1 h-1 bg-zinc-300 rounded-full"></span>
              <span>{video.likes} likes</span>
            </div>
            <span className="text-xs font-medium text-zinc-900 flex items-center gap-1 sm:gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-2 group-hover:translate-x-0">
              Watch <PlayCircle size={12} className="sm:w-3.5 sm:h-3.5" />
            </span>
          </div>
        </div>
      </Link>
    </div>
  );
};

export default VideoLibrary;