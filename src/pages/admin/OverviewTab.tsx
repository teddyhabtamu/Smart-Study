import React, { useState, useEffect, useCallback } from 'react';
import { Users, Crown, FileText, MessageSquare } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { adminAPI } from '../../services/api';
import { StatsCardSkeleton, RecentActivitySkeleton } from './skeletons';

// Overview dashboard tab (extracted from Admin.tsx): system stats + recent
// activity. Owns the admin-stats fetch — no other tab uses it.
const OverviewTab: React.FC = () => {
  const { documents, videos, forumPosts, allUsers } = useData();
  const [adminStats, setAdminStats] = useState<any>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const fetchAdminStats = useCallback(async () => {
    try {
      setStatsLoading(true);
      const stats = await adminAPI.getAdminStats();
      setAdminStats(stats);
    } catch (error: any) {
      console.error('Failed to fetch admin stats:', error);
    } finally {
      setStatsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAdminStats();
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

  return (
        <div className="space-y-4 sm:space-y-8 animate-fade-in">
              {/* Stats Cards */}
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
                <div className="bg-white p-4 sm:p-6 rounded-xl border border-zinc-200 shadow-sm">
                   <div className="flex justify-between items-start mb-3 sm:mb-4">
                      <div className="p-1.5 sm:p-2 bg-zinc-100 text-zinc-700 rounded-lg"><Users size={18} className="sm:w-5 sm:h-5" /></div>
                      <span className="text-[10px] sm:text-xs font-bold text-emerald-600 bg-emerald-50 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full">+12%</span>
                   </div>
                   <div className="text-xl sm:text-3xl font-bold text-zinc-900 tracking-tight">{stats.totalUsers.toLocaleString()}</div>
                   <div className="text-xs sm:text-sm text-zinc-500 mt-1">Total Students</div>
                </div>
                <div className="bg-white p-4 sm:p-6 rounded-xl border border-zinc-200 shadow-sm">
                   <div className="flex justify-between items-start mb-3 sm:mb-4">
                      <div className="p-1.5 sm:p-2 bg-zinc-100 text-zinc-700 rounded-lg"><Crown size={18} className="sm:w-5 sm:h-5" /></div>
                      <span className="text-[10px] sm:text-xs font-bold text-emerald-600 bg-emerald-50 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full">+5%</span>
                   </div>
                   <div className="text-xl sm:text-3xl font-bold text-zinc-900 tracking-tight">{stats.premiumUsers.toLocaleString()}</div>
                   <div className="text-xs sm:text-sm text-zinc-500 mt-1">Premium Subscribers</div>
                </div>
                <div className="bg-white p-4 sm:p-6 rounded-xl border border-zinc-200 shadow-sm">
                   <div className="flex justify-between items-start mb-3 sm:mb-4">
                      <div className="p-1.5 sm:p-2 bg-zinc-100 text-zinc-700 rounded-lg"><FileText size={18} className="sm:w-5 sm:h-5" /></div>
                      <span className="text-[10px] sm:text-xs font-bold text-zinc-400 bg-zinc-50 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full">New</span>
                   </div>
                   <div className="text-xl sm:text-3xl font-bold text-zinc-900 tracking-tight">{stats.totalDocuments + stats.totalVideos}</div>
                   <div className="text-xs sm:text-sm text-zinc-500 mt-1">Learning Resources</div>
                </div>
                <div className="bg-white p-4 sm:p-6 rounded-xl border border-zinc-200 shadow-sm">
                   <div className="flex justify-between items-start mb-3 sm:mb-4">
                      <div className="p-1.5 sm:p-2 bg-zinc-100 text-zinc-700 rounded-lg"><MessageSquare size={18} className="sm:w-5 sm:h-5" /></div>
                   </div>
                   <div className="text-xl sm:text-3xl font-bold text-zinc-900 tracking-tight">{stats.totalPosts}</div>
                   <div className="text-xs sm:text-sm text-zinc-500 mt-1">Community Posts</div>
                </div>
              </>
            )}
          </div>

          {/* Recent Activity */}
          {adminLoading || !adminStats ? (
            <RecentActivitySkeleton />
          ) : (
            <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6">
              <h3 className="font-bold text-zinc-900 mb-4">Recent System Activity</h3>
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
                              <p className="text-sm font-medium text-zinc-900">
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
