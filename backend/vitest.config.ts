import { defineConfig } from 'vitest/config';

// Backend-only config. Previously vitest resolved the repo-root
// vite.config.ts, which imports the root `vite` package — absent when only
// backend dependencies are installed (the CI backend job), so every CI run
// died in config load. This file is self-contained (`vitest/config` ships
// with the backend's own vitest) and mirrors the previous effective
// settings (node environment, src tests only).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
