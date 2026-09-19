import React, { useState, useEffect, useCallback } from 'react';
import { Users, Crown, FileText, MessageSquare, Sparkles, Gauge } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { adminAPI } from '../../services/api';
import { StatsCardSkeleton, RecentActivitySkeleton } from './skeletons';

// Overview dashboard tab (extracted from Admin.tsx): system stats + recent
// activity. Owns the admin-stats fetch — no other tab uses it.
const OverviewTab: React.FC = () => {
  const { documents, videos, forumPosts, allUsers } = useData();
  const [adminStats, setAdminStats] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [topUsers, setTopUsers] = useState<any[] | null>(null);

  const fetchAdminStats = useCallback(async () => {
    try {
      setStatsLoading(true);
      setStatsError(null);
      const stats = await adminAPI.getAdminStats();
      setAdminStats(stats);
    } catch (error: any) {
      console.error('Failed to fetch admin stats:', error);
      // Surface failure with a retry — otherwise the tab shows skeletons
      // forever and reads as "still loading"
      setStatsError(error.message || 'Failed to load system stats');
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAdminStats();
    // Top consumers ride along silently: a metering gap must not fail the
    // whole tab, and an empty ranking simply doesn't render (see below).
    adminAPI.getTopAiUsers(7, 8).then(setTopUsers).catch(() => setTopUsers([]));
  }, [fetchAdminStats]);

  const stats = adminStats ? {
    totalUsers: adminStats.total_users,
    premiumUsers: adminStats.premium_users,
    totalDocuments: adminStats.total_documents,
    totalVideos: adminStats.total_videos,
    totalPosts: adminStats.total_forum_posts
  } : {
    totalUsers: allUsers.length,
    premiumUsers: allUsers.filter(s => s.isPremium).length,
    totalDocuments: documents.length,
    totalVideos: videos.length,
    totalPosts: forumPosts.length
  };

  const adminLoading = statsLoading;

  // Never render raw backend/API text ("Access token required", "HTTP 500"):
  // expired sessions redirect via the session-expired broadcast, and
  // everything else gets a human sentence. Details stay in the console.
  const friendlyStatsError = (): string => {
    const m = (statsError || '').toLowerCase();
    if (!m) return 'Please check your connection and try again.';
    if (m.includes('token') || m.includes('unauthorized') || m.includes(' 401') || m.includes('session') || m.includes('sign in') || m.includes('log in')) {
      return 'Your session ended — please sign in again.';
    }
    if (m.includes('timeout') || m.includes('network') || m.includes('fetch failed') || m.includes('500') || m.includes('failed to fetch')) {
      return 'Please check your connection and try again.';
    }
    return 'Something went wrong loading stats.';
  };

  return (
        <div className="space-y-4 sm:space-y-8 animate-fade-in">
              {/* Stats Cards (no growth pills: we store no historical
                  baselines, so any "+x%" would be invented) */}
          {statsError && !adminStats && !statsLoading ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
              <p className="text-red-800 font-medium text-sm">Failed to load system stats</p>
              <p className="text-red-600 text-xs mt-1">{friendlyStatsError()}</p>
              <button
                onClick={fetchAdminStats}
                className="mt-4 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors"
              >
                Try Again
              </button>
            </div>
          ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
            {adminLoading || !adminStats ? (
              <>
                <StatsCardSkeleton />
                <StatsCardSkeleton />
                <StatsCardSkeleton />
                <StatsCardSkeleton />
              </>
            ) : (
              <>
                <div className="bg-surface p-4 sm:p-6 rounded-xl border border-zinc-200 shadow-sm">
                   <div className="flex justify-between items-start mb-3 sm:mb-4">
                      <div className="p-1.5 sm:p-2 bg-zinc-100 text-inksoft rounded-lg"><Users size={18} className="sm:w-5 sm:h-5" /></div>
                   </div>
                   <div className="text-xl sm:text-3xl font-bold text-ink tracking-tight">{stats.totalUsers.toLocaleString()}</div>
                   <div className="text-xs sm:text-sm text-zinc-500 mt-1">Total Students</div>
                </div>
                <div className="bg-surface p-4 sm:p-6 rounded-xl border border-zinc-200 shadow-sm">
                   <div className="flex justify-between items-start mb-3 sm:mb-4">
                      <div className="p-1.5 sm:p-2 bg-zinc-100 text-inksoft rounded-lg"><Crown size={18} className="sm:w-5 sm:h-5" /></div>
                   </div>
                   <div className="text-xl sm:text-3xl font-bold text-ink tracking-tight">{stats.premiumUsers.toLocaleString()}</div>
                   <div className="text-xs sm:text-sm text-zinc-500 mt-1">Premium Subscribers</div>
                </div>
                <div className="bg-surface p-4 sm:p-6 rounded-xl border border-zinc-200 shadow-sm">
                   <div className="flex justify-between items-start mb-3 sm:mb-4">
                      <div className="p-1.5 sm:p-2 bg-zinc-100 text-inksoft rounded-lg"><FileText size={18} className="sm:w-5 sm:h-5" /></div>
                   </div>
                   <div className="text-xl sm:text-3xl font-bold text-ink tracking-tight">{stats.totalDocuments + stats.totalVideos}</div>
                   <div className="text-xs sm:text-sm text-zinc-500 mt-1">Learning Resources</div>
                </div>
                <div className="bg-surface p-4 sm:p-6 rounded-xl border border-zinc-200 shadow-sm">
                   <div className="flex justify-between items-start mb-3 sm:mb-4">
                      <div className="p-1.5 sm:p-2 bg-zinc-100 text-inksoft rounded-lg"><MessageSquare size={18} className="sm:w-5 sm:h-5" /></div>
                   </div>
                   <div className="text-xl sm:text-3xl font-bold text-ink tracking-tight">{stats.totalPosts}</div>
                   <div className="text-xs sm:text-sm text-zinc-500 mt-1">Community Posts</div>
                </div>
              </>
            )}
           </div>
           )}

           {/* AI usage (7 days): shared-key visibility. Shown whenever the
               backend supports it — including the empty state, so "no panel"
               never reads as "broken panel". Quota errors > 0 turn the pill
               red — that is the "key exhausted" signal, worth a look before
               users report 429s. */}
           {adminLoading ? (
             <div className="bg-surface rounded-xl border border-zinc-200 shadow-sm p-6 animate-pulse" aria-hidden="true">
               <div className="h-4 bg-zinc-200 rounded w-48 mb-4"></div>
               <div className="space-y-2">
                 <div className="h-3 bg-zinc-100 rounded w-full"></div>
                 <div className="h-3 bg-zinc-100 rounded w-5/6"></div>
                 <div className="h-3 bg-zinc-100 rounded w-4/6"></div>
               </div>
             </div>
           ) : adminStats && Array.isArray(adminStats.ai_usage_7d) && (() => {
             const rows = adminStats.ai_usage_7d.map((r: any) => ({
               route: String(r.route || 'unknown'),
               calls: parseInt(r.calls || '0', 10) || 0,
               failures: parseInt(r.failures || '0', 10) || 0,
               quotaErrors: parseInt(r.quota_errors || '0', 10) || 0,
               avgMs: r.avg_ms === null || r.avg_ms === undefined ? null : Number(r.avg_ms),
             }));
             const totalCalls = rows.reduce((n: number, r: any) => n + r.calls, 0);
             const totalQuota = rows.reduce((n: number, r: any) => n + r.quotaErrors, 0);
             if (rows.length === 0) {
               return (
                 <div className="bg-surface rounded-xl border border-zinc-200 shadow-sm p-6">
                   <h3 className="font-bold text-ink flex items-center gap-2">
                     <Sparkles size={16} className="text-inksoft" /> AI usage · last 7 days
                   </h3>
                   <p className="text-xs text-zinc-500 mt-2">
                     No AI generations logged yet — rows appear here after the first quiz, plan, or tutor chat.
                   </p>
                 </div>
               );
             }
             return (
               <div className="bg-surface rounded-xl border border-zinc-200 shadow-sm p-6">
                 <div className="flex items-center justify-between mb-1">
                   <h3 className="font-bold text-ink flex items-center gap-2">
                     <Sparkles size={16} className="text-inksoft" /> AI usage · last 7 days
                   </h3>
                   {totalQuota > 0 ? (
                     <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                       {totalQuota} quota error{totalQuota === 1 ? '' : 's'}
                     </span>
                   ) : (
                     <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                       key healthy
                     </span>
                   )}
                 </div>
                 <p className="text-xs text-zinc-500 mb-4">
                   {totalCalls.toLocaleString()} generations across {rows.length} route{rows.length === 1 ? '' : 's'}
                 </p>
                 <div className="space-y-2">
                   {rows.map((r: any) => (
                     <div key={r.route} className="flex items-center justify-between py-2 border-b border-zinc-50 last:border-0 text-sm">
                       <span className="font-medium text-ink font-mono text-xs">{r.route}</span>
                       <span className="text-xs text-zinc-500">
                         {r.calls.toLocaleString()} calls
                         {r.failures > 0 && <span className="text-amber-600"> · {r.failures} failed</span>}
                         {r.quotaErrors > 0 && <span className="text-red-600 font-semibold"> · {r.quotaErrors} quota</span>}
                         {r.avgMs !== null && <span> · ~{Math.round(r.avgMs)}ms</span>}
                       </span>
                     </div>
                   ))}
                 </div>
               </div>
             );
            })()}

            {/* Top AI consumers (7 days): who burns the shared quota. Hidden
                while loading and when empty — a missing table or zero usage
                is not an error state worth wall space. Rows are min-w-0
                safe: long names truncate instead of pushing counts off. */}
            {topUsers !== null && topUsers.length > 0 && (
              <div className="bg-surface rounded-xl border border-zinc-200 shadow-sm p-4 sm:p-6">
                <h3 className="font-bold text-ink flex items-center gap-2">
                  <Gauge size={16} className="text-inksoft" /> Top AI consumers · last 7 days
                </h3>
                <p className="text-xs text-zinc-500 mt-1 mb-3">
                  Students ranked by AI generations — spot abuse or heavy-but-legit cramming before it trips the shared quota.
                </p>
                <div className="space-y-1">
                  {topUsers.map((u: any, i: number) => {
                    const calls = parseInt(u.calls || '0', 10) || 0;
                    const quota = parseInt(u.quota_errors || '0', 10) || 0;
                    return (
                      <div key={u.user_id || i} className="flex items-center gap-3 py-2 border-b border-zinc-50 last:border-0 text-sm min-w-0">
                        <span className="w-5 h-5 rounded-full bg-zinc-100 text-inksoft text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                          {i + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-ink text-sm truncate">{u.name || 'Unknown student'}</p>
                          <p className="text-[11px] text-zinc-400 truncate">{u.email || ''}</p>
                        </div>
                        <span className="text-xs text-zinc-500 whitespace-nowrap flex-shrink-0">
                          {calls.toLocaleString()} call{calls === 1 ? '' : 's'}
                          {quota > 0 && <span className="text-red-600 font-semibold"> · {quota} quota</span>}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Recent Activity */}
          {adminLoading ? (
            <RecentActivitySkeleton />
          ) : !adminStats ? (
            <div className="bg-surface rounded-xl border border-zinc-200 shadow-sm p-6 text-center py-8 text-zinc-500">
              <p className="text-sm">{statsError ? friendlyStatsError() : 'No recent activity to display'}</p>
            </div>
          ) : (
            <div className="bg-surface rounded-xl border border-zinc-200 shadow-sm p-6">
              <h3 className="font-bold text-ink mb-4">Recent System Activity</h3>
              <div className="space-y-4">
                 {adminStats?.recent_activity && adminStats.recent_activity.length > 0 ? (
                   adminStats.recent_activity.map((item: any, i: number) => (
                     <div key={i} className="flex items-center justify-between py-3 border-b border-zinc-50 last:border-0 hover:bg-zinc-50 transition-colors px-2 -mx-2 rounded-lg">
                        <div className="flex items-center gap-3">
                           <div className={`w-2 h-2 rounded-full ${
                             item.type === 'user_registration' ? 'bg-blue-400' :
                             item.type === 'premium_subscription' ? 'bg-purple-400' :
                             item.type === 'content_upload' ? 'bg-green-400' :
                             'bg-zinc-300'
                           }`}></div>
                           <div>
                              <p className="text-sm font-medium text-ink">
                                {item.type === 'user_registration' ? 'New User Registration' :
                                 item.type === 'premium_subscription' ? 'Premium Subscription' :
                                 item.type === 'content_upload' ? 'Content Upload' :
                                 'System Activity'}
                              </p>
                              <p className="text-xs text-zinc-500">{item.message}</p>
                           </div>
                        </div>
                        <span className="text-xs text-zinc-400">
                          {new Date(item.timestamp).toLocaleDateString()}
                        </span>
                     </div>
                   ))
                 ) : (
                   <div className="text-center py-8 text-zinc-500">
                     <p className="text-sm">No recent activity to display</p>
                   </div>
                 )}
              </div>
            </div>
          )}
        </div>
  );
};

export default OverviewTab;
