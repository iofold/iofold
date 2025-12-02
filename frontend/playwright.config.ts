import { defineConfig, devices } from '@playwright/test'

// Use staging by default, override with BASE_URL env var for local
const useStaging = process.env.USE_STAGING !== 'false'
const stagingBaseURL = 'https://platform.staging.iofold.com'
const localBaseURL = 'http://dev4:3000'

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
  testDir: './e2e',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 1,
  /* Parallel workers - configurable via WORKERS env var */
  workers: process.env.WORKERS ? parseInt(process.env.WORKERS) : (process.env.CI ? 1 : 4),
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: 'html',
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env.BASE_URL || (useStaging ? stagingBaseURL : localBaseURL),
    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
  ],

  /* Run your local dev server before starting the tests - disabled for staging */
  ...(useStaging ? {} : {
    webServer: {
      command: 'pnpm run dev',
      url: localBaseURL,
      reuseExistingServer: true,
      timeout: 120 * 1000,
    },
  }),
})
