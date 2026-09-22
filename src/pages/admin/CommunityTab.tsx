import React, { useState, useEffect, useCallback } from 'react';
import Dialog from '../../components/Dialog';
import { AlertTriangle, Trash2, Search, CheckCircle } from 'lucide-react';
import CustomSelect, { Option } from '../../components/CustomSelect';
import { useToast } from '../../context/ToastContext';
import { forumAPI, adminAPI } from '../../services/api';
import { SUBJECTS } from '../../constants';
import { CommunityPostsSkeleton } from './skeletons';

const PAGE_SIZE = 15;

// Community moderation tab (extracted from Admin.tsx): review + delete posts.
// Self-contained with server-side search (title/content/author), subject
// filter, and pagination — rendering the full unfiltered list forced admins
// to scroll every post to find abuse.
const CommunityTab: React.FC = () => {
  const { addToast } = useToast();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const [posts, setPosts] = useState<any[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [pagination, setPagination] = useState({ total: 0, limit: PAGE_SIZE, offset: 0, hasMore: false });
  const [searchTerm, setSearchTerm] = useState('');
  // Debounced: the fetch effect fires per value, so raw keystrokes would
  // spam a request per character.
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm), 400);
    return () => clearTimeout(t);
  }, [searchTerm]);
  const [subjectFilter, setSubjectFilter] = useState('');

  const subjectOptions: Option[] = [
    { label: 'All Subjects', value: '' },
    ...SUBJECTS.filter((s) => s !== 'All').map((s) => ({ label: s, value: s }))
  ];

  const fetchPosts = useCallback(async (opts?: { offset?: number }) => {
    try {
      setPostsLoading(true);
      const offset = opts?.offset ?? 0;
      const result = await forumAPI.getPosts({
        limit: PAGE_SIZE,
        offset,
        search: debouncedSearch.trim() || undefined,
        subject: subjectFilter || undefined
      });
      setPosts(result.posts || []);
      setPagination(result.pagination || { total: 0, limit: PAGE_SIZE, offset, hasMore: false });
    } catch (error: any) {
      console.error('Failed to fetch community posts:', error);
      addToast('Failed to load community posts', 'error');
    } finally {
      setPostsLoading(false);
    }
  }, [addToast, debouncedSearch, subjectFilter]);

  // Refetch from page one whenever search/subject change; pager drives offsets.
  useEffect(() => {
    fetchPosts({ offset: 0 });
  }, [fetchPosts]);

  const hasActiveFilters = debouncedSearch.trim() !== '' || subjectFilter !== '';

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

  // Review queue: first-timer posts waiting for approve/reject. Oldest
  // first (matches the server order) so nothing rots at the bottom.
  // Silent-fail to hidden (pre-migration DBs have no queue).
  const [pendingPosts, setPendingPosts] = useState<any[] | null>(null);
  const [isDecidingPost, setIsDecidingPost] = useState<string | null>(null);
  const [rejectingPostId, setRejectingPostId] = useState<string | null>(null);
  const [postRejectReason, setPostRejectReason] = useState('');

  const fetchPendingPosts = useCallback(async () => {
    try {
      const rows = await adminAPI.getPendingForumPosts();
      setPendingPosts(rows);
    } catch {
      setPendingPosts(null);
    }
  }, []);

  useEffect(() => {
    fetchPendingPosts();
  }, [fetchPendingPosts]);

  const decidePost = async (post: any, approve: boolean) => {
    try {
      setIsDecidingPost(post.id);
      if (approve) {
        await adminAPI.approveForumPost(post.id);
        addToast('Post approved — now live', 'success');
      } else {
        const reason = postRejectReason.trim().slice(0, 500);
        await adminAPI.rejectForumPost(post.id, reason || undefined);
        addToast(reason ? 'Post rejected with reason' : 'Post rejected', 'success');
        setRejectingPostId(null);
        setPostRejectReason('');
      }
      await Promise.all([fetchPendingPosts(), fetchPosts({ offset: pagination.offset })]);
    } catch (error: any) {
      addToast(error?.message || 'Failed to review post', 'error');
    } finally {
      setIsDecidingPost(null);
    }
  };

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
      await forumAPI.deletePost(deletePostConfirmation.id);
      // If the page's last post was deleted, step back so the admin never
      // lands on an empty page with a Next/Prev dead end.
      const nextOffset = posts.length <= 1 && pagination.offset > 0
        ? Math.max(0, pagination.offset - pagination.limit)
        : pagination.offset;
      await fetchPosts({ offset: nextOffset });
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
            <div className="bg-surface p-4 sm:p-6 rounded-xl border border-zinc-200 shadow-sm">
              <h2 className="text-base sm:text-lg font-bold text-ink mb-1">Community Moderation</h2>
              <p className="text-xs sm:text-sm text-zinc-500 mb-4">Review and manage discussions.</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Search title, content, or author..."
                    aria-label="Search community posts"
                    className="pl-9 pr-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/5 focus:border-zinc-400 transition-all w-full"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <div className="w-full sm:w-48">
                  <CustomSelect
                    options={subjectOptions}
                    value={subjectFilter}
                    onChange={(value) => setSubjectFilter(value)}
                  />
                </div>
              </div>
            </div>

            {/* Review queue: first-timer posts awaiting approve/reject.
                Approve goes live silently; reject notifies the author with
                the reason. Empty queue (or pre-migration DB) hides itself. */}
            {pendingPosts !== null && pendingPosts.length > 0 && (
              <div className="bg-surface rounded-xl border border-amber-200 shadow-sm p-4 sm:p-5">
                <h3 className="font-bold text-ink text-sm sm:text-base mb-1">
                  Awaiting review <span className="text-xs font-medium text-zinc-500">({pendingPosts.length} waiting)</span>
                </h3>
                <p className="text-xs text-zinc-500 mb-3">First posts from new members — approve to publish, or reject with a reason the author will see.</p>
                <div className="space-y-2">
                  {pendingPosts.map((p: any) => (
                    <React.Fragment key={p.id}>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-3 bg-zinc-50 border border-zinc-200 rounded-lg">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-ink truncate">{p.title}</p>
                          <p className="text-xs text-inksoft line-clamp-2 mt-0.5">{p.content}</p>
                          <p className="text-[11px] text-zinc-500 truncate mt-1">
                            {p.author}{p.author_email ? ` · ${p.author_email}` : ''}
                            {' · '}{p.created_at ? new Date(p.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'}
                          </p>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <button
                            onClick={() => decidePost(p, true)}
                            disabled={isDecidingPost === p.id}
                            className="flex-1 sm:flex-none px-3 py-1.5 bg-zinc-900 text-onink text-xs font-medium rounded-lg hover:bg-zinc-800 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-1"
                          >
                            <CheckCircle size={13} /> {isDecidingPost === p.id ? 'Working…' : 'Approve'}
                          </button>
                          {rejectingPostId === p.id ? (
                            <button
                              onClick={() => { setRejectingPostId(null); setPostRejectReason(''); }}
                              disabled={isDecidingPost === p.id}
                              className="flex-1 sm:flex-none px-3 py-1.5 bg-surface border border-zinc-200 text-zinc-500 text-xs font-medium rounded-lg hover:bg-zinc-50 transition-colors disabled:opacity-50"
                            >
                              Cancel
                            </button>
                          ) : (
                            <button
                              onClick={() => { setRejectingPostId(p.id); setPostRejectReason(''); }}
                              disabled={isDecidingPost === p.id}
                              className="flex-1 sm:flex-none px-3 py-1.5 bg-surface border border-zinc-200 text-zinc-500 text-xs font-medium rounded-lg hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors disabled:opacity-50"
                            >
                              Reject
                            </button>
                          )}
                        </div>
                      </div>
                      {rejectingPostId === p.id && (
                        <div className="p-3 bg-red-50/50 border border-red-100 rounded-lg space-y-2">
                          <label className="block text-[11px] font-semibold text-zinc-500">
                            Reason <span className="font-normal">(shown to {p.author} — optional)</span>
                          </label>
                          <textarea
                            value={postRejectReason}
                            onChange={(e) => setPostRejectReason(e.target.value)}
                            rows={2}
                            maxLength={500}
                            placeholder="e.g. Please ask one clear question with what you tried so far"
                            className="w-full px-3 py-2 bg-surface border border-zinc-200 rounded-lg text-xs text-ink placeholder-zinc-400 focus:outline-none focus:border-zinc-400 resize-vertical"
                          />
                          <button
                            onClick={() => decidePost(p, false)}
                            disabled={isDecidingPost === p.id}
                            className="w-full sm:w-auto px-3 py-1.5 bg-red-600 text-white text-xs font-medium rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                          >
                            {isDecidingPost === p.id ? 'Rejecting…' : 'Confirm reject'}
                          </button>
                        </div>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            )}

            {postsLoading ? (
              <CommunityPostsSkeleton />
            ) : (
              <>
              <div className="grid gap-3 sm:gap-4">
                 {posts.map(post => (
                   <div key={post.id} className="bg-surface p-4 sm:p-5 rounded-xl border border-zinc-200 shadow-sm flex gap-3 sm:gap-4">
                      <div className="flex flex-col items-center gap-1 text-zinc-400 pt-1 hidden sm:flex">
                         <AlertTriangle size={20} />
                      </div>
                      <div className="flex-1 min-w-0">
                         <div className="flex flex-col sm:flex-row justify-between items-start gap-2 mb-2">
                            <h3 className="font-bold text-ink text-sm flex-1 min-w-0 line-clamp-1">{post.title}</h3>
                            <button
                              onClick={() => handleDeletePost(post.id, post.title)}
                              className="text-xs font-medium text-red-600 hover:text-red-700 bg-red-50 px-2 py-1 rounded hover:bg-red-100 transition-colors whitespace-nowrap"
                            >
                              Delete
                            </button>
                         </div>
                         <p className="text-xs sm:text-sm text-inksoft line-clamp-2 mb-3 bg-zinc-50 p-2 sm:p-3 rounded-lg border border-zinc-100 italic">
                            "{post.content}"
                         </p>
                          <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs text-zinc-400">
                              <span className="truncate min-w-0 max-w-full">Posted by <span className="font-medium text-inksoft">{post.author}</span></span>
                             <span className="hidden sm:inline">•</span>
                             <span className="text-[10px] sm:text-xs">{(post as any).created_at ? new Date((post as any).created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</span>
                             <span className="hidden sm:inline">•</span>
                             <span className="text-[10px] sm:text-xs">{post.comment_count} {(post.comment_count || 0) === 1 ? 'comment' : 'comments'}</span>
                          </div>
                      </div>
                   </div>
                 ))}
                 {posts.length === 0 && (
                   <div className="text-center py-12 text-zinc-400">
                     {hasActiveFilters ? 'No discussions match your search or filter.' : 'No community posts to moderate.'}
                   </div>
                 )}
              </div>

              {/* Pagination footer */}
              <div className="bg-surface rounded-xl border border-zinc-200 shadow-sm px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between text-xs text-zinc-500">
                <div>
                  Showing <span className="font-medium text-inksoft">{posts.length}</span> of{' '}
                  <span className="font-medium text-inksoft">{pagination.total}</span> discussions
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => fetchPosts({ offset: Math.max(0, pagination.offset - pagination.limit) })}
                    disabled={postsLoading || pagination.offset === 0}
                    className="px-3 py-2 bg-surface border border-zinc-200 rounded-lg hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Prev
                  </button>
                  <button
                    onClick={() => fetchPosts({ offset: pagination.offset + pagination.limit })}
                    disabled={postsLoading || !pagination.hasMore}
                    className="px-3 py-2 bg-surface border border-zinc-200 rounded-lg hover:bg-zinc-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
              </>
            )}
         </div>
      <Dialog
        open={deletePostConfirmation.isOpen && mounted}
        onClose={() => setDeletePostConfirmation({ isOpen: false, id: null, title: null })}
        label="Delete discussion?"
      >
            <div className="p-4 sm:p-6">
              <div className="flex items-start gap-4 mb-4">
                <div className="p-3 rounded-full bg-red-100 text-red-600">
                  <Trash2 size={24} />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-ink text-lg mb-2">
                    Delete Community Post?
                  </h3>
                  <p className="text-sm text-inksoft">
                    Are you sure you want to delete <strong>"{deletePostConfirmation.title}"</strong>? This will also delete all comments associated with this post. This action is permanent and cannot be undone.
                  </p>
                </div>
              </div>
              <div className="flex gap-3 pt-4 border-t border-zinc-100">
                <button
                  onClick={closeDeletePostConfirmation}
                  className="flex-1 px-4 py-2.5 bg-surface border border-zinc-200 text-inksoft font-medium rounded-lg hover:bg-zinc-50 transition-colors"
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
      </Dialog>
    </>
  );
};

export default CommunityTab;
