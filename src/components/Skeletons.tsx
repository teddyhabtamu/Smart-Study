import React from 'react';

// Document Card Skeleton
export const DocumentCardSkeleton: React.FC = () => (
  <div className="bg-surface rounded-xl border border-zinc-200 overflow-hidden animate-pulse">
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
  <div className="bg-surface rounded-xl border border-zinc-200 overflow-hidden animate-pulse">
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

// Forum Post Skeleton — mirrors Community.tsx post cards (p-4/sm:p-5,
// vote button + count column, subject/grade pills + views, title, excerpt,
// avatar footer) so cards don't jump when posts land.
export const ForumPostSkeleton: React.FC = () => (
  <div className="bg-surface p-4 sm:p-5 rounded-xl border border-zinc-200 shadow-sm animate-pulse" aria-hidden="true">
    <div className="flex items-start gap-3 sm:gap-4">
      <div className="flex flex-col items-center gap-0.5 min-w-[2.5rem] sm:min-w-[3rem]">
        <div className="w-[18px] h-[18px] sm:w-5 sm:h-5 bg-zinc-200 rounded"></div>
        <div className="h-4 bg-zinc-200 rounded w-5"></div>
      </div>
      <div className="flex-1 min-w-0 space-y-0">
        <div className="flex flex-wrap items-center gap-1 sm:gap-2 mb-1">
          <div className="h-5 bg-zinc-200 rounded w-20"></div>
          <div className="h-5 bg-zinc-200 rounded w-16"></div>
          <div className="h-4 bg-zinc-200 rounded w-10 ml-auto"></div>
        </div>
        <div className="h-6 bg-zinc-200 rounded w-3/4 mb-2"></div>
        <div className="space-y-2 mb-3 sm:mb-4">
          <div className="h-4 bg-zinc-200 rounded w-full"></div>
          <div className="h-4 bg-zinc-200 rounded w-5/6"></div>
        </div>
        <div className="pt-3 sm:pt-4 border-t border-zinc-50 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-5 h-5 sm:w-6 sm:h-6 bg-zinc-200 rounded-full flex-shrink-0"></div>
            <div className="h-3 bg-zinc-200 rounded w-24"></div>
          </div>
          <div className="h-3 bg-zinc-200 rounded w-20 flex-shrink-0"></div>
        </div>
      </div>
    </div>
  </div>
);

// Dashboard Stats Card Skeleton
export const DashboardStatsCardSkeleton: React.FC = () => (
  <div className="bg-surface p-6 rounded-2xl border border-zinc-200 shadow-sm animate-pulse">
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
  <div className="bg-surface p-4 rounded-xl border border-zinc-200 hover:border-zinc-400 transition-all flex gap-4 items-center animate-pulse">
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

// Leaderboard Item Skeleton — mirrors both Community leaderboard rows
// (rank dot + avatar + name/level stack + XP pill) in desktop and mobile.
export const LeaderboardItemSkeleton: React.FC = () => (
  <div className="flex items-center justify-between gap-2 p-2 sm:p-3 rounded-lg animate-pulse" aria-hidden="true">
    <div className="flex items-center gap-2 sm:gap-3 min-w-0">
      <div className="w-5 h-5 sm:w-6 sm:h-6 bg-zinc-200 rounded-full flex-shrink-0"></div>
      <div className="w-6 h-6 sm:w-8 sm:h-8 rounded-full bg-zinc-200 flex-shrink-0"></div>
      <div className="space-y-1 min-w-0">
        <div className="h-3 bg-zinc-200 rounded w-20"></div>
        <div className="h-2 bg-zinc-200 rounded w-12"></div>
      </div>
    </div>
    <div className="h-5 bg-zinc-200 rounded w-16 flex-shrink-0"></div>
  </div>
);

// Planner Event Skeleton
export const PlannerEventSkeleton: React.FC = () => (
  <div className="bg-surface p-4 rounded-xl border border-zinc-200 shadow-sm animate-pulse">
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
  <div className="bg-surface rounded-xl border border-zinc-200 shadow-sm p-6 animate-pulse">
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
  // Mirrors the reader layout: slim header, viewer card with tall preview,
  // details strip, and the sticky AI-tools aside (not the old 3-col grid).
  <div className="min-h-screen bg-zinc-100 animate-pulse" aria-hidden="true">
    {/* Header */}
    <div className="bg-surface border-b border-zinc-200">
      <div className="max-w-[1440px] mx-auto flex items-center gap-3 px-3 sm:px-5 py-2.5">
        <div className="w-9 h-9 bg-zinc-200 rounded-xl flex-shrink-0"></div>
        <div className="flex-1 space-y-2 min-w-0">
          <div className="h-4 bg-zinc-200 rounded w-2/3 max-w-md"></div>
          <div className="h-3 bg-zinc-200 rounded w-40"></div>
        </div>
        <div className="flex gap-1.5 flex-shrink-0">
          <div className="w-10 h-10 bg-zinc-200 rounded-xl"></div>
          <div className="w-10 h-10 bg-zinc-200 rounded-xl"></div>
          <div className="h-10 bg-zinc-200 rounded-xl w-24"></div>
        </div>
      </div>
    </div>

    <div className="max-w-[1600px] mx-auto w-full px-3 sm:px-5 py-4 sm:py-6 grid gap-4 sm:gap-6 lg:grid-cols-[minmax(0,1fr)_360px] items-start">
      {/* Viewer card */}
      <div className="bg-surface border border-zinc-200 rounded-2xl overflow-hidden min-w-0">
        <div className="h-12 border-b border-zinc-100 flex items-center px-4 gap-2">
          <div className="h-3 bg-zinc-200 rounded w-20"></div>
          <div className="h-5 bg-zinc-200 rounded-md w-12"></div>
          <div className="flex-1"></div>
          <div className="w-8 h-8 bg-zinc-200 rounded-lg"></div>
          <div className="w-8 h-8 bg-zinc-200 rounded-lg"></div>
        </div>
        {/* Details strip */}
        <div className="border-b border-zinc-100 px-4 py-2 flex gap-4">
          <div className="h-3 bg-zinc-200 rounded w-24"></div>
          <div className="h-3 bg-zinc-200 rounded w-20 hidden sm:block"></div>
          <div className="h-3 bg-zinc-200 rounded w-16 hidden md:block"></div>
        </div>
        {/* Tall preview */}
        <div className="bg-zinc-200/60 h-[68vh] lg:h-[80vh]"></div>
      </div>

      {/* AI tools aside */}
      <div className="hidden lg:block bg-surface border border-zinc-200 rounded-2xl overflow-hidden">
        <div className="p-2.5 pb-0">
          <div className="h-10 bg-zinc-100 rounded-xl"></div>
        </div>
        <div className="p-4 space-y-4">
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-3.5 space-y-2">
            <div className="h-2 bg-zinc-200 rounded w-full"></div>
            <div className="h-2 bg-zinc-200 rounded w-3/4"></div>
          </div>
          <div className="flex justify-end">
            <div className="h-10 bg-zinc-200 rounded-2xl w-3/4"></div>
          </div>
          <div className="flex gap-2.5">
            <div className="w-7 h-7 bg-zinc-200 rounded-full flex-shrink-0"></div>
            <div className="h-14 bg-zinc-200 rounded-2xl flex-1"></div>
          </div>
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
    <div className="bg-surface rounded-xl border border-zinc-200 shadow-sm p-6">
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
    <div className="bg-surface rounded-xl border border-zinc-200 shadow-sm p-6">
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
    <div className="bg-surface rounded-xl border border-zinc-200 shadow-sm p-6">
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

// My AI Usage Skeleton — mirrors MyAiUsageCard (title + total row,
// sub-line, 3 meter rows, footer link).
export const MyAiUsageSkeleton: React.FC = () => (
  <div className="bg-surface rounded-2xl border border-zinc-200 p-4 sm:p-6 shadow-sm animate-pulse" aria-hidden="true">
    <div className="flex items-center justify-between gap-2 mb-1">
      <div className="h-5 bg-zinc-200 rounded w-36"></div>
      <div className="h-6 bg-zinc-200 rounded w-10"></div>
    </div>
    <div className="h-3 bg-zinc-200 rounded w-48 mb-3"></div>
    <div className="space-y-2 mb-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="h-3 bg-zinc-200 rounded flex-1"></div>
          <div className="h-1.5 bg-zinc-200 rounded-full w-20 flex-shrink-0"></div>
          <div className="h-3 bg-zinc-200 rounded w-6 flex-shrink-0"></div>
        </div>
      ))}
    </div>
    <div className="h-3 bg-zinc-200 rounded w-28"></div>
  </div>
);

// Weekly Recap Skeleton — mirrors WeeklyRecapCard (title + streak row,
// headline, 7-day bar strip, footer link) so the Dashboard doesn't jump.
export const WeeklyRecapSkeleton: React.FC = () => (
  <div className="bg-surface p-4 sm:p-6 rounded-2xl border border-zinc-200 shadow-sm animate-pulse" aria-hidden="true">
    <div className="flex items-center justify-between gap-2 mb-1">
      <div className="h-5 bg-zinc-200 rounded w-32"></div>
      <div className="h-4 bg-zinc-200 rounded w-20"></div>
    </div>
    <div className="h-3 bg-zinc-200 rounded w-56 mb-3"></div>
    <div className="flex items-end gap-1.5 sm:gap-2 h-20 mb-1">
      {[10, 26, 18, 40, 30, 52, 22].map((h, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
          <div className="w-full bg-zinc-200 rounded-full" style={{ height: h }}></div>
          <div className="w-3 h-2.5 bg-zinc-200 rounded"></div>
        </div>
      ))}
    </div>
    <div className="h-3 bg-zinc-200 rounded w-24 mt-1"></div>
  </div>
);
