
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MessageSquare, ThumbsUp, Eye, Search, Plus, CheckCircle, X, Filter, Lock, Trophy } from 'lucide-react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { SUBJECTS, GRADES } from '../constants';
import { ForumPost, UserRole } from '../types';
import CustomSelect, { Option } from '../components/CustomSelect';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';

const Community: React.FC = () => {
  const { user } = useAuth();
  const { forumPosts, addForumPost } = useData();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('All');
  const [mounted, setMounted] = useState(false);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newSubject, setNewSubject] = useState('Mathematics');
  const [newGrade, setNewGrade] = useState('9');

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  // Mock Leaderboard Data
  const TOP_LEARNERS = [
    { name: 'Sara Alemu', xp: 12500, level: 13, initial: 'S' },
    { name: 'Dawit B.', xp: 9800, level: 10, initial: 'D' },
    { name: 'Hana M.', xp: 8450, level: 9, initial: 'H' },
    { name: 'Kirubel T.', xp: 7200, level: 8, initial: 'K' },
    { name: 'You', xp: user?.xp || 0, level: user?.level || 1, initial: user?.name.charAt(0) || 'U', isUser: true },
  ].sort((a, b) => b.xp - a.xp);

  const filteredPosts = forumPosts.filter(post => {
    const matchesSearch =
      post.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      post.content.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSubject = selectedSubject === 'All' || post.subject === selectedSubject;
    return matchesSearch && matchesSubject;
  });

  const handleCreatePost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      navigate('/login');
      return;
    }

    const newPost: ForumPost = {
      id: 'f-' + Date.now(),
      title: newTitle,
      content: newContent,
      author: user.name,
      authorRole: user.role,
      subject: newSubject,
      grade: parseInt(newGrade),
      createdAt: 'Just now',
      votes: 0,
      views: 0,
      comments: [],
      tags: [],
      isSolved: false
    };

    addForumPost(newPost);
    setIsModalOpen(false);
    setNewTitle('');
    setNewContent('');
    setNewSubject('Mathematics');
    setNewGrade('9');
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
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Student Community</h1>
          <p className="text-zinc-500">Ask questions, share knowledge, and learn together.</p>
        </div>

        <button
          onClick={handleAskQuestion}
          className="px-5 py-2.5 bg-zinc-900 text-white text-sm font-medium rounded-lg hover:bg-zinc-800 transition-colors flex items-center gap-2 shadow-lg shadow-zinc-900/10 group"
        >
          {user && !user.isPremium ? <Lock size={16} className="text-zinc-400 group-hover:text-white transition-colors" /> : <Plus size={16} />}
          Ask Question
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar */}
        <div className="lg:col-span-1 space-y-6">
          {/* Filters */}
          <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-sm">
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

          {/* Leaderboard */}
          <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-sm">
            <h3 className="font-bold text-zinc-900 mb-4 flex items-center gap-2">
              <Trophy size={16} className="text-amber-500" /> Top Learners
            </h3>
            <div className="space-y-3">
               {TOP_LEARNERS.map((learner, idx) => (
                 <div key={idx} className={`flex items-center justify-between p-2 rounded-lg ${learner.isUser ? 'bg-zinc-50 border border-zinc-100' : ''}`}>
                    <div className="flex items-center gap-3">
                       <div className="w-5 text-center text-xs font-bold text-zinc-400">
                          {idx + 1}
                       </div>
                       <div className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-xs font-bold text-zinc-600 border border-zinc-200">
                          {learner.initial}
                       </div>
                       <div>
                          <p className={`text-xs font-bold ${learner.isUser ? 'text-zinc-900' : 'text-zinc-700'}`}>
                             {learner.name}
                          </p>
                          <p className="text-[10px] text-zinc-400">Level {learner.level}</p>
                       </div>
                    </div>
                    <div className="text-xs font-mono font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
                       {learner.xp.toLocaleString()} XP
                    </div>
                 </div>
               ))}
            </div>
          </div>
        </div>

        {/* Posts List */}
        <div className="lg:col-span-3 space-y-4">
          {filteredPosts.map(post => (
            <Link
              key={post.id}
              to={`/community/${post.id}`}
              className="block bg-white p-6 rounded-xl border border-zinc-200 shadow-sm hover:border-zinc-300 hover:shadow-md transition-all group"
            >
              <div className="flex items-start gap-4">
                {/* Vote Section */}
                <div className="flex flex-col items-center gap-1 min-w-[3rem]">
                  <button
                    onClick={(e) => e.preventDefault()} // ← Prevents navigation when clicking vote
                    className="text-zinc-400 hover:text-zinc-900 transition-colors"
                  >
                    <ThumbsUp size={18} />
                  </button>
                  <span className="font-bold text-zinc-900">{post.votes}</span>
                </div>

                {/* Post Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200">
                      {post.subject}
                    </span>
                    <span className="text-xs font-medium text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200">
                      Grade {post.grade}
                    </span>
                    {post.isSolved && (
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded flex items-center gap-1">
                        <CheckCircle size={10} /> SOLVED
                      </span>
                    )}
                    <span className="text-xs text-zinc-400 ml-auto flex items-center gap-1">
                      <Eye size={12} /> {post.views}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-zinc-900 mb-2 group-hover:text-zinc-700 transition-colors">
                    {post.title}
                  </h3>

                  <p className="text-zinc-600 text-sm mb-4 line-clamp-2">{post.content}</p>

                  <div className="flex items-center justify-between border-t border-zinc-50 pt-4">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white ${
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
                      <MessageSquare size={14} /> {post.comments.length} comments
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ))}

          {filteredPosts.length === 0 && (
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
                <h3 className="font-bold text-zinc-900">Ask the Community</h3>
                <button onClick={() => setIsModalOpen(false)} className="p-1 text-zinc-400 hover:text-zinc-900 rounded hover:bg-zinc-200">
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleCreatePost} className="p-6 space-y-4 overflow-y-auto">
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
                    className="w-full py-2.5 bg-zinc-900 text-white font-medium rounded-lg hover:bg-zinc-800 transition-colors shadow-lg shadow-zinc-900/10"
                  >
                    Post Question
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
