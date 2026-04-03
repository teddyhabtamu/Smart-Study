import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Search, PlayCircle, Lock, Bookmark, Loader2, ArrowLeft, ArrowUpDown, GraduationCap, BookOpen, FlaskConical, Globe, Calculator, BookMarked, Atom, Dna, Compass, ChevronRight } from 'lucide-react';
import { SUBJECTS } from '../constants';
import { VideoLesson } from '../types';
import CustomSelect, { Option } from '../components/CustomSelect';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { VideoCardSkeleton } from '../components/Skeletons';
import { convertGoogleDriveImageUrl } from '../utils/imageUtils';
import { useSEO, pageSEO } from '../utils/seoUtils';
import { videosAPI } from '../services/api';

const INITIAL_LIMIT = 16;
const LOAD_MORE_LIMIT = 12;

// Map subjects to icons for the pills
const SUBJECT_ICONS: Record<string, React.ReactNode> = {
  'Mathematics': <Calculator size={14} />,
  'Physics': <Atom size={14} />,
  'Chemistry': <FlaskConical size={14} />,
  'Biology': <Dna size={14} />,
  'English': <BookOpen size={14} />,
  'History': <BookMarked size={14} />,
  'Geography': <Globe size={14} />,
};

// Grade card data
const GRADE_DATA: Record<number, { tagline: string; subjects: string }> = {
  9: { tagline: 'Foundation Year', subjects: 'Math · Biology · Chemistry · Physics' },
  10: { tagline: 'Intermediate Year', subjects: 'Math · English · History · Geography' },
  11: { tagline: 'Advanced Year', subjects: 'Physics · Chemistry · Civics · IT' },
  12: { tagline: 'Final Year', subjects: 'All Subjects · Exam Prep' },
};

