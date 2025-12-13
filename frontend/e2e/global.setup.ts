/**
 * Global setup for Clerk E2E testing
 *
 * This setup performs two key tasks:
 * 1. Obtains a Testing Token to bypass bot detection (Turnstile CAPTCHA)
 * 2. Authenticates a test user and persists auth state for faster test execution
 *
 * @see https://clerk.com/docs/testing/playwright
 */
import { clerkSetup, clerk } from '@clerk/testing/playwright'
import { test as setup, chromium } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'

// Path to store authenticated state
export const authFile = path.join(__dirname, '../playwright/.auth/user.json')

setup.describe.configure({ mode: 'serial' })

setup('Initialize Clerk Testing Token', async ({}) => {
  console.log('🔑 Initializing Clerk Testing Token...')
  try {
    await clerkSetup()
    console.log('✅ Clerk Testing Token initialized successfully')
  } catch (error) {
    console.error('❌ Failed to initialize Clerk Testing Token:', error)
    throw new Error(`Clerk Testing Token initialization failed: ${error instanceof Error ? error.message : String(error)}`)
  }
})

/**
 * Helper function to implement exponential backoff retry logic
 */
async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelay: number = 1000
): Promise<T> {
  let lastError: Error | undefined

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))

      if (attempt < maxAttempts) {
        const delay = baseDelay * Math.pow(2, attempt - 1) // Exponential backoff: 1s, 2s, 4s
        console.log(`⚠️  Attempt ${attempt}/${maxAttempts} failed: ${lastError.message}`)
        console.log(`⏳ Retrying in ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  throw lastError
}

setup('Authenticate test user and save state', async ({ page, baseURL }) => {
  // Check if test user credentials are provided
  const username = process.env.E2E_CLERK_USER_USERNAME
  const password = process.env.E2E_CLERK_USER_PASSWORD

  // Validate credentials are present
  if (!username || !password) {
    const errorMessage = [
      '❌ CRITICAL: E2E test credentials not configured!',
      '',
      'Missing environment variables:',
      !username ? '  - E2E_CLERK_USER_USERNAME' : '',
      !password ? '  - E2E_CLERK_USER_PASSWORD' : '',
      '',
      'Please set these in your .env.local file or CI environment.',
      'See frontend/e2e/CLERK_TESTING_SETUP.md for setup instructions.',
    ].filter(Boolean).join('\n')

    console.error(errorMessage)
    throw new Error('E2E_CLERK_USER_USERNAME and E2E_CLERK_USER_PASSWORD must be set')
  }

  // Check if auth state already exists
  if (fs.existsSync(authFile)) {
    console.log('📄 Existing auth state found at', authFile)
    console.log('🔄 Re-authenticating to ensure fresh credentials...')
  } else {
    console.log('🆕 No existing auth state found, creating new session...')
  }

  console.log('🔐 Authenticating test user:', username)

  try {
    await retryWithBackoff(async () => {
      console.log('🌐 Navigating to application...')

      // Navigate to the home page with explicit timeout
      await page.goto(baseURL || '/', {
        timeout: 30000,
        waitUntil: 'domcontentloaded'
      })

      console.log('🔑 Attempting sign in with Clerk...')

      // Sign in using Clerk's testing utilities with explicit timeout
      page.setDefaultTimeout(30000)

      await clerk.signIn({
        page,
        signInParams: {
          strategy: 'password',
          identifier: username,
          password: password,
        },
      })

      console.log('⏳ Waiting for authentication redirect...')

      // Wait for successful authentication and navigation
      // This waits for either /agents or / (depending on redirect configuration)
      await page.waitForURL(/\/(agents|$)/, { timeout: 20000 })

      console.log('✓ Redirected to authenticated page')
      console.log('🔍 Verifying authentication state...')

      // Verify we're authenticated by checking for user button or other auth indicator
      await page.waitForSelector('[data-clerk-user-button]', { timeout: 15000 })

      console.log('✓ Authentication verified')
      console.log('💾 Saving auth state to:', authFile)

      // Ensure the directory exists
      const authDir = path.dirname(authFile)
      if (!fs.existsSync(authDir)) {
        fs.mkdirSync(authDir, { recursive: true })
      }

      // Save authenticated state to be reused by tests
      await page.context().storageState({ path: authFile })

      console.log('✅ Auth state saved successfully')
    }, 3, 1000) // Max 3 attempts with exponential backoff starting at 1s

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error('❌ Failed to authenticate after multiple attempts:', errorMessage)
    console.error('Full error:', error)
    console.error('')
    console.error('Troubleshooting steps:')
    console.error('1. Verify credentials are correct in .env.local')
    console.error('2. Check that the test user exists in Clerk Dashboard')
    console.error('3. Ensure CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY are set correctly')
    console.error('4. Verify network connectivity to Clerk services')
    console.error('5. Check if email verification is required for the test account')

    // Clean up any partial auth state
    if (fs.existsSync(authFile)) {
      console.log('🧹 Cleaning up partial auth state...')
      fs.unlinkSync(authFile)
    }

    throw new Error(`Authentication setup failed: ${errorMessage}`)
  }
})
