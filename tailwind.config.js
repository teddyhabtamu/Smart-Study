/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        border: "hsl(var(--border))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        // ------------------------------------------------------------------
        // Themeable palette: every color below resolves through CSS channels
        // set per theme ([data-theme] blocks in index.css). This is what makes
        // runtime themes possible with Tailwind v3 (build-time utilities):
        // switching themes only flips variable values — zero class changes.
        //
        // Roles (see THEMES.md in docs or the ThemeContext header):
        // - surface/ink/inksoft/onink: role tokens. ink+inksoft are body copy
        //   (codemodded from text-zinc-900/800/700/600); surface is card/page
        //   surfaces (from bg-white); onink is text on ink buttons.
        // - zinc ramp: borders, fills, hovers, muted text, AND dark surfaces
        //   (bg-zinc-900 buttons stay dark-style in every theme, GitHub-dark
        //   fashion — they never invert, so no role split was needed there).
        // - amber ramp: brand accent (PRO, stars). Warnings share the ramp
        //   today; a future accent-swap must split brand vs warning first.
        // - white/black stay FIXED: white text on fixed colors (red-600
        //   deletes, emerald dots, gradients) must never move.
        // ------------------------------------------------------------------
        surface: 'rgb(var(--surface) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        inksoft: 'rgb(var(--inksoft) / <alpha-value>)',
        onink: 'rgb(var(--onink) / <alpha-value>)',
        // Warning text on theme surfaces: amber-700 in light themes,
        // light gold in dark ones. Fixed-bg amber pills keep the ramp.
        warn: 'rgb(var(--warn) / <alpha-value>)',
        zinc: {
          50: 'rgb(var(--zinc-50) / <alpha-value>)',
          100: 'rgb(var(--zinc-100) / <alpha-value>)',
          200: 'rgb(var(--zinc-200) / <alpha-value>)',
          300: 'rgb(var(--zinc-300) / <alpha-value>)',
          400: 'rgb(var(--zinc-400) / <alpha-value>)',
          500: 'rgb(var(--zinc-500) / <alpha-value>)',
          600: 'rgb(var(--zinc-600) / <alpha-value>)',
          700: 'rgb(var(--zinc-700) / <alpha-value>)',
          800: 'rgb(var(--zinc-800) / <alpha-value>)',
          900: 'rgb(var(--zinc-900) / <alpha-value>)',
          950: 'rgb(var(--zinc-950) / <alpha-value>)',
        },
        amber: {
          50: 'rgb(var(--amber-50) / <alpha-value>)',
          100: 'rgb(var(--amber-100) / <alpha-value>)',
          200: 'rgb(var(--amber-200) / <alpha-value>)',
          300: 'rgb(var(--amber-300) / <alpha-value>)',
          400: 'rgb(var(--amber-400) / <alpha-value>)',
          500: 'rgb(var(--amber-500) / <alpha-value>)',
          600: 'rgb(var(--amber-600) / <alpha-value>)',
          700: 'rgb(var(--amber-700) / <alpha-value>)',
          800: 'rgb(var(--amber-800) / <alpha-value>)',
          900: 'rgb(var(--amber-900) / <alpha-value>)',
          950: 'rgb(var(--amber-950) / <alpha-value>)',
        },
      },
      boxShadow: {
        'soft': '0 2px 10px rgba(0, 0, 0, 0.03)',
        'card': '0 0 0 1px rgba(0,0,0,0.03), 0 2px 8px rgba(0,0,0,0.04)',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'fade-in-fast': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.5s ease-out',
        // Anchored popovers (dropdowns, pickers, notification panel): the
        // old opacity-only 0.2s pop read as aggressive next to the modals'
        // slide-up entrances. A 4px settle + fade over 0.25s keeps dropdowns
        // snappy while giving them the same smooth feel.
        'popover': 'popover 0.25s ease-out',
        'loader-rotate': 'loaderRotate 1s infinite linear',
        'loader-rotate-reverse': 'loaderRotateReverse 1s infinite linear',
        'loader-rotate-reverse-delayed': 'loaderRotateReverse 1s infinite linear -0.5s',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        popover: {
          '0%': { transform: 'translateY(-4px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        loaderRotate: {
          '0%': { transform: 'rotate(0deg)' },
          '58%': { transform: 'rotate(360deg)' },
          '100%': { transform: 'rotate(360deg)' },
        },
        loaderRotateReverse: {
          '0%': { transform: 'rotate(0deg)' },
          '58%': { transform: 'rotate(-360deg)' },
          '100%': { transform: 'rotate(-360deg)' },
        }
      }
    }
  },
  plugins: [],
}