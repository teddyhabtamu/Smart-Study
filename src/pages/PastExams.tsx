import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Search, BookOpen, Lock, Filter, ArrowUpDown, Bookmark, Loader2, FileText, Crown } from 'lucide-react';
import { SUBJECTS, GRADES } from '../constants';
import { Document } from '../types';
import CustomSelect, { Option } from '../components/CustomSelect';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { DocumentCardSkeleton } from '../components/Skeletons';
import GoogleDriveImage from '../components/GoogleDriveImage';

const INITIAL_LIMIT = 16; // Load 16 exam papers initially
const LOAD_MORE_LIMIT = 12; // Load 12 more exam papers each time

const PastExams: React.FC = () => {
  const { documents, fetchDocuments, fetchMoreDocuments, loading, errors } = useData();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('All');
  const [selectedGrade, setSelectedGrade] = useState('All');
  const [sortBy, setSortBy] = useState('newest');
  const [showSavedOnly, setShowSavedOnly] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const observerTarget = useRef<HTMLDivElement>(null);

  // Debounced search: the fetch effect fires per value, so raw keystrokes
  // would spam a request per character (and race them — guarded in DataContext)
  const [debouncedSearch, setDebouncedSearch] = useState(searchTerm);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 400);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // Single param builder so initial load, retry, and load-more can't drift
  const buildParams = (limit: number, offset: number): any => {
    const params: any = {
      limit,
      offset,
      tag: 'past-exam', // Filter for past exam papers
    };
    if (selectedSubject !== 'All') params.subject = selectedSubject;
    if (selectedGrade !== 'All') params.grade = selectedGrade === 'General' ? 0 : parseInt(selectedGrade);
    if (debouncedSearch.trim()) params.search = debouncedSearch;
    if (showSavedOnly) params.bookmarked = true;
    if (sortBy !== 'newest') params.sort = sortBy;
    return params;
  };

  // Fetch initial exam papers on mount and when filters change
  useEffect(() => {
    // Reset pagination state when filters change
    setHasMore(true);
    setLoadingMore(false);

    fetchDocuments(buildParams(INITIAL_LIMIT, 0)).then((result) => {
      if (result) {
        setHasMore(result.hasMore);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchDocuments, selectedSubject, selectedGrade, debouncedSearch, showSavedOnly, sortBy]);

  // Load more exam papers function
  const loadMoreExams = useCallback(async () => {
    if (loadingMore || !hasMore) return;

    setLoadingMore(true);
    try {
      const result = await fetchMoreDocuments(buildParams(LOAD_MORE_LIMIT, documents.length));
      setHasMore(result.hasMore);
    } catch (error) {
      console.error('Failed to load more exam papers:', error);
    } finally {
      setLoadingMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingMore, hasMore, documents.length, selectedSubject, selectedGrade, debouncedSearch, showSavedOnly, sortBy, fetchMoreDocuments]);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading.documents) {
          loadMoreExams();
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
  }, [hasMore, loadingMore, loading.documents, loadMoreExams]);

  // Filter documents client-side as additional safety (backend should already filter, but this prevents flicker)
  const filteredExams = React.useMemo(() => {
    let filtered = documents;
    // Additional client-side filtering to ensure only past-exam documents are shown
    filtered = filtered.filter(doc => {
      if (!doc.tags || !Array.isArray(doc.tags)) return false; // Exclude docs with no tags
      return doc.tags.includes('past-exam'); // Only show past-exam documents
    });
    return filtered;
  }, [documents]);

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
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900">Past Exams</h1>
          <p className="text-zinc-500 text-sm sm:text-base">Access past exam papers and practice with real questions.</p>
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
               placeholder="Search by title, subject, or keyword..."
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
      {errors.documents && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
          <p className="text-red-800 font-medium">Failed to load exam papers</p>
          <p className="text-red-600 text-sm mt-1">{errors.documents}</p>
          {/* Retry keeps the visible filters — a bare refetch would show
              unfiltered results under a filtered UI */}
          <button
            onClick={() => fetchDocuments(buildParams(INITIAL_LIMIT, 0))}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Grid */}
      {loading.documents && documents.length === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <DocumentCardSkeleton key={i} />
          ))}
        </div>
      ) : !errors.documents && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
            {filteredExams.map((exam) => (
              <ExamCard key={exam.id} exam={exam} />
            ))}
          </div>

          {/* Loading more indicator */}
          {loadingMore && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6 mt-4">
              {[1, 2, 3, 4].map((i) => (
                <DocumentCardSkeleton key={`loading-${i}`} />
              ))}
            </div>
          )}

          {/* Intersection Observer target */}
          {hasMore && !loadingMore && (
            <div ref={observerTarget} className="h-20 flex items-center justify-center">
              <div className="text-zinc-400 text-sm">Scroll to load more exam papers...</div>
            </div>
          )}

          {/* End of results message */}
          {!hasMore && documents.length > 0 && (
            <div className="text-center py-8 text-zinc-500 text-sm">
              You've reached the end of the past exams library
            </div>
          )}
        </>
      )}

      {/* Suppressed while the error panel above shows — otherwise failure
          reads as "no results" and offers a misleading clear-filters */}
      {filteredExams.length === 0 && !loading.documents && !errors.documents && (
        <div className="py-12 sm:py-20 text-center border border-dashed border-zinc-200 rounded-2xl bg-zinc-50/50 px-4">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-zinc-100 rounded-xl flex items-center justify-center mx-auto mb-3 text-zinc-400">
             <FileText size={16} className="sm:w-5 sm:h-5" />
          </div>
          <p className="text-zinc-900 font-medium text-sm">No exam papers found</p>
          <p className="text-zinc-500 text-xs mt-1 px-2">
            {showSavedOnly ? "You haven't saved any exam papers matching these filters." : "Try adjusting your search or filters."}
          </p>
          <button
            onClick={() => {setSearchTerm(''); setSelectedSubject('All'); setSelectedGrade('All'); setShowSavedOnly(false); setSortBy('newest');}}
            className="mt-4 text-xs font-medium text-zinc-900 hover:text-black bg-zinc-100 px-3 py-1.5 rounded-md transition-colors"
          >
            Clear all filters
          </button>
        </div>
      )}
    </div>
  );
};

