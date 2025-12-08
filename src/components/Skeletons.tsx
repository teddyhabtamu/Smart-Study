import React from 'react';

// Document Card Skeleton
export const DocumentCardSkeleton: React.FC = () => (
  <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden animate-pulse">
    <div className="h-40 bg-zinc-200"></div>
    <div className="p-5 space-y-3">
      <div className="h-5 bg-zinc-200 rounded w-3/4"></div>
      <div className="h-4 bg-zinc-200 rounded w-full"></div>
      <div className="h-4 bg-zinc-200 rounded w-2/3"></div>
      <div className="pt-4 border-t border-zinc-50 flex items-center justify-between">
        <div className="h-3 bg-zinc-200 rounded w-24"></div>
        <div className="h-3 bg-zinc-200 rounded w-20"></div>
      </div>
    </div>
  </div>
);

// Video Card Skeleton
export const VideoCardSkeleton: React.FC = () => (
  <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden animate-pulse">
    <div className="aspect-video bg-zinc-200"></div>
    <div className="p-4 space-y-3">
      <div className="h-4 bg-zinc-200 rounded w-20"></div>
      <div className="h-5 bg-zinc-200 rounded w-full"></div>
      <div className="h-4 bg-zinc-200 rounded w-3/4"></div>
      <div className="pt-3 border-t border-zinc-50 flex items-center justify-between">
        <div className="h-3 bg-zinc-200 rounded w-16"></div>
        <div className="h-3 bg-zinc-200 rounded w-12"></div>
      </div>
    </div>
  </div>
);

// Forum Post Skeleton
export const ForumPostSkeleton: React.FC = () => (
  <div className="bg-white p-6 rounded-xl border border-zinc-200 shadow-sm animate-pulse">
    <div className="flex items-start gap-4">
      <div className="flex flex-col items-center gap-1 min-w-[3rem]">
        <div className="w-6 h-6 bg-zinc-200 rounded"></div>
        <div className="h-4 bg-zinc-200 rounded w-4"></div>
      </div>
      <div className="flex-1 space-y-3">
        <div className="flex items-center gap-2">
          <div className="h-5 bg-zinc-200 rounded w-20"></div>
          <div className="h-5 bg-zinc-200 rounded w-16"></div>
          <div className="h-5 bg-zinc-200 rounded w-12 ml-auto"></div>
        </div>
        <div className="h-6 bg-zinc-200 rounded w-3/4"></div>
        <div className="space-y-2">
          <div className="h-4 bg-zinc-200 rounded w-full"></div>
          <div className="h-4 bg-zinc-200 rounded w-5/6"></div>
        </div>
        <div className="pt-4 border-t border-zinc-50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-zinc-200 rounded-full"></div>
            <div className="h-3 bg-zinc-200 rounded w-24"></div>
          </div>
          <div className="h-3 bg-zinc-200 rounded w-20"></div>
        </div>
      </div>
    </div>
  </div>
);

// Dashboard Stats Card Skeleton
export const DashboardStatsCardSkeleton: React.FC = () => (
  <div className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm animate-pulse">
    <div className="flex justify-between items-start mb-4">
      <div className="w-10 h-10 bg-zinc-200 rounded-lg"></div>
      <div className="w-12 h-4 bg-zinc-200 rounded"></div>
    </div>
    <div className="w-20 h-9 bg-zinc-200 rounded mb-2"></div>
    <div className="w-32 h-4 bg-zinc-200 rounded"></div>
  </div>
);

// Dashboard Bookmark Card Skeleton
export const BookmarkCardSkeleton: React.FC = () => (
  <div className="bg-white p-4 rounded-xl border border-zinc-200 hover:border-zinc-400 transition-all flex gap-4 items-center animate-pulse">
    <div className="w-16 h-16 rounded-lg bg-zinc-200 flex-shrink-0"></div>
    <div className="flex-1 min-w-0 space-y-2">
      <div className="h-4 bg-zinc-200 rounded w-3/4"></div>
      <div className="flex items-center gap-2">
        <div className="h-3 bg-zinc-200 rounded w-16"></div>
        <div className="h-3 bg-zinc-200 rounded w-12"></div>
      </div>
    </div>
  </div>
);

// Task Item Skeleton
export const TaskItemSkeleton: React.FC = () => (
  <div className="flex gap-3 items-start p-3 rounded-xl bg-zinc-50 border border-zinc-100 animate-pulse">
    <div className="w-5 h-5 bg-zinc-200 rounded-full mt-1"></div>
    <div className="flex-1 space-y-2">
      <div className="h-4 bg-zinc-200 rounded w-3/4"></div>
      <div className="flex items-center gap-2">
        <div className="h-3 bg-zinc-200 rounded w-16"></div>
        <div className="h-3 bg-zinc-200 rounded w-12"></div>
      </div>
    </div>
  </div>
);

