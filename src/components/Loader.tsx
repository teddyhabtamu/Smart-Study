import React from 'react';
import { GraduationCap } from 'lucide-react';

// Branded boot / suspense screen: brand mark + wordmark + a thin indeterminate
// bar. Theme-aware throughout (page/ink/zinc/amber tokens) — the old version
// hardcoded black dots that nearly vanished on dark themes and carried no
// brand identity. Motion collapses under prefers-reduced-motion via the
// global blanket in index.css.
const Loader: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[rgb(var(--page))] px-4">
      <div className="w-14 h-14 rounded-2xl bg-zinc-900 flex items-center justify-center shadow-xl animate-boot-mark">
        <GraduationCap size={28} className="text-amber-400" />
      </div>

      <p className="mt-5 text-lg font-bold text-ink tracking-tight">
        SmartStudy
      </p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
        AI Learning
      </p>

      <div
        className="mt-6 h-1 w-40 overflow-hidden rounded-full bg-zinc-200"
        role="status"
        aria-label="Loading"
      >
        <div className="h-full w-1/3 rounded-full bg-amber-400 animate-boot-bar" />
      </div>
    </div>
  );
};

export default Loader;

