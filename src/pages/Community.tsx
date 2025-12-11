
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MessageSquare, ThumbsUp, Eye, Search, Plus, CheckCircle, X, Filter, Lock, Trophy, Loader2, ChevronDown, SlidersHorizontal } from 'lucide-react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { SUBJECTS, GRADES } from '../constants';
import { ForumPost, UserRole } from '../types';
import CustomSelect, { Option } from '../components/CustomSelect';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { useToast } from '../context/ToastContext';
import { usersAPI, forumAPI } from '../services/api';
import { ForumPostSkeleton, LeaderboardItemSkeleton } from '../components/Skeletons';

const Community: React.FC = () => {
  const { user } = useAuth();
  const { forumPosts, fetchForumPosts, createForumPost, loading, errors } = useData();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('All');
  const [mounted, setMounted] = useState(false);
  const [leaderboard, setLeaderboard] = useState<{ id: string; name: string; xp: number; level: number; initial: string; avatar?: string; rank: number; isUser?: boolean }[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newSubject, setNewSubject] = useState('Mathematics');
  const [newGrade, setNewGrade] = useState('9');
  const [isCreatingPost, setIsCreatingPost] = useState(false);
  const [votingPosts, setVotingPosts] = useState<Set<string>>(new Set()); // Track which posts are being voted on
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  useEffect(() => {
    setMounted(true);
    fetchForumPosts(); // Fetch forum posts on mount
    fetchLeaderboard(); // Fetch leaderboard data
    return () => setMounted(false);
  }, [fetchForumPosts]);

  // Refresh posts when navigating back to this page
  useEffect(() => {
    fetchForumPosts();
  }, [location.pathname, fetchForumPosts]);

  const fetchLeaderboard = async () => {
    try {
      setLeaderboardLoading(true);
      const data = await usersAPI.getLeaderboard(5); // Get top 5 learners

      // Sort by XP descending and take top 5 to ensure we have the highest XP users
      const sortedData = data
        .sort((a, b) => b.xp - a.xp)
        .slice(0, 5);

      let processedLeaderboard = [...sortedData];

      // If user is logged in, check if they're in the top 5
      if (user) {
        const currentUserInLeaderboard = processedLeaderboard.find(learner => learner.id === user.id);

        if (currentUserInLeaderboard) {
          // Mark current user in the list
          processedLeaderboard = processedLeaderboard.map(learner =>
            learner.id === user.id ? { ...learner, isUser: true } : learner
          );
        } else {
          // User is not in top 5, check if they should replace the lowest ranked user
          const lowestRanked = processedLeaderboard[processedLeaderboard.length - 1];
          if (user.xp > lowestRanked.xp) {
            // Replace the lowest ranked user with current user
            processedLeaderboard[processedLeaderboard.length - 1] = {
              id: user.id,
              name: user.name,
              xp: user.xp,
              level: user.level,
              initial: user.name.charAt(0).toUpperCase(),
              avatar: user.avatar,
              rank: lowestRanked.rank, // Keep the rank
              isUser: true
            };
          }
        }
      }

      // Update ranks based on the final sorted order
      processedLeaderboard = processedLeaderboard
        .sort((a, b) => b.xp - a.xp)
        .map((learner, index) => ({
          ...learner,
          rank: index + 1
        }));

      setLeaderboard(processedLeaderboard);
    } catch (error) {
      console.error('Failed to fetch leaderboard:', error);
      // Fallback: show current user if logged in
      if (user) {
        setLeaderboard([{
          id: user.id,
          name: user.name,
          xp: user.xp,
          level: user.level,
          initial: user.name.charAt(0).toUpperCase(),
          avatar: user.avatar,
          rank: 1,
          isUser: true
        }]);
      } else {
        setLeaderboard([]);
      }
    } finally {
      setLeaderboardLoading(false);
    }
  };

  const filteredPosts = forumPosts.filter(post => {
    const matchesSearch =
      post.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      post.content.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSubject = selectedSubject === 'All' || post.subject === selectedSubject;
    return matchesSearch && matchesSubject;
  });

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      navigate('/login');
      return;
    }

    setIsCreatingPost(true);
    try {
      await createForumPost({
        title: newTitle,
        content: newContent,
        subject: newSubject,
        grade: parseInt(newGrade),
        tags: []
      });

      setIsModalOpen(false);
      setNewTitle('');
      setNewContent('');
      setNewSubject('Mathematics');
      setNewGrade('9');

      // Refresh the posts list to show the new post
      fetchForumPosts();
    } catch (error) {
      console.error('Failed to create forum post:', error);
      // TODO: Show error toast
    } finally {
      setIsCreatingPost(false);
    }
  };

  const handleVote = async (postId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (!user) {
      navigate('/login');
      return;
    }

    // Prevent multiple votes on the same post
    if (votingPosts.has(postId)) return;

    setVotingPosts(prev => new Set(prev).add(postId));

    try {
      await forumAPI.votePost(postId, 1); // Always upvote from list view

      // Refresh the forum posts to get updated vote counts
      await fetchForumPosts();

      addToast('Post upvoted!', 'success');
    } catch (error) {
      console.error('Failed to vote on post:', error);
      addToast('Failed to vote. Please try again.', 'error');
    } finally {
      setVotingPosts(prev => {
        const newSet = new Set(prev);
        newSet.delete(postId);
        return newSet;
      });
    }
  };

  const handlePostClick = (postId: string) => {
    if (!user) {
      navigate('/login', { state: { from: `/community/${postId}` } });
      return;
    }
    navigate(`/community/${postId}`);
  };

  const handleAskQuestion = () => {
    if (!user) {
      navigate('/login');
      return;
    }

    if (!user.isPremium) {
      navigate('/subscription', { state: { from: location.pathname } });
      return;
    }

    setIsModalOpen(true);
  };

  const subjectOptions: Option[] = SUBJECTS.map(s => ({ label: s === 'All' ? 'All Topics' : s, value: s }));
  const postSubjectOptions: Option[] = SUBJECTS.filter(s => s !== 'All').map(s => ({ label: s, value: s }));
  const gradeOptions: Option[] = GRADES.filter(g => g !== 'All').map(g => ({ label: `Grade ${g}`, value: g }));

  return (
    <div className="space-y-8 animate-fade-in">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900">Student Community</h1>
            <p className="text-zinc-500 text-sm sm:text-base">Ask questions, share knowledge, and learn together.</p>
          </div>

          <button
            onClick={handleAskQuestion}
            className="px-4 sm:px-5 py-2 sm:py-2.5 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-zinc-900/10 group self-start sm:self-auto"
          >
            {user && !user.isPremium ? <Lock size={14} className="sm:w-4 sm:h-4 text-zinc-400 group-hover:text-white transition-colors" /> : <Plus size={14} className="sm:w-4 sm:h-4" />}
            Ask Question
          </button>
        </div>
      </div>

      {/* Mobile Search Bar */}
      <div className="lg:hidden">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            className="w-full pl-10 pr-4 py-3 bg-white border border-zinc-200 rounded-lg text-sm focus:outline-none focus:border-zinc-400 shadow-sm"
            placeholder="Search discussions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Mobile Leaderboard */}
      <div className="lg:hidden">
        <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-sm">
          <h3 className="font-bold text-zinc-900 mb-4 flex items-center gap-2 text-sm">
            <Trophy size={16} className="text-amber-500" /> Top Learners
          </h3>
          <div className="grid grid-cols-1 gap-3">
             {leaderboardLoading ? (
               <>
                 <div className="animate-pulse flex items-center justify-between p-3 bg-zinc-50 rounded-lg">
                   <div className="flex items-center gap-3">
                     <div className="w-8 h-8 bg-zinc-200 rounded-full"></div>
                     <div>
                       <div className="w-20 h-3 bg-zinc-200 rounded mb-1"></div>
                       <div className="w-12 h-2 bg-zinc-200 rounded"></div>
                     </div>
                   </div>
                   <div className="w-16 h-6 bg-zinc-200 rounded"></div>
                 </div>
                 <div className="animate-pulse flex items-center justify-between p-3 bg-zinc-50 rounded-lg">
                   <div className="flex items-center gap-3">
                     <div className="w-8 h-8 bg-zinc-200 rounded-full"></div>
                     <div>
                       <div className="w-20 h-3 bg-zinc-200 rounded mb-1"></div>
                       <div className="w-12 h-2 bg-zinc-200 rounded"></div>
                     </div>
                   </div>
                   <div className="w-16 h-6 bg-zinc-200 rounded"></div>
                 </div>
               </>
             ) : leaderboard.length > 0 ? (
               leaderboard.slice(0, 3).map((learner) => (
                 <div key={learner.id} className={`flex items-center justify-between p-3 rounded-lg ${learner.isUser ? 'bg-amber-50 border border-amber-200' : 'bg-zinc-50'}`}>
                    <div className="flex items-center gap-3">
                       <div className="w-6 h-6 rounded-full bg-zinc-200 flex items-center justify-center text-[10px] font-bold text-zinc-600">
                          {learner.rank}
                       </div>
                       <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-xs font-bold text-zinc-600 border border-zinc-200">
                          {learner.initial}
                       </div>
                       <div>
                          <p className={`text-sm font-bold ${learner.isUser ? 'text-amber-900' : 'text-zinc-900'}`}>
                             {learner.name}
                          </p>
                          <p className="text-xs text-zinc-500">Level {learner.level}</p>
                       </div>
                    </div>
                    <div className="text-sm font-mono font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded">
                       {learner.xp.toLocaleString()} XP
                    </div>
                 </div>
               ))
             ) : (
               <div className="text-center py-4 text-zinc-500 text-sm">
                 No learners found
               </div>
             )}
          </div>
          {leaderboard.length > 3 && (
            <div className="mt-3 pt-3 border-t border-zinc-100">
              <p className="text-xs text-zinc-500 text-center">
                +{leaderboard.length - 3} more top learners
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar */}
        <div className="lg:col-span-1 space-y-4 sm:space-y-6">
          {/* Filters - Desktop */}
          <div className="hidden lg:block bg-white p-4 rounded-xl border border-zinc-200 shadow-sm">
            <h3 className="font-bold text-zinc-900 mb-4 flex items-center gap-2">
              <Filter size={16} /> Filter Topics
            </h3>

            <div className="space-y-4">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  className="w-full pl-9 pr-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:border-zinc-400"
                  placeholder="Search discussions..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-500 mb-1.5 uppercase tracking-wider">Subject</label>
                <div className="space-y-1">
                  {SUBJECTS.slice(0, 6).map(sub => (
                    <button
                      key={sub}
                      onClick={() => setSelectedSubject(sub)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                        selectedSubject === sub
                          ? 'bg-zinc-100 text-zinc-900 font-medium'
                          : 'text-zinc-600 hover:bg-zinc-50'
                      }`}
                    >
                      {sub === 'All' ? 'All Topics' : sub}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Mobile Filters */}
          <div className="lg:hidden">
            {/* Mobile Filter Button */}
            <button
              onClick={() => setShowMobileFilters(true)}
              className="w-full bg-white p-3 rounded-xl border border-zinc-200 shadow-sm flex items-center justify-between hover:border-zinc-300 transition-colors"
            >
              <div className="flex items-center gap-2">
                <SlidersHorizontal size={16} className="text-zinc-500" />
                <span className="text-sm font-medium text-zinc-900">
                  {selectedSubject === 'All' ? 'All Topics' : selectedSubject}
                  {searchTerm && ` • "${searchTerm}"`}
                </span>
              </div>
              <ChevronDown size={16} className="text-zinc-400" />
            </button>

            {/* Mobile Filters Modal */}
            {showMobileFilters && createPortal(
              <div className="fixed inset-0 z-[300] flex items-end animate-fade-in">
                {/* Backdrop */}
                <div
                  className="fixed inset-0 bg-black/50 backdrop-blur-sm"
                  onClick={() => setShowMobileFilters(false)}
                />

                {/* Modal */}
                <div className="relative w-full bg-white rounded-t-2xl shadow-2xl animate-fade-in max-h-[80vh] overflow-hidden">
                  <div className="p-4 border-b border-zinc-100">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-zinc-900 text-base">Filter Discussions</h3>
                      <button
                        onClick={() => setShowMobileFilters(false)}
                        className="p-2 text-zinc-400 hover:text-zinc-900 rounded-lg hover:bg-zinc-100 transition-colors"
                      >
                        <X size={20} />
                      </button>
                    </div>
                  </div>

                  <div className="p-4 space-y-6 overflow-y-auto max-h-[calc(80vh-80px)]">
                    {/* Search */}
                    <div>
                      <label className="block text-sm font-semibold text-zinc-900 mb-2">Search</label>
                      <div className="relative">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                        <input
                          type="text"
                          className="w-full pl-10 pr-4 py-3 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:border-zinc-400"
                          placeholder="Search discussions..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* Subject Filter */}
                    <div>
                      <label className="block text-sm font-semibold text-zinc-900 mb-3">Subject</label>
                      <div className="grid grid-cols-2 gap-2">
                        {SUBJECTS.map(sub => (
                          <button
                            key={sub}
                            onClick={() => setSelectedSubject(sub)}
                            className={`p-3 rounded-lg text-sm font-medium transition-colors border ${
                              selectedSubject === sub
                                ? 'bg-zinc-900 text-white border-zinc-900'
                                : 'bg-zinc-50 text-zinc-700 border-zinc-200 hover:bg-zinc-100'
                            }`}
                          >
                            {sub === 'All' ? 'All Topics' : sub}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Apply Filters Button */}
                    <div className="pt-4 border-t border-zinc-100 space-y-3">
                      <div className="flex gap-3">
                        <button
                          onClick={() => {
                            setSelectedSubject('All');
                            setSearchTerm('');
                          }}
                          className="flex-1 py-2.5 bg-zinc-100 text-zinc-700 font-medium rounded-lg hover:bg-zinc-200 transition-colors text-sm"
                        >
                          Clear All
                        </button>
                        <button
                          onClick={() => setShowMobileFilters(false)}
                          className="flex-1 py-2.5 bg-zinc-900 text-white font-medium rounded-lg hover:bg-zinc-800 transition-colors text-sm"
                        >
                          Apply Filters
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>,
              document.body
            )}
          </div>

          {/* Leaderboard - Desktop Only */}
          <div className="hidden lg:block bg-white p-4 rounded-xl border border-zinc-200 shadow-sm">
            <h3 className="font-bold text-zinc-900 mb-4 flex items-center gap-2">
              <Trophy size={16} className="text-amber-500" /> Top Learners
            </h3>
            <div className="space-y-3">
               {leaderboardLoading ? (
                 <>
                   <LeaderboardItemSkeleton />
                   <LeaderboardItemSkeleton />
                   <LeaderboardItemSkeleton />
                   <LeaderboardItemSkeleton />
                   <LeaderboardItemSkeleton />
                 </>
               ) : leaderboard.length > 0 ? (
                 leaderboard.map((learner) => (
                   <div key={learner.id} className={`flex items-center justify-between p-3 rounded-lg transition-colors ${learner.isUser ? 'bg-amber-50 border border-amber-200' : 'hover:bg-zinc-50'}`}>
                      <div className="flex items-center gap-3">
                         <div className="w-6 h-6 rounded-full bg-zinc-200 flex items-center justify-center text-xs font-bold text-zinc-600">
                            {learner.rank}
                         </div>
                         <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-xs font-bold text-zinc-600 border border-zinc-200">
                            {learner.initial}
                         </div>
                         <div>
                            <p className={`text-sm font-bold ${learner.isUser ? 'text-amber-900' : 'text-zinc-900'}`}>
                               {learner.name}
                            </p>
                            <p className="text-xs text-zinc-500">Level {learner.level}</p>
                         </div>
                      </div>
                      <div className="text-sm font-mono font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded">
                         {learner.xp.toLocaleString()} XP
                      </div>
                   </div>
                 ))
               ) : (
                 <div className="text-center py-4 text-zinc-500 text-sm">
                   No learners found
                 </div>
               )}
            </div>
          </div>
        </div>

        {/* Posts List */}
        <div className="lg:col-span-3 space-y-4">
          {/* Error State */}
          {errors.forumPosts && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
              <p className="text-red-800 font-medium">Failed to load forum posts</p>
              <p className="text-red-600 text-sm mt-1">{errors.forumPosts}</p>
              <button
                onClick={() => fetchForumPosts()}
                className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Loading State */}
          {loading.forumPosts ? (
            <>
              <ForumPostSkeleton />
              <ForumPostSkeleton />
              <ForumPostSkeleton />
              <ForumPostSkeleton />
            </>
          ) : !errors.forumPosts && filteredPosts.map(post => (
            <div
              key={post.id}
              onClick={() => handlePostClick(post.id)}
              className="block bg-white p-4 sm:p-6 rounded-xl border border-zinc-200 shadow-sm hover:border-zinc-300 hover:shadow-md transition-all group cursor-pointer"
            >
              <div className="flex items-start gap-3 sm:gap-4">
                {/* Vote Section */}
                <div className="flex flex-col items-center gap-1 min-w-[2.5rem] sm:min-w-[3rem]">
                  <button
                    onClick={(e) => handleVote(post.id, e)}
                    disabled={votingPosts.has(post.id)}
                    className="text-zinc-400 hover:text-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center p-1"
                  >
                    {votingPosts.has(post.id) ? (
                      <Loader2 size={16} className="sm:w-[18px] sm:h-[18px] animate-spin" />
                    ) : (
                      <ThumbsUp size={16} className="sm:w-[18px] sm:h-[18px]" />
                    )}
                  </button>
                  <span className="font-bold text-zinc-900 text-sm">{post.votes}</span>
                </div>

                {/* Post Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-1 sm:gap-2 mb-1">
                    <span className="text-xs font-medium text-zinc-500 bg-zinc-100 px-1.5 sm:px-2 py-0.5 rounded border border-zinc-200">
                      {post.subject}
                    </span>
                    <span className="text-xs font-medium text-zinc-500 bg-zinc-100 px-1.5 sm:px-2 py-0.5 rounded border border-zinc-200">
                      Grade {post.grade}
                    </span>
                    {post.isSolved && (
                      <span className="text-[9px] sm:text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded flex items-center gap-1">
                        <CheckCircle size={8} className="sm:w-2.5 sm:h-2.5" /> SOLVED
                      </span>
                    )}
                    <span className="text-xs text-zinc-400 ml-auto flex items-center gap-1">
                      <Eye size={10} className="sm:w-3 sm:h-3" /> {post.views}
                    </span>
                  </div>

                  <h3 className="text-base sm:text-lg font-bold text-zinc-900 mb-2 group-hover:text-zinc-700 transition-colors">
                    {post.title}
                  </h3>

                  <p className="text-zinc-600 text-sm mb-3 sm:mb-4 line-clamp-2">{post.content}</p>

                  <div className="flex items-center justify-between border-t border-zinc-50 pt-3 sm:pt-4">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[9px] sm:text-[10px] font-bold text-white ${
                          post.authorRole === UserRole.TUTOR
                            ? 'bg-zinc-800'
                            : post.authorRole === UserRole.ADMIN
                            ? 'bg-zinc-900'
                            : 'bg-zinc-400'
                        }`}
                      >
                        {post.author.charAt(0)}
                      </div>

                      <span className="text-xs font-medium text-zinc-700">{post.author}</span>
                      <span className="text-xs text-zinc-400">• {post.createdAt}</span>
                    </div>

                    <div className="flex items-center gap-1 text-xs text-zinc-500">
                      <MessageSquare size={12} className="sm:w-3.5 sm:h-3.5" /> {post.comment_count || 0} comments
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}

          {!loading.forumPosts && !errors.forumPosts && filteredPosts.length === 0 && (
            <div className="text-center py-12 bg-zinc-50 border border-dashed border-zinc-200 rounded-xl">
              <p className="text-zinc-500">No discussions found matching your filters.</p>
            </div>
          )}
        </div>
      </div>

      {/* Create Post Modal */}
      {isModalOpen && mounted &&
        createPortal(
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-zinc-900/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg relative animate-slide-up flex flex-col max-h-[90vh]">
              <div className="p-4 border-b border-zinc-100 flex justify-between items-center bg-zinc-50 rounded-t-xl">
                <h3 className="font-bold text-zinc-900 text-sm sm:text-base">Ask the Community</h3>
                <button onClick={() => setIsModalOpen(false)} className="p-1 text-zinc-400 hover:text-zinc-900 rounded hover:bg-zinc-200">
                  <X size={18} className="sm:w-5 sm:h-5" />
                </button>
              </div>

              <form onSubmit={handleCreatePost} className="p-4 sm:p-6 space-y-4 overflow-y-auto">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Question Title</label>
                  <input
                    type="text"
                    required
                    className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-500 transition-shadow shadow-sm"
                    placeholder="What's your question?"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Subject</label>
                    <CustomSelect options={postSubjectOptions} value={newSubject} onChange={setNewSubject} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Grade Level</label>
                    <CustomSelect options={gradeOptions} value={newGrade} onChange={setNewGrade} />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Details</label>
                  <textarea
                    required
                    rows={5}
                    className="w-full px-3 py-2 bg-white border border-zinc-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-500 resize-none transition-shadow shadow-sm"
                    placeholder="Describe your problem in detail..."
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isCreatingPost}
                    className="w-full py-3 sm:py-2.5 bg-zinc-900 text-white font-medium rounded-lg hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-zinc-900/10 flex items-center justify-center gap-2"
                  >
                    {isCreatingPost ? <Loader2 size={14} className="sm:w-4 sm:h-4 animate-spin" /> : null}
                    {isCreatingPost ? 'Posting...' : 'Post Question'}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default Community;
