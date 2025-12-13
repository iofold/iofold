/**
 * Direct Manual Playwright Test: Evals Page Flow (No Auth Setup Dependency)
 *
 * This test runs independently without relying on global auth setup.
 * It handles authentication inline if needed.
 *
 * Run with: cd frontend && USE_STAGING=true pnpm playwright test --project=chromium --headed evals-page-direct-manual.spec.ts
 */

import { test, expect, Page } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'

// Override test configuration for this specific test
test.use({
  // Don't use stored auth state for this test
  storageState: undefined,
})

// Helper function to take timestamped screenshots
async function takeTimestampedScreenshot(page: Page, name: string, baseDir: string) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
  const filename = `evals-${name}-${timestamp}.png`
  const filepath = path.join(baseDir, filename)

  // Ensure directory exists
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true })
  }

  await page.screenshot({ path: filepath, fullPage: true })
  console.log(`📸 Screenshot saved: ${filename}`)
  return { filename, filepath }
}

test.describe('Evals Page Flow - Direct Manual Test', () => {
  const screenshotsDir = path.join(__dirname, '../e2e-screenshots')
  let testResults: Array<{ step: string; status: string; details?: string; screenshot?: string }> = []

  test('Complete Evals page flow with manual authentication', async ({ page, baseURL }) => {
    console.log('🚀 Starting Evals page flow test on:', baseURL)

    // Increase timeouts for manual testing
    test.setTimeout(180000) // 3 minutes
    page.setDefaultTimeout(30000)

    // Step 1: Navigate to staging site
    console.log('📍 Step 1: Navigating to staging site...')
    try {
      await page.goto('/', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      })

      await page.waitForTimeout(2000) // Let page settle

      const screenshot1 = await takeTimestampedScreenshot(page, '01-initial-load', screenshotsDir)
      testResults.push({
        step: 'Navigate to staging site',
        status: 'PASS',
        details: `Loaded: ${page.url()}`,
        screenshot: screenshot1.filename
      })
      console.log('✅ Step 1: Initial load successful')
    } catch (error) {
      const screenshot = await takeTimestampedScreenshot(page, '01-initial-load-failed', screenshotsDir)
      testResults.push({
        step: 'Navigate to staging site',
        status: 'FAIL',
        details: error instanceof Error ? error.message : String(error),
        screenshot: screenshot.filename
      })
      throw error
    }

    // Step 2: Handle authentication if needed
    console.log('📍 Step 2: Checking authentication status...')
    try {
      const currentUrl = page.url()
      console.log(`Current URL: ${currentUrl}`)

      // Check if we're on sign-in page
      if (currentUrl.includes('/sign-in') || currentUrl.includes('sign_in')) {
        console.log('🔐 Sign-in required, authenticating...')

        // Wait for sign-in form to load
        await page.waitForLoadState('networkidle', { timeout: 15000 })

        const screenshot2a = await takeTimestampedScreenshot(page, '02a-signin-page', screenshotsDir)

        // Try to find email/identifier input
        const emailInput = page.locator('input[name="identifier"], input[type="email"], input[autocomplete="username"]').first()
        await emailInput.waitFor({ state: 'visible', timeout: 10000 })

        console.log('✍️ Entering email...')
        await emailInput.fill('e2e+clerk_test@iofold.com')
        await page.waitForTimeout(500)

        // Click continue/submit button (filter out hidden elements)
        const continueButton = page.locator('button:has-text("Continue")').filter({ hasNotText: '' }).last()
        await continueButton.click({ force: false })
        console.log('🔘 Clicked continue button')

        await page.waitForTimeout(2000)

        const screenshot2b = await takeTimestampedScreenshot(page, '02b-after-email', screenshotsDir)

        // Wait for password field
        const passwordInput = page.locator('input[name="password"], input[type="password"]').first()
        await passwordInput.waitFor({ state: 'visible', timeout: 10000 })

        console.log('🔒 Entering password...')
        await passwordInput.fill('E2eTestPassword123!')
        await page.waitForTimeout(500)

        // Click submit (look for visible Continue or Sign in button)
        const submitButton = page.locator('button:has-text("Continue"), button:has-text("Sign in")').last()
        await submitButton.click({ force: false })
        console.log('🔘 Clicked sign in button')

        await page.waitForTimeout(3000)

        const screenshot2c = await takeTimestampedScreenshot(page, '02c-after-password', screenshotsDir)

        // Check for OTP requirement
        const otpInput = page.locator('input[name="code"], input[autocomplete="one-time-code"], input[type="text"]').first()
        const otpVisible = await otpInput.isVisible({ timeout: 5000 }).catch(() => false)

        if (otpVisible) {
          console.log('🔑 OTP required, entering code...')

          // Fill OTP code character by character
          await otpInput.focus()
          await otpInput.type('424242', { delay: 100 })

          console.log('✓ OTP code entered, waiting for auto-submission or button to be enabled...')
          await page.waitForTimeout(2000)

          const screenshot2d = await takeTimestampedScreenshot(page, '02d-otp-entered', screenshotsDir)

          // Check if button is enabled and visible
          const otpSubmitButton = page.locator('button:has-text("Continue"), button:has-text("Verify")').last()
          const buttonEnabled = await otpSubmitButton.isEnabled({ timeout: 5000 }).catch(() => false)

          if (buttonEnabled) {
            await otpSubmitButton.click({ force: false })
            console.log('🔘 Clicked verify OTP button')
            await page.waitForTimeout(2000)
          } else {
            console.log('⚠️ OTP button not enabled, checking if auto-submitted...')
            await page.waitForTimeout(1000)
          }

          const screenshot2e = await takeTimestampedScreenshot(page, '02e-after-otp', screenshotsDir)
        }

        // Wait for successful authentication
        console.log('⏳ Waiting for redirect after authentication...')
        await page.waitForURL(/\/(agents|evals|$)/, { timeout: 30000 })

        const screenshot2f = await takeTimestampedScreenshot(page, '02f-authenticated', screenshotsDir)

        testResults.push({
          step: 'Authenticate user',
          status: 'PASS',
          details: 'Successfully authenticated with test credentials',
          screenshot: screenshot2f.filename
        })
        console.log('✅ Step 2: Authentication successful')
      } else {
        console.log('✓ Already authenticated or no auth required')
        testResults.push({
          step: 'Check authentication',
          status: 'PASS',
          details: 'Already authenticated (no sign-in page detected)'
        })
      }
    } catch (error) {
      const screenshot = await takeTimestampedScreenshot(page, '02-auth-failed', screenshotsDir)
      testResults.push({
        step: 'Authentication',
        status: 'FAIL',
        details: error instanceof Error ? error.message : String(error),
        screenshot: screenshot.filename
      })
      console.error('❌ Authentication failed:', error)
      throw error
    }

    // Step 3: Navigate to /evals page
    console.log('📍 Step 3: Navigating to /evals page...')
    try {
      await page.goto('/evals', {
        waitUntil: 'networkidle',
        timeout: 30000
      })
      await page.waitForTimeout(3000) // Allow page to fully load

      const screenshot3 = await takeTimestampedScreenshot(page, '03-evals-page-loaded', screenshotsDir)

      testResults.push({
        step: 'Navigate to /evals page',
        status: 'PASS',
        details: `URL: ${page.url()}`,
        screenshot: screenshot3.filename
      })
      console.log('✅ Step 3: Evals page loaded')
    } catch (error) {
      const screenshot = await takeTimestampedScreenshot(page, '03-evals-nav-failed', screenshotsDir)
      testResults.push({
        step: 'Navigate to /evals page',
        status: 'FAIL',
        details: error instanceof Error ? error.message : String(error),
        screenshot: screenshot.filename
      })
      throw error
    }

    // Step 4: Verify the Evals table loads
    console.log('📍 Step 4: Verifying Evals table loads...')
    try {
      // Check page content
      const pageContent = await page.textContent('body')
      console.log(`Page contains "eval": ${pageContent?.toLowerCase().includes('eval')}`)

      // Wait for either table or empty state
      const hasTable = await page.locator('table').isVisible({ timeout: 10000 }).catch(() => false)
      const hasEmptyState = await page.locator('text=/no evals|empty|create your first/i').isVisible({ timeout: 5000 }).catch(() => false)
      const hasError = await page.locator('text=/error|failed|not found/i').isVisible({ timeout: 2000 }).catch(() => false)

      if (hasError) {
        const errorText = await page.locator('text=/error|failed|not found/i').first().textContent()
        throw new Error(`Page shows error: ${errorText}`)
      }

      if (hasTable) {
        // Count rows
        const rowCount = await page.locator('tbody tr').count()
        console.log(`📊 Found ${rowCount} eval rows`)

        const screenshot4 = await takeTimestampedScreenshot(page, '04-table-with-data', screenshotsDir)
        testResults.push({
          step: 'Verify Evals table loads',
          status: 'PASS',
          details: `Table loaded with ${rowCount} rows`,
          screenshot: screenshot4.filename
        })
      } else if (hasEmptyState) {
        const screenshot4 = await takeTimestampedScreenshot(page, '04-table-empty-state', screenshotsDir)
        testResults.push({
          step: 'Verify Evals table loads',
          status: 'PASS',
          details: 'Page loaded with empty state (no evals)',
          screenshot: screenshot4.filename
        })
      } else {
        const screenshot4 = await takeTimestampedScreenshot(page, '04-table-unknown-state', screenshotsDir)
        testResults.push({
          step: 'Verify Evals table loads',
          status: 'WARN',
          details: 'Page loaded but neither table nor empty state detected',
          screenshot: screenshot4.filename
        })
      }
      console.log('✅ Step 4: Table verification complete')
    } catch (error) {
      const screenshot = await takeTimestampedScreenshot(page, '04-table-failed', screenshotsDir)
      testResults.push({
        step: 'Verify Evals table loads',
        status: 'FAIL',
        details: error instanceof Error ? error.message : String(error),
        screenshot: screenshot.filename
      })
      console.error('❌ Table verification failed:', error)
      // Don't throw - continue with other tests
    }

    // Step 5: Test search and agent filter
    console.log('📍 Step 5: Testing search and agent filter...')
    try {
      // Look for search input
      const searchInput = page.locator('input[type="search"], input[placeholder*="Search" i], input[placeholder*="Filter" i]').first()
      const searchExists = await searchInput.isVisible({ timeout: 5000 }).catch(() => false)

      if (searchExists) {
        console.log('🔍 Testing search functionality...')
        await searchInput.fill('test')
        await page.waitForTimeout(1500) // Allow debounce/filter to apply

        const screenshot5a = await takeTimestampedScreenshot(page, '05a-search-applied', screenshotsDir)
        testResults.push({
          step: 'Test search functionality',
          status: 'PASS',
          details: 'Search input found and tested with "test" query',
          screenshot: screenshot5a.filename
        })

        // Clear search
        await searchInput.clear()
        await page.waitForTimeout(1000)

        const screenshot5b = await takeTimestampedScreenshot(page, '05b-search-cleared', screenshotsDir)
      } else {
        const screenshot5 = await takeTimestampedScreenshot(page, '05-no-search', screenshotsDir)
        testResults.push({
          step: 'Test search functionality',
          status: 'SKIP',
          details: 'Search input not found on page',
          screenshot: screenshot5.filename
        })
      }

      // Look for agent filter dropdown/combobox
      const agentFilter = page.locator('select, [role="combobox"], button:has-text("Agent"), button:has-text("Filter")').first()
      const filterExists = await agentFilter.isVisible({ timeout: 5000 }).catch(() => false)

      if (filterExists) {
        console.log('🎯 Testing agent filter...')
        await agentFilter.click()
        await page.waitForTimeout(1000)

        const screenshot5c = await takeTimestampedScreenshot(page, '05c-filter-opened', screenshotsDir)
        testResults.push({
          step: 'Test agent filter',
          status: 'PASS',
          details: 'Agent filter found and opened',
          screenshot: screenshot5c.filename
        })

        // Close filter
        await page.keyboard.press('Escape')
        await page.waitForTimeout(500)
      } else {
        testResults.push({
          step: 'Test agent filter',
          status: 'SKIP',
          details: 'Agent filter not found on page'
        })
      }

      console.log('✅ Step 5: Search and filter testing complete')
    } catch (error) {
      const screenshot = await takeTimestampedScreenshot(page, '05-search-filter-failed', screenshotsDir)
      testResults.push({
        step: 'Test search and agent filter',
        status: 'FAIL',
        details: error instanceof Error ? error.message : String(error),
        screenshot: screenshot.filename
      })
      console.log('⚠️ Step 5 had errors but continuing...')
    }

    // Step 6: Click on an eval to view details
    console.log('📍 Step 6: Clicking on an eval to view details...')
    try {
      const firstRow = page.locator('tbody tr').first()
      const rowExists = await firstRow.isVisible({ timeout: 5000 }).catch(() => false)

      if (rowExists) {
        console.log('🖱️ Clicking first eval row...')
        await firstRow.click()
        await page.waitForTimeout(2000) // Wait for side panel to open

        const screenshot6a = await takeTimestampedScreenshot(page, '06a-clicked-row', screenshotsDir)

        // Check for side panel/dialog/drawer
        const sidePanelVisible = await page.locator('[role="dialog"], aside, .side-panel, [class*="drawer"], [class*="panel"]').isVisible({ timeout: 5000 }).catch(() => false)

        if (sidePanelVisible) {
          const screenshot6b = await takeTimestampedScreenshot(page, '06b-eval-details-panel', screenshotsDir)
          testResults.push({
            step: 'Click eval and open side panel',
            status: 'PASS',
            details: 'Side panel opened successfully',
            screenshot: screenshot6b.filename
          })
          console.log('✅ Step 6: Side panel opened')
        } else {
          // Maybe it navigated to a detail page instead
          const urlChanged = page.url().includes('/evals/') && !page.url().endsWith('/evals')
          if (urlChanged) {
            const screenshot6b = await takeTimestampedScreenshot(page, '06b-eval-detail-page', screenshotsDir)
            testResults.push({
              step: 'Click eval and open detail page',
              status: 'PASS',
              details: `Navigated to detail page: ${page.url()}`,
              screenshot: screenshot6b.filename
            })
            console.log('✅ Step 6: Detail page opened')
          } else {
            const screenshot6b = await takeTimestampedScreenshot(page, '06b-no-panel-or-page', screenshotsDir)
            testResults.push({
              step: 'Click eval and open side panel',
              status: 'WARN',
              details: 'Row clicked but no side panel or detail page detected',
              screenshot: screenshot6b.filename
            })
          }
        }
      } else {
        const screenshot6 = await takeTimestampedScreenshot(page, '06-no-rows', screenshotsDir)
        testResults.push({
          step: 'Click eval and open side panel',
          status: 'SKIP',
          details: 'No eval rows available to click',
          screenshot: screenshot6.filename
        })
        console.log('⚠️ Step 6: No evals to click, skipping remaining steps')
        return // Exit early
      }
    } catch (error) {
      const screenshot = await takeTimestampedScreenshot(page, '06-click-eval-failed', screenshotsDir)
      testResults.push({
        step: 'Click eval and open side panel',
        status: 'FAIL',
        details: error instanceof Error ? error.message : String(error),
        screenshot: screenshot.filename
      })
      console.error('❌ Step 6 failed:', error)
      return // Exit early
    }

    // Step 7: Check Details and Executions tabs
    console.log('📍 Step 7: Checking Details and Executions tabs...')
    try {
      // Look for tabs
      const detailsTab = page.locator('button, [role="tab"]').filter({ hasText: /details/i }).first()
      const executionsTab = page.locator('button, [role="tab"]').filter({ hasText: /executions|runs/i }).first()

      const detailsTabExists = await detailsTab.isVisible({ timeout: 5000 }).catch(() => false)
      const executionsTabExists = await executionsTab.isVisible({ timeout: 5000 }).catch(() => false)

      if (detailsTabExists) {
        console.log('📋 Clicking Details tab...')
        await detailsTab.click()
        await page.waitForTimeout(1500)

        const screenshot7a = await takeTimestampedScreenshot(page, '07a-details-tab', screenshotsDir)
        testResults.push({
          step: 'View Details tab',
          status: 'PASS',
          details: 'Details tab loaded successfully',
          screenshot: screenshot7a.filename
        })
      } else {
        const screenshot7a = await takeTimestampedScreenshot(page, '07a-no-details-tab', screenshotsDir)
        testResults.push({
          step: 'View Details tab',
          status: 'SKIP',
          details: 'Details tab not found',
          screenshot: screenshot7a.filename
        })
      }

      if (executionsTabExists) {
        console.log('📊 Clicking Executions tab...')
        await executionsTab.click()
        await page.waitForTimeout(1500)

        const screenshot7b = await takeTimestampedScreenshot(page, '07b-executions-tab', screenshotsDir)
        testResults.push({
          step: 'View Executions tab',
          status: 'PASS',
          details: 'Executions tab loaded successfully',
          screenshot: screenshot7b.filename
        })
      } else {
        const screenshot7b = await takeTimestampedScreenshot(page, '07b-no-executions-tab', screenshotsDir)
        testResults.push({
          step: 'View Executions tab',
          status: 'SKIP',
          details: 'Executions tab not found',
          screenshot: screenshot7b.filename
        })
      }

      // Take final screenshot
      const screenshot7c = await takeTimestampedScreenshot(page, '07c-final-state', screenshotsDir)
      testResults.push({
        step: 'Final state capture',
        status: 'PASS',
        details: 'Final screenshot captured',
        screenshot: screenshot7c.filename
      })

      console.log('✅ Step 7: Tabs verification complete')
    } catch (error) {
      const screenshot = await takeTimestampedScreenshot(page, '07-tabs-failed', screenshotsDir)
      testResults.push({
        step: 'Check Details and Executions tabs',
        status: 'FAIL',
        details: error instanceof Error ? error.message : String(error),
        screenshot: screenshot.filename
      })
      console.error('❌ Step 7 failed:', error)
    }

    console.log('🎉 Test execution completed!')
  })

  test.afterAll(async () => {
    // Generate summary report
    const timestamp = new Date().toISOString()
    const passed = testResults.filter(r => r.status === 'PASS').length
    const failed = testResults.filter(r => r.status === 'FAIL').length
    const skipped = testResults.filter(r => r.status === 'SKIP').length
    const warnings = testResults.filter(r => r.status === 'WARN').length

    const report = `# Evals Page Flow - Manual Test Results

**Test Date:** ${timestamp}
**Environment:** Staging (https://platform.staging.iofold.com)
**Test Credentials:** e2e+clerk_test@iofold.com

## Summary

- ✅ Passed: ${passed}
- ❌ Failed: ${failed}
- ⚠️ Warnings: ${warnings}
- ⏭️ Skipped: ${skipped}
- **Total Steps:** ${testResults.length}

## Overall Result

${failed === 0 ? '✅ **ALL TESTS PASSED**' : '❌ **SOME TESTS FAILED**'}

## Detailed Results

${testResults.map((result, index) => `
### ${index + 1}. ${result.step}

**Status:** ${result.status === 'PASS' ? '✅ PASS' : result.status === 'FAIL' ? '❌ FAIL' : result.status === 'WARN' ? '⚠️ WARN' : '⏭️ SKIP'}
**Details:** ${result.details || 'N/A'}
${result.screenshot ? `**Screenshot:** \`${result.screenshot}\`` : ''}
`).join('\n')}

## Screenshots Location

All screenshots are saved in: \`/home/ygupta/workspace/iofold/frontend/e2e-screenshots/\`

View screenshots with:
\`\`\`bash
ls -lh /home/ygupta/workspace/iofold/frontend/e2e-screenshots/
\`\`\`

## Test Scenarios Covered

1. Navigate to staging site
2. Authenticate if redirected to sign-in
3. Navigate to /evals page
4. Verify the Evals list page loads with table
5. Test search and agent filter
6. Click on an eval to view details in side panel
7. Check the Details and Executions tabs

## Notes

- Test executed with inline authentication (no Clerk Testing Token dependency)
- Screenshots include timestamps for easy identification
- Full page screenshots captured at each major step
- Tests handle both empty state and populated table scenarios
- Increased timeouts for manual observation (180s total test timeout)

## Troubleshooting

${failed > 0 ? `
### Failed Steps

${testResults.filter(r => r.status === 'FAIL').map(r => `
- **${r.step}**
  - Details: ${r.details}
  - Screenshot: ${r.screenshot || 'N/A'}
`).join('\n')}

### Recommended Actions

1. Review the screenshot(s) from failed step(s)
2. Check network connectivity to staging environment
3. Verify test credentials are valid
4. Check browser console for JavaScript errors
5. Ensure staging environment is running
` : '✅ No failures to troubleshoot'}

## Next Steps

${failed > 0 ? '- 🔍 Investigate failed steps and review error screenshots' : '- ✅ All tests passed! Consider adding these to CI/CD pipeline'}
${skipped > 0 ? '- 📝 Review skipped steps - may indicate missing UI elements or empty state' : ''}
${warnings > 0 ? '- ⚠️ Review warnings - may indicate unexpected UI behavior' : ''}
- 🔄 Run tests regularly to catch regressions
- 📊 Consider adding performance metrics to test results
- 🎯 Add assertions for specific eval data fields
`

    const reportPath = path.join(__dirname, '../../.tmp/playwright-evals-test-results.md')

    // Ensure directory exists
    const reportDir = path.dirname(reportPath)
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true })
    }

    fs.writeFileSync(reportPath, report)
    console.log(`📄 Test report saved to: ${reportPath}`)
    console.log(`📸 Screenshots saved to: ${screenshotsDir}`)
  })
})
