import { defineConfig, devices } from '@playwright/test';

// One built server in test mode (fake mail and PDOK, settable clock) shared by all tests, so they run one at a time and each starts with a reset.
const PORT = 3917;
const URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
  use: {
    baseURL: URL,
    locale: 'nl-NL',
    timezoneId: 'Europe/Amsterdam',
    trace: 'retain-on-failure',
    actionTimeout: 15_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'rm -rf tmp/e2e-data && node dist/server/main.js',
    url: `${URL}/health`,
    reuseExistingServer: false,
    env: { APP_MODUS: 'test', PORT: String(PORT), BASIS_URL: URL, DATA_DIR: 'tmp/e2e-data', TZ: 'Europe/Amsterdam' },
  },
});
