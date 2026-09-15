import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  type ThemeId,
  ALL_THEMES,
  isThemeId,
  type AutoSlot,
  type AutoSlotMap,
  DEFAULT_AUTO_SLOTS,
  parseAutoSlots,
  currentAutoTheme,
  currentSlot,
} from './themeSchedule';

// Re-export the canonical theme types from the pure schedule module so
// existing `from '../context/ThemeContext'` imports keep working.
export type { ThemeId, AutoSlot, AutoSlotMap };
export { ALL_THEMES, DEFAULT_AUTO_SLOTS };

// ---------------------------------------------------------------------------
// Theme system (Phase 2 wardrobe: 3 lights + 3 darks, + Auto schedule).
//
// Themes are CSS-variable sets flipped by one data-theme attribute on <html>
// (see the THEMES block in index.css; palette wiring in tailwind.config).
// Switching is instant and class-free. Preference persists in localStorage so
// guests keep their theme.
//
// Preferences: a fixed theme | 'system' (OS setting, live) | 'auto' (clock
// schedule: Day Ivory / Evening Parchment / Night Iris by default, each slot
// user-overridable and persisted separately).
// ---------------------------------------------------------------------------

export type ThemePreference = ThemeId | 'system' | 'auto';

export interface ThemeMeta {
  id: ThemeId;
  name: string;
  blurb: string;
  dark: boolean;
  /** [page, ink, accent] preview dots for the switcher. */
  swatches: [string, string, string];
}

export const THEMES: ThemeMeta[] = [
  {
    id: 'ivory',
    name: 'Ivory',
    blurb: 'Warm paper light — the classic look',
    dark: false,
    swatches: ['#FAFAFA', '#18181B', '#F59E0B'],
  },
  {
    id: 'parchment',
    name: 'Parchment',
    blurb: 'Sunlit sepia paper — easiest on the eyes',
    dark: false,
    swatches: ['#F6F0E4', '#403A32', '#F59E0B'],
  },
  {
    id: 'matcha',
    name: 'Matcha',
    blurb: 'Fresh pale green — calm daylight focus',
    dark: false,
    swatches: ['#F0F7F2', '#1A2E22', '#F59E0B'],
  },
  {
    id: 'midnight-iris',
    name: 'Midnight Iris',
    blurb: 'Deep dark with gold — easy night studying',
    dark: true,
    swatches: ['#0B0B10', '#F4F4F5', '#FBBF24'],
  },
  {
    id: 'abyss',
    name: 'Abyss',
    blurb: 'Tokyo-night navy — deep focus after dark',
    dark: true,
    swatches: ['#0F121C', '#C0CAF5', '#FBBF24'],
  },
  {
    id: 'ember',
    name: 'Ember',
    blurb: 'Warm retro dark — built for marathons',
    dark: true,
    swatches: ['#1C1916', '#EBDBB2', '#FBBF24'],
  },
];

const STORAGE_KEY = 'smartstudy-theme';
const SLOTS_KEY = 'smartstudy-theme-slots';
const META_COLORS: Record<ThemeId, string> = {
  ivory: '#FAFAFA',
  parchment: '#F6F0E4',
  matcha: '#F0F7F2',
  'midnight-iris': '#0B0B10',
  abyss: '#0F121C',
  ember: '#1C1916',
};

const loadPreference = (): ThemePreference => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'system' || stored === 'auto' || isThemeId(stored)) return stored;
  } catch {
    // Private mode etc. — fall through to system.
  }
  return 'system';
};

const loadAutoSlots = (): AutoSlotMap => {
  try {
    return parseAutoSlots(localStorage.getItem(SLOTS_KEY));
  } catch {
    return { ...DEFAULT_AUTO_SLOTS };
  }
};

const resolveSystem = (): ThemeId =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'midnight-iris'
    : 'ivory';

const applyTheme = (theme: ThemeId): void => {
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', META_COLORS[theme]);
};

interface ThemeContextType {
  preference: ThemePreference;
  theme: ThemeId;
  setPreference: (p: ThemePreference) => void;
  /** Active Day/Evening/Night mapping (defaults until overridden). */
  autoSlots: AutoSlotMap;
  /** The schedule slot currently in effect (meaningful when preference is 'auto'). */
  autoSlot: AutoSlot;
  /** Override one Auto slot's theme; persists. Applies immediately in Auto mode. */
  setAutoSlot: (slot: AutoSlot, theme: ThemeId) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  preference: 'system',
  theme: 'ivory',
  setPreference: () => {},
  autoSlots: DEFAULT_AUTO_SLOTS,
  autoSlot: 'day',
  setAutoSlot: () => {},
});

const resolveTheme = (pref: ThemePreference, slots: AutoSlotMap): ThemeId => {
  if (pref === 'system') return resolveSystem();
  if (pref === 'auto') return currentAutoTheme(slots);
  return pref;
};

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [preference, setPreferenceState] = useState<ThemePreference>(loadPreference);
  const [autoSlots, setAutoSlotsState] = useState<AutoSlotMap>(loadAutoSlots);
  const [theme, setTheme] = useState<ThemeId>(() =>
    resolveTheme(loadPreference(), loadAutoSlots()),
  );
  const [autoSlot, setAutoSlotTick] = useState<AutoSlot>(() => currentSlot());

  // Apply on change + follow the OS while preference is 'system'.
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (preference !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setTheme(resolveSystem());
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [preference]);

  // While preference is 'auto', re-resolve on a 30s tick (slot boundaries are
  // hourly; 30s keeps it prompt without pointless renders) and whenever the
  // tab regains visibility after sleeping through a boundary.
  useEffect(() => {
    if (preference !== 'auto') return;
    const tick = () => {
      setAutoSlotTick(currentSlot());
      setTheme((prev) => {
        const next = currentAutoTheme(autoSlots);
        return next === prev ? prev : next;
      });
    };
    tick();
    const id = window.setInterval(tick, 30_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [preference, autoSlots]);

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p);
    try {
      localStorage.setItem(STORAGE_KEY, p);
    } catch {
      // Non-fatal: theme still applies for the session.
    }
    // Read slots fresh so a just-saved mapping applies on the same tap.
    setTheme(resolveTheme(p, loadAutoSlots()));
  }, []);

  const setAutoSlot = useCallback((slot: AutoSlot, slotTheme: ThemeId) => {
    setAutoSlotsState((prev) => {
      const next = { ...prev, [slot]: slotTheme };
      try {
        localStorage.setItem(SLOTS_KEY, JSON.stringify(next));
      } catch {
        // Non-fatal: mapping still applies for the session.
      }
      return next;
    });
  }, []);

  return (
    <ThemeContext.Provider
      value={{ preference, theme, setPreference, autoSlots, autoSlot, setAutoSlot }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => useContext(ThemeContext);
