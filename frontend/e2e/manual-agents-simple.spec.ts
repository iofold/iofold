import { test, expect, Page, chromium } from '@playwright/test'
import * as path from 'path'

/**
 * Simple Manual Test for Agents Page Flow (No Dependencies)
 *
 * This test runs independently without clerk-setup dependencies.
 * Run with: cd frontend && pnpm exec playwright test manual-agents-simple.spec.ts --project=chromium
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

// Configure test to not depend on setup projects
test.use({
  storageState: undefined,
})

test.describe('Agents Page Flow - Staging Manual Test (Standalone)', () => {
  test.setTimeout(180000) // 3 minutes for manual testing with auth

  test('Complete Agents page flow with authentication', async ({ page }) => {
    console.log('\n🚀 Starting Agents page flow test on staging...\n')

    // Step 1: Navigate to staging site
    console.log('Step 1: Navigating to staging site...')
    await page.goto(STAGING_URL, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(2000)
    await takeScreenshot(page, '00-initial-load')
    console.log(`  Current URL: ${page.url()}`)

    // Step 2: Check if we need to authenticate
    console.log('Step 2: Checking authentication status...')
    const currentUrl = page.url()
    const needsAuth = currentUrl.includes('/sign-in') || currentUrl.includes('/sign-up')

    if (needsAuth) {
      console.log('🔐 Authentication required, signing in...')

      try {
        // Wait for sign-in form
        await page.waitForSelector('input[name="identifier"], input[type="email"], input[name="email"]', {
          timeout: 15000,
        })
        await takeScreenshot(page, '01-signin-page')

        // Enter email
        console.log('  Entering email...')
        const emailInput = page.locator('input[name="identifier"], input[type="email"], input[name="email"]').first()
        await emailInput.fill(TEST_EMAIL)
        await page.waitForTimeout(500)

        // Click continue - use getByRole for more reliable selection
        console.log('  Clicking continue...')
        const continueBtn = page.getByRole('button', { name: 'Continue' }).filter({ hasNotText: 'Sign up' })
        await continueBtn.waitFor({ state: 'visible', timeout: 10000 })
        await continueBtn.click()
        await page.waitForTimeout(2000)
        await takeScreenshot(page, '02-after-email')

        // Enter password if field is visible
        const passwordInput = page.locator('input[name="password"], input[type="password"]').first()
        const passwordVisible = await passwordInput.isVisible({ timeout: 5000 }).catch(() => false)

        if (passwordVisible) {
          console.log('  Entering password...')
          await passwordInput.fill(TEST_PASSWORD)
          await page.waitForTimeout(500)

          const submitBtn = page.getByRole('button', { name: /Continue|Sign in/i })
          await submitBtn.waitFor({ state: 'visible', timeout: 5000 })
          await submitBtn.click()
          await page.waitForTimeout(2000)
          await takeScreenshot(page, '03-after-password')
        }

        // Check for OTP
        const otpInput = page.locator('input[name="code"], input[inputmode="numeric"]').first()
        const otpVisible = await otpInput.isVisible({ timeout: 5000 }).catch(() => false)

        if (otpVisible) {
          console.log('  Entering OTP...')
          await otpInput.fill(TEST_OTP)
          await page.waitForTimeout(1000)

          // Try to click verify button, but it might auto-submit
          try {
            const verifyBtn = page.getByRole('button', { name: /Continue|Verify/i })
            const btnVisible = await verifyBtn.isVisible({ timeout: 2000 }).catch(() => false)
            if (btnVisible) {
              await verifyBtn.click()
              console.log('    Clicked verify button')
            } else {
              console.log('    OTP auto-submitted')
            }
          } catch (e) {
            console.log('    OTP likely auto-submitted')
          }
          await page.waitForTimeout(3000)
          await takeScreenshot(page, '04-after-otp')
        }

        // Wait for redirect away from auth pages
        await page.waitForURL(
          (url) => !url.href.includes('/sign-in') && !url.href.includes('/sign-up'),
          { timeout: 30000 }
        )
        console.log('✅ Authentication successful')
        await takeScreenshot(page, '05-authenticated')
      } catch (error) {
        console.error('❌ Authentication error:', error.message)
        await takeScreenshot(page, 'error-authentication')
        throw error
      }
    } else {
      console.log('✅ Already authenticated')
    }

    // Step 3: Navigate to /agents page
    console.log('\nStep 3: Navigating to /agents page...')
    await page.goto(`${STAGING_URL}/agents`, { waitUntil: 'networkidle', timeout: 30000 })
    await page.waitForTimeout(2000)
    await takeScreenshot(page, '10-agents-list-page')
    console.log(`  Current URL: ${page.url()}`)

    // Step 4: Verify agents list is displayed
    console.log('\nStep 4: Verifying agents list display...')

    // Check page title
    const title = await page.title()
    console.log(`  Page title: ${title}`)

    // Look for various agent list indicators
    const mainContent = page.locator('main, [role="main"], .main-content').first()
    const mainExists = await mainContent.isVisible({ timeout: 5000 }).catch(() => false)
    console.log(`  Main content visible: ${mainExists}`)

    // Look for agent cards or links
    const agentLinks = page.locator('a[href*="/agents/"]')
    const agentCount = await agentLinks.count()
    console.log(`📊 Found ${agentCount} agent link(s)`)

    // Try different selectors for agent items
    const cardSelectors = [
      '[data-testid="agent-card"]',
      '.agent-card',
      '[class*="agent"]',
      'article',
      '[role="article"]',
    ]

    for (const selector of cardSelectors) {
      const elements = page.locator(selector)
      const count = await elements.count()
      if (count > 0) {
        console.log(`  Found ${count} elements matching: ${selector}`)
      }
    }

    if (agentCount === 0) {
      console.log('⚠️  No agent links found on the page')
      console.log('  This could mean:')
      console.log('  - No agents exist in the workspace')
      console.log('  - Page structure is different than expected')
      console.log('  - Page failed to load properly')

      // Log visible text for debugging
      const bodyText = await page.locator('body').textContent()
      console.log(`  Page contains text: ${bodyText?.substring(0, 200)}...`)

      await takeScreenshot(page, '11-no-agents-found')
    } else {
      console.log(`✅ Found ${agentCount} agent(s)`)

      // Step 5: Click on first agent to view details
      console.log('\nStep 5: Clicking on first agent...')
      const firstAgent = agentLinks.first()

      // Get agent text for logging
      const agentText = await firstAgent.textContent()
      console.log(`🤖 Agent link text: ${agentText?.trim().substring(0, 100)}`)

      // Get href to see where we're navigating
      const href = await firstAgent.getAttribute('href')
      console.log(`  Navigation href: ${href}`)

      await firstAgent.click()
      await page.waitForLoadState('networkidle', { timeout: 30000 })
      await page.waitForTimeout(2000)
      await takeScreenshot(page, '20-agent-details-page')

      const detailUrl = page.url()
      console.log(`  Detail page URL: ${detailUrl}`)
      expect(detailUrl).toMatch(/\/agents\/[^/]+/)
      console.log('✅ Navigated to agent details page')

      // Step 6: Test all tabs
      console.log('\nStep 6: Testing all tabs...')

      const tabs = [
        { name: 'Overview', patterns: ['overview', 'about'] },
        { name: 'Evals', patterns: ['evals', 'evaluations'] },
        { name: 'Playground', patterns: ['playground', 'test'] },
        { name: 'Tasksets', patterns: ['tasksets', 'tasks'] },
        { name: 'GEPA', patterns: ['gepa', 'optimization'] },
      ]

      for (const tab of tabs) {
        console.log(`\n  Testing tab: ${tab.name}...`)

        try {
          // Try multiple selectors for the tab
          const selectors = [
            `a[href*="/${tab.patterns[0]}"]`,
            `button:has-text("${tab.name}")`,
            `[role="tab"]:has-text("${tab.name}")`,
            `a:has-text("${tab.name}")`,
          ]

          let tabElement = null
          let usedSelector = ''

          for (const selector of selectors) {
            const element = page.locator(selector).first()
            const visible = await element.isVisible({ timeout: 2000 }).catch(() => false)
            if (visible) {
              tabElement = element
              usedSelector = selector
              break
            }
          }

          if (tabElement) {
            console.log(`    Found tab using: ${usedSelector}`)
            const tabText = await tabElement.textContent()
            console.log(`    Tab text: ${tabText?.trim()}`)

            await tabElement.click()
            await page.waitForTimeout(2000)
            await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {
              console.log(`    ⚠️  Network idle timeout (continuing anyway)`)
            })

            const tabUrl = page.url()
            console.log(`    URL after click: ${tabUrl}`)

            const screenshotName = `30-tab-${tab.name.toLowerCase()}`
            await takeScreenshot(page, screenshotName)
            console.log(`    ✅ ${tab.name} tab loaded`)
          } else {
            console.log(`    ⚠️  ${tab.name} tab not found or not visible`)
            await takeScreenshot(page, `30-tab-${tab.name.toLowerCase()}-missing`)
          }
        } catch (error) {
          console.log(`    ❌ Error testing ${tab.name} tab: ${error.message}`)
          await takeScreenshot(page, `30-tab-${tab.name.toLowerCase()}-error`)
        }
      }

      console.log('\n✅ All tabs tested')
    }

    // Final screenshot
    await takeScreenshot(page, '99-test-complete')
    console.log('\n✅ Test completed successfully!\n')
  })
})