const ExamCard: React.FC<{ exam: Document }> = ({ exam }) => {
  const { user, toggleBookmark } = useAuth();
  const isBookmarked = user?.bookmarks?.includes(exam.id);
  const [isBookmarking, setIsBookmarking] = useState(false);

  const handleBookmarkClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (user) {
      setIsBookmarking(true);
      try {
        await toggleBookmark(exam.id, 'document');
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

      <Link to={`/document/${exam.id}`} className="flex flex-col h-full">
        <div className="relative h-32 sm:h-40 bg-zinc-100 overflow-hidden">
          {exam.preview_image ? (
            <GoogleDriveImage
              src={exam.preview_image}
              alt={exam.title}
              className="w-full h-full object-cover opacity-90 group-hover:scale-105 transition-transform duration-500"
              fallbackIcon={<FileText size={36} className="sm:w-12 sm:h-12 text-zinc-400 opacity-60" />}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-100 to-zinc-200">
              <FileText size={36} className="sm:w-12 sm:h-12 text-zinc-400 opacity-60" />
            </div>
          )}

          {/* Members see Pro (owned), everyone else the lock — same rule as
              the Library and Video cards */}
          {exam.is_premium && (
            user?.isPremium ? (
              <div className="absolute top-2 left-2 sm:top-3 sm:left-3 bg-amber-400 text-zinc-900 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md text-[9px] sm:text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-sm" title="Included in your Pro membership">
                <Crown size={8} className="sm:w-2.5 sm:h-2.5" /> Pro
              </div>
            ) : (
              <div className="absolute top-2 left-2 sm:top-3 sm:left-3 bg-zinc-900/90 text-white px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md text-[9px] sm:text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 backdrop-blur-sm shadow-sm">
                <Lock size={8} className="sm:w-2.5 sm:h-2.5" /> Premium
              </div>
            )
          )}
          <div className="absolute bottom-2 left-2 sm:bottom-3 sm:left-3 flex gap-1.5 sm:gap-2">
             <span className="bg-white/90 backdrop-blur-sm px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-zinc-800 border border-black/5 shadow-sm">
               {exam.subject}
             </span>
             <span className="bg-white/90 backdrop-blur-sm px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-zinc-800 border border-black/5 shadow-sm">
               {exam.grade === 0 ? 'General' : `Grade ${exam.grade}`}
             </span>
          </div>
        </div>

        <div className="p-3 sm:p-5 flex-1 flex flex-col">
          <h3 className="font-semibold text-zinc-900 leading-snug mb-2 line-clamp-2 group-hover:text-zinc-600 transition-colors text-sm sm:text-base">{exam.title}</h3>
          <p className="text-zinc-500 text-xs sm:text-sm mb-3 sm:mb-4 line-clamp-2 flex-1 font-light leading-relaxed">
            {exam.description}
          </p>

          <div className="flex items-center justify-between pt-3 sm:pt-4 border-t border-zinc-50 mt-auto">
            <span className="text-[10px] sm:text-[11px] text-zinc-400 font-medium uppercase tracking-wider flex items-center gap-1">
              {exam.file_type} • {exam.downloads} Downloads
            </span>
            <span className="text-xs font-medium text-zinc-900 flex items-center gap-1 sm:gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-2 group-hover:translate-x-0">
              View <BookOpen size={12} className="sm:w-3.5 sm:h-3.5" />
            </span>
          </div>
        </div>
      </Link>
    </div>
  );
};

export default PastExams;

