import React, { useState } from 'react';

export interface ActivityBar {
  key: string;
  /** Single-letter (or short) axis label rendered under the bar. */
  label: string;
  /** Bar magnitude; 0 renders a tick. */
  value: number;
  /** Tooltip headline, e.g. "Thu, Sep 17". */
  title: string;
  /** Tooltip detail, e.g. "3 tasks · 220 XP". */
  detail: string;
  /** Screen-reader + tooltip full text. Defaults to "title: detail". */
  ariaLabel?: string;
  /** Emphasized label (e.g. today). */
  highlight?: boolean;
}

interface ActivityBarsProps {
  bars: ActivityBar[];
  /** Max bar height in px. Defaults to 64. */
  maxHeight?: number;
  /** Currently open tooltip key (controlled for single-open behavior). */
  openKey?: string | null;
  onOpenChange?: (key: string | null) => void;
}

// ---------------------------------------------------------------------------
// ActivityBars: one bar-chart implementation for every mini chart
// (weekly recap, engagement). Slim capped columns (never fat pills),
// custom tooltips on hover (mouse), focus (keyboard), and tap (touch —
// hover doesn't exist there, so tap toggles). Edge columns pin their
// tooltip inward so nothing clips on 360px viewports. Native `title`
// tooltips are deliberately not used: slow, undiscoverable, and absent
// on touch.
// ---------------------------------------------------------------------------
const ActivityBars: React.FC<ActivityBarsProps> = ({
  bars,
  maxHeight = 64,
  openKey,
  onOpenChange,
}) => {
  const [internalOpen, setInternalOpen] = useState<string | null>(null);
  const open = onOpenChange ? openKey ?? null : internalOpen;
  // Functional updates allowed (avoids stale closures in leave/blur); the
  // controlled prop wins when provided, internal state otherwise.
  const setOpen = (v: string | null | ((cur: string | null) => string | null)): void => {
    const next = typeof v === 'function' ? (v as (cur: string | null) => string | null)(open) : v;
    if (onOpenChange) onOpenChange(next);
    else setInternalOpen(next);
  };
  const max = Math.max(1, ...bars.map((b) => b.value));

  return (
    <div className="flex items-end gap-1.5 sm:gap-2 h-20 mb-1">
      {bars.map((b, i) => {
        const isOpen = open === b.key;
        const height = b.value === 0 ? 4 : Math.max(10, Math.round((b.value / max) * maxHeight));
        const align =
          i <= 1 ? 'left-0' : i >= bars.length - 2 ? 'right-0' : 'left-1/2 -translate-x-1/2';
        return (
          <button
            key={b.key}
            type="button"
            aria-label={b.ariaLabel || `${b.title}: ${b.detail}`}
            aria-expanded={isOpen}
            onMouseEnter={() => setOpen(b.key)}
            onMouseLeave={() => setOpen((cur) => (cur === b.key ? null : cur))}
            onFocus={() => setOpen(b.key)}
            onBlur={() => setOpen((cur) => (cur === b.key ? null : cur))}
            onClick={() => setOpen(isOpen ? null : b.key)}
            className="flex-1 min-w-0 flex flex-col items-center gap-1 h-full justify-end relative rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/30"
          >
            {isOpen && (
              <span
                role="status"
                className={`absolute -top-1 -translate-y-full ${align} z-10 whitespace-nowrap bg-zinc-900 text-onink text-[11px] font-medium rounded-lg px-2.5 py-1.5 shadow-lg pointer-events-none`}
              >
                {b.title} · {b.detail}
              </span>
            )}
            <span
              className={`w-full max-w-[26px] mx-auto rounded-full transition-colors ${b.value === 0 ? 'bg-ink/15' : isOpen ? 'bg-inksoft' : 'bg-ink'}`}
              style={{ height }}
            />
            <span className={`text-[10px] ${b.highlight ? 'font-bold text-ink' : 'text-zinc-500'}`}>
              {b.label}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export default ActivityBars;
