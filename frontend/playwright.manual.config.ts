import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright Configuration for manual authentication tests
 * This config skips the Clerk setup and uses manual auth in each test
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'line',
  timeout: 120000,
  use: {
    baseURL: 'https://platform.staging.iofold.com',
    trace: 'on-first-retry',
    screenshot: 'on',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
