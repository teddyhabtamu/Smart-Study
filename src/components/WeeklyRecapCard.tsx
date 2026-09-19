import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { CalendarRange, ChevronRight, Flame } from 'lucide-react';
import { dashboardAPI } from '../services/api';

interface RecapDay {
  date: string;
  tasksCompleted: number;
  xp: number;
}

interface Recap {
  tasksCompleted: number;
  xpGained: number;
  quizzesTaken: number;
  aiCalls: number;
  videosCompleted: number;
  activeDays: number;
  streak: number;
  perDay: RecapDay[];
}

// Dashboard "Your week" card: 7-day totals + daily activity bars from data
// we already log (events, XP, quizzes, AI, videos). Self-contained like
// MyAiUsageCard. Unlike usage stats, the EMPTY state stays visible — a new
// account seeing "plan your first session" is onboarding, not a broken
// zero. Only a fetch failure hides the card.
const weekdayLetter = (dateStr: string): string => {
  const d = new Date(`${dateStr}T12:00:00`);
  return isNaN(d.getTime()) ? '' : 'SMTWTFS'[d.getDay()] || '';
};

const WeeklyRecapCard: React.FC = () => {
  const [recap, setRecap] = useState<Recap | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    dashboardAPI
      .getRecap()
      .then((d) => {
        if (alive) setRecap(d);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (failed || !recap) return null;
  const hasActivity =
    recap.tasksCompleted > 0 ||
    recap.xpGained > 0 ||
    recap.quizzesTaken > 0 ||
    recap.aiCalls > 0 ||
    recap.videosCompleted > 0;
  const maxTasks = Math.max(1, ...recap.perDay.map((d) => d.tasksCompleted));
  const todayStr = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);

  return (
    <div className="bg-surface p-4 sm:p-6 rounded-2xl border border-zinc-200 shadow-sm">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h3 className="font-bold text-ink flex items-center gap-2 min-w-0">
          <CalendarRange size={16} className="text-zinc-500 flex-shrink-0" />
          <span className="truncate">Your week</span>
        </h3>
        {recap.streak > 0 && (
          <span className="flex items-center gap-1 text-xs font-bold text-inksoft whitespace-nowrap flex-shrink-0">
            <Flame size={13} className="fill-current text-orange-500" /> {recap.streak} day streak
          </span>
        )}
      </div>

      {!hasActivity ? (
        <div className="mt-2">
          <p className="text-sm text-zinc-500 mb-3">
            Nothing logged yet this week — plan your first session and it will show up here.
          </p>
          <Link
            to="/planner"
            className="inline-flex items-center gap-1 px-4 py-2 bg-zinc-900 text-onink text-sm font-medium rounded-lg hover:bg-zinc-800 transition-colors"
          >
            Plan your week <ChevronRight size={14} />
          </Link>
        </div>
      ) : (
        <>
          <p className="text-xs text-zinc-500 mb-3">
            {recap.tasksCompleted.toLocaleString()} task{recap.tasksCompleted === 1 ? '' : 's'} done
            {' · '}{recap.xpGained.toLocaleString()} XP
            {recap.quizzesTaken > 0 && <> · {recap.quizzesTaken} quiz{recap.quizzesTaken === 1 ? '' : 'zes'}</>}
            {recap.activeDays > 0 && <> · {recap.activeDays} active day{recap.activeDays === 1 ? '' : 's'}</>}
          </p>
          <div className="flex items-end gap-1.5 sm:gap-2 h-20 mb-1" aria-hidden="true">
            {recap.perDay.map((d) => {
              const isToday = d.date === todayStr;
              const height = d.tasksCompleted === 0 ? 4 : Math.max(10, Math.round((d.tasksCompleted / maxTasks) * 64));
              return (
                <div key={d.date} className="flex-1 min-w-0 flex flex-col items-center gap-1 h-full justify-end">
                  <div
                    className={`w-full rounded-full ${d.tasksCompleted === 0 ? 'bg-ink/15' : 'bg-ink'}`}
                    style={{ height }}
                    title={`${d.date}: ${d.tasksCompleted} tasks, ${d.xp} XP`}
                  />
                  <span className={`text-[10px] ${isToday ? 'font-bold text-ink' : 'text-zinc-500'}`}>
                    {weekdayLetter(d.date)}
                  </span>
                </div>
              );
            })}
          </div>
          <Link
            to="/planner"
            className="text-xs font-medium text-zinc-500 hover:text-ink flex items-center gap-1 transition-colors mt-1"
          >
            Open planner <ChevronRight size={14} />
          </Link>
        </>
      )}
    </div>
  );
};

export default WeeklyRecapCard;
