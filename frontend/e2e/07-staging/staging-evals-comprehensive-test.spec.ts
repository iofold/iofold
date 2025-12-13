/**
 * Comprehensive Staging Evals Flow Test
 *
 * This test thoroughly explores the Evals functionality on staging
 * including clicking into eval details and testing interactions
 */
import { test, expect } from '@playwright/test'

const TEST_EMAIL = 'e2e+clerk_test@iofold.com'
const TEST_PASSWORD = 'E2eTestPassword123!'
const DEV_OTP_CODE = '424242'
const SCREENSHOT_DIR = '/home/ygupta/workspace/iofold/.tmp/e2e-screenshots'

function getTimestamp(): string {
  const now = new Date()
  return now.toISOString().replace(/[:.]/g, '-').slice(0, -5)
}

async function signInViaUI(page: import('@playwright/test').Page) {
  console.log('Starting sign-in process...')
  await page.goto('https://platform.staging.iofold.com/sign-in')
  await page.waitForLoadState('networkidle')

  await page.waitForSelector('input[name="identifier"], input[type="email"]', { timeout: 10000 })
  await page.fill('input[name="identifier"], input[type="email"]', TEST_EMAIL)
  await page.click('button:has-text("Continue")')

  await page.waitForSelector('input[type="password"]', { timeout: 10000 })
  await page.fill('input[type="password"]', TEST_PASSWORD)
  await page.click('button:has-text("Continue")')

  await page.waitForTimeout(2000)

  const currentUrl = page.url()
  if (currentUrl.includes('/factor-two') || currentUrl.includes('verification')) {
    console.log('Device verification required, entering OTP code...')
    await page.waitForLoadState('networkidle')

    const otpInput = page.locator('input[data-input-otp="true"]')
    if (await otpInput.count() > 0) {
      await otpInput.click({ force: true })
      await page.waitForTimeout(200)
      await page.keyboard.press('Control+a')
      await page.keyboard.press('Backspace')
      await page.keyboard.type(DEV_OTP_CODE, { delay: 150 })
      await page.waitForTimeout(1000)

      const continueButton = page.locator('button:has-text("Continue"), button:has-text("Verify")').first()
      if (await continueButton.isVisible() && await continueButton.isEnabled()) {
        await continueButton.click()
      }
      await page.waitForURL((url) => !url.pathname.includes('/sign-in'), { timeout: 15000 })
    }
  }

  console.log('Sign-in completed successfully!')
}

