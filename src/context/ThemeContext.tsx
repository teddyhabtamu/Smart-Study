import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Theme system (Phase 1: Ivory + Midnight Iris).
//
// Themes are CSS-variable sets flipped by one data-theme attribute on <html>
// (see the THEMES block in index.css; palette wiring in tailwind.config).
// Switching is instant and class-free. Preference persists in localStorage so
// guests keep their theme; 'system' follows the OS color scheme live.
// ---------------------------------------------------------------------------

export type ThemeId = 'ivory' | 'midnight-iris';
export type ThemePreference = ThemeId | 'system';

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
    id: 'midnight-iris',
    name: 'Midnight Iris',
    blurb: 'Deep dark with gold — easy night studying',
    dark: true,
    swatches: ['#0B0B10', '#F4F4F5', '#FBBF24'],
  },
];

const STORAGE_KEY = 'smartstudy-theme';
const META_COLORS: Record<ThemeId, string> = {
  ivory: '#FAFAFA',
  'midnight-iris': '#0B0B10',
};

const isThemeId = (v: unknown): v is ThemeId =>
  v === 'ivory' || v === 'midnight-iris';

const loadPreference = (): ThemePreference => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'system' || isThemeId(stored)) return stored;
  } catch {
    // Private mode etc. — fall through to system.
  }
  return 'system';
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
}

const ThemeContext = createContext<ThemeContextType>({
  preference: 'system',
  theme: 'ivory',
  setPreference: () => {},
});

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [preference, setPreferenceState] = useState<ThemePreference>(loadPreference);
  const [theme, setTheme] = useState<ThemeId>(() => {
    const pref = loadPreference();
    return pref === 'system' ? resolveSystem() : pref;
  });

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

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p);
    try {
      localStorage.setItem(STORAGE_KEY, p);
    } catch {
      // Non-fatal: theme still applies for the session.
    }
    setTheme(p === 'system' ? resolveSystem() : p);
  }, []);

  return (
    <ThemeContext.Provider value={{ preference, theme, setPreference }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextType => useContext(ThemeContext);
