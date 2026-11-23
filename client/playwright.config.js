import { defineConfig } from '@playwright/test';

// Browser tests (client/e2e), run with `npm run test:e2e`. Each test file gets
// its own server and database (e2e/helpers.js), so files run in parallel; the
// tests inside a file run in order, as one story.
export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.js',
  workers: process.env.CI ? 2 : '50%',
  timeout: 60_000,
  expect: { timeout: 5_000 },
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    actionTimeout: 10_000, // a step that can't happen fails in seconds, not after the full minute
    channel: 'chrome', // the installed Chrome; CI installs it with `npx playwright install chrome`
    trace: 'retain-on-failure', // a step-by-step replay of any failure: npx playwright show-trace <file>
  },
});
