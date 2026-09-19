import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { RotateCcw, ChevronRight } from 'lucide-react';
import { plannerAPI } from '../services/api';

interface DueSubject {
  subject: string;
  avgScorePct: number | null;
  attempts: number;
  reason: 'weakest' | 'recent';
}

// Dashboard "Review today" card: spaced repetition from the student's own
// history — weakest quiz subjects first, recent planner subjects when no
// quiz data exists yet. One tap starts a short review quiz in Practice
// (same generator, same daily limit — no new quota surface). Renders
// nothing while loading, on failure, or when nothing is due.
const ReviewTodayCard: React.FC = () => {
  const navigate = useNavigate();
  const [due, setDue] = useState<DueSubject[] | null>(null);

  useEffect(() => {
    let alive = true;
    plannerAPI
      .getReviewQueue()
      .then((d) => {
        if (alive) setDue(d.due || []);
      })
      .catch(() => {
        if (alive) setDue(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!due || due.length === 0) return null;
  const [top, ...rest] = due;
  if (!top) return null;
  // Perfect record: nothing is weak, so "lowest average" copy would read as
  // nonsense ("lowest: 100%"). Reframe as maintenance, ordered oldest-first
  // by the backend tiebreak.
  const allStrong = top.avgScorePct !== null && top.avgScorePct >= 90;

  const startReview = (subject: string) => {
    navigate('/practice', { state: { reviewSubject: subject, reviewCount: '5' } });
  };

  return (
    <div className="bg-surface p-4 sm:p-6 rounded-2xl border border-zinc-200 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <RotateCcw size={16} className="text-zinc-500 flex-shrink-0" />
        <h3 className="font-bold text-ink truncate">Review today</h3>
      </div>
      <p className="text-xs text-zinc-500 mb-3">
        {allStrong ? (
          <>Everything's strong — keep <span className="font-bold text-ink">{top.subject}</span> warm with 5 quick questions.</>
        ) : top.reason === 'weakest' && top.avgScorePct !== null ? (
          <>Your lowest quiz average is <span className="font-bold text-ink">{top.subject} ({top.avgScorePct}%)</span> — 5 quick questions to lock it in.</>
        ) : (
          <>Pick up <span className="font-bold text-ink">{top.subject}</span> again — short review, 5 questions.</>
        )}
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <button
          onClick={() => startReview(top.subject)}
          className="flex-1 px-4 py-2.5 bg-zinc-900 text-onink text-sm font-medium rounded-xl hover:bg-zinc-800 transition-colors flex items-center justify-center gap-1.5"
        >
          Start review <ChevronRight size={14} />
        </button>
      </div>
      {rest.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-3">
          {rest.map((d) => (
            <button
              key={d.subject}
              onClick={() => startReview(d.subject)}
              className="px-3 py-1.5 text-xs font-medium text-inksoft bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 rounded-lg transition-colors whitespace-nowrap"
            >
              {d.subject}
              {d.avgScorePct !== null && <span className="text-zinc-500"> · {d.avgScorePct}%</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ReviewTodayCard;
