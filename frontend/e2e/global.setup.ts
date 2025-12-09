/**
 * Global setup for Clerk E2E testing
 * This obtains a Testing Token at suite startup to bypass bot detection (Turnstile CAPTCHA)
 *
 * @see https://clerk.com/docs/testing/playwright
 */
import { clerkSetup } from '@clerk/testing/playwright'
import { test as setup } from '@playwright/test'

setup.describe.configure({ mode: 'serial' })

setup('Initialize Clerk Testing Token', async ({}) => {
  await clerkSetup()
})
