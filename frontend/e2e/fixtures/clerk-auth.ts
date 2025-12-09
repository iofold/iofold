/**
 * Clerk Authentication Fixture for Playwright E2E Tests
 *
 * This fixture provides authenticated test helpers using Clerk's official testing utilities.
 * It bypasses bot detection (Turnstile CAPTCHA) using Testing Tokens.
 *
 * @see https://clerk.com/docs/testing/playwright
 * @see https://clerk.com/blog/testing-clerk-nextjs
 */
import { clerk, setupClerkTestingToken } from '@clerk/testing/playwright'
import { test as base, expect } from '@playwright/test'

// Extend the base test with Clerk authentication helpers
export const test = base.extend<{
  // Helper to setup testing token (bypasses bot detection)
  clerkTestingToken: void
}>({
  clerkTestingToken: [
    async ({ page }, use) => {
      await setupClerkTestingToken({ page })
      await use()
    },
    { auto: true }, // Automatically run for all tests
  ],
})

// Re-export expect for convenience
export { expect }

// Re-export clerk for signIn/signOut helpers
export { clerk }

/**
 * Helper to sign in a test user
 *
 * Usage:
 * ```ts
 * import { test, signInTestUser } from './fixtures/clerk-auth'
 *
 * test('authenticated flow', async ({ page }) => {
 *   await signInTestUser(page)
 *   await page.goto('/protected-route')
 *   // ... test authenticated functionality
 * })
 * ```
 */
export async function signInTestUser(page: import('@playwright/test').Page) {
  const username = process.env.E2E_CLERK_USER_USERNAME
  const password = process.env.E2E_CLERK_USER_PASSWORD

  if (!username || !password) {
    throw new Error(
      'Missing E2E_CLERK_USER_USERNAME or E2E_CLERK_USER_PASSWORD environment variables. ' +
        'Please set them in .env.local for E2E testing.'
    )
  }

  await clerk.signIn({
    page,
    signInParams: {
      strategy: 'password',
      identifier: username,
      password: password,
    },
  })
}

/**
 * Helper to sign out the current user
 */
export async function signOutUser(page: import('@playwright/test').Page) {
  await clerk.signOut({ page })
}
