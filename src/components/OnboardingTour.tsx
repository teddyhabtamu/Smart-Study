import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  GraduationCap, PlayCircle, BookOpen, Sparkles, CalendarDays, Users,
  ArrowRight, ArrowLeft,
} from 'lucide-react';
import Dialog from './Dialog';

const STORAGE_KEY = 'smartstudy_onboarding_v1';

// Per-account persistence: different accounts on one browser each get the
// tour once; guests share the :guest key. localStorage (not the backend
// preferences column) is deliberate — tour dismissal is UI state, it must
// work offline/for guests, and a backend round-trip would delay first paint.
export const onboardingStorageKey = (userId?: string | null): string =>
  userId ? `${STORAGE_KEY}:${userId}` : `${STORAGE_KEY}:guest`;

export const hasSeenOnboarding = (userId?: string | null): boolean => {
  try {
    return localStorage.getItem(onboardingStorageKey(userId)) === 'seen';
  } catch {
    // Storage unavailable (private mode): fail closed so we don't nag with
    // an undismissable-every-visit modal.
    return true;
  }
};

export const markOnboardingSeen = (userId?: string | null): void => {
  try {
    localStorage.setItem(onboardingStorageKey(userId), 'seen');
  } catch {
    // Private mode — the tour simply shows again next visit; Skip still
    // works for this session.
  }
};

interface TourStep {
  icon: React.ReactNode;
  title: string;
  body: string;
  link?: { label: string; to: string };
}

const STEPS: TourStep[] = [
  {
    icon: <GraduationCap size={22} />,
    title: 'Welcome to SmartStudy',
    body: 'Your all-in-one study companion for Ethiopian high school (Grades 9–12): video lessons, textbooks, past exams, an AI tutor, and a study community. This 1-minute tour shows you around — skip anytime.',
  },
  {
    icon: <PlayCircle size={22} />,
    title: 'Watch: Video Classroom',
    body: 'Pick your grade, then filter by subject and chapter. New This Week keeps you current — tap the bookmark on any lesson to build your Saved for Later list.',
    link: { label: 'Browse videos', to: '/videos' },
  },
  {
    icon: <BookOpen size={22} />,
    title: 'Read: Library & Past Exams',
    body: 'Textbooks and national exam papers for every grade and subject — all searchable, with the same Saved filter so your shortlist follows you.',
    link: { label: 'Open library', to: '/library' },
  },
  {
    icon: <Sparkles size={22} />,
    title: 'Ask: AI Tutor',
    body: 'Stuck on a concept? Get step-by-step explanations tuned to your grade — type your question, ask by voice, or snap a photo of it.',
    link: { label: 'Try the AI Tutor', to: '/ai-tutor' },
  },
  {
    icon: <CalendarDays size={22} />,
    title: 'Plan, practice & level up',
    body: 'Schedule tasks in the Study Planner, drill yourself in the Practice Center, and earn XP, streaks, and levels as you learn.',
    link: { label: 'Open planner', to: '/planner' },
  },
  {
    icon: <Users size={22} />,
    title: "You're set — learn together",
    body: 'Join discussions in the Community, track everything from your Dashboard, and press Ctrl+K anywhere to search the whole platform.',
    link: { label: 'Visit community', to: '/community' },
  },
];

interface OnboardingTourProps {
  open: boolean;
  onClose: () => void;
  /** 'guest' (Landing) vs 'member' (Dashboard) — only the final CTAs differ. */
  mode?: 'guest' | 'member';
  /** Account the seen-flag is stored under. Null = guest key. */
  userId?: string | null;
}

// Guided first-run tour: Back / Next / Skip with progress, persisted so it
// shows once. Any dismissal (Skip, X, backdrop, Esc, mid-tour link) counts
// as seen — the tour must never nag. Re-entry is via the caller's explicit
// "Take the tour" button, which sets open regardless of the flag.
const OnboardingTour: React.FC<OnboardingTourProps> = ({
  open,
  onClose,
  mode = 'member',
  userId = null,
}) => {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const isLast = step === STEPS.length - 1;
  const current = STEPS[step];

  // Fresh from step 0 every time it opens (replays start over, not where
  // a previous session left off).
  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  const dismiss = () => {
    markOnboardingSeen(userId);
    onClose();
  };

  const goTo = (to: string) => {
    dismiss();
    navigate(to);
  };

  return (
    <Dialog
      open={open}
      onClose={dismiss}
      label="SmartStudy quick tour"
      describedBy="onboarding-tour-body"
      size="sm"
    >
      <div className="p-5 sm:p-6">
        {/* Header: position + skip */}
        <div className="flex items-center justify-between mb-5">
          <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
            Quick tour · Step {step + 1} of {STEPS.length}
          </p>
          {!isLast && (
            <button
              onClick={dismiss}
              className="text-xs font-semibold text-zinc-400 hover:text-ink transition-colors"
            >
              Skip
            </button>
          )}
        </div>

        {/* Step content */}
        <div className="flex items-start gap-4 mb-4">
          <div className="w-11 h-11 rounded-xl bg-zinc-900 text-onink flex items-center justify-center flex-shrink-0">
            {current.icon}
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-ink text-lg leading-tight mb-1.5">
              {current.title}
            </h3>
            <p id="onboarding-tour-body" className="text-sm text-inksoft leading-relaxed">
              {current.body}
            </p>
          </div>
        </div>

        {/* Mid-tour shortcut: explore now instead of finishing the tour */}
        {current.link && !isLast && (
          <button
            onClick={() => goTo(current.link!.to)}
            className="mb-4 text-xs font-semibold text-ink flex items-center gap-1 hover:gap-2 transition-all"
          >
            {current.link.label} <ArrowRight size={13} />
          </button>
        )}

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 my-5" aria-hidden="true">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? 'w-6 bg-zinc-900' : 'w-1.5 bg-zinc-200'
              }`}
            />
          ))}
        </div>

        {/* Footer nav */}
        {isLast ? (
          <div className="space-y-2">
            {mode === 'guest' ? (
              <>
                <button
                  onClick={() => goTo('/register')}
                  className="w-full py-2.5 bg-zinc-900 text-onink text-sm font-semibold rounded-xl hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2"
                >
                  Create free account <ArrowRight size={15} />
                </button>
                <button
                  onClick={() => goTo('/videos')}
                  className="w-full py-2.5 bg-surface border border-zinc-200 text-inksoft text-sm font-medium rounded-xl hover:bg-zinc-50 transition-colors"
                >
                  Browse videos first
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => goTo('/videos')}
                  className="w-full py-2.5 bg-zinc-900 text-onink text-sm font-semibold rounded-xl hover:bg-zinc-800 transition-colors flex items-center justify-center gap-2"
                >
                  Explore videos <ArrowRight size={15} />
                </button>
                <button
                  onClick={dismiss}
                  className="w-full py-2.5 bg-surface border border-zinc-200 text-inksoft text-sm font-medium rounded-xl hover:bg-zinc-50 transition-colors"
                >
                  Back to dashboard
                </button>
              </>
            )}
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
              className="flex-1 py-2.5 bg-surface border border-zinc-200 text-inksoft text-sm font-medium rounded-xl hover:bg-zinc-50 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ArrowLeft size={15} /> Back
            </button>
            <button
              onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
              className="flex-1 py-2.5 bg-zinc-900 text-onink text-sm font-semibold rounded-xl hover:bg-zinc-800 transition-colors flex items-center justify-center gap-1.5"
            >
              Next <ArrowRight size={15} />
            </button>
          </div>
        )}

        <p className="mt-4 text-center text-[11px] text-zinc-400">
          {mode === 'guest'
            ? 'You can replay this anytime from the home page tour button.'
            : 'You can replay this anytime with “Take the tour” on your dashboard.'}
        </p>
      </div>
    </Dialog>
  );
};

export default OnboardingTour;
