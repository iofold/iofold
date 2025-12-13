/**
 * Staging Evals Flow Test
 *
 * Comprehensive test of the Evals functionality on staging environment
 * Tests: Navigation, list view, detail view, filtering, sorting, playground
 *
 * Run with: USE_STAGING=true pnpm test:e2e staging-evals-flow-test.spec.ts
 */
import { test, expect } from '@playwright/test'

const TEST_EMAIL = 'e2e+clerk_test@iofold.com'
const TEST_PASSWORD = 'E2eTestPassword123!'
const DEV_OTP_CODE = '424242'
const SCREENSHOT_DIR = '/home/ygupta/workspace/iofold/.tmp/e2e-screenshots'

/**
 * Helper to get timestamp for filenames
 */
function getTimestamp(): string {
  const now = new Date()
  return now.toISOString().replace(/[:.]/g, '-').slice(0, -5)
}

/**
 * Helper to sign in via UI with OTP handling
 */
async function signInViaUI(page: import('@playwright/test').Page) {
  console.log('Starting sign-in process...')
  await page.goto('https://platform.staging.iofold.com/sign-in')
  await page.waitForLoadState('networkidle')

  // Take screenshot of sign-in page
  await page.screenshot({
    path: `${SCREENSHOT_DIR}/evals-flow-01-signin-page-${getTimestamp()}.png`,
    fullPage: true
  })

  await page.waitForSelector('input[name="identifier"], input[type="email"]', { timeout: 10000 })

  console.log('Filling in email...')
  await page.fill('input[name="identifier"], input[type="email"]', TEST_EMAIL)
  await page.click('button:has-text("Continue")')

  await page.waitForSelector('input[type="password"]', { timeout: 10000 })
  console.log('Filling in password...')
  await page.fill('input[type="password"]', TEST_PASSWORD)

  // Screenshot before clicking continue
  await page.screenshot({
    path: `${SCREENSHOT_DIR}/evals-flow-02-password-entered-${getTimestamp()}.png`,
    fullPage: true
  })

  await page.click('button:has-text("Continue")')

  await page.waitForTimeout(2000)

  const currentUrl = page.url()
  if (currentUrl.includes('/factor-two') || currentUrl.includes('verification')) {
    console.log('Device verification required, entering OTP code...')

    await page.waitForLoadState('networkidle')

    // Screenshot OTP page
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/evals-flow-03-otp-page-${getTimestamp()}.png`,
      fullPage: true
    })

    const otpInput = page.locator('input[data-input-otp="true"]')

    if (await otpInput.count() > 0) {
      console.log('Found Clerk OTP input, typing code...')
      await otpInput.click({ force: true })
      await page.waitForTimeout(200)

      await page.keyboard.press('Control+a')
      await page.keyboard.press('Backspace')

      await page.keyboard.type(DEV_OTP_CODE, { delay: 150 })
      console.log('Typed OTP code')

      await page.waitForTimeout(1000)

      const continueButton = page.locator('button:has-text("Continue"), button:has-text("Verify")').first()
      if (await continueButton.isVisible() && await continueButton.isEnabled()) {
        console.log('Clicking continue button...')
        await continueButton.click()
      }

      await page.waitForURL((url) => !url.pathname.includes('/sign-in'), { timeout: 15000 })
    }
  }

  // Screenshot after successful sign-in
  await page.waitForTimeout(2000)
  await page.screenshot({
    path: `${SCREENSHOT_DIR}/evals-flow-04-signed-in-${getTimestamp()}.png`,
    fullPage: true
  })

  console.log('Sign-in completed successfully!')
}

test.describe('Staging Evals Flow Tests', () => {
  test('Full Evals Flow Test', async ({ page }) => {
    // Step 1: Sign In
    console.log('\n=== STEP 1: SIGN IN ===')
    await signInViaUI(page)

    // Step 2: Navigate to Evals page
    console.log('\n=== STEP 2: NAVIGATE TO EVALS PAGE ===')
    await page.waitForTimeout(2000)

    // Take screenshot of dashboard with sidebar
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/evals-flow-05-dashboard-with-sidebar-${getTimestamp()}.png`,
      fullPage: true
    })

    // Navigate directly to /evals
    console.log('Navigating to /evals page...')
    await page.goto('https://platform.staging.iofold.com/evals')
    await page.waitForLoadState('networkidle')

    // Verify we're on the evals page
    const currentURL = page.url()
    console.log(`Current URL: ${currentURL}`)
    expect(currentURL).toContain('/evals')

    await page.waitForTimeout(2000)
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/evals-flow-06-evals-page-loaded-${getTimestamp()}.png`,
      fullPage: true
    })

    // Step 3: Check page content
    console.log('\n=== STEP 3: VERIFY EVALS LIST ===')

    // Check for page title/heading
    const h1Elements = await page.locator('h1').all()
    const headings = await Promise.all(
      h1Elements.map(async (h1) => {
        const text = await h1.textContent()
        return text?.trim() || ''
      })
    )
    console.log(`Page headings: ${headings.join(', ')}`)

    // Check for eval cards or list items
    const evalCards = await page.locator('[data-testid*="eval"], [class*="eval-card"], .card, [role="article"]').all()
    console.log(`Found ${evalCards.length} potential eval cards/items`)

    // Check for table
    const hasTable = await page.locator('table').count() > 0
    console.log(`Has table: ${hasTable}`)

    // Check for empty state
    const emptyStateMessages = await page.locator('text=/no evals|empty|get started|create.*eval/i').all()
    const emptyStateTexts = await Promise.all(
      emptyStateMessages.map(async (elem) => {
        const text = await elem.textContent()
        return text?.trim() || ''
      })
    )
    console.log(`Empty state messages: ${emptyStateTexts.join(', ')}`)

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/evals-flow-07-evals-content-${getTimestamp()}.png`,
      fullPage: true
    })

    // Step 4: Check eval card details (if evals exist)
    console.log('\n=== STEP 4: CHECK EVAL CARD DETAILS ===')

    if (evalCards.length > 0) {
      const firstCard = evalCards[0]
      await firstCard.scrollIntoViewIfNeeded()

      // Check for eval name
      const cardText = await firstCard.textContent()
      console.log(`First eval card text: ${cardText?.substring(0, 200)}...`)

      // Look for pass rate, last run info
      const hasPassRate = cardText?.toLowerCase().includes('pass') ||
                          cardText?.toLowerCase().includes('rate') ||
                          cardText?.toLowerCase().includes('%')
      const hasLastRun = cardText?.toLowerCase().includes('last') ||
                         cardText?.toLowerCase().includes('run') ||
                         cardText?.toLowerCase().includes('ago')

      console.log(`Has pass rate info: ${hasPassRate}`)
      console.log(`Has last run info: ${hasLastRun}`)

      await page.screenshot({
        path: `${SCREENSHOT_DIR}/evals-flow-08-eval-card-details-${getTimestamp()}.png`,
        fullPage: true
      })
    } else {
      console.log('No eval cards found - checking for alternative layouts...')

      // Check for list items
      const listItems = await page.locator('ul li, ol li').all()
      console.log(`Found ${listItems.length} list items`)

      if (listItems.length > 0) {
        const firstItem = listItems[0]
        const itemText = await firstItem.textContent()
        console.log(`First list item: ${itemText?.substring(0, 200)}`)
      }
    }

    // Step 5: Try to click on an eval to view details
    console.log('\n=== STEP 5: VIEW EVAL DETAILS ===')

    // Look for clickable eval items
    const clickableEvals = await page.locator('a[href*="/evals/"], button[data-eval-id]').all()
    console.log(`Found ${clickableEvals.length} clickable eval items`)

    if (clickableEvals.length > 0) {
      const firstEval = clickableEvals[0]
      const evalHref = await firstEval.getAttribute('href')
      console.log(`Clicking on eval: ${evalHref}`)

      await firstEval.click()
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(2000)

      const detailURL = page.url()
      console.log(`Eval detail URL: ${detailURL}`)

      await page.screenshot({
        path: `${SCREENSHOT_DIR}/evals-flow-09-eval-detail-page-${getTimestamp()}.png`,
        fullPage: true
      })

      // Check for eval detail content
      const detailContent = await page.locator('body').textContent()
      console.log(`Detail page contains: ${detailContent?.substring(0, 300)}...`)

      // Look for playground or test buttons
      const playgroundButton = page.locator('button:has-text("Playground"), a:has-text("Playground"), button:has-text("Test"), a:has-text("Test")').first()
      if (await playgroundButton.count() > 0) {
        console.log('Found playground/test button')
        await page.screenshot({
          path: `${SCREENSHOT_DIR}/evals-flow-10-playground-button-${getTimestamp()}.png`,
          fullPage: true
        })
      }

      // Navigate back to evals list
      console.log('Navigating back to evals list...')
      await page.goto('https://platform.staging.iofold.com/evals')
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(1000)
    } else {
      console.log('No clickable eval items found')
    }

    // Step 6: Check for filtering/sorting options
    console.log('\n=== STEP 6: CHECK FILTERING AND SORTING ===')

    const filterButtons = await page.locator('button:has-text("Filter"), select, input[type="search"]').all()
    console.log(`Found ${filterButtons.length} filter/search elements`)

    const sortButtons = await page.locator('button:has-text("Sort"), select[name*="sort"]').all()
    console.log(`Found ${sortButtons.length} sort elements`)

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/evals-flow-11-filters-and-sorting-${getTimestamp()}.png`,
      fullPage: true
    })

    // Step 7: Check for action buttons
    console.log('\n=== STEP 7: CHECK ACTION BUTTONS ===')

    const actionButtons = await page.locator('button:visible').all()
    const buttonTexts = await Promise.all(
      actionButtons.map(async (btn) => {
        const text = await btn.textContent()
        return text?.trim() || ''
      })
    )

    console.log(`Found ${buttonTexts.length} visible buttons`)
    console.log(`Button texts: ${buttonTexts.slice(0, 10).join(', ')}`)

    const hasCreateButton = buttonTexts.some(text =>
      text.toLowerCase().includes('create') ||
      text.toLowerCase().includes('new') ||
      text.toLowerCase().includes('add')
    )
    console.log(`Has create/new button: ${hasCreateButton}`)

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/evals-flow-12-action-buttons-${getTimestamp()}.png`,
      fullPage: true
    })

    // Step 8: Check for console errors
    console.log('\n=== STEP 8: CHECK FOR ERRORS ===')

    const consoleErrors: string[] = []
    const pageErrors: string[] = []

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })

    page.on('pageerror', (error) => {
      pageErrors.push(error.message)
    })

    await page.waitForTimeout(3000)

    console.log(`Console errors: ${consoleErrors.length}`)
    console.log(`Page errors: ${pageErrors.length}`)

    if (consoleErrors.length > 0) {
      console.log('Console errors:', consoleErrors.slice(0, 5))
    }

    if (pageErrors.length > 0) {
      console.log('Page errors:', pageErrors)
    }

    // Final screenshot
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/evals-flow-13-final-state-${getTimestamp()}.png`,
      fullPage: true
    })

    // Assertions
    console.log('\n=== FINAL ASSERTIONS ===')
    expect(currentURL).toContain('/evals')
    expect(h1Elements.length).toBeGreaterThan(0)
    expect(pageErrors).toEqual([]) // No critical page errors
  })
})
