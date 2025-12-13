import { defineConfig, devices } from '@playwright/test'
import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(__dirname, '.env.local') })

// Use staging by default, override with BASE_URL env var for local
const useStaging = process.env.USE_STAGING !== 'false'
const stagingBaseURL = 'https://platform.staging.iofold.com'
const localBaseURL = 'http://dev4:3000'

// Path to stored auth state
const authFile = path.join(__dirname, 'playwright/.auth/user.json')
// Check if auth state exists
const hasAuthState = fs.existsSync(authFile)

/**
 * Playwright Configuration for iofold E2E Tests
 *
 * Features:
 * - Clerk authentication bypass via Testing Tokens
 * - Staging-first testing (configurable via USE_STAGING=false)
 * - Parallel test execution
 *
 * @see https://playwright.dev/docs/test-configuration
 * @see https://clerk.com/docs/testing/playwright
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
    /* Use stored auth state if available for faster test execution */
    ...(hasAuthState ? { storageState: authFile } : {}),
  },

  /* Configure projects for major browsers */
  projects: [
    // Clerk global setup - runs FIRST to obtain Testing Token
    {
      name: 'clerk-setup',
      testMatch: /global\.setup\.ts/,
    },
    // Main test projects - depend on clerk-setup
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['clerk-setup'],
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      dependencies: ['clerk-setup'],
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      dependencies: ['clerk-setup'],
    },
  ],

  /* Run your local dev server before starting the tests - disabled for staging */
  ...(useStaging ? {} : {
    webServer: {
      command: 'pnpm run dev',
      url: process.env.BASE_URL || localBaseURL,
      reuseExistingServer: true,
      timeout: 120 * 1000,
    },
  }),
})
