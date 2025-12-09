/**
 * Auth Bypass Verification Test
 *
 * This test verifies that the Clerk testing token bypass is working correctly.
 * It uses UI-based sign-in to test the full flow with testing tokens.
 *
 * In Clerk dev mode, device verification uses code "424242" for test emails.
 *
 * @see https://clerk.com/docs/testing/playwright
 */
import { test, expect } from './fixtures/clerk-auth'

// Use +clerk_test suffix so 424242 test verification code works
const TEST_EMAIL = process.env.E2E_CLERK_USER_USERNAME || 'e2e+clerk_test@iofold.com'
const TEST_PASSWORD = process.env.E2E_CLERK_USER_PASSWORD || 'E2eTestPassword123!'
const DEV_OTP_CODE = '424242' // Clerk dev mode OTP code

/**
 * Helper to sign in via UI with OTP handling
 */
async function signInViaUI(page: import('@playwright/test').Page) {
  // Navigate to the sign-in page
  await page.goto('/sign-in')
  await page.waitForLoadState('networkidle')
  await page.waitForSelector('input[name="identifier"], input[type="email"]', { timeout: 10000 })

  // Fill in email
  await page.fill('input[name="identifier"], input[type="email"]', TEST_EMAIL)
  await page.click('button:has-text("Continue")')

  // Wait for password field
  await page.waitForSelector('input[type="password"]', { timeout: 10000 })
  await page.fill('input[type="password"]', TEST_PASSWORD)
  await page.click('button:has-text("Continue")')

  // Check if we need OTP verification (new device)
  // Wait a bit to see where we land
  await page.waitForTimeout(2000)

  const currentUrl = page.url()
  if (currentUrl.includes('/factor-two') || currentUrl.includes('verification') || currentUrl.includes('Check your email')) {
    console.log('Device verification required, entering OTP code...')

    // Wait for the OTP form to be ready
    await page.waitForLoadState('networkidle')

    // Clerk uses a single hidden input with data-input-otp="true" that captures all 6 digits
    // The visual divs are decorative - we need to target the actual input
    // IMPORTANT: Clerk's OTP input blocks .fill() - must use keyboard events
    const otpInput = page.locator('input[data-input-otp="true"]')

    if (await otpInput.count() > 0) {
      console.log('Found Clerk OTP input, clicking to focus...')
      // Click to focus the input
      await otpInput.click({ force: true })
      await page.waitForTimeout(200)

      // Clear any existing value
      await page.keyboard.press('Control+a')
      await page.keyboard.press('Backspace')

      // Type the OTP code character by character (Clerk intercepts fill())
      console.log('Typing OTP code via keyboard...')
      await page.keyboard.type(DEV_OTP_CODE, { delay: 150 })
      console.log('Typed OTP code')

      // Verify the value was entered
      const value = await otpInput.inputValue()
      console.log(`OTP input value after typing: "${value}"`)
    } else {
      // Fallback: try autocomplete one-time-code input
      const fallbackInput = page.locator('input[autocomplete="one-time-code"]')
      if (await fallbackInput.count() > 0) {
        console.log('Using autocomplete input fallback...')
        await fallbackInput.click({ force: true })
        await page.keyboard.type(DEV_OTP_CODE, { delay: 150 })
      } else {
        // Last resort: type directly on the page
        console.log('No OTP input found, typing directly...')
        await page.keyboard.type(DEV_OTP_CODE, { delay: 150 })
      }
    }

    // Wait a moment for validation
    await page.waitForTimeout(1000)

    // Click continue if there's a button and it's enabled
    const continueButton = page.locator('button:has-text("Continue"), button:has-text("Verify")').first()
    if (await continueButton.isVisible() && await continueButton.isEnabled()) {
      console.log('Clicking continue button...')
      await continueButton.click()
    }

    // Wait for redirect
    await page.waitForURL((url) => !url.pathname.includes('/sign-in'), { timeout: 15000 })
  }
}

test.describe('Auth Bypass Verification', () => {
  test('should be able to sign in via UI with testing token bypass', async ({ page }) => {
    await signInViaUI(page)

    // Verify we're signed in by checking we're not on sign-in page anymore
    const currentURL = page.url()
    console.log(`After sign-in, current URL: ${currentURL}`)

    // The sign-in should succeed and we should no longer be on the sign-in page
    expect(currentURL).not.toContain('/sign-in')
  })

  test('should access protected /traces route after UI sign in', async ({ page }) => {
    await signInViaUI(page)

    // Navigate to protected route
    await page.goto('/traces')
    await page.waitForLoadState('networkidle')

    // Verify we're on the traces page and not redirected to sign-in
    const currentURL = page.url()
    console.log(`After navigating to /traces, current URL: ${currentURL}`)

    // Should be on traces page, not sign-in
    expect(currentURL).toContain('/traces')
    expect(currentURL).not.toContain('/sign-in')

    // The page should have the Traces Explorer heading
    await expect(page.locator('h1:has-text("Traces")')).toBeVisible({ timeout: 10000 })
  })
})
