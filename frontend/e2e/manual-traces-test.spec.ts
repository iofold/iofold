import { test, expect } from '@playwright/test';

const STAGING_URL = 'https://platform.staging.iofold.com';
const TEST_EMAIL = 'e2e+clerk_test@iofold.com';
const TEST_PASSWORD = 'E2eTestPassword123!';
const TEST_OTP = '424242';
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

test.describe('Traces Page Flow - Staging Manual Test', () => {
  test.setTimeout(120000); // 2 minute timeout

  test('Complete Traces page flow', async ({ page }) => {
    console.log(`Starting test at ${new Date().toISOString()}`);

    // Step 1: Navigate to staging site
    console.log('Step 1: Navigating to staging site...');
    await page.goto(STAGING_URL);
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: `frontend/e2e-screenshots/traces-${TIMESTAMP}-01-landing.png`,
      fullPage: true
    });
    console.log('✓ Landing page loaded');

    // Step 2: Check if we need to sign in
    console.log('Step 2: Checking authentication status...');
    const currentUrl = page.url();

    if (currentUrl.includes('/sign-in') || currentUrl.includes('accounts.clerk')) {
      console.log('Authentication required, proceeding with sign-in...');

      // Wait for Clerk sign-in form
      await page.waitForSelector('input[name="identifier"], input[type="email"]', { timeout: 10000 });
      await page.screenshot({
        path: `frontend/e2e-screenshots/traces-${TIMESTAMP}-02-signin-form.png`,
        fullPage: true
      });

      // Enter email
      const emailInput = await page.locator('input[name="identifier"], input[type="email"]').first();
      await emailInput.fill(TEST_EMAIL);
      await page.screenshot({
        path: `frontend/e2e-screenshots/traces-${TIMESTAMP}-03-email-filled.png`,
        fullPage: true
      });

      // Click continue/next button
      await page.locator('button:has-text("Continue"), button:has-text("Next")').first().click();
      await page.waitForTimeout(2000);

      // Enter password
      const passwordInput = await page.locator('input[name="password"], input[type="password"]').first();
      await passwordInput.fill(TEST_PASSWORD);
      await page.screenshot({
        path: `frontend/e2e-screenshots/traces-${TIMESTAMP}-04-password-filled.png`,
        fullPage: true
      });

      // Click sign in button
      await page.locator('button:has-text("Continue"), button:has-text("Sign in"), button[type="submit"]').first().click();
      await page.waitForTimeout(3000);

      // Check if OTP is required
      const otpVisible = await page.locator('input[name="code"], input[type="text"][inputmode="numeric"]').isVisible().catch(() => false);
      if (otpVisible) {
        console.log('OTP required, entering code...');
        await page.locator('input[name="code"], input[type="text"][inputmode="numeric"]').first().fill(TEST_OTP);
        await page.screenshot({
          path: `frontend/e2e-screenshots/traces-${TIMESTAMP}-05-otp-filled.png`,
          fullPage: true
        });
        await page.locator('button:has-text("Continue"), button:has-text("Verify"), button[type="submit"]').first().click();
        await page.waitForTimeout(3000);
      }

      // Wait for navigation to complete
      await page.waitForLoadState('networkidle');
      await page.screenshot({
        path: `frontend/e2e-screenshots/traces-${TIMESTAMP}-06-authenticated.png`,
        fullPage: true
      });
      console.log('✓ Authentication successful');
    } else {
      console.log('✓ Already authenticated');
    }

    // Step 3: Navigate to /traces page
    console.log('Step 3: Navigating to /traces page...');
    await page.goto(`${STAGING_URL}/traces`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await page.screenshot({
      path: `frontend/e2e-screenshots/traces-${TIMESTAMP}-07-traces-page.png`,
      fullPage: true
    });
    console.log('✓ Traces page loaded');

    // Step 4: Verify the Traces Explorer page loads
    console.log('Step 4: Verifying Traces Explorer components...');
    const pageTitle = await page.locator('h1, h2').first().textContent();
    console.log(`Page title: ${pageTitle}`);

    // Check for key components
    const hasFilters = await page.locator('[data-testid*="filter"], button:has-text("Filter"), input[placeholder*="filter" i]').count() > 0;
    const hasSearch = await page.locator('[data-testid*="search"], input[placeholder*="search" i], input[type="search"]').count() > 0;
    const hasTraceList = await page.locator('[data-testid*="trace"], table, [role="table"]').count() > 0;

    console.log(`Has filters: ${hasFilters}`);
    console.log(`Has search: ${hasSearch}`);
    console.log(`Has trace list: ${hasTraceList}`);

    await page.screenshot({
      path: `frontend/e2e-screenshots/traces-${TIMESTAMP}-08-explorer-verified.png`,
      fullPage: true
    });

    // Step 5: Test filtering functionality
    console.log('Step 5: Testing filtering functionality...');
    const filterElements = await page.locator('[data-testid*="filter"], button:has-text("Filter"), select, [role="combobox"]').all();

    if (filterElements.length > 0) {
      console.log(`Found ${filterElements.length} filter elements`);
      const firstFilter = filterElements[0];
      await firstFilter.scrollIntoViewIfNeeded();
      await firstFilter.click();
      await page.waitForTimeout(1000);
      await page.screenshot({
        path: `frontend/e2e-screenshots/traces-${TIMESTAMP}-09-filter-opened.png`,
        fullPage: true
      });

      // Try to select a filter option if available
      const filterOptions = await page.locator('[role="option"], [role="menuitem"], option').count();
      if (filterOptions > 0) {
        await page.locator('[role="option"], [role="menuitem"], option').first().click();
        await page.waitForTimeout(2000);
        await page.screenshot({
          path: `frontend/e2e-screenshots/traces-${TIMESTAMP}-10-filter-applied.png`,
          fullPage: true
        });
        console.log('✓ Filter applied');
      }
    } else {
      console.log('No filter elements found on page');
    }

    // Step 6: Test search functionality
    console.log('Step 6: Testing search functionality...');
    const searchInput = await page.locator('[data-testid*="search"], input[placeholder*="search" i], input[type="search"]').first();
    const searchVisible = await searchInput.isVisible().catch(() => false);

    if (searchVisible) {
      await searchInput.scrollIntoViewIfNeeded();
      await searchInput.fill('test query');
      await page.waitForTimeout(1000);
      await page.screenshot({
        path: `frontend/e2e-screenshots/traces-${TIMESTAMP}-11-search-entered.png`,
        fullPage: true
      });

      // Press Enter or wait for search to trigger
      await searchInput.press('Enter');
      await page.waitForTimeout(2000);
      await page.screenshot({
        path: `frontend/e2e-screenshots/traces-${TIMESTAMP}-12-search-results.png`,
        fullPage: true
      });
      console.log('✓ Search executed');
    } else {
      console.log('No search input found on page');
    }

    // Step 7: Click on a trace to view details
    console.log('Step 7: Testing trace detail view...');
    const traceItems = await page.locator('[data-testid*="trace-item"], [data-testid*="trace-row"], tbody tr, [role="row"]').all();

    if (traceItems.length > 1) { // Skip header row
      console.log(`Found ${traceItems.length} trace items`);
      const firstTrace = traceItems[1] || traceItems[0];
      await firstTrace.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await firstTrace.click();
      await page.waitForTimeout(2000);

      await page.screenshot({
        path: `frontend/e2e-screenshots/traces-${TIMESTAMP}-13-trace-detail-panel.png`,
        fullPage: true
      });

      // Check if side panel opened
      const sidePanel = await page.locator('[data-testid*="panel"], [data-testid*="drawer"], [role="dialog"], aside').count();
      console.log(`Side panel/drawer elements found: ${sidePanel}`);

      if (sidePanel > 0) {
        await page.waitForTimeout(1000);
        await page.screenshot({
          path: `frontend/e2e-screenshots/traces-${TIMESTAMP}-14-trace-detail-content.png`,
          fullPage: true
        });
        console.log('✓ Trace detail panel opened');
      }
    } else {
      console.log('No trace items found to click');
      await page.screenshot({
        path: `frontend/e2e-screenshots/traces-${TIMESTAMP}-13-no-traces.png`,
        fullPage: true
      });
    }

    // Final screenshot
    await page.screenshot({
      path: `frontend/e2e-screenshots/traces-${TIMESTAMP}-15-final-state.png`,
      fullPage: true
    });

    console.log('✓ Test completed successfully');
  });
});