// Leaderboard Item Skeleton
export const LeaderboardItemSkeleton: React.FC = () => (
  <div className="flex items-center justify-between p-2 rounded-lg animate-pulse">
    <div className="flex items-center gap-3">
      <div className="w-5 h-5 bg-zinc-200 rounded"></div>
      <div className="w-8 h-8 rounded-full bg-zinc-200"></div>
      <div className="space-y-1">
        <div className="h-3 bg-zinc-200 rounded w-16"></div>
        <div className="h-2 bg-zinc-200 rounded w-12"></div>
      </div>
    </div>
    <div className="h-4 bg-zinc-200 rounded w-16"></div>
  </div>
);

// Planner Event Skeleton
export const PlannerEventSkeleton: React.FC = () => (
  <div className="bg-white p-4 rounded-xl border border-zinc-200 shadow-sm animate-pulse">
    <div className="flex items-start justify-between mb-3">
      <div className="space-y-2 flex-1">
        <div className="h-5 bg-zinc-200 rounded w-3/4"></div>
        <div className="flex items-center gap-2">
          <div className="h-4 bg-zinc-200 rounded w-20"></div>
          <div className="h-4 bg-zinc-200 rounded w-16"></div>
        </div>
      </div>
      <div className="w-6 h-6 bg-zinc-200 rounded"></div>
    </div>
    <div className="h-3 bg-zinc-200 rounded w-24"></div>
  </div>
);

// Profile Section Skeleton
export const ProfileSectionSkeleton: React.FC = () => (
  <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6 animate-pulse">
    <div className="flex items-center gap-4 mb-6">
      <div className="w-16 h-16 rounded-full bg-zinc-200"></div>
      <div className="space-y-2 flex-1">
        <div className="h-5 bg-zinc-200 rounded w-32"></div>
        <div className="h-4 bg-zinc-200 rounded w-48"></div>
      </div>
    </div>
    <div className="space-y-4">
      <div className="h-4 bg-zinc-200 rounded w-full"></div>
      <div className="h-4 bg-zinc-200 rounded w-3/4"></div>
      <div className="h-4 bg-zinc-200 rounded w-5/6"></div>
    </div>
  </div>
);

// Video Watch Page Skeleton
export const VideoWatchSkeleton: React.FC = () => (
  <div className="max-w-6xl mx-auto space-y-6 animate-pulse">
    {/* Breadcrumb */}
    <div className="flex items-center gap-2">
      <div className="h-4 bg-zinc-200 rounded w-32"></div>
      <div className="h-4 bg-zinc-200 rounded w-24"></div>
      <div className="h-4 bg-zinc-200 rounded w-48"></div>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Main Video Section */}
      <div className="lg:col-span-2 space-y-6">
        {/* Video Player */}
        <div className="aspect-video bg-zinc-200 rounded-xl"></div>
        
        {/* Video Info */}
        <div className="space-y-3">
          <div className="h-8 bg-zinc-200 rounded w-3/4"></div>
          <div className="flex items-center gap-4">
            <div className="h-4 bg-zinc-200 rounded w-24"></div>
            <div className="h-4 bg-zinc-200 rounded w-16"></div>
            <div className="h-4 bg-zinc-200 rounded w-20"></div>
          </div>
          <div className="h-4 bg-zinc-200 rounded w-full"></div>
          <div className="h-4 bg-zinc-200 rounded w-5/6"></div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-zinc-200">
          <div className="h-10 bg-zinc-200 rounded-t w-24"></div>
          <div className="h-10 bg-zinc-200 rounded-t w-24"></div>
          <div className="h-10 bg-zinc-200 rounded-t w-24"></div>
        </div>

        {/* Tab Content */}
        <div className="space-y-4">
          <div className="h-4 bg-zinc-200 rounded w-full"></div>
          <div className="h-4 bg-zinc-200 rounded w-3/4"></div>
        </div>
      </div>

      {/* Sidebar */}
      <div className="space-y-6">
        {/* Related Videos */}
        <div className="space-y-4">
          <div className="h-6 bg-zinc-200 rounded w-32"></div>
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex gap-3">
              <div className="w-32 h-20 bg-zinc-200 rounded"></div>
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-zinc-200 rounded w-full"></div>
                <div className="h-3 bg-zinc-200 rounded w-2/3"></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);

