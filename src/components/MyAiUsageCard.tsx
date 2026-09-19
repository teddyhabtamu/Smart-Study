import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles, ChevronRight } from 'lucide-react';
import { usersAPI } from '../services/api';
import { MyAiUsageSkeleton } from './Skeletons';

// Dashboard "AI usage this week" card: the student's own generations from
// the same ai_usage rows the admin aggregates read — scoped to the caller.
// Self-contained (owns its fetch) so Dashboard stays untouched beyond
// mounting it. Deliberately quiet: renders nothing while loading, on
// error, or at zero usage — a metering outage or a brand-new account must
// never add wall space or a broken-looking zero state.
const ROUTE_LABELS: Record<string, string> = {
  chat: 'Tutor chats',
  'chat-stream': 'Tutor chats',
  'generate-study-plan': 'Study plans',
  'generate-practice-quiz': 'Quizzes',
};

const MyAiUsageCard: React.FC = () => {
  const [usage, setUsage] = useState<{
    totalCalls: number;
    byRoute: Array<{ route: string; calls: number }>;
  } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    usersAPI
      .getMyAiUsage(7)
      .then((d) => {
        if (alive) setUsage({ totalCalls: d.totalCalls, byRoute: d.byRoute });
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (failed) return null;
  if (!usage) return <MyAiUsageSkeleton />;
  if (usage.totalCalls === 0) return null;
  const top = [...usage.byRoute].sort((a, b) => b.calls - a.calls).slice(0, 3);

  return (
    <div className="bg-surface rounded-2xl border border-zinc-200 p-4 sm:p-6 shadow-sm">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h3 className="font-bold text-ink flex items-center gap-2 min-w-0">
          <Sparkles size={16} className="text-zinc-500 flex-shrink-0" />
          <span className="truncate">AI usage this week</span>
        </h3>
        <span className="text-xl font-bold text-ink tabular-nums flex-shrink-0">
          {usage.totalCalls.toLocaleString()}
        </span>
      </div>
      <p className="text-xs text-zinc-500 mb-3">
        {usage.totalCalls === 1 ? 'generation' : 'generations'} across tutor, planner and practice
      </p>
      <div className="space-y-1.5 mb-3">
        {top.map((r) => (
          <div key={r.route} className="flex items-center gap-2 text-xs min-w-0">
            <span className="text-zinc-500 truncate flex-1 min-w-0">
              {ROUTE_LABELS[r.route] || r.route}
            </span>
            <div className="w-20 h-1.5 bg-zinc-100 rounded-full overflow-hidden flex-shrink-0">
              <div
                className="h-full bg-ink rounded-full"
                style={{ width: `${Math.max(8, Math.round((r.calls / usage.totalCalls) * 100))}%` }}
              />
            </div>
            <span className="text-zinc-500 tabular-nums w-6 text-right flex-shrink-0">{r.calls}</span>
          </div>
        ))}
      </div>
      <Link
        to="/ai-tutor"
        className="text-xs font-medium text-zinc-500 hover:text-ink flex items-center gap-1 transition-colors"
      >
        Open AI Tutor <ChevronRight size={14} />
      </Link>
    </div>
  );
};

export default MyAiUsageCard;
