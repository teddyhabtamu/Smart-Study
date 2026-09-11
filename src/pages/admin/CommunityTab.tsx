import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useToast } from '../../context/ToastContext';
import { CommunityPostsSkeleton } from './skeletons';

// Community moderation tab (extracted from Admin.tsx): review + delete posts.
const CommunityTab: React.FC = () => {
  const { forumPosts, deleteForumPost, fetchForumPosts, loading } = useData();
  const { addToast } = useToast();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const [deletePostConfirmation, setDeletePostConfirmation] = useState<{
    isOpen: boolean;
    id: string | null;
    title: string | null;
  }>({
    isOpen: false,
    id: null,
    title: null
  });
  const [isDeletingPost, setIsDeletingPost] = useState(false);

  const handleDeletePost = (id: string, title: string) => {
    setDeletePostConfirmation({
      isOpen: true,
      id: id,
      title: title
    });
  };

  const confirmDeletePost = async () => {
    if (!deletePostConfirmation.id || isDeletingPost) return;

    setIsDeletingPost(true);
    try {
      await deleteForumPost(deletePostConfirmation.id);
      await fetchForumPosts(); // Refresh posts list
      addToast('Discussion post deleted successfully', 'success');
      setDeletePostConfirmation({ isOpen: false, id: null, title: null });
    } catch (error: any) {
      console.error('Delete post error:', error);
      const errorMessage = error?.message || 'Failed to delete post. Please try again.';
      addToast(errorMessage, 'error');
    } finally {
      setIsDeletingPost(false);
    }
  };

  const closeDeletePostConfirmation = () => {
    setDeletePostConfirmation({ isOpen: false, id: null, title: null });
  };

  return (
    <>
         <div className="space-y-4 sm:space-y-6 animate-fade-in">
            <div className="bg-white p-4 sm:p-6 rounded-xl border border-zinc-200 shadow-sm">
              <h2 className="text-base sm:text-lg font-bold text-zinc-900 mb-2">Community Moderation</h2>
              <p className="text-xs sm:text-sm text-zinc-500">Review and manage discussions.</p>
            </div>

            {loading.forumPosts ? (
              <CommunityPostsSkeleton />
            ) : (
              <div className="grid gap-3 sm:gap-4">
                 {forumPosts.map(post => (
                   <div key={post.id} className="bg-white p-4 sm:p-5 rounded-xl border border-zinc-200 shadow-sm flex gap-3 sm:gap-4">
                      <div className="flex flex-col items-center gap-1 text-zinc-400 pt-1 hidden sm:flex">
                         <AlertTriangle size={20} />
                      </div>
                      <div className="flex-1 min-w-0">
                         <div className="flex flex-col sm:flex-row justify-between items-start gap-2 mb-2">
                            <h3 className="font-bold text-zinc-900 text-sm flex-1 min-w-0 line-clamp-1">{post.title}</h3>
                            <button
                              onClick={() => handleDeletePost(post.id, post.title)}
                              className="text-xs font-medium text-red-600 hover:text-red-700 bg-red-50 px-2 py-1 rounded hover:bg-red-100 transition-colors whitespace-nowrap"
                            >
                              Delete
                            </button>
                         </div>
                         <p className="text-xs sm:text-sm text-zinc-600 line-clamp-2 mb-3 bg-zinc-50 p-2 sm:p-3 rounded-lg border border-zinc-100 italic">
                            "{post.content}"
                         </p>
                          <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs text-zinc-400">
                             <span className="truncate">Posted by <span className="font-medium text-zinc-600">{post.author}</span></span>
                             <span className="hidden sm:inline">•</span>
                             <span className="text-[10px] sm:text-xs">{(post as any).created_at ? new Date((post as any).created_at).toLocaleDateString() : '—'}</span>
                             <span className="hidden sm:inline">•</span>
                             <span className="text-[10px] sm:text-xs">{post.comment_count} comments</span>
                          </div>
                      </div>
                   </div>
                 ))}
                 {forumPosts.length === 0 && (
                   <div className="text-center py-12 text-zinc-400">No community posts to moderate.</div>
                 )}
              </div>
            )}
         </div>
      {deletePostConfirmation.isOpen && mounted && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 bg-zinc-900/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md relative animate-slide-up">
            <div className="p-4 sm:p-6">
              <div className="flex items-start gap-4 mb-4">
                <div className="p-3 rounded-full bg-red-100 text-red-600">
                  <Trash2 size={24} />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-zinc-900 text-lg mb-2">
                    Delete Community Post?
                  </h3>
                  <p className="text-sm text-zinc-600">
                    Are you sure you want to delete <strong>"{deletePostConfirmation.title}"</strong>? This will also delete all comments associated with this post. This action is permanent and cannot be undone.
                  </p>
                </div>
              </div>
              <div className="flex gap-3 pt-4 border-t border-zinc-100">
                <button
                  onClick={closeDeletePostConfirmation}
                  className="flex-1 px-4 py-2.5 bg-white border border-zinc-200 text-zinc-700 font-medium rounded-lg hover:bg-zinc-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDeletePost}
                  disabled={isDeletingPost}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isDeletingPost ? 'Deleting…' : 'Delete Forever'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
};

export default CommunityTab;
