import React from 'react';

// Shared admin page loading placeholders (extracted from Admin.tsx).
export const StatsCardSkeleton: React.FC = () => (
  <div className="bg-surface p-6 rounded-xl border border-zinc-200 shadow-sm animate-pulse">
    <div className="flex justify-between items-start mb-4">
      <div className="w-10 h-10 bg-zinc-200 rounded-lg"></div>
      <div className="w-12 h-4 bg-zinc-200 rounded"></div>
    </div>
    <div className="w-20 h-9 bg-zinc-200 rounded mb-2"></div>
    <div className="w-32 h-4 bg-zinc-200 rounded"></div>
  </div>
);

export const RecentActivitySkeleton: React.FC = () => (
  <div className="bg-surface rounded-xl border border-zinc-200 shadow-sm p-6">
    <div className="w-48 h-6 bg-zinc-200 rounded mb-6 animate-pulse"></div>
    <div className="space-y-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="flex items-center justify-between py-3 border-b border-zinc-50 last:border-0 animate-pulse">
          <div className="flex items-center gap-3 flex-1">
            <div className="w-2 h-2 bg-zinc-200 rounded-full"></div>
            <div className="flex-1 space-y-2">
              <div className="w-48 h-4 bg-zinc-200 rounded"></div>
              <div className="w-64 h-3 bg-zinc-200 rounded"></div>
            </div>
          </div>
          <div className="w-20 h-3 bg-zinc-200 rounded"></div>
        </div>
      ))}
    </div>
  </div>
);

export const StudentsTableSkeleton: React.FC = () => (
  <div className="bg-surface rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="text-xs text-zinc-500 uppercase bg-zinc-50/50 border-b border-zinc-100">
          <tr>
            <th className="px-6 py-3"><div className="w-16 h-4 bg-zinc-200 rounded animate-pulse"></div></th>
            <th className="px-6 py-3"><div className="w-12 h-4 bg-zinc-200 rounded animate-pulse"></div></th>
            <th className="px-6 py-3"><div className="w-16 h-4 bg-zinc-200 rounded animate-pulse"></div></th>
            <th className="px-6 py-3"><div className="w-20 h-4 bg-zinc-200 rounded animate-pulse"></div></th>
            <th className="px-6 py-3 text-right"><div className="w-20 h-4 bg-zinc-200 rounded animate-pulse ml-auto"></div></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-50">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <tr key={i} className="animate-pulse">
              <td className="px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-zinc-200 rounded-full"></div>
                  <div className="space-y-2">
                    <div className="w-32 h-4 bg-zinc-200 rounded"></div>
                    <div className="w-48 h-3 bg-zinc-200 rounded"></div>
                  </div>
                </div>
              </td>
              <td className="px-6 py-4">
                <div className="w-20 h-6 bg-zinc-200 rounded-full"></div>
              </td>
              <td className="px-6 py-4">
                <div className="w-16 h-6 bg-zinc-200 rounded"></div>
              </td>
              <td className="px-6 py-4">
                <div className="w-24 h-4 bg-zinc-200 rounded"></div>
              </td>
              <td className="px-6 py-4 text-right">
                <div className="flex justify-end gap-2">
                  <div className="w-20 h-8 bg-zinc-200 rounded"></div>
                  <div className="w-8 h-8 bg-zinc-200 rounded"></div>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

export const PositionsSkeleton: React.FC = () => (
  <div className="space-y-3 sm:space-y-4">
    {[1, 2, 3].map((i) => (
      <div key={i} className="bg-surface rounded-xl border border-zinc-200 shadow-sm p-4 sm:p-6 animate-pulse">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex-1 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-16 h-5 bg-zinc-200 rounded-md"></div>
              <div className="flex-1 h-5 bg-zinc-200 rounded"></div>
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="w-24 h-4 bg-zinc-200 rounded"></div>
              <div className="w-20 h-4 bg-zinc-200 rounded"></div>
              <div className="w-32 h-4 bg-zinc-200 rounded"></div>
            </div>
            <div className="space-y-2">
              <div className="w-full h-3 bg-zinc-200 rounded"></div>
              <div className="w-3/4 h-3 bg-zinc-200 rounded"></div>
            </div>
          </div>
          <div className="flex gap-2">
            <div className="w-10 h-10 bg-zinc-200 rounded-lg"></div>
            <div className="w-10 h-10 bg-zinc-200 rounded-lg"></div>
          </div>
        </div>
      </div>
    ))}
  </div>
);

export const ApplicationsSkeleton: React.FC = () => (
  <div className="space-y-3 sm:space-y-4">
    {[1, 2, 3].map((i) => (
      <div key={i} className="bg-surface rounded-xl border border-zinc-200 shadow-sm p-4 sm:p-6 animate-pulse">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex-1 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-20 h-5 bg-zinc-200 rounded-md"></div>
                <div className="flex-1 h-5 bg-zinc-200 rounded"></div>
              </div>
              <div className="space-y-2">
                <div className="w-48 h-4 bg-zinc-200 rounded"></div>
                <div className="w-64 h-4 bg-zinc-200 rounded"></div>
                <div className="w-56 h-4 bg-zinc-200 rounded"></div>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="w-32 h-9 bg-zinc-200 rounded-lg"></div>
              <div className="w-24 h-9 bg-zinc-200 rounded-lg"></div>
            </div>
          </div>
          <div className="pt-3 border-t border-zinc-100 space-y-2">
            <div className="w-full h-3 bg-zinc-200 rounded"></div>
            <div className="w-5/6 h-3 bg-zinc-200 rounded"></div>
            <div className="w-4/5 h-3 bg-zinc-200 rounded"></div>
          </div>
        </div>
      </div>
    ))}
  </div>
);

export const ContentTableSkeleton: React.FC = () => (
  <div className="bg-surface rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="text-xs text-zinc-500 uppercase bg-zinc-50/50 border-b border-zinc-100">
          <tr>
            <th className="px-6 py-3"><div className="w-16 h-4 bg-zinc-200 rounded animate-pulse"></div></th>
            <th className="px-6 py-3"><div className="w-20 h-4 bg-zinc-200 rounded animate-pulse"></div></th>
            <th className="px-6 py-3"><div className="w-16 h-4 bg-zinc-200 rounded animate-pulse"></div></th>
            <th className="px-6 py-3 text-right"><div className="w-20 h-4 bg-zinc-200 rounded animate-pulse ml-auto"></div></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-50">
          {[1, 2, 3, 4, 5].map((i) => (
            <tr key={i} className="animate-pulse">
              <td className="px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-zinc-200 rounded-lg"></div>
                  <div className="space-y-2">
                    <div className="w-56 h-4 bg-zinc-200 rounded"></div>
                    <div className="w-72 h-3 bg-zinc-200 rounded"></div>
                  </div>
                </div>
              </td>
              <td className="px-6 py-4">
                <div className="space-y-2">
                  <div className="w-24 h-3 bg-zinc-200 rounded"></div>
                  <div className="w-16 h-3 bg-zinc-200 rounded"></div>
                </div>
              </td>
              <td className="px-6 py-4">
                <div className="flex items-center gap-2">
                  <div className="w-12 h-5 bg-zinc-200 rounded-full"></div>
                  <div className="w-16 h-5 bg-zinc-200 rounded"></div>
                </div>
              </td>
              <td className="px-6 py-4 text-right">
                <div className="flex justify-end gap-2">
                  <div className="w-8 h-8 bg-zinc-200 rounded"></div>
                  <div className="w-8 h-8 bg-zinc-200 rounded"></div>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

export const CommunityPostsSkeleton: React.FC = () => (
  <div className="grid gap-4">
    {[1, 2, 3, 4].map((i) => (
      <div key={i} className="bg-surface p-5 rounded-xl border border-zinc-200 shadow-sm flex gap-4 animate-pulse">
        <div className="flex flex-col items-center gap-1 pt-1">
          <div className="w-5 h-5 bg-zinc-200 rounded"></div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start mb-3">
            <div className="w-64 h-5 bg-zinc-200 rounded"></div>
            <div className="w-24 h-6 bg-zinc-200 rounded"></div>
          </div>
          <div className="mb-3 bg-zinc-50 p-3 rounded-lg border border-zinc-100">
            <div className="w-full h-4 bg-zinc-200 rounded mb-2"></div>
            <div className="w-5/6 h-4 bg-zinc-200 rounded"></div>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-32 h-3 bg-zinc-200 rounded"></div>
            <div className="w-20 h-3 bg-zinc-200 rounded"></div>
            <div className="w-24 h-3 bg-zinc-200 rounded"></div>
          </div>
        </div>
      </div>
    ))}
  </div>
);

export const AdminTeamSkeleton: React.FC = () => (
  <div className="bg-surface rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-left">
        <thead className="text-xs text-zinc-500 uppercase bg-zinc-50/50 border-b border-zinc-100">
          <tr>
            <th className="px-6 py-3"><div className="w-16 h-4 bg-zinc-200 rounded animate-pulse"></div></th>
            <th className="px-6 py-3"><div className="w-12 h-4 bg-zinc-200 rounded animate-pulse"></div></th>
            <th className="px-6 py-3"><div className="w-16 h-4 bg-zinc-200 rounded animate-pulse"></div></th>
            <th className="px-6 py-3"><div className="w-20 h-4 bg-zinc-200 rounded animate-pulse"></div></th>
            <th className="px-6 py-3 text-right"><div className="w-16 h-4 bg-zinc-200 rounded animate-pulse ml-auto"></div></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-50">
          {[1, 2, 3].map((i) => (
            <tr key={i} className="animate-pulse">
              <td className="px-6 py-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-zinc-200"></div>
                  <div className="space-y-2">
                    <div className="w-32 h-4 bg-zinc-200 rounded"></div>
                    <div className="w-48 h-3 bg-zinc-200 rounded"></div>
                  </div>
                </div>
              </td>
              <td className="px-6 py-4">
                <div className="w-24 h-4 bg-zinc-200 rounded"></div>
              </td>
              <td className="px-6 py-4">
                <div className="w-20 h-6 bg-zinc-200 rounded-full"></div>
              </td>
              <td className="px-6 py-4">
                <div className="w-24 h-4 bg-zinc-200 rounded"></div>
              </td>
              <td className="px-6 py-4 text-right">
                <div className="w-8 h-8 bg-zinc-200 rounded ml-auto"></div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

// Mirrors AiKeysTab: header meta line + key cards (fingerprint row, three
// counters, timestamps, action button) so the layout doesn't shift when the
// live ring status lands.
export const AiKeysSkeleton: React.FC = () => (
  <div className="space-y-4">
    <div className="flex items-center justify-between gap-2">
      <div className="w-48 h-4 bg-zinc-200 rounded animate-pulse"></div>
      <div className="w-8 h-8 bg-zinc-200 rounded-lg animate-pulse"></div>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {[1, 2].map((i) => (
        <div key={i} className="bg-surface border border-zinc-200 rounded-xl p-4 shadow-sm animate-pulse">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="w-28 h-5 bg-zinc-200 rounded"></div>
            <div className="w-20 h-5 bg-zinc-200 rounded-full"></div>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[1, 2, 3].map((j) => (
              <div key={j} className="bg-zinc-50 rounded-lg py-2 px-1">
                <div className="w-8 h-5 bg-zinc-200 rounded mx-auto mb-1"></div>
                <div className="w-12 h-3 bg-zinc-200 rounded mx-auto"></div>
              </div>
            ))}
          </div>
          <div className="w-40 h-3 bg-zinc-200 rounded mb-3"></div>
          <div className="w-full h-9 bg-zinc-200 rounded-lg"></div>
        </div>
      ))}
    </div>
    <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 space-y-2">
      <div className="w-full h-3 bg-zinc-200 rounded"></div>
      <div className="w-5/6 h-3 bg-zinc-200 rounded"></div>
    </div>
  </div>
);

// Mirrors the policy managers: header block + long text lines + meta row.
export const PolicyManagerSkeleton: React.FC = () => (
  <div className="space-y-4 sm:space-y-6">
    <div className="bg-surface p-4 sm:p-6 rounded-xl border border-zinc-200 shadow-sm animate-pulse">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="space-y-2">
          <div className="w-56 h-6 bg-zinc-200 rounded"></div>
          <div className="w-72 h-4 bg-zinc-200 rounded"></div>
        </div>
        <div className="w-28 h-9 bg-zinc-200 rounded-lg"></div>
      </div>
      <div className="space-y-2">
        <div className="w-full h-3 bg-zinc-200 rounded"></div>
        <div className="w-full h-3 bg-zinc-200 rounded"></div>
        <div className="w-11/12 h-3 bg-zinc-200 rounded"></div>
        <div className="w-full h-3 bg-zinc-200 rounded"></div>
        <div className="w-3/4 h-3 bg-zinc-200 rounded"></div>
      </div>
      <div className="mt-4 p-4 bg-zinc-50 border border-zinc-200 rounded-lg">
        <div className="w-48 h-4 bg-zinc-200 rounded"></div>
      </div>
    </div>
  </div>
);
