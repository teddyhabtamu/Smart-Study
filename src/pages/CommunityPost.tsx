import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, ThumbsUp, MessageSquare, Share2, CheckCircle, Send, Info, BookOpen, User as UserIcon, Check, Trash2, Edit2, X, Save, Sparkles, ArrowRight, Bot, Loader2, HelpCircle } from 'lucide-react';
import { UserRole, ForumComment } from '../types';
import MarkdownRenderer from '../components/MarkdownRenderer';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import TTSButton from '../components/TTSButton';
import { generateTutorResponse } from '../services/geminiService';

const CommunityPost: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { forumPosts, updateForumPost, deleteForumPost } = useData();
  const { user, isLoading } = useAuth();
  const { addToast } = useToast();
  
  const post = forumPosts.find(p => p.id === id);
  // Find related posts (same subject, excluding current)
  const relatedPosts = forumPosts.filter(p => p.subject === post?.subject && p.id !== post?.id).slice(0, 3);
  
  // Local interaction state
  const [replyContent, setReplyContent] = useState('');
  const [hasVoted, setHasVoted] = useState(false);

  // Edit State (Post)
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');

  // Edit State (Comment)
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentContent, setEditCommentContent] = useState('');

  // Delete Confirmation State
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'post' | 'comment', id: string } | null>(null);

  // AI Answer State
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);

  useEffect(() => {
    // Wait for auth loading to finish before checking user
    if (!isLoading && !user) {
      navigate('/login');
    }
  }, [isLoading, user, navigate]);

  useEffect(() => {
    if (post) {
      setEditTitle(post.title);
      setEditContent(post.content);
    }
  }, [post]);

  if (isLoading || !user) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="w-8 h-8 border-2 border-zinc-900 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-zinc-500 animate-fade-in">
        <p className="mb-2">Discussion not found.</p>
        <p className="text-xs text-zinc-400 mb-6">It may have been deleted or the link is incorrect.</p>
        <Link to="/community" className="px-4 py-2 bg-zinc-100 text-zinc-900 rounded-lg hover:bg-zinc-200 text-sm font-medium transition-colors">
          Return to Community
        </Link>
      </div>
    );
  }

  const handleVote = () => {
    if (!post) return;
    const newVotes = hasVoted ? post.votes - 1 : post.votes + 1;
    setHasVoted(!hasVoted);
    updateForumPost(post.id, { votes: newVotes });
  };

  const handleShare = () => {
    navigator.clipboard.writeText(window.location.href);
    addToast("Discussion link copied!", "success");
  };

  const handleCommentVote = (commentId: string) => {
    const updatedComments = post.comments.map(c => 
      c.id === commentId ? { ...c, votes: c.votes + 1 } : c
    );
    updateForumPost(post.id, { comments: updatedComments });
  };

  // --- AI Answer Logic ---
  const handleGenerateAIAnswer = async () => {
    if (!user.isPremium) {
      navigate('/subscription', { state: { from: window.location.pathname } });
      return;
    }

    setIsGeneratingAI(true);
    try {
      const prompt = `Question Title: ${post.title}\nQuestion Details: ${post.content}\n\nAct as an expert tutor. Please provide a clear, step-by-step, verified answer to this student's question. Explain the concepts simply and provide an example if relevant.`;
      const response = await generateTutorResponse([], prompt, { subject: post.subject, deepThinking: true });
      updateForumPost(post.id, { aiAnswer: response });
      addToast("AI Answer generated!", "success");
    } catch (e) {
      addToast("Failed to generate answer. Try again.", "error");
    } finally {
      setIsGeneratingAI(false);
    }
  };

  // --- Edit Comment Logic ---
  const handleEditComment = (comment: ForumComment) => {
    setEditingCommentId(comment.id);
    setEditCommentContent(comment.content);
  };

  const handleCancelCommentEdit = () => {
    setEditingCommentId(null);
    setEditCommentContent('');
  };

  const handleSaveCommentEdit = (commentId: string) => {
    if (!editCommentContent.trim()) {
      addToast("Comment cannot be empty.", "error");
      return;
    }
    
    const updatedComments = post.comments.map(c => 
      c.id === commentId ? { ...c, content: editCommentContent, isEdited: true } : c
    );
    
    updateForumPost(post.id, { comments: updatedComments });
    setEditingCommentId(null);
    setEditCommentContent('');
    addToast("Comment updated successfully.", "success");
  };

  const handleDeleteComment = (e: React.MouseEvent, commentId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!post) return;
    setDeleteTarget({ type: 'comment', id: commentId });
  };

  const handleDeletePost = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!post) return;
    setDeleteTarget({ type: 'post', id: post.id });
  };

  const confirmDelete = () => {
    if (!deleteTarget || !post) return;

    if (deleteTarget.type === 'post') {
      if (deleteForumPost) {
        deleteForumPost(deleteTarget.id);
        addToast("Discussion deleted.", "info");
        navigate('/community', { replace: true });
      } else {
        console.error("deleteForumPost function missing");
      }
    } else if (deleteTarget.type === 'comment') {
      const updatedComments = post.comments.filter(c => c.id !== deleteTarget.id);
      updateForumPost(post.id, { comments: updatedComments });
      addToast("Comment deleted.", "info");
    }
    setDeleteTarget(null);
  };

  const handleSaveEdit = () => {
    if (!editTitle.trim() || !editContent.trim()) {
      addToast("Title and content cannot be empty", "error");
      return;
    }
    updateForumPost(post.id, {
      title: editTitle,
      content: editContent,
      isEdited: true
    });
    setIsEditing(false);
    addToast("Discussion updated successfully", "success");
  };

  const handleCancelEdit = () => {
    setEditTitle(post.title);
    setEditContent(post.content);
    setIsEditing(false);
  };

  const handleAcceptSolution = (commentId: string) => {
    // Only author can mark solution
    if (user.name !== post.author) return;

    const updatedComments = post.comments.map(c => 
      c.id === commentId 
        ? { ...c, isAccepted: !c.isAccepted } 
        : { ...c, isAccepted: false } // Unmark others if single solution enforcement
    );
    
    // Check if any solution is now accepted to update parent 'isSolved' status
    const isSolved = updatedComments.some(c => c.isAccepted);
    updateForumPost(post.id, { comments: updatedComments, isSolved });
    if (isSolved) addToast("Marked as solved!", "success");
  };

  const handleSubmitReply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyContent.trim() || !post || !user) return;

    const newComment: ForumComment = {
      id: 'c-' + Date.now(),
      author: user.name,
      role: user.role,
      content: replyContent,
      createdAt: 'Just now',
      votes: 0,
      isAccepted: false
    };

    const updatedComments = [...(post.comments || []), newComment];
    updateForumPost(post.id, { comments: updatedComments });
    setReplyContent('');
    addToast("Reply posted successfully", "success");
  };

  const isAuthor = user.name === post.author;
  const isAdmin = user.role === UserRole.ADMIN;

  return (
    <div className="h-[calc(100vh-5rem)] flex flex-col gap-4 animate-fade-in relative">
      {/* Header Row */}
      <div className="flex items-center gap-4 shrink-0">
        <Link to="/community" className="p-2 rounded-lg hover:bg-zinc-100 text-zinc-500 transition-colors">
          <ChevronLeft size={20} />
        </Link>
        <div className="min-w-0 flex-1">
          {isEditing ? (
            <input 
              type="text" 
              value={editTitle} 
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full text-lg font-bold text-zinc-900 bg-white border border-zinc-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 shadow-sm"
              placeholder="Question Title"
            />
          ) : (
            <h1 className="text-lg font-bold text-zinc-900 leading-none mb-1 truncate">{post.title}</h1>
          )}
          <p className="text-xs text-zinc-500 flex items-center gap-2 mt-1">
            <span>{post.subject}</span>
            <span className="w-1 h-1 bg-zinc-300 rounded-full"></span>
            <span>Grade {post.grade}</span>
          </p>
        </div>
        <div className="ml-auto flex gap-2 relative">
           {!isEditing && (
             <button 
               onClick={handleShare}
               className="px-3 py-1.5 text-sm font-medium text-zinc-600 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 flex items-center gap-2"
             >
               <Share2 size={14} /> Share
             </button>
           )}
           
           {(isAuthor || isAdmin) && !isEditing && (
             <>
               <button 
                 onClick={() => setIsEditing(true)}
                 className="px-3 py-1.5 text-sm font-medium text-zinc-600 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors flex items-center gap-2"
                 title="Edit Discussion"
               >
                 <Edit2 size={14} /> Edit
               </button>
               <button 
                 onClick={handleDeletePost}
                 className="px-3 py-1.5 text-sm font-medium text-red-600 bg-white border border-zinc-200 rounded-lg hover:bg-red-50 hover:border-red-100 transition-colors flex items-center gap-2"
                 title="Delete Discussion"
               >
                 <Trash2 size={14} /> Delete
               </button>
             </>
           )}

           {isEditing && (
             <>
               <button 
                 onClick={handleCancelEdit}
                 className="px-3 py-1.5 text-sm font-medium text-zinc-600 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors flex items-center gap-2"
               >
                 <X size={14} /> Cancel
               </button>
               <button 
                 onClick={handleSaveEdit}
                 className="px-3 py-1.5 text-sm font-medium text-white bg-zinc-900 border border-zinc-900 rounded-lg hover:bg-zinc-800 transition-colors flex items-center gap-2"
               >
                 <Save size={14} /> Save
               </button>
             </>
           )}
        </div>
      </div>

      <div className="flex-1 flex gap-6 min-h-0">
        {/* Left: Main Content (Scrollable Area) */}
        <div className="flex-1 bg-zinc-100 rounded-xl overflow-hidden flex flex-col border border-zinc-200 relative">
          <div className="flex-1 overflow-y-auto p-4 md:p-8 flex justify-center">
             <div className="w-full max-w-3xl space-y-6">
                
                {/* Main Question Card */}
                <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-8">
                   <div className="flex gap-6">
                      {/* Vote Column */}
                      <div className="flex flex-col items-center gap-1 pt-1">
                         <button 
                           onClick={handleVote}
                           className={`p-2 rounded-lg transition-colors ${hasVoted ? 'bg-zinc-100 text-zinc-900' : 'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600'}`}
                         >
                           <ThumbsUp size={24} className={hasVoted ? 'fill-current' : ''} />
                         </button>
                         <span className={`font-bold text-xl ${hasVoted ? 'text-zinc-900' : 'text-zinc-700'}`}>{post.votes}</span>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                         <div className="flex items-center gap-3 mb-6">
                           <div className="flex items-center gap-2">
                             <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white ${
                               post.authorRole === UserRole.TUTOR ? 'bg-zinc-800' : 
                               post.authorRole === UserRole.ADMIN ? 'bg-zinc-900' : 'bg-zinc-400'
                             }`}>
                               {post.author.charAt(0)}
                             </div>
                             <div>
                                <p className="text-sm font-semibold text-zinc-900 leading-tight">{post.author}</p>
                                <p className="text-xs text-zinc-500">
                                  {post.createdAt}
                                  {post.isEdited && <span className="italic text-zinc-400 ml-1">(edited)</span>}
                                </p>
                             </div>
                           </div>
                           {post.isSolved && (
                             <span className="ml-auto px-3 py-1 rounded bg-emerald-50 text-emerald-600 text-xs font-bold border border-emerald-100 flex items-center gap-1">
                               <CheckCircle size={14} /> SOLVED
                             </span>
                           )}
                           {!isEditing && <TTSButton text={post.content} size={16} quality="high" className="ml-2" />}
                         </div>

                         {isEditing ? (
                           <textarea
                             value={editContent}
                             onChange={(e) => setEditContent(e.target.value)}
                             rows={12}
                             className="w-full p-4 bg-white text-zinc-900 border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zinc-900/10 focus:border-zinc-400 resize-y shadow-sm mb-4"
                             placeholder="Type your content here..."
                           />
                         ) : (
                           <div className="prose prose-zinc max-w-none text-zinc-800 mb-8">
                              <MarkdownRenderer content={post.content} />
                           </div>
                         )}

                         {post.tags && post.tags.length > 0 && (
                           <div className="flex flex-wrap gap-2 pt-6 border-t border-zinc-50">
                             {post.tags.map((tag, i) => (
                               <span key={i} className="text-xs text-zinc-500 bg-zinc-50 px-2.5 py-1 rounded-md border border-zinc-100">
                                 #{tag}
                               </span>
                             ))}
                           </div>
                         )}
                      </div>
                   </div>
                </div>

                {/* AI Smart Answer Section */}
                <div className="bg-indigo-50/50 rounded-xl border border-indigo-100 p-6 relative overflow-hidden shadow-sm">
                   <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
                      <Sparkles size={100} className="text-indigo-500" />
                   </div>
                   
                   <div className="flex items-center gap-3 mb-4 relative z-10">
                      <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-sm">
                         <Bot size={18} />
                      </div>
                      <h3 className="font-bold text-indigo-950">AI Smart Analysis</h3>
                      {post.aiAnswer && <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold border border-indigo-200">VERIFIED</span>}
                   </div>

                   {post.aiAnswer ? (
                      <div className="relative z-10">
                         <div className="prose prose-sm prose-indigo text-indigo-900/80 mb-2">
                            <MarkdownRenderer content={post.aiAnswer} />
                         </div>
                         <div className="flex justify-end pt-2 border-t border-indigo-100/50">
                            <TTSButton text={post.aiAnswer} size={16} quality="high" className="text-indigo-400 hover:text-indigo-700 bg-white shadow-sm" />
                         </div>
                      </div>
                   ) : (
                      <div className="relative z-10">
                         <p className="text-sm text-indigo-800 mb-4 max-w-xl">
                            Get an instant, AI-verified explanation for this question. 
                            Our Smart Tutor can break down the problem and show you the steps.
                         </p>
                         <button 
                            onClick={handleGenerateAIAnswer}
                            disabled={isGeneratingAI}
                            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 shadow-sm disabled:opacity-70"
                         >
                            {isGeneratingAI ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                            {user.isPremium ? "Generate Verified Answer" : "Unlock Verified Answer"}
                         </button>
                      </div>
                   )}
                </div>

                {/* Answers Count */}
                <div className="flex items-center gap-2 text-base font-bold text-zinc-900 px-1 pt-2 border-t border-zinc-200">
                  <MessageSquare size={18} />
                  {post.comments.length} Answers
                </div>

                {/* Answers List */}
                <div className="space-y-4">
                   {post.comments.map((comment) => (
                      <div key={comment.id} className={`bg-white rounded-xl border p-8 shadow-sm ${comment.isAccepted ? 'border-emerald-200 ring-1 ring-emerald-100' : 'border-zinc-200'}`}>
                         <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                               <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                                 comment.role === UserRole.TUTOR ? 'bg-zinc-800' : 
                                 comment.role === UserRole.ADMIN ? 'bg-zinc-900' : 'bg-zinc-400'
                               }`}>
                                 {comment.author.charAt(0)}
                               </div>
                               <div>
                                  <p className="text-sm font-semibold text-zinc-900">{comment.author}</p>
                                  <p className="text-[10px] text-zinc-500">
                                    {comment.role === UserRole.TUTOR ? 'Expert Tutor' : comment.role === UserRole.ADMIN ? 'Administrator' : 'Student'} • {comment.createdAt}
                                    {comment.isEdited && <span className="italic ml-1">(edited)</span>}
                                  </p>
                               </div>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <TTSButton text={comment.content} size={14} quality="high" className="text-zinc-400 hover:text-zinc-900" />
                              {comment.isAccepted && (
                                <span className="flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-600 px-2 py-1 rounded font-bold border border-emerald-100">
                                  <Check size={12} /> Accepted Solution
                                </span>
                              )}
                            </div>
                         </div>

                         {editingCommentId === comment.id ? (
                           <div className="mb-4">
                             <textarea 
                               value={editCommentContent}
                               onChange={(e) => setEditCommentContent(e.target.value)}
                               className="w-full p-3 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:border-zinc-400 mb-2"
                               rows={4}
                             />
                             <div className="flex gap-2">
                               <button onClick={() => handleSaveCommentEdit(comment.id)} className="px-3 py-1.5 bg-zinc-900 text-white text-xs rounded-md">Save</button>
                               <button onClick={handleCancelCommentEdit} className="px-3 py-1.5 bg-white border border-zinc-200 text-zinc-600 text-xs rounded-md">Cancel</button>
                             </div>
                           </div>
                         ) : (
                           <div className="text-sm text-zinc-700 leading-relaxed mb-6">
                              <MarkdownRenderer content={comment.content} />
                           </div>
                         )}

                         <div className="flex items-center justify-between border-t border-zinc-50 pt-4">
                            <div className="flex items-center gap-4">
                               <button 
                                 onClick={() => handleCommentVote(comment.id)}
                                 className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-900 transition-colors"
                               >
                                 <ThumbsUp size={14} /> {comment.votes} Helpful
                               </button>
                               {(user.name === comment.author || isAdmin) && (
                                 <>
                                   <button 
                                     onClick={() => handleEditComment(comment)}
                                     className="text-xs font-medium text-zinc-400 hover:text-zinc-900 transition-colors"
                                   >
                                     Edit
                                   </button>
                                   <button 
                                     onClick={(e) => handleDeleteComment(e, comment.id)}
                                     className="text-xs font-medium text-zinc-400 hover:text-red-600 transition-colors"
                                   >
                                     Delete
                                   </button>
                                 </>
                               )}
                            </div>

                            {isAuthor && !comment.isAccepted && (
                              <button 
                                onClick={() => handleAcceptSolution(comment.id)}
                                className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-emerald-600 transition-colors"
                              >
                                <CheckCircle size={14} /> Mark as Solution
                              </button>
                            )}
                         </div>
                      </div>
                   ))}
                </div>

                {/* Reply Form - NOT STICKY ANYMORE */}
                <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6 mt-8">
                   <h3 className="font-bold text-zinc-900 mb-4 text-sm">Post a Reply</h3>
                   <form onSubmit={handleSubmitReply}>
                      <textarea
                        value={replyContent}
                        onChange={(e) => setReplyContent(e.target.value)}
                        placeholder="Type your answer here... Markdown supported."
                        className="w-full p-4 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-400 resize-none text-sm transition-all mb-4"
                        rows={4}
                      ></textarea>
                      <div className="flex justify-end">
                         <button 
                           type="submit"
                           disabled={!replyContent.trim()}
                           className="px-6 py-2.5 bg-zinc-900 text-white font-medium rounded-lg hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-zinc-900/10 flex items-center gap-2"
                         >
                           <Send size={16} /> Post Answer
                         </button>
                      </div>
                   </form>
                </div>
             </div>
          </div>
        </div>

        {/* Right Sidebar: Related Content (Hidden on small screens) */}
        <div className="hidden lg:block w-80 flex-shrink-0 space-y-6">
           {/* Related Questions */}
           <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-5">
              <h3 className="font-bold text-zinc-900 text-sm mb-4 flex items-center gap-2">
                 <HelpCircle size={16} className="text-zinc-500" /> Related Questions
              </h3>
              <div className="space-y-4">
                 {relatedPosts.length > 0 ? relatedPosts.map(rp => (
                    <Link key={rp.id} to={`/community/${rp.id}`} className="block group">
                       <h4 className="text-xs font-semibold text-zinc-800 group-hover:text-indigo-600 transition-colors line-clamp-2 leading-relaxed mb-1">
                          {rp.title}
                       </h4>
                       <div className="flex items-center gap-2 text-[10px] text-zinc-400">
                          <span>{rp.votes} votes</span>
                          <span>•</span>
                          <span>{rp.comments.length} answers</span>
                       </div>
                    </Link>
                 )) : (
                    <p className="text-xs text-zinc-400">No related discussions found.</p>
                 )}
              </div>
           </div>

           {/* Mobile App Promo */}
           <div className="bg-gradient-to-br from-zinc-800 to-zinc-900 rounded-xl p-6 text-white text-center shadow-lg relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl -mr-10 -mt-10"></div>
              <h4 className="font-bold text-sm mb-2 relative z-10">Study on the go</h4>
              <p className="text-xs text-zinc-400 mb-4 leading-relaxed relative z-10">
                 Download the SmartStudy app for offline access and practice notifications.
              </p>
              <button className="w-full py-2 bg-white text-zinc-900 rounded-lg text-xs font-bold hover:bg-zinc-100 transition-colors relative z-10">
                 Get Mobile App
              </button>
           </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteTarget && createPortal(
        <div className="fixed inset-0 z-[999] flex items-center justify-center p-4 bg-zinc-900/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm relative animate-slide-up overflow-hidden">
            <div className="p-6 text-center">
              <div className="w-12 h-12 bg-red-50 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 size={24} />
              </div>
              <h3 className="text-lg font-bold text-zinc-900 mb-2">Delete {deleteTarget.type === 'post' ? 'Discussion' : 'Comment'}?</h3>
              <p className="text-sm text-zinc-500 mb-6">Are you sure you want to delete this? This action cannot be undone.</p>
              
              <div className="flex gap-3">
                <button 
                  onClick={() => setDeleteTarget(null)}
                  className="flex-1 px-4 py-2.5 bg-white border border-zinc-200 text-zinc-700 font-medium rounded-lg hover:bg-zinc-50 transition-colors text-sm"
                >
                  Cancel
                </button>
                <button 
                  onClick={confirmDelete}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors text-sm"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default CommunityPost;