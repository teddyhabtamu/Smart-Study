import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  GraduationCap, PlayCircle, BookOpen, Sparkles, Target,
  ArrowRight, ArrowLeft, X,
} from 'lucide-react';

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

// Stable selectors for the spotlight targets. WARNING (onboarding rot): if
// the Dashboard layout moves or renames these sections, update the
// data-tour attributes AND this map — a stale selector silently degrades to
// a centered card (never a highlight over empty space), but the tour loses
// its point. Review this tour whenever the Dashboard changes.
export const TOUR_TARGETS = {
  aiAssistant: '[data-tour="ai-assistant"]',
  continueLearning: '[data-tour="continue-learning"]',
  dailyGoal: '[data-tour="daily-goal"]',
} as const;

interface TourStep {
  icon: React.ReactNode;
  title: string;
  body: string;
  /** Selector of the element to spotlight. Absent → centered card. */
  target?: string;
  link?: { label: string; to: string };
  chips?: { label: string; to: string }[];
}

// Member tour: welcome modal → 3 spotlight coachmarks on the real
// Dashboard → centered finale with quick links. 5 steps max: benchmark data
// (Chameleon, 550M interactions) shows 3-step tours completing near 72%
// while 7+ collapse toward 16%. Copy is capped near 180 chars per tooltip.
const MEMBER_STEPS: TourStep[] = [
  {
    icon: <GraduationCap size={22} />,
    title: 'Welcome to SmartStudy',
    body: 'Your mission control for Grades 9–12: lessons, plans, and progress in one place. A 1-minute tour — skip anytime.',
  },
  {
    icon: <Sparkles size={22} />,
    title: 'Stuck? Ask here',
    body: 'Type, speak, or snap a photo of any question. Answers come step-by-step, tuned to your grade.',
    target: TOUR_TARGETS.aiAssistant,
    link: { label: 'Open AI Tutor', to: '/ai-tutor' },
  },
  {
    icon: <PlayCircle size={22} />,
    title: 'Pick up where you left off',
    body: 'Bookmark any video or document and it lands here, ready to resume in one tap.',
    target: TOUR_TARGETS.continueLearning,
  },
  {
    icon: <Target size={22} />,
    title: 'Your daily loop',
    body: 'Finish today’s tasks to grow your streak, earn XP, and level up. The full schedule lives in the Planner.',
    target: TOUR_TARGETS.dailyGoal,
    link: { label: 'Open Planner', to: '/planner' },
  },
  {
    icon: <GraduationCap size={22} />,
    title: "You're set",
    body: 'That’s the loop: learn, practice, repeat. Everything else is one tap away:',
    chips: [
      { label: 'Videos', to: '/videos' },
      { label: 'Library', to: '/library' },
      { label: 'Practice', to: '/practice' },
      { label: 'Community', to: '/community' },
    ],
  },
];

// Guest tour (Landing): no app UI to anchor to, so all steps stay centered.
// Same 5-step budget; the finale carries the section map as link chips.
const GUEST_STEPS: TourStep[] = [
  {
    icon: <GraduationCap size={22} />,
    title: 'Welcome to SmartStudy',
    body: 'Your all-in-one study companion for Ethiopian high school (Grades 9–12). A 1-minute tour — skip anytime.',
  },
  {
    icon: <PlayCircle size={22} />,
    title: 'Watch: Video Classroom',
    body: 'Expert lessons by grade, subject, and chapter. New This Week keeps you current — save lessons to build your list.',
    link: { label: 'Browse videos', to: '/videos' },
  },
  {
    icon: <BookOpen size={22} />,
    title: 'Read: Library & Past Exams',
    body: 'Textbooks and national exam papers for every grade — all searchable, with saved lists that follow you.',
    link: { label: 'Open library', to: '/library' },
  },
  {
    icon: <Sparkles size={22} />,
    title: 'Ask: AI Tutor',
    body: 'Stuck? Get step-by-step explanations tuned to your grade — type, speak, or snap a photo.',
    link: { label: 'Try the AI Tutor', to: '/ai-tutor' },
  },
  {
    icon: <GraduationCap size={22} />,
    title: "You're set",
    body: 'Plans, quizzes, and a study community round it out. Start free — upgrade only if you want Pro:',
    chips: [
      { label: 'Videos', to: '/videos' },
      { label: 'Library', to: '/library' },
      { label: 'Planner', to: '/planner' },
      { label: 'Community', to: '/community' },
    ],
  },
];

interface Spot {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface OnboardingTourProps {
  open: boolean;
  onClose: () => void;
  /** 'guest' (Landing, centered) vs 'member' (Dashboard, spotlight). */
  mode?: 'guest' | 'member';
  /** Account the seen-flag is stored under. Null = guest key. */
  userId?: string | null;
}

// Guided first-run tour: a welcome modal that routes into spotlight
// coachmarks anchored to the real UI. Any dismissal (Skip, X, backdrop in
// centered mode, Esc, mid-tour link) counts as seen — the tour must never
// nag. Re-entry is via the caller's explicit "Take the tour" button, which
// sets open regardless of the flag.
const OnboardingTour: React.FC<OnboardingTourProps> = ({
  open,
  onClose,
  mode = 'member',
  userId = null,
}) => {
  const navigate = useNavigate();
  const steps = mode === 'guest' ? GUEST_STEPS : MEMBER_STEPS;
  const [step, setStep] = useState(0);
  const [spot, setSpot] = useState<Spot | null>(null);
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 640
  );
  const tipRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);

  const isLast = step === steps.length - 1;
  const current = steps[step];
  // Spotlight only when the step names a target AND it resolves to a live,
  // on-screen element. Anything else (missing node, redesigned layout,
  // closed mobile drawer) degrades to a centered card.
  const isSpotlight = !isMobile && spot !== null && !!current.target;
  const showCutout = spot !== null && !!current.target;
  // The highlight cutout renders on mobile too — a fully-dimmed screen with
  // a bottom sheet never shows WHICH component the step is about. Only the
  // floating tooltip card stays desktop-only (no room beside full-width
  // mobile cards); mobile keeps its bottom sheet under the cutout.

  // Fresh from step 0 every time it opens; capture the trigger for focus
  // return and lock background scroll while the tour owns the screen.
  useEffect(() => {
    if (!open) return;
    setStep(0);
    triggerRef.current = document.activeElement;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
      const trigger = triggerRef.current as HTMLElement | null;
      if (trigger && document.contains(trigger)) trigger.focus({ preventScroll: true });
      triggerRef.current = null;
    };
  }, [open ]);

  // Track the mobile breakpoint (mobile always uses a bottom sheet — no
  // floating math, no cramped tooltips beside full-width cards).
  useEffect(() => {
    if (!open) return;
    const onResize = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [open ]);

  // Resolve + track the spotlight target. Scrolls it into view, then
  // re-measures on scroll/resize so the cutout sticks to the element.
  useEffect(() => {
    if (!open) return;
    const sel = steps[step].target;
    if (!sel) {
      setSpot(null);
      return;
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const update = () => {
      const el = document.querySelector(sel);
      if (!el) {
        setSpot(null);
        return;
      }
      const r = el.getBoundingClientRect();
      const visible =
        r.width > 4 && r.height > 4 &&
        r.bottom > 0 && r.top < window.innerHeight &&
        r.right > 0 && r.left < window.innerWidth;
      setSpot(visible ? { top: r.top, left: r.left, width: r.width, height: r.height } : null);
    };
    document.querySelector(sel)?.scrollIntoView({
      behavior: reduced ? 'auto' : 'smooth',
      block: 'center',
    });
    update();
    const t1 = setTimeout(update, 150);
    const t2 = setTimeout(update, 600);
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    window.addEventListener('resize', update);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', onScroll, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step]);

  // Focus the tooltip on every step so keyboard users land in the tour.
  useLayoutEffect(() => {
    if (open) tipRef.current?.focus({ preventScroll: true });
  }, [open, step ]);

  if (!open) return null;

  const dismiss = () => {
    markOnboardingSeen(userId);
    onClose();
  };

  const goTo = (to: string) => {
    dismiss();
    navigate(to);
  };

  // Tooltip placement (desktop spotlight): below the cutout when it fits a
  // compact card (~330px), else above; horizontally centered on the target
  // and clamped into the viewport. Copy + card are compact by design, and
  // the body scrolls past 40vh, so the estimate can't strand the card.
  const TIP_W = 340;
  const TIP_H = 330;
  const GAP = 12;
  let tipStyle: React.CSSProperties = {};
  if (isSpotlight && spot) {
    const fitsBelow = spot.top + spot.height + GAP + TIP_H <= window.innerHeight;
    const top = fitsBelow
      ? spot.top + spot.height + GAP
      : Math.max(12, spot.top - TIP_H - GAP);
    const left = Math.min(
      Math.max(16, spot.left + spot.width / 2 - TIP_W / 2),
      window.innerWidth - TIP_W - 16
    );
    tipStyle = { top, left, width: TIP_W };
  }

  const onTipKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      dismiss();
      return;
    }
    // Light focus trap: Tab cycles the tooltip controls instead of
    // escaping to the dimmed page behind.
    if (e.key !== 'Tab' || !tipRef.current) return;
    const items = Array.from(
      tipRef.current.querySelectorAll(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ) as HTMLElement[];
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const tooltip = (
    <div
      ref={tipRef}
      role="dialog"
      aria-modal="true"
      aria-label={`SmartStudy quick tour, step ${step + 1} of ${steps.length}: ${current.title}`}
      tabIndex={-1}
      onKeyDown={onTipKeyDown}
      style={isSpotlight ? tipStyle : undefined}
      className={
        isSpotlight
          ? 'fixed z-[410] w-[340px] max-w-[calc(100vw-2rem)] bg-zinc-900 text-white rounded-2xl shadow-2xl p-5 outline-none animate-slide-up'
          : isMobile
            // Bottom sheet: capped to the *dynamic* viewport with its own
            // scroll (landscape phones / large text would otherwise push the
            // nav buttons off-screen with no way to reach them), and parked
            // above the home indicator via safe-area (same pattern as
            // PwaInstall) instead of a fixed bottom-4.
            ? 'fixed z-[410] left-4 right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] bg-zinc-900 text-white rounded-2xl shadow-2xl p-5 outline-none animate-slide-up max-h-[calc(100dvh-2rem)] overflow-y-auto'
            : 'relative z-[410] w-[380px] max-w-[calc(100vw-2rem)] bg-zinc-900 text-white rounded-2xl shadow-2xl p-5 sm:p-6 outline-none animate-slide-up max-h-[calc(100vh-4rem)] overflow-y-auto'
      }
    >
      {/* Header: position + skip */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
          Step {step + 1} of {steps.length}
        </p>
        <div className="flex items-center gap-1">
          {!isLast && (
            <button
              onClick={dismiss}
              className="text-xs font-semibold text-zinc-400 hover:text-white transition-colors px-2 py-2 min-h-[44px]"
            >
              Skip
            </button>
          )}
          <button
            onClick={dismiss}
            aria-label="Close tour"
            className="p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-zinc-400 hover:text-white rounded-lg transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Step content */}
      <div className="flex items-start gap-3.5 mb-3">
        <div className="w-10 h-10 rounded-xl bg-white text-zinc-900 flex items-center justify-center flex-shrink-0">
          {current.icon}
        </div>
        <div className="min-w-0">
          <h3 className="font-bold text-white text-base leading-tight mb-1">
            {current.title}
          </h3>
          <p className="text-sm text-zinc-300 leading-relaxed">{current.body}</p>
        </div>
      </div>

      {/* Mid-tour shortcut into the featured section */}
      {current.link && !isLast && (
        <button
          onClick={() => goTo(current.link!.to)}
          className="mb-3 text-xs font-semibold text-white flex items-center gap-1 hover:gap-2 transition-all"
        >
          {current.link.label} <ArrowRight size={13} />
        </button>
      )}

      {/* Finale quick-link map */}
      {current.chips && (
        <div className="grid grid-cols-2 gap-2 my-4">
              {current.chips.map((chip) => (
                <button
                  key={chip.to + chip.label}
                  onClick={() => goTo(chip.to)}
                  className="px-3 py-2 min-h-[44px] flex items-center bg-white/10 border border-white/10 rounded-xl text-xs font-semibold text-white hover:bg-white/20 transition-colors text-left"
                >
                  {chip.label}
                </button>
              ))}
        </div>
      )}

      {/* Progress dots */}
      <div className="flex items-center justify-center gap-1.5 my-4" aria-hidden="true">
        {steps.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all ${
              i === step ? 'w-6 bg-white' : 'w-1.5 bg-white/25'
            }`}
          />
        ))}
      </div>

      {/* Footer nav */}
      {isLast ? (
        mode === 'guest' ? (
          <div className="space-y-2">
            <button
              onClick={() => goTo('/register')}
              className="w-full py-2.5 min-h-[44px] bg-white text-zinc-900 text-sm font-bold rounded-xl hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2"
            >
              Create free account <ArrowRight size={15} />
            </button>
            <button
              onClick={() => goTo('/videos')}
              className="w-full py-2.5 min-h-[44px] bg-transparent border border-white/20 text-zinc-200 text-sm font-medium rounded-xl hover:bg-white/10 transition-colors flex items-center justify-center"
            >
              Browse videos first
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <button
              onClick={() => goTo('/videos')}
              className="w-full py-2.5 min-h-[44px] bg-white text-zinc-900 text-sm font-bold rounded-xl hover:bg-zinc-200 transition-colors flex items-center justify-center gap-2"
            >
              Explore videos <ArrowRight size={15} />
            </button>
            <button
              onClick={dismiss}
              className="w-full py-2.5 min-h-[44px] bg-transparent border border-white/20 text-zinc-200 text-sm font-medium rounded-xl hover:bg-white/10 transition-colors flex items-center justify-center"
            >
              Back to dashboard
            </button>
          </div>
        )
      ) : (
        <div className="flex gap-2">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="flex-1 py-2.5 min-h-[44px] bg-transparent border border-white/20 text-zinc-200 text-sm font-medium rounded-xl hover:bg-white/10 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ArrowLeft size={15} /> Back
          </button>
          <button
            onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}
            className="flex-1 py-2.5 min-h-[44px] bg-white text-zinc-900 text-sm font-bold rounded-xl hover:bg-zinc-200 transition-colors flex items-center justify-center gap-1.5"
          >
            {step === 0 ? 'Show me around' : 'Next'} <ArrowRight size={15} />
          </button>
        </div>
      )}

      <p className="mt-3.5 text-center text-[11px] text-zinc-500">
        {mode === 'guest'
          ? 'Replay anytime from the home page tour button.'
          : 'Replay anytime with “Take the tour” on your dashboard.'}
      </p>
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 z-[400]">
      {showCutout && spot ? (
        <>
          {/* Click-swallowing layer (transparent: the highlight's box-shadow
              does the dimming) so the tour keeps focus on the tooltip. */}
          <div className="absolute inset-0" />
          {/* Spotlight cutout: padded ring over the live element, everything
              else dimmed. pointer-events-none — purely visual. On mobile the
              bottom-sheet card renders under this same cutout. */}
          <div
            aria-hidden="true"
            className="absolute rounded-xl border-2 border-white shadow-[0_0_0_9999px_rgba(9,9,11,0.62)] motion-reduce:transition-none transition-all duration-300 pointer-events-none"
            style={{
              top: spot.top - 8,
              left: spot.left - 8,
              width: spot.width + 16,
              height: spot.height + 16,
            }}
          />
          {tooltip}
        </>
      ) : (
        <div
          className="absolute inset-0 bg-zinc-950/60 backdrop-blur-[1px] flex items-end sm:items-center justify-center p-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) dismiss();
          }}
        >
          {tooltip}
        </div>
      )}
    </div>,
    document.body
  );
};

export default OnboardingTour;
