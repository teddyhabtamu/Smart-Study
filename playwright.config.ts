import { defineConfig } from '@playwright/test';

// End-to-end journeys against the REAL stack (Vite + Express + Supabase).
// AI calls are stubbed at the network layer (deterministic, no quota burn);
// everything else — auth, routes, DB writes, toasts — runs for real.
// Workers stay at 1: one shared backend + DB means parallel runs would
// interleave each other's data and fight over pool slots.
export default defineConfig({
  testDir: './e2e',
  testMatch: '*.spec.ts',
  timeout: 120000,
  expect: { timeout: 20000 },
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  globalSetup: './e2e/setup.ts',
  globalTeardown: './e2e/teardown.ts',
  webServer: [
    {
      command: 'npm run dev',
      cwd: 'backend',
      url: 'http://localhost:5000/api/version',
      timeout: 120000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:5173',
      timeout: 120000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