test.describe('Comprehensive Evals Tests', () => {
  test('Complete Evals workflow including detail view', async ({ page }) => {
    // Sign in
    console.log('\n=== SIGNING IN ===')
    await signInViaUI(page)
    await page.waitForTimeout(2000)

    // Navigate to Evals
    console.log('\n=== NAVIGATING TO EVALS ===')
    await page.goto('https://platform.staging.iofold.com/evals')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/comprehensive-01-evals-list-${getTimestamp()}.png`,
      fullPage: true
    })

    // Verify page loaded
    const currentURL = page.url()
    console.log(`Current URL: ${currentURL}`)
    expect(currentURL).toContain('/evals')

    // Check page content
    const pageTitle = await page.locator('h1').first().textContent()
    console.log(`Page title: ${pageTitle}`)
    expect(pageTitle).toContain('Evals')

    // Check for table
    const table = page.locator('table')
    const hasTable = await table.count() > 0
    console.log(`Has table: ${hasTable}`)
    expect(hasTable).toBe(true)

    // Check for rows in the table
    const rows = await table.locator('tbody tr').all()
    console.log(`Found ${rows.length} eval rows`)

    if (rows.length > 0) {
      // Test clicking on first eval
      console.log('\n=== CLICKING ON FIRST EVAL ===')
      const firstRow = rows[0]

      // Get eval name
      const evalNameCell = firstRow.locator('td').first()
      const evalName = await evalNameCell.textContent()
      console.log(`First eval name: ${evalName}`)

      // Take screenshot before clicking
      await page.screenshot({
        path: `${SCREENSHOT_DIR}/comprehensive-02-before-click-${getTimestamp()}.png`,
        fullPage: true
      })

      // Click on the first row
      await firstRow.click()
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(2000)

      const detailURL = page.url()
      console.log(`Detail page URL: ${detailURL}`)

      await page.screenshot({
        path: `${SCREENSHOT_DIR}/comprehensive-03-eval-detail-page-${getTimestamp()}.png`,
        fullPage: true
      })

      // Check detail page content
      const detailPageContent = await page.locator('body').textContent()
      console.log(`Detail page loaded: ${detailPageContent?.substring(0, 200)}`)

      // Look for common eval detail elements
      const hasExecutions = detailPageContent?.toLowerCase().includes('execution')
      const hasAccuracy = detailPageContent?.toLowerCase().includes('accuracy')
      const hasResults = detailPageContent?.toLowerCase().includes('result')

      console.log(`Has executions info: ${hasExecutions}`)
      console.log(`Has accuracy info: ${hasAccuracy}`)
      console.log(`Has results info: ${hasResults}`)

      // Check for action buttons on detail page
      const detailButtons = await page.locator('button:visible').all()
      const detailButtonTexts = await Promise.all(
        detailButtons.map(async (btn) => {
          const text = await btn.textContent()
          return text?.trim() || ''
        })
      )
      console.log(`Detail page buttons: ${detailButtonTexts.slice(0, 10).join(', ')}`)

      // Take final screenshot of detail page
      await page.screenshot({
        path: `${SCREENSHOT_DIR}/comprehensive-04-detail-final-${getTimestamp()}.png`,
        fullPage: true
      })

      // Navigate back to list
      console.log('\n=== NAVIGATING BACK TO LIST ===')
      await page.goBack()
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(1000)

      await page.screenshot({
        path: `${SCREENSHOT_DIR}/comprehensive-05-back-to-list-${getTimestamp()}.png`,
        fullPage: true
      })

      const backURL = page.url()
      console.log(`Back to list URL: ${backURL}`)
      expect(backURL).toContain('/evals')
    } else {
      console.log('No evals found in the table')
    }

    // Test search functionality
    console.log('\n=== TESTING SEARCH ===')
    const searchInput = page.locator('input[placeholder*="Search"], input[type="search"]').first()
    if (await searchInput.count() > 0) {
      console.log('Found search input, testing...')
      await searchInput.fill('Test')
      await page.waitForTimeout(1000)

      await page.screenshot({
        path: `${SCREENSHOT_DIR}/comprehensive-06-search-test-${getTimestamp()}.png`,
        fullPage: true
      })

      // Clear search
      await searchInput.clear()
      await page.waitForTimeout(500)
    } else {
      console.log('No search input found')
    }

    // Test filter dropdown
    console.log('\n=== TESTING FILTER DROPDOWN ===')
    const filterDropdown = page.locator('select, button:has-text("All Agents")').first()
    if (await filterDropdown.count() > 0) {
      console.log('Found filter dropdown, clicking...')
      await filterDropdown.click()
      await page.waitForTimeout(1000)

      await page.screenshot({
        path: `${SCREENSHOT_DIR}/comprehensive-07-filter-dropdown-${getTimestamp()}.png`,
        fullPage: true
      })

      // Close dropdown
      await page.keyboard.press('Escape')
      await page.waitForTimeout(500)
    } else {
      console.log('No filter dropdown found')
    }

    // Test Generate Eval button
    console.log('\n=== TESTING GENERATE EVAL BUTTON ===')
    const generateButton = page.locator('button:has-text("Generate Eval")').first()
    if (await generateButton.count() > 0 && await generateButton.isVisible()) {
      console.log('Found Generate Eval button, clicking...')
      await generateButton.click()
      await page.waitForTimeout(2000)

      await page.screenshot({
        path: `${SCREENSHOT_DIR}/comprehensive-08-generate-eval-modal-${getTimestamp()}.png`,
        fullPage: true
      })

      const modalURL = page.url()
      console.log(`After Generate Eval click URL: ${modalURL}`)

      // Close modal/dialog if it opened
      const closeButton = page.locator('button[aria-label="Close"], button:has-text("Cancel")').first()
      if (await closeButton.count() > 0) {
        await closeButton.click()
        await page.waitForTimeout(500)
      } else {
        // Try escape key
        await page.keyboard.press('Escape')
        await page.waitForTimeout(500)
      }
    } else {
      console.log('Generate Eval button not found or not visible')
    }

    // Final screenshot
    console.log('\n=== FINAL STATE ===')
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/comprehensive-09-final-state-${getTimestamp()}.png`,
      fullPage: true
    })

    // Check for console errors
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text())
      }
    })

    console.log(`Console errors: ${consoleErrors.length}`)
    if (consoleErrors.length > 0) {
      console.log('Errors:', consoleErrors.slice(0, 3))
    }
  })
})
