
import React, { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Search, Filter, PlayCircle, Clock, Lock, ArrowUpDown, Bookmark } from 'lucide-react';
import { SUBJECTS, GRADES } from '../constants';
import { VideoLesson } from '../types';
import CustomSelect, { Option } from '../components/CustomSelect';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { VideoCardSkeleton } from '../components/Skeletons';

const VideoLibrary: React.FC = () => {
  const { videos, fetchVideos, loading, errors } = useData();
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('All');
  const [selectedGrade, setSelectedGrade] = useState('All');
  const [sortBy, setSortBy] = useState('newest');
  const [showSavedOnly, setShowSavedOnly] = useState(false);

  // Fetch videos on mount and when filters change
  useEffect(() => {
    const params: any = {};

    if (selectedSubject !== 'All') params.subject = selectedSubject;
    if (selectedGrade !== 'All') params.grade = parseInt(selectedGrade);
    if (searchTerm.trim()) params.search = searchTerm;
    if (showSavedOnly) params.bookmarked = true;
    if (sortBy !== 'newest') params.sort = sortBy;

    fetchVideos(params);
  }, [fetchVideos, selectedSubject, selectedGrade, searchTerm, showSavedOnly, sortBy]);

  // Use videos directly since filtering is now done on the backend
  const filteredVideos = videos;

  const subjectOptions: Option[] = SUBJECTS.map(s => ({ label: s === 'All' ? 'All Subjects' : s, value: s }));
  const gradeOptions: Option[] = GRADES.map(g => ({ label: g === 'All' ? 'All Grades' : `Grade ${g}`, value: g }));
  const sortOptions: Option[] = [
    { label: 'Newest First', value: 'newest' },
    { label: 'Most Viewed', value: 'popular' },
    { label: 'A-Z Title', value: 'title' },
  ];

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Video Classroom</h1>
          <p className="text-zinc-500">Watch expert-led lessons for every subject.</p>
        </div>

        {/* Search & Filters */}
        <div className="space-y-4">
          <div className="relative">
             <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-5 w-5 text-zinc-400" />
             </div>
             <input
               type="text"
               className="block w-full pl-10 pr-3 py-3 bg-white border border-zinc-200 rounded-lg text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-300 transition-all shadow-sm"
               placeholder="Search topics, videos, or instructors..."
               value={searchTerm}
               onChange={(e) => setSearchTerm(e.target.value)}
             />
          </div>

          <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
            <div className="hidden lg:flex h-[42px] w-9 items-center justify-center bg-zinc-100 rounded-lg text-zinc-500 border border-zinc-200 flex-shrink-0">
               <Filter size={14} />
            </div>
            
            <div className="w-full lg:w-48">
              <CustomSelect 
                options={subjectOptions}
                value={selectedSubject}
                onChange={setSelectedSubject}
                placeholder="Select Subject"
              />
            </div>

            <div className="w-full lg:w-40">
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
                className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                  showSavedOnly 
                    ? 'bg-amber-50 text-amber-700 border-amber-200' 
                    : 'bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50'
                }`}
              >
                <Bookmark size={16} className={showSavedOnly ? "fill-current" : ""} />
                <span className="whitespace-nowrap">Saved</span>
              </button>
            )}

            <div className="w-full lg:w-48 lg:ml-auto flex items-center gap-2">
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

      {/* Video Grid */}
      {loading.videos ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <VideoCardSkeleton key={i} />
          ))}
        </div>
      ) : !errors.videos && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredVideos.map((video) => (
              <VideoCard key={video.id} video={video} />
            ))}
          </div>

          {filteredVideos.length === 0 && (
        <div className="py-20 text-center border border-dashed border-zinc-200 rounded-2xl bg-zinc-50/50">
          <div className="w-12 h-12 bg-zinc-100 rounded-xl flex items-center justify-center mx-auto mb-3 text-zinc-400">
             <PlayCircle size={20} />
          </div>
          <p className="text-zinc-900 font-medium text-sm">No videos found</p>
          <p className="text-zinc-500 text-xs mt-1">
            {showSavedOnly ? "You haven't saved any videos matching these filters." : "Try changing the filters to see more results."}
          </p>
          <button 
            onClick={() => {setSearchTerm(''); setSelectedSubject('All'); setSelectedGrade('All'); setShowSavedOnly(false);}}
            className="mt-4 text-xs font-medium text-zinc-900 hover:text-black bg-zinc-100 px-3 py-1.5 rounded-md transition-colors"
          >
            Clear all filters
          </button>
        </div>
      )}
        </>
      )}
    </div>
  );
};

const VideoCard: React.FC<{ video: VideoLesson }> = ({ video }) => {
  const { user, toggleBookmark } = useAuth();
  const isBookmarked = user?.bookmarks?.includes(video.id);

  const handleBookmarkClick = async (e: React.MouseEvent) => {
    e.preventDefault(); // Prevent navigation
    e.stopPropagation(); // Prevent event bubbling
    if (user) {
      try {
        await toggleBookmark(video.id, 'video');
      } catch (error) {
        console.error('Failed to toggle bookmark:', error);
      }
    }
  };

  return (
    <div className="group bg-white rounded-xl border border-zinc-200 overflow-hidden hover:border-zinc-300 hover:shadow-card transition-all flex flex-col h-full relative">
      {/* Bookmark Button - Positioned absolutely */}
      {user && (
        <button
          onClick={handleBookmarkClick}
          className={`absolute top-3 left-3 z-10 w-8 h-8 rounded-full flex items-center justify-center transition-all ${
            isBookmarked
              ? 'bg-amber-500 text-white shadow-lg hover:bg-amber-600'
              : 'bg-white/90 backdrop-blur-sm text-zinc-600 hover:bg-white shadow-md'
          }`}
        >
          <Bookmark size={14} className={isBookmarked ? "fill-current text-white" : ""} />
        </button>
      )}

      <Link to={`/video/${video.id}`} className="flex flex-col h-full">
        {/* Thumbnail Container */}
        <div className="relative aspect-video bg-zinc-900 overflow-hidden">
          <img
            src={video.thumbnail}
            alt={video.title}
            className="w-full h-full object-cover opacity-90 group-hover:scale-105 group-hover:opacity-80 transition-all duration-500"
          />

          {/* Play Overlay */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
             <div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center border border-white/50">
                <PlayCircle size={24} className="text-white fill-current" />
             </div>
          </div>

          {/* Badges */}
          {video.isPremium && (
            <div className="absolute top-2 right-2 bg-amber-500 text-white px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm">
              <Lock size={10} /> Pro
            </div>
          )}
        </div>
    
    <div className="p-4 flex-1 flex flex-col">
      <div className="flex justify-between items-start mb-2">
        <span className="text-[10px] font-bold text-zinc-900 uppercase tracking-wider bg-zinc-100 px-2 py-0.5 rounded-full border border-zinc-200">
            {video.subject} • Gr {video.grade}
        </span>
      </div>
      
      <h3 className="font-bold text-zinc-900 leading-snug mb-2 line-clamp-2 group-hover:text-zinc-600 transition-colors">
        {video.title}
      </h3>
      
      <p className="text-zinc-500 text-xs mb-4 line-clamp-2 leading-relaxed">
        {video.description}
      </p>
      
        <div className="mt-auto pt-3 border-t border-zinc-50 flex items-center justify-between text-xs text-zinc-400">
           <div className="flex items-center gap-1.5">
             <div className="w-5 h-5 bg-zinc-100 rounded-full flex items-center justify-center text-[9px] font-bold text-zinc-600">
                {video.instructor?.charAt(0) || '?'}
             </div>
             <span className="text-zinc-500">{video.instructor || 'Unknown'}</span>
           </div>
           <div className="flex items-center gap-1">
              <Clock size={12} />
              <span>{video.uploadedAt}</span>
           </div>
        </div>
      </div>
    </Link>
  </div>
  );
};

export default VideoLibrary;