const VideoLibrary: React.FC = () => {
  const { videos, fetchVideos, fetchMoreVideos, loading, errors } = useData();
  const { user } = useAuth();
  const location = useLocation();
  const { updateSEO } = useSEO();

  useEffect(() => {
    updateSEO(pageSEO.videos);
  }, [updateSEO]);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('All');
  const [selectedGrade, setSelectedGrade] = useState<number | 'All'>('All');
  const [selectedChapter, setSelectedChapter] = useState('All');
  const [chapterOptions, setChapterOptions] = useState<Option[]>([{ label: 'All Chapters', value: 'All' }]);
  const [sortBy, setSortBy] = useState('newest');
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [topVideos, setTopVideos] = useState<VideoLesson[]>([]);
  const [topVideosLoading, setTopVideosLoading] = useState(true);

  const observerTarget = useRef<HTMLDivElement>(null);
  const prevLocationRef = useRef<string>('');

  const isLandingMode = selectedGrade === 'All' && !searchTerm.trim() && !showSavedOnly;
  const hasBookmarks = user && user.bookmarks && user.bookmarks.length > 0;

  // Fetch top videos for landing page
  useEffect(() => {
    if (!isLandingMode) return;
    setTopVideosLoading(true);

    // videosAPI.getAll with bookmarked=true works on the backend even though the type doesn't list it
    const params: any = { limit: 8 };
    if (hasBookmarks) params.bookmarked = true;

    videosAPI.getAll(params).then((res: any) => {
      const data = res.videos || res.data || [];
      setTopVideos(data);
    }).catch((err: any) => console.error('Failed to load top videos:', err))
      .finally(() => setTopVideosLoading(false));
  }, [isLandingMode, user]);

  // Fetch filtered videos for drill-down mode
  useEffect(() => {
    if (isLandingMode) return;

    setHasMore(true);
    setLoadingMore(false);

    const params: any = { limit: INITIAL_LIMIT, offset: 0 };
    if (selectedSubject !== 'All') params.subject = selectedSubject;
    if (selectedGrade !== 'All') params.grade = selectedGrade;
    if (selectedChapter !== 'All') params.chapter = selectedChapter;
    if (searchTerm.trim()) params.search = searchTerm;
    if (showSavedOnly) params.bookmarked = true;
    if (sortBy !== 'newest') params.sort = sortBy;

    fetchVideos(params).then((result) => {
      if (result) setHasMore(result.hasMore);
    });
  }, [fetchVideos, isLandingMode, selectedSubject, selectedGrade, selectedChapter, searchTerm, showSavedOnly, sortBy]);

  // Fetch chapters when grade and subject change
  useEffect(() => {
    if (selectedGrade !== 'All' && selectedSubject !== 'All') {
      videosAPI.getTopics(selectedGrade as number, selectedSubject)
        .then((topics: string[]) => {
          if (topics && topics.length > 0) {
            setChapterOptions([{ label: 'All Chapters', value: 'All' }, ...topics.map(t => ({ label: t, value: t }))]);
          } else {
            setChapterOptions([{ label: 'All Chapters', value: 'All' }]);
          }
        })
        .catch(() => setChapterOptions([{ label: 'All Chapters', value: 'All' }]));
    } else {
      setChapterOptions([{ label: 'All Chapters', value: 'All' }]);
    }
  }, [selectedGrade, selectedSubject]);

  useEffect(() => { setSelectedChapter('All'); }, [selectedGrade, selectedSubject]);

  useEffect(() => {
    const currentPath = location.pathname;
    const prevPath = prevLocationRef.current;
    if (currentPath === '/videos' && prevPath.startsWith('/video/') && !isLandingMode) {
      const params: any = { limit: INITIAL_LIMIT, offset: 0 };
      if (selectedSubject !== 'All') params.subject = selectedSubject;
      if (selectedGrade !== 'All') params.grade = selectedGrade;
      if (selectedChapter !== 'All') params.chapter = selectedChapter;
      if (searchTerm.trim()) params.search = searchTerm;
      fetchVideos(params).then((result) => { if (result) setHasMore(result.hasMore); });
    }
    prevLocationRef.current = currentPath;
  }, [location.pathname]);

  const loadMoreVideos = useCallback(async () => {
    if (loadingMore || !hasMore || isLandingMode) return;
    setLoadingMore(true);
    const params: any = { limit: LOAD_MORE_LIMIT, offset: videos.length };
    if (selectedSubject !== 'All') params.subject = selectedSubject;
    if (selectedGrade !== 'All') params.grade = selectedGrade;
    if (selectedChapter !== 'All') params.chapter = selectedChapter;
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
  }, [loadingMore, hasMore, isLandingMode, videos.length, selectedSubject, selectedGrade, selectedChapter, searchTerm, showSavedOnly, sortBy, fetchMoreVideos]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading.videos && !isLandingMode) {
          loadMoreVideos();
        }
      },
      { threshold: 0.1 }
    );
    const currentTarget = observerTarget.current;
    if (currentTarget) observer.observe(currentTarget);
    return () => { if (currentTarget) observer.unobserve(currentTarget); };
  }, [hasMore, loadingMore, loading.videos, isLandingMode, loadMoreVideos]);

  const filteredVideos = React.useMemo(() => {
    const seen = new Set<string>();
    return videos.filter(video => {
      if (seen.has(video.id)) return false;
      seen.add(video.id);
      return true;
    });
  }, [videos]);

  const sortOptions: Option[] = [
    { label: 'Newest First', value: 'newest' },
    { label: 'Most Popular', value: 'popular' },
    { label: 'A-Z Title', value: 'title' },
  ];

  const handleGradeSelect = (grade: number) => {
    setSelectedGrade(grade);
    setSelectedSubject('All');
    setSearchTerm('');
  };

  const handleBackToLanding = () => {
    setSelectedGrade('All');
    setSelectedSubject('All');
    setSearchTerm('');
    setShowSavedOnly(false);
  };

  return (
    <div className="space-y-8 animate-fade-in pb-12">

      {/* ─── Page Header ─── */}
      <div className="flex flex-col gap-5">
        <div>
          {selectedGrade !== 'All' ? (
            <div className="flex items-center gap-3 animate-fade-in">
              <button
                onClick={handleBackToLanding}
                className="flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-900 bg-white border border-zinc-200 px-3 py-1.5 rounded-lg transition-colors shadow-sm hover:shadow"
              >
                <ArrowLeft size={14} /> All Grades
              </button>
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 bg-zinc-900 rounded-lg flex items-center justify-center">
                  <GraduationCap size={14} className="text-white" />
                </div>
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900">Grade {selectedGrade}</h1>
              </div>
            </div>
          ) : (
            <>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900">Video Classroom</h1>
              <p className="text-zinc-500 text-sm mt-1">Watch expert-led lessons for every subject and grade.</p>
            </>
          )}
        </div>

        {/* Universal Search */}
        <div className="relative max-w-2xl">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-zinc-400" />
          </div>
          <input
            type="text"
            className="block w-full pl-10 pr-4 py-2.5 bg-white border border-zinc-200 rounded-xl text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-400 transition-all shadow-sm"
            placeholder="Search across all grades and subjects..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {isLandingMode ? (
        /* ═══════════════ LANDING MODE ═══════════════ */
        <div className="space-y-10 animate-fade-in">

          {/* Grade Selection Grid — ALWAYS at the top */}
          <section>
            <h2 className="font-bold text-zinc-900 text-[15px] mb-4">Choose Your Grade</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {([9, 10, 11, 12] as const).map((grade) => {
                const info = GRADE_DATA[grade];
                return (
                  <button
                    key={grade}
                    onClick={() => handleGradeSelect(grade)}
                    className="group relative bg-white rounded-2xl border border-zinc-200 p-4 sm:p-6 text-left overflow-hidden hover:border-zinc-400 hover:shadow-card transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                  >
                    {/* Subtle dot pattern background */}
                    <div className="absolute inset-0 bg-grid-pattern opacity-40 pointer-events-none rounded-2xl" />

                    <div className="relative z-10">
                      {/* Grade number badge */}
                      <div className="w-10 h-10 sm:w-12 sm:h-12 bg-zinc-900 text-white rounded-xl flex items-center justify-center font-black text-base sm:text-lg mb-3 sm:mb-4 group-hover:scale-105 transition-transform duration-200 shadow-sm">
                        {grade}
                      </div>

                      <h3 className="font-bold text-zinc-900 text-base sm:text-lg leading-none mb-1">
                        Grade {grade}
                      </h3>
                      <p className="text-xs text-zinc-500 font-medium mb-2 sm:mb-3">{info.tagline}</p>
                      <p className="text-[11px] text-zinc-400 leading-relaxed hidden sm:block">{info.subjects}</p>

                      {/* Arrow link indicator */}
                      <div className="mt-3 sm:mt-4 flex items-center gap-1 text-xs font-semibold text-zinc-900 opacity-0 group-hover:opacity-100 translate-x-0 group-hover:translate-x-0.5 transition-all duration-200">
                        Explore <ChevronRight size={13} />
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Saved / New Arrivals strip — below grade cards */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-zinc-900 flex items-center gap-2 text-[15px]">
                <Compass size={16} className="text-zinc-500" />
                {hasBookmarks ? 'Saved for Later' : 'New This Week'}
              </h2>
            </div>

            {/* Horizontal scrolling strip */}
            <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-3 hide-scrollbar -mx-4 px-4 sm:-mx-1 sm:px-1 snap-x snap-mandatory">
              {topVideosLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="w-[75vw] sm:w-72 flex-shrink-0 snap-start">
                    <VideoCardSkeleton />
                  </div>
                ))
              ) : topVideos.length > 0 ? (
                topVideos.map(video => (
                  <div key={video.id} className="w-[75vw] sm:w-72 flex-shrink-0 snap-start">
                    <VideoCard video={video} compact />
                  </div>
                ))
              ) : (
                <div className="w-full py-8 text-center text-zinc-500 text-sm border border-dashed border-zinc-200 rounded-xl">
                  {hasBookmarks ? 'Your saved videos will appear here.' : 'No videos yet.'}
                </div>
              )}
            </div>
          </section>

        </div>
      ) : (
        /* ═══════════════ DRILL-DOWN MODE ═══════════════ */
        <div className="space-y-5 animate-fade-in">

          {/* Subject Pills Row */}
          <div className="flex gap-2 overflow-x-auto pb-1 hide-scrollbar -mx-1 px-1">
            <button
              onClick={() => setSelectedSubject('All')}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs sm:text-sm font-semibold whitespace-nowrap border transition-all flex-shrink-0 ${selectedSubject === 'All'
                ? 'bg-zinc-900 text-white border-zinc-900 shadow-sm'
                : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400 hover:text-zinc-900'
                }`}
            >
              All Subjects
            </button>
            {SUBJECTS.map((subject) => (
              <button
                key={subject}
                onClick={() => setSelectedSubject(subject)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs sm:text-sm font-semibold whitespace-nowrap border transition-all flex-shrink-0 ${selectedSubject === subject
                  ? 'bg-zinc-900 text-white border-zinc-900 shadow-sm'
                  : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400 hover:text-zinc-900'
                  }`}
              >
                {SUBJECT_ICONS[subject] && (
                  <span className="opacity-70">{SUBJECT_ICONS[subject]}</span>
                )}
                {subject}
              </button>
            ))}
          </div>

          {/* Secondary Controls Row */}
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
            <div className="w-full sm:w-60">
              <CustomSelect
                options={chapterOptions}
                value={selectedChapter}
                onChange={setSelectedChapter}
                placeholder="Filter by Chapter..."
              />
            </div>

            {user && (
              <button
                onClick={() => setShowSavedOnly(!showSavedOnly)}
                className={`flex items-center justify-center gap-1.5 px-3.5 py-[10px] rounded-xl text-sm font-medium border transition-colors whitespace-nowrap ${showSavedOnly
                  ? 'bg-zinc-900 text-white border-zinc-900'
                  : 'bg-white text-zinc-600 border-zinc-200 hover:border-zinc-400'
                  }`}
              >
                <Bookmark size={14} className={showSavedOnly ? 'fill-current' : ''} />
                Saved Only
              </button>
            )}

            <div className="sm:ml-auto flex items-center gap-2">
              <div className="hidden sm:flex h-[42px] w-9 items-center justify-center bg-white rounded-xl text-zinc-400 border border-zinc-200 flex-shrink-0">
                <ArrowUpDown size={14} />
              </div>
              <div className="w-full sm:w-44">
                <CustomSelect options={sortOptions} value={sortBy} onChange={setSortBy} placeholder="Sort By" />
              </div>
            </div>
          </div>

          {/* Error State */}
          {errors.videos && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-5 text-center">
              <p className="text-red-800 font-semibold text-sm">Failed to load videos</p>
              <p className="text-red-600 text-xs mt-1">{errors.videos}</p>
              <button onClick={() => fetchVideos()} className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium">
                Try Again
              </button>
            </div>
          )}

          {/* Video Grid */}
          {loading.videos && videos.length === 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => <VideoCardSkeleton key={i} />)}
            </div>
          ) : !errors.videos && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
                {filteredVideos.map((video) => <VideoCard key={video.id} video={video} />)}
              </div>

              {loadingMore && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5 mt-2">
                  {[1, 2, 3, 4].map((i) => <VideoCardSkeleton key={`l-${i}`} />)}
                </div>
              )}

              {hasMore && !loadingMore && (
                <div ref={observerTarget} className="h-16 flex items-center justify-center">
                  <Loader2 className="w-4 h-4 text-zinc-300 animate-spin" />
                </div>
              )}

              {!hasMore && videos.length > 0 && (
                <p className="text-center py-6 text-zinc-400 text-xs font-medium">
                  You've reached the end · {videos.length} videos loaded
                </p>
              )}
            </>
          )}

          {/* Empty State */}
          {filteredVideos.length === 0 && !loading.videos && !errors.videos && (
            <div className="py-16 text-center border-2 border-dashed border-zinc-200 rounded-2xl bg-zinc-50/50">
              <div className="w-10 h-10 bg-white border border-zinc-200 rounded-xl flex items-center justify-center mx-auto mb-3 text-zinc-400 shadow-sm">
                <Search className="w-4 h-4" />
              </div>
              <p className="text-zinc-900 font-semibold text-sm">No videos found</p>
              <p className="text-zinc-500 text-xs mt-1 max-w-xs mx-auto">
                {showSavedOnly ? "No bookmarked videos match these filters." : "Try adjusting your filters or search term."}
              </p>
              <button
                onClick={() => { setSearchTerm(''); setSelectedSubject('All'); setSelectedChapter('All'); setShowSavedOnly(false); }}
                className="mt-4 text-xs font-semibold text-white bg-zinc-900 px-4 py-2 rounded-lg hover:bg-black transition-colors"
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ═══════════════════════════════════════════════
   VideoCard — matches system card style exactly
═══════════════════════════════════════════════ */
const VideoCard: React.FC<{ video: VideoLesson; compact?: boolean }> = ({ video, compact }) => {
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
      {/* Bookmark button */}
      {user && (
        <button
          onClick={handleBookmarkClick}
          disabled={isBookmarking}
          className={`absolute top-2.5 right-2.5 z-10 w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed ${isBookmarked
            ? 'bg-zinc-900 text-white shadow-md'
            : 'bg-white/90 backdrop-blur-sm text-zinc-600 hover:bg-white shadow opacity-0 group-hover:opacity-100'
            }`}
        >
          {isBookmarking ? <Loader2 size={12} className="animate-spin" /> : <Bookmark size={12} className={isBookmarked ? 'fill-current' : ''} />}
        </button>
      )}

      <Link to={`/video/${video.id}`} className="flex flex-col h-full">
        {/* Thumbnail */}
        <div className="relative aspect-video bg-zinc-100 overflow-hidden">
          {video.thumbnail ? (
            <img
              src={convertGoogleDriveImageUrl(video.thumbnail)}
              alt={video.title}
              className="w-full h-full object-cover opacity-90 group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-100 to-zinc-200">
              <PlayCircle className="w-10 h-10 text-zinc-300" />
            </div>
          )}

          {/* Play overlay */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-all duration-300">
            <div className="w-12 h-12 sm:w-14 sm:h-14 bg-white rounded-full flex items-center justify-center shadow-xl opacity-0 group-hover:opacity-100 scale-75 group-hover:scale-100 transition-all duration-300">
              <div className="w-0 h-0 border-l-[11px] border-l-zinc-900 border-t-[7px] border-t-transparent border-b-[7px] border-b-transparent ml-1"></div>
            </div>
          </div>

          {/* Premium badge */}
          {video.isPremium && (
            <div className="absolute top-2 left-2 sm:top-3 sm:left-3 bg-zinc-900/90 text-white px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold uppercase tracking-wide flex items-center gap-1 backdrop-blur-sm shadow-sm">
              <Lock size={8} /> Premium
            </div>
          )}

          {/* Meta badges (bottom) */}
          <div className="absolute bottom-2 left-2 sm:bottom-3 sm:left-3 flex gap-1.5">
            <span className="bg-white/90 backdrop-blur-sm px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-bold uppercase text-zinc-700 border border-black/5 shadow-sm">
              {video.subject}
            </span>
            <span className="bg-white/90 backdrop-blur-sm px-1.5 py-0.5 rounded text-[9px] sm:text-[10px] font-bold uppercase text-zinc-700 border border-black/5 shadow-sm">
              {video.grade === 0 ? 'General' : `G${video.grade}`}
            </span>
          </div>
        </div>

        {/* Card body */}
        <div className={`${compact ? 'p-3' : 'p-3 sm:p-5'} flex-1 flex flex-col`}>
          <h3 className={`font-semibold text-zinc-900 leading-snug mb-1.5 line-clamp-2 group-hover:text-zinc-600 transition-colors ${compact ? 'text-sm' : 'text-sm sm:text-base'}`}>
            {video.title}
          </h3>

          {!compact && (
            <p className="text-zinc-500 text-xs sm:text-sm mb-3 sm:mb-4 line-clamp-2 flex-1 font-light leading-relaxed">
              {video.description}
            </p>
          )}

          <div className="flex items-center justify-between pt-3 border-t border-zinc-50 mt-auto">
            <div className="flex items-center gap-2.5 text-[10px] sm:text-[11px] text-zinc-400 font-medium">
              <span className="flex items-center gap-1">
                <PlayCircle size={10} className="sm:w-3 sm:h-3" />
                {video.views.toLocaleString()}
              </span>
              <span className="w-1 h-1 bg-zinc-300 rounded-full"></span>
              <span>{video.likes} likes</span>
            </div>
            <span className="text-[10px] sm:text-xs font-semibold text-zinc-900 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              Watch <PlayCircle size={11} className="sm:w-3 sm:h-3" />
            </span>
          </div>
        </div>
      </Link>
    </div>
  );
};

export default VideoLibrary;