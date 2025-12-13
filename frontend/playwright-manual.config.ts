import { defineConfig, devices } from '@playwright/test'

/**
 * Manual Testing Configuration (No Dependencies)
 *
 * This config is designed for manual testing without any setup dependencies.
 * Usage: pnpm exec playwright test --config=playwright-manual.config.ts
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  timeout: 180000, // 3 minutes per test
  use: {
    baseURL: 'https://platform.staging.iofold.com',
    trace: 'on',
    screenshot: 'on',
    video: 'off',
  },
  projects: [
    {
      name: 'manual-chromium',
      use: { ...devices['Desktop Chrome'] },
      // No dependencies, no stored auth state
    },
  ],
})
