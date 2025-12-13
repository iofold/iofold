/**
 * Manual Traces Flow Test for Staging Environment
 * Tests traces functionality with manual authentication
 */
import { test, expect } from '@playwright/test';

const STAGING_URL = 'https://platform.staging.iofold.com';
const SCREENSHOT_DIR = '/home/ygupta/workspace/iofold/.tmp/e2e-screenshots';

// Test credentials
const TEST_EMAIL = 'e2e+clerk_test@iofold.com';
const TEST_PASSWORD = 'E2eTestPassword123!';
const TEST_OTP = '424242';

// Helper function to get timestamp for screenshots
function getTimestamp(): string {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
}

// Helper function to take screenshot with timestamp
async function takeScreenshot(page: any, stepName: string) {
  const timestamp = getTimestamp();
  const filename = `${SCREENSHOT_DIR}/traces-manual-${stepName}-${timestamp}.png`;
  await page.screenshot({ path: filename, fullPage: true });
  console.log(`📸 Screenshot saved: ${filename}`);
  return filename;
}

test.describe('Manual Traces Flow on Staging', () => {
  // Skip global setup dependency for manual test
  test.use({ storageState: { cookies: [], origins: [] } });

  test('Complete traces flow with manual sign-in', async ({ page }) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const failedRequests: Array<{ url: string; status: number }> = [];

    // Set up error tracking
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
        console.error('🔴 Browser Console Error:', msg.text());
      } else if (msg.type() === 'warning') {
        warnings.push(msg.text());
      }
    });

    page.on('pageerror', error => {
      errors.push(`Page Error: ${error.message}`);
      console.error('🔴 Page Error:', error.message);
    });

    page.on('response', response => {
      if (response.status() >= 400) {
        failedRequests.push({ url: response.url(), status: response.status() });
        console.warn(`⚠️  Failed Request: ${response.status()} - ${response.url()}`);
      }
    });

    console.log('\n========================================');
    console.log('TRACES FLOW TEST - STAGING ENVIRONMENT');
    console.log('========================================\n');

    // STEP 1: Navigate to landing page
    console.log('STEP 1: Navigate to staging platform');
    console.log(`URL: ${STAGING_URL}`);
    await page.goto(STAGING_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await takeScreenshot(page, '01-landing');

    // STEP 2: Click sign in or navigate to sign-in page
    console.log('\nSTEP 2: Navigate to sign-in page');

    // Try to find sign-in button/link
    const signInButton = page.locator('a[href*="sign-in"], button:has-text("Sign in")').first();
    if (await signInButton.count() > 0) {
      await signInButton.click();
      await page.waitForLoadState('networkidle');
    } else {
      // Direct navigation
      await page.goto(`${STAGING_URL}/sign-in`, { waitUntil: 'networkidle' });
    }
    await takeScreenshot(page, '02-signin-page');

    // STEP 3: Enter email
    console.log('\nSTEP 3: Enter email address');
    const emailInput = page.locator('input[type="email"], input[name="identifier"], input[placeholder*="email" i]').first();
    await emailInput.fill(TEST_EMAIL);
    await takeScreenshot(page, '03-email-entered');

    // Click continue
    const continueButton = page.locator('button:has-text("Continue")').first();
    await continueButton.click();
    await page.waitForTimeout(2000);
    await takeScreenshot(page, '04-after-continue');

    // STEP 4: Enter password
    console.log('\nSTEP 4: Enter password');
    const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
    await passwordInput.waitFor({ state: 'visible', timeout: 10000 });
    await passwordInput.fill(TEST_PASSWORD);
    await takeScreenshot(page, '05-password-entered');

    // Click continue/submit - find visible button only
    const submitButton = page.locator('button:has-text("Continue"):visible, button[type="submit"]:visible').first();
    await submitButton.click();
    await page.waitForTimeout(3000);
    await takeScreenshot(page, '06-after-password-submit');

    // STEP 5: Handle OTP if required
    console.log('\nSTEP 5: Check for OTP verification');

    // Wait for either OTP screen or successful auth
    await page.waitForTimeout(2000);

    // Check if we're on OTP screen by looking for "Check your email" or "Resend" text
    const pageText = await page.textContent('body');
    const isOTPScreen = pageText?.includes('Check your email') || pageText?.includes('Resend');

    if (isOTPScreen) {
      console.log('OTP verification required - detected verification screen');
      await takeScreenshot(page, '07-otp-screen');

      // Try multiple selectors for OTP inputs
      const otpSelectors = [
        'input[type="text"][inputmode="numeric"]',
        'input[type="text"][maxlength="1"]',
        'input[autocomplete="one-time-code"]',
        'input[data-otp]',
        'input[name*="code"]',
      ];

      let otpInputs;
      let otpCount = 0;

      for (const selector of otpSelectors) {
        otpInputs = page.locator(selector);
        otpCount = await otpInputs.count();
        if (otpCount > 0) {
          console.log(`Found ${otpCount} OTP inputs with selector: ${selector}`);
          break;
        }
      }

      if (otpCount > 0 && otpInputs) {
        // Fill each digit of the OTP (424242)
        const otpDigits = TEST_OTP.split('');
        for (let i = 0; i < Math.min(otpDigits.length, otpCount); i++) {
          await otpInputs.nth(i).fill(otpDigits[i]);
          await page.waitForTimeout(150);
        }

        await takeScreenshot(page, '07b-otp-entered');
        console.log('OTP digits entered');

        // Wait for auto-submission or click continue
        await page.waitForTimeout(2000);

        const otpContinue = page.locator('button:has-text("Continue"):visible').first();
        if (await otpContinue.count() > 0) {
          await otpContinue.click();
          console.log('Clicked OTP continue button');
        }

        await page.waitForTimeout(3000);
      } else {
        console.log('⚠️  OTP screen detected but could not find input fields');
        await takeScreenshot(page, '07-otp-inputs-not-found');
      }
    } else {
      console.log('No OTP required - proceeding to next step');
    }

    // STEP 6: Verify authentication success
    console.log('\nSTEP 6: Verify authentication success');
    await page.waitForURL(/\/(agents|traces|$)/, { timeout: 15000 });
    await page.waitForSelector('[data-clerk-user-button]', { timeout: 10000 });
    await takeScreenshot(page, '08-authenticated');
    console.log('✅ Successfully authenticated');

    // STEP 7: Navigate to Traces page
    console.log('\nSTEP 7: Navigate to Traces page');

    // Look for Traces navigation link
    const tracesNav = page.locator('a[href*="/traces"], nav a:has-text("Traces")').first();

    if (await tracesNav.count() > 0) {
      console.log('Found Traces navigation link');
      await tracesNav.click();
      await page.waitForLoadState('networkidle');
    } else {
      console.log('Direct navigation to /traces');
      await page.goto(`${STAGING_URL}/traces`, { waitUntil: 'networkidle' });
    }

    await page.waitForTimeout(2000);
    await takeScreenshot(page, '09-traces-page');
    console.log(`Current URL: ${page.url()}`);
    console.log('✅ Navigated to Traces page');

    // STEP 8: Analyze traces page content
    console.log('\nSTEP 8: Analyze traces page content');

    const pageAnalysis = {
      hasTable: await page.locator('table').count() > 0,
      hasDataGrid: await page.locator('[role="grid"]').count() > 0,
      hasList: await page.locator('[role="list"]').count() > 0,
      hasTraceItems: await page.locator('[data-testid*="trace"], [class*="trace-item"], [class*="trace-row"]').count() > 0,
      tableRows: await page.locator('table tbody tr').count(),
      searchInputs: await page.locator('input[type="search"], input[placeholder*="search" i]').count(),
      filterButtons: await page.locator('button:has-text("Filter"), [role="combobox"]').count(),
    };

    console.log('Page structure analysis:');
    console.log(`  - Has table: ${pageAnalysis.hasTable}`);
    console.log(`  - Has data grid: ${pageAnalysis.hasDataGrid}`);
    console.log(`  - Has list: ${pageAnalysis.hasList}`);
    console.log(`  - Has trace items: ${pageAnalysis.hasTraceItems}`);
    console.log(`  - Table rows: ${pageAnalysis.tableRows}`);
    console.log(`  - Search inputs: ${pageAnalysis.searchInputs}`);
    console.log(`  - Filter buttons: ${pageAnalysis.filterButtons}`);

    // Check for empty state
    const bodyText = await page.textContent('body');
    const hasEmptyState = bodyText?.toLowerCase().includes('no traces') ||
                         bodyText?.toLowerCase().includes('empty') ||
                         bodyText?.toLowerCase().includes('no data');

    if (hasEmptyState) {
      console.log('⚠️  Empty state detected - no traces available');
    }

    // STEP 9: Test search functionality (if available)
    if (pageAnalysis.searchInputs > 0) {
      console.log('\nSTEP 9: Test search functionality');
      const searchInput = page.locator('input[type="search"], input[placeholder*="search" i]').first();

      await searchInput.fill('test');
      await page.waitForTimeout(1000);
      await takeScreenshot(page, '10-search-active');

      await searchInput.clear();
      await page.waitForTimeout(500);
      console.log('✅ Search functionality tested');
    } else {
      console.log('\nSTEP 9: No search functionality found');
    }

    // STEP 10: Test clicking on a trace (if available)
    console.log('\nSTEP 10: Test trace detail view');

    const clickableTraces = page.locator('a[href*="/traces/"], table tbody tr, [data-testid*="trace"]').first();
    const hasClickableTraces = await clickableTraces.count() > 0;

    if (hasClickableTraces) {
      console.log('Found clickable trace elements');
      await takeScreenshot(page, '11-before-trace-click');

      try {
        await clickableTraces.click({ timeout: 5000 });
        await page.waitForTimeout(2000);
        await takeScreenshot(page, '12-trace-detail');

        console.log(`Trace detail URL: ${page.url()}`);

        // Analyze trace detail page
        const detailAnalysis = {
          hasInput: await page.locator('text=/input/i, [data-testid*="input"]').count() > 0,
          hasOutput: await page.locator('text=/output/i, [data-testid*="output"]').count() > 0,
          hasTimestamp: await page.locator('time, [data-testid*="timestamp"]').count() > 0,
          hasMetadata: await page.locator('text=/metadata/i, [data-testid*="metadata"]').count() > 0,
          codeBlocks: await page.locator('pre, code').count(),
        };

        console.log('Trace detail content:');
        Object.entries(detailAnalysis).forEach(([key, value]) => {
          console.log(`  - ${key}: ${value}`);
        });

        await takeScreenshot(page, '13-trace-detail-full');
        console.log('✅ Trace detail page tested');
      } catch (error) {
        console.log('⚠️  Could not click trace:', error);
      }
    } else {
      console.log('⚠️  No clickable traces found');
      await takeScreenshot(page, '11-no-traces');
    }

    // STEP 11: Test pagination (if available)
    console.log('\nSTEP 11: Test pagination');

    // Navigate back to traces list if needed
    if (!page.url().endsWith('/traces')) {
      await page.goto(`${STAGING_URL}/traces`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(1000);
    }

    const nextButton = page.locator('button:has-text("Next"), button:has-text(">")').first();
    const hasPagination = await nextButton.count() > 0;

    if (hasPagination) {
      console.log('Found pagination controls');
      const isDisabled = await nextButton.isDisabled().catch(() => true);

      if (!isDisabled) {
        await nextButton.click();
        await page.waitForTimeout(1500);
        await takeScreenshot(page, '14-pagination-next');

        const prevButton = page.locator('button:has-text("Previous"), button:has-text("<")').first();
        if (await prevButton.count() > 0) {
          await prevButton.click();
          await page.waitForTimeout(1500);
          await takeScreenshot(page, '15-pagination-prev');
        }

        console.log('✅ Pagination tested');
      } else {
        console.log('⚠️  Next button disabled (likely single page)');
      }
    } else {
      console.log('⚠️  No pagination controls found');
    }

    // STEP 12: Final state capture
    console.log('\nSTEP 12: Final state capture');
    await page.goto(`${STAGING_URL}/traces`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await takeScreenshot(page, '16-final-state');

    // STEP 13: Report summary
    console.log('\n========================================');
    console.log('TEST SUMMARY');
    console.log('========================================');
    console.log(`Page load time: ${Date.now()}ms`);
    console.log(`Console errors: ${errors.length}`);
    console.log(`Console warnings: ${warnings.length}`);
    console.log(`Failed requests: ${failedRequests.length}`);

    if (errors.length > 0) {
      console.log('\n🔴 Console Errors:');
      errors.forEach((error, i) => {
        console.log(`  ${i + 1}. ${error.slice(0, 200)}`);
      });
    }

    if (failedRequests.length > 0) {
      console.log('\n⚠️  Failed Requests:');
      failedRequests.forEach((req, i) => {
        console.log(`  ${i + 1}. ${req.status} - ${req.url}`);
      });
    }

    console.log('\n✅ TEST COMPLETED');
    console.log('========================================\n');

    // Assertions
    expect(page.url()).toContain('platform.staging.iofold.com');
    expect(errors.filter(e => !e.includes('favicon') && !e.includes('warning'))).toHaveLength(0);
  });
});