// Document View Page Skeleton
export const DocumentViewSkeleton: React.FC = () => (
  <div className="max-w-7xl mx-auto space-y-6 animate-pulse">
    {/* Header */}
    <div className="flex items-center justify-between">
      <div className="space-y-2">
        <div className="h-8 bg-zinc-200 rounded w-64"></div>
        <div className="h-4 bg-zinc-200 rounded w-48"></div>
      </div>
      <div className="flex gap-2">
        <div className="h-10 bg-zinc-200 rounded w-24"></div>
        <div className="h-10 bg-zinc-200 rounded w-24"></div>
      </div>
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Main Document Section */}
      <div className="lg:col-span-2 space-y-6">
        {/* Document Preview */}
        <div className="bg-white border border-zinc-200 rounded-xl p-6">
          <div className="aspect-[4/3] bg-zinc-200 rounded-lg"></div>
        </div>

        {/* Document Info */}
        <div className="space-y-3">
          <div className="h-6 bg-zinc-200 rounded w-3/4"></div>
          <div className="h-4 bg-zinc-200 rounded w-full"></div>
          <div className="h-4 bg-zinc-200 rounded w-5/6"></div>
        </div>
      </div>

      {/* Sidebar */}
      <div className="space-y-6">
        {/* Tools */}
        <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
          <div className="h-6 bg-zinc-200 rounded w-24"></div>
          <div className="space-y-3">
            <div className="h-10 bg-zinc-200 rounded w-full"></div>
            <div className="h-10 bg-zinc-200 rounded w-full"></div>
            <div className="h-10 bg-zinc-200 rounded w-full"></div>
          </div>
        </div>

        {/* Chat/Notes */}
        <div className="bg-white border border-zinc-200 rounded-xl p-6 space-y-4">
          <div className="h-6 bg-zinc-200 rounded w-32"></div>
          <div className="space-y-2">
            <div className="h-4 bg-zinc-200 rounded w-full"></div>
            <div className="h-4 bg-zinc-200 rounded w-3/4"></div>
          </div>
          <div className="h-24 bg-zinc-200 rounded"></div>
        </div>
      </div>
    </div>
  </div>
);

// Community Post Detail Skeleton
export const CommunityPostDetailSkeleton: React.FC = () => (
  <div className="max-w-5xl mx-auto space-y-6 animate-pulse">
    {/* Breadcrumb */}
    <div className="flex items-center gap-2">
      <div className="h-4 bg-zinc-200 rounded w-24"></div>
      <div className="h-4 bg-zinc-200 rounded w-48"></div>
    </div>

    {/* Post Header */}
    <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6">
      <div className="flex items-start gap-4">
        {/* Vote Section */}
        <div className="flex flex-col items-center gap-2">
          <div className="w-6 h-6 bg-zinc-200 rounded"></div>
          <div className="h-6 bg-zinc-200 rounded w-8"></div>
        </div>

        {/* Post Content */}
        <div className="flex-1 space-y-4">
          <div className="flex items-center gap-2">
            <div className="h-5 bg-zinc-200 rounded w-20"></div>
            <div className="h-5 bg-zinc-200 rounded w-16"></div>
            <div className="h-5 bg-zinc-200 rounded w-12 ml-auto"></div>
          </div>
          
          <div className="h-8 bg-zinc-200 rounded w-3/4"></div>
          
          <div className="space-y-2">
            <div className="h-4 bg-zinc-200 rounded w-full"></div>
            <div className="h-4 bg-zinc-200 rounded w-full"></div>
            <div className="h-4 bg-zinc-200 rounded w-5/6"></div>
          </div>

          {/* Author Info */}
          <div className="flex items-center gap-3 pt-4 border-t border-zinc-100">
            <div className="w-8 h-8 rounded-full bg-zinc-200"></div>
            <div className="space-y-1">
              <div className="h-3 bg-zinc-200 rounded w-24"></div>
              <div className="h-2 bg-zinc-200 rounded w-32"></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    {/* Comments Section */}
    <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6">
      <div className="h-6 bg-zinc-200 rounded w-32 mb-6"></div>
      
      {/* Comment Input */}
      <div className="mb-6 space-y-2">
        <div className="h-24 bg-zinc-200 rounded"></div>
        <div className="h-10 bg-zinc-200 rounded w-32 ml-auto"></div>
      </div>

      {/* Comments List */}
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex gap-4 p-4 border border-zinc-100 rounded-lg">
            <div className="w-10 h-10 rounded-full bg-zinc-200"></div>
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-zinc-200 rounded w-32"></div>
              <div className="h-4 bg-zinc-200 rounded w-full"></div>
              <div className="h-4 bg-zinc-200 rounded w-3/4"></div>
              <div className="flex items-center gap-4 pt-2">
                <div className="h-3 bg-zinc-200 rounded w-16"></div>
                <div className="h-3 bg-zinc-200 rounded w-12"></div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>

    {/* Related Posts */}
    <div className="bg-white rounded-xl border border-zinc-200 shadow-sm p-6">
      <div className="h-6 bg-zinc-200 rounded w-40 mb-4"></div>
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="p-3 border border-zinc-100 rounded-lg">
            <div className="h-4 bg-zinc-200 rounded w-full mb-2"></div>
            <div className="h-3 bg-zinc-200 rounded w-2/3"></div>
          </div>
        ))}
      </div>
    </div>
  </div>
);
