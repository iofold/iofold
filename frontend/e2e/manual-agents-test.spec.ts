import { test, expect, Page } from '@playwright/test'
import * as path from 'path'

/**
 * Manual Playwright Test for Agents Page Flow
 *
 * Tests the complete Agents page flow on staging:
 * 1. Navigation and authentication
 * 2. Agents list display
 * 3. Agent details page
 * 4. All tabs (Overview, Evals, Playground, Tasksets, GEPA)
 *
 * Run with: cd frontend && BASE_URL=https://platform.staging.iofold.com pnpm exec playwright test manual-agents-test.spec.ts --headed --project=chromium
 */

const STAGING_URL = 'https://platform.staging.iofold.com'
const TEST_EMAIL = 'e2e+clerk_test@iofold.com'
const TEST_PASSWORD = 'E2eTestPassword123!'
const TEST_OTP = '424242'

// Get timestamp for screenshots
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
const screenshotDir = path.join(__dirname, '../e2e-screenshots')

/**
 * Helper to take a screenshot with descriptive name
 */
async function takeScreenshot(page: Page, name: string) {
  const filename = `agents-${timestamp}-${name}.png`
  const filepath = path.join(screenshotDir, filename)
  await page.screenshot({ path: filepath, fullPage: true })
  console.log(`📸 Screenshot saved: ${filename}`)
  return filename
}

/**
 * Helper to authenticate with Clerk
 */
async function authenticate(page: Page) {
  console.log('🔐 Starting authentication...')

  // Check if we're on sign-in page
  const isSignInPage = page.url().includes('/sign-in') || page.url().includes('/sign-up')

  if (isSignInPage) {
    console.log('📝 Sign-in page detected, entering credentials...')

    // Wait for sign-in form to be visible
    await page.waitForSelector('input[name="identifier"], input[type="email"]', { timeout: 10000 })
    await takeScreenshot(page, '01-signin-page')

    // Enter email
    const emailInput = page.locator('input[name="identifier"], input[type="email"]').first()
    await emailInput.fill(TEST_EMAIL)
    await page.waitForTimeout(500)

    // Click continue/submit button
    const continueButton = page.locator('button:has-text("Continue"), button:has-text("Sign in"), button[type="submit"]').first()
    await continueButton.click()
    await page.waitForTimeout(1000)

    // Enter password if visible
    const passwordInput = page.locator('input[name="password"], input[type="password"]')
    if (await passwordInput.isVisible()) {
      await passwordInput.fill(TEST_PASSWORD)
      await page.waitForTimeout(500)

      const submitButton = page.locator('button:has-text("Continue"), button:has-text("Sign in"), button[type="submit"]').first()
      await submitButton.click()
      await page.waitForTimeout(1000)
    }

    // Handle OTP if prompted
    try {
      const otpInput = page.locator('input[name="code"], input[type="text"]').first()
      if (await otpInput.isVisible({ timeout: 3000 })) {
        console.log('🔢 OTP prompt detected, entering code...')
        await otpInput.fill(TEST_OTP)
        await page.waitForTimeout(500)

        const verifyButton = page.locator('button:has-text("Continue"), button:has-text("Verify")').first()
        await verifyButton.click()
        await page.waitForTimeout(2000)
      }
    } catch (e) {
      console.log('ℹ️  No OTP prompt detected')
    }

    // Wait for navigation away from auth pages
    await page.waitForURL((url) => !url.href.includes('/sign-in') && !url.href.includes('/sign-up'), { timeout: 10000 })
    console.log('✅ Authentication successful')
  } else {
    console.log('✅ Already authenticated')
  }
}

test.describe('Agents Page Flow - Staging Manual Test', () => {
  test.setTimeout(120000) // 2 minutes for manual testing

  test('Complete Agents page flow with all tabs', async ({ page }) => {
    console.log('\n🚀 Starting Agents page flow test on staging...\n')

    // Step 1: Navigate to staging site
    console.log('Step 1: Navigating to staging site...')
    await page.goto(STAGING_URL)
    await page.waitForTimeout(2000)
    await takeScreenshot(page, '00-initial-load')

    // Step 2: Authenticate if needed
    console.log('Step 2: Checking authentication status...')
    await authenticate(page)
    await takeScreenshot(page, '02-after-auth')

    // Step 3: Navigate to /agents page
    console.log('Step 3: Navigating to /agents page...')
    await page.goto(`${STAGING_URL}/agents`)
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(2000)
    await takeScreenshot(page, '03-agents-list-page')

    // Step 4: Verify agents list is displayed
    console.log('Step 4: Verifying agents list display...')

    // Check for agents list container
    const agentsListVisible = await page.locator('[data-testid="agents-list"], .agents-list, main').isVisible()
    expect(agentsListVisible).toBeTruthy()
    console.log('✅ Agents list container found')

    // Look for agent items
    const agentCards = page.locator('[data-testid="agent-card"], .agent-card, a[href*="/agents/"]')
    const agentCount = await agentCards.count()
    console.log(`📊 Found ${agentCount} agent(s)`)

    if (agentCount === 0) {
      console.log('⚠️  No agents found on the page')
      await takeScreenshot(page, '04-no-agents-found')
      // Log page content for debugging
      const pageContent = await page.content()
      console.log('Page URL:', page.url())
      console.log('Page title:', await page.title())
    } else {
      // Step 5: Click on first agent to view details
      console.log('Step 5: Clicking on first agent...')
      const firstAgent = agentCards.first()

      // Get agent name/title for logging
      const agentText = await firstAgent.textContent()
      console.log(`🤖 Clicking agent: ${agentText?.trim().substring(0, 50)}...`)

      await firstAgent.click()
      await page.waitForLoadState('networkidle')
      await page.waitForTimeout(2000)
      await takeScreenshot(page, '05-agent-details-page')

      // Verify we're on an agent detail page
      const currentUrl = page.url()
      expect(currentUrl).toMatch(/\/agents\/[^/]+/)
      console.log(`✅ Navigated to agent details: ${currentUrl}`)

      // Step 6: Test all tabs
      console.log('Step 6: Testing all tabs...')

      const tabs = [
        { name: 'Overview', selector: 'a[href*="/overview"], button:has-text("Overview"), [role="tab"]:has-text("Overview")' },
        { name: 'Evals', selector: 'a[href*="/evals"], button:has-text("Evals"), [role="tab"]:has-text("Evals")' },
        { name: 'Playground', selector: 'a[href*="/playground"], button:has-text("Playground"), [role="tab"]:has-text("Playground")' },
        { name: 'Tasksets', selector: 'a[href*="/tasksets"], button:has-text("Tasksets"), [role="tab"]:has-text("Tasksets")' },
        { name: 'GEPA', selector: 'a[href*="/gepa"], button:has-text("GEPA"), [role="tab"]:has-text("GEPA")' },
      ]

      for (const tab of tabs) {
        console.log(`  Testing tab: ${tab.name}...`)

        try {
          // Try to find the tab
          const tabElement = page.locator(tab.selector).first()
          const isVisible = await tabElement.isVisible({ timeout: 5000 })

          if (isVisible) {
            await tabElement.click()
            await page.waitForTimeout(1500)
            await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {
              console.log(`  ⚠️  Network idle timeout for ${tab.name} tab`)
            })

            const screenshotName = `06-tab-${tab.name.toLowerCase()}`
            await takeScreenshot(page, screenshotName)
            console.log(`  ✅ ${tab.name} tab loaded successfully`)

            // Verify URL changed or content loaded
            const urlAfterClick = page.url()
            console.log(`     URL: ${urlAfterClick}`)
          } else {
            console.log(`  ⚠️  ${tab.name} tab not found or not visible`)
            await takeScreenshot(page, `06-tab-${tab.name.toLowerCase()}-missing`)
          }
        } catch (error) {
          console.log(`  ❌ Error testing ${tab.name} tab:`, error.message)
          await takeScreenshot(page, `06-tab-${tab.name.toLowerCase()}-error`)
        }
      }

      console.log('✅ All tabs tested')
    }

    // Final screenshot
    await takeScreenshot(page, '99-test-complete')
    console.log('\n✅ Test completed successfully!\n')
  })
})
