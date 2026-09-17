import React, { useEffect, useRef } from 'react';

interface RailProps {
  children: React.ReactNode;
  /** Classes for the scroll strip itself (layout, gaps, snap, padding). */
  className?: string;
  /** Accessible name for the scrollable region, e.g. "Admin sections". */
  label: string;
}

// Horizontally scrollable strip where the mouse wheel scrolls sideways.
//
// Touchpads swipe these strips natively, but a plain mouse wheel does
// nothing on them — mouse users couldn't reach overflowed tabs/cards. This
// translates vertical wheel motion into horizontal scrolling while hovering
// the strip. Three deliberate restraints keep it from becoming annoying:
// - Edge release: at either end, the wheel goes back to the page — the
//   strip never traps vertical page scroll (the classic failure of naive
//   wheel hijacking, painful on tall card rails).
// - Horizontal gestures pass through untouched, so trackpad two-finger
//   swipes and Shift+wheel keep their native behavior.
// - Fine pointers only (real mice): touch screens keep swipe, keyboard
//   users keep the focusable region + arrow keys.
const Rail: React.FC<RailProps> = ({ children, className = '', label }) => {
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;

    const finePointer =
      typeof window !== 'undefined' &&
      window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    if (!finePointer) return;

    const onWheel = (e: WheelEvent) => {
      const target = scrollerRef.current;
      if (!target) return;
      // A genuine horizontal gesture (trackpad swipe, Shift+wheel): the
      // browser already pans natively — stay out of the way.
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      if (e.deltaY === 0) return;

      const max = target.scrollWidth - target.clientWidth;
      if (max <= 0) return; // nothing to scroll: page keeps the gesture
      const goingDown = e.deltaY > 0;
      const atStart = target.scrollLeft <= 1;
      const atEnd = target.scrollLeft >= max - 1;
      // At the boundary in the gesture's direction: release to the page.
      if ((goingDown && atEnd) || (!goingDown && atStart)) return;

      e.preventDefault();
      // Firefox reports lines for some mice — normalize to pixels.
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      target.scrollBy({ left: delta });
    };

    // passive:false is required — preventDefault() is the whole point.
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onWheel);
    };
  }, []);

  return (
    <div
      ref={scrollerRef}
      role="region"
      aria-label={label}
      tabIndex={0}
      className={`overflow-x-auto hide-scrollbar focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900/20 rounded-lg ${className}`}
    >
      {children}
    </div>
  );
};

export default Rail;
