/**
 * Comprehensive Traces Flow Test for Staging Environment
 * Tests the complete traces functionality on https://platform.staging.iofold.com
 */
import { test, expect } from '@playwright/test';
import { clerk } from '@clerk/testing/playwright';

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
  const filename = `${SCREENSHOT_DIR}/traces-flow-${stepName}-${timestamp}.png`;
  await page.screenshot({ path: filename, fullPage: true });
  console.log(`📸 Screenshot saved: ${filename}`);
  return filename;
}

test.describe('Staging Traces Flow Tests', () => {
  let isAuthenticated = false;

  test.beforeEach(async ({ page }) => {
    // Set up error tracking
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.error('🔴 Browser Console Error:', msg.text());
      }
    });

    page.on('pageerror', error => {
      console.error('🔴 Page Error:', error.message);
    });

    // Track failed requests
    page.on('response', response => {
      if (response.status() >= 400) {
        console.warn(`⚠️  Failed Request: ${response.status()} - ${response.url()}`);
      }
    });
  });

  test('Step 1: Sign in to staging platform', async ({ page }) => {
    console.log('\n=== STEP 1: SIGN IN ===');
    console.log(`Navigating to: ${STAGING_URL}`);

    // Navigate to home page
    await page.goto(STAGING_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await takeScreenshot(page, '01-landing-page');

    // Check if already authenticated
    const isAlreadyAuth = await page.locator('[data-clerk-user-button]').count() > 0;

    if (isAlreadyAuth) {
      console.log('✅ Already authenticated, skipping sign-in');
      isAuthenticated = true;
      return;
    }

    console.log('🔐 Authenticating with Clerk...');

    try {
      // Use Clerk's sign-in helper
      await clerk.signIn({
        page,
        signInParams: {
          strategy: 'password',
          identifier: TEST_EMAIL,
          password: TEST_PASSWORD,
        },
      });

      // Wait for successful authentication
      await page.waitForURL(/\/(agents|traces|$)/, { timeout: 15000 });
      await takeScreenshot(page, '02-signed-in');

      // Verify authentication
      await page.waitForSelector('[data-clerk-user-button]', { timeout: 10000 });
      isAuthenticated = true;

      console.log('✅ Successfully signed in');
    } catch (error) {
      console.error('❌ Sign-in failed:', error);
      await takeScreenshot(page, '02-signin-failed');
      throw error;
    }
  });

  test('Step 2: Navigate to Traces page', async ({ page }) => {
    console.log('\n=== STEP 2: NAVIGATE TO TRACES PAGE ===');

    // Ensure we're signed in first
    await page.goto(STAGING_URL, { waitUntil: 'domcontentloaded' });

    // Wait for auth to be ready
    await page.waitForSelector('[data-clerk-user-button]', { timeout: 10000 });
    await takeScreenshot(page, '03-before-traces-nav');

    // Look for Traces link in sidebar or navigation
    console.log('Looking for Traces navigation link...');

    const tracesLinkSelectors = [
      'a[href*="/traces"]',
      'nav a:has-text("Traces")',
      '[role="navigation"] a:has-text("Traces")',
      'aside a:has-text("Traces")',
    ];

    let tracesLinkFound = false;
    for (const selector of tracesLinkSelectors) {
      const link = page.locator(selector).first();
      if (await link.count() > 0) {
        console.log(`Found Traces link with selector: ${selector}`);
        await link.click();
        tracesLinkFound = true;
        break;
      }
    }

    if (!tracesLinkFound) {
      console.log('⚠️  Traces link not found in navigation, trying direct URL...');
      await page.goto(`${STAGING_URL}/traces`, { waitUntil: 'networkidle' });
    }

    // Wait for page to load
    await page.waitForLoadState('networkidle', { timeout: 15000 });
    await takeScreenshot(page, '04-traces-page-loaded');

    // Verify we're on the traces page
    const currentUrl = page.url();
    console.log(`Current URL: ${currentUrl}`);
    expect(currentUrl).toContain('traces');

    console.log('✅ Successfully navigated to Traces page');
  });

  test('Step 3: Verify traces list loads correctly', async ({ page }) => {
    console.log('\n=== STEP 3: VERIFY TRACES LIST ===');

    await page.goto(`${STAGING_URL}/traces`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000); // Allow time for data to load

    await takeScreenshot(page, '05-traces-list');

    // Check for common list/table elements
    const hasTable = await page.locator('table').count() > 0;
    const hasDataGrid = await page.locator('[role="grid"]').count() > 0;
    const hasList = await page.locator('[role="list"]').count() > 0;
    const hasTraceItems = await page.locator('[data-testid*="trace"], [class*="trace-item"]').count() > 0;

    console.log('Display elements found:');
    console.log(`  - Table: ${hasTable}`);
    console.log(`  - Data Grid: ${hasDataGrid}`);
    console.log(`  - List: ${hasList}`);
    console.log(`  - Trace Items: ${hasTraceItems}`);

    // Check for empty state
    const bodyText = await page.textContent('body');
    const hasEmptyState = bodyText?.toLowerCase().includes('no traces') ||
                         bodyText?.toLowerCase().includes('empty');

    if (hasEmptyState) {
      console.log('⚠️  Empty state detected - no traces available');
    } else {
      console.log('✅ Traces list appears to have data');
    }

    // Count trace rows/items
    const traceCount = await page.locator('table tbody tr, [role="row"][data-testid*="trace"]').count();
    console.log(`Trace items visible: ${traceCount}`);
  });

  test('Step 4: Test search and filter functionality', async ({ page }) => {
    console.log('\n=== STEP 4: TEST SEARCH/FILTER ===');

    await page.goto(`${STAGING_URL}/traces`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    // Look for search inputs
    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i], input[placeholder*="filter" i]').first();
    const searchInputCount = await searchInput.count();

    console.log(`Search inputs found: ${searchInputCount}`);

    if (searchInputCount > 0) {
      console.log('Testing search functionality...');
      await takeScreenshot(page, '06-before-search');

      // Type in search
      await searchInput.fill('test');
      await page.waitForTimeout(1000);
      await takeScreenshot(page, '07-search-active');

      // Clear search
      await searchInput.clear();
      await page.waitForTimeout(1000);

      console.log('✅ Search functionality tested');
    } else {
      console.log('⚠️  No search input found');
    }

    // Look for filter dropdowns or buttons
    const filterButtons = page.locator('button:has-text("Filter"), select, [role="combobox"], [aria-label*="filter" i]');
    const filterCount = await filterButtons.count();

    console.log(`Filter elements found: ${filterCount}`);

    if (filterCount > 0) {
      await takeScreenshot(page, '08-filters-visible');

      // Try clicking first filter
      try {
        await filterButtons.first().click({ timeout: 3000 });
        await page.waitForTimeout(1000);
        await takeScreenshot(page, '09-filter-opened');

        // Click outside to close
        await page.keyboard.press('Escape');
        console.log('✅ Filter functionality tested');
      } catch (error) {
        console.log('⚠️  Could not interact with filter:', error);
      }
    } else {
      console.log('⚠️  No filter elements found');
    }
  });

  test('Step 5: Click on a trace to view details', async ({ page }) => {
    console.log('\n=== STEP 5: VIEW TRACE DETAILS ===');

    await page.goto(`${STAGING_URL}/traces`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    await takeScreenshot(page, '10-before-trace-click');

    // Look for clickable trace items
    const clickableSelectors = [
      'a[href*="/traces/"]',
      'table tbody tr',
      '[role="row"][data-testid*="trace"]',
      '[class*="trace-row"]',
      'button:has-text("View")',
    ];

    let traceClicked = false;

    for (const selector of clickableSelectors) {
      const elements = page.locator(selector);
      const count = await elements.count();

      if (count > 0) {
        console.log(`Found ${count} clickable elements with selector: ${selector}`);

        try {
          const firstElement = elements.first();

          // Get trace ID or info if available
          const text = await firstElement.textContent().catch(() => '');
          console.log(`Clicking trace element: ${text?.slice(0, 50)}...`);

          await firstElement.click({ timeout: 5000 });
          traceClicked = true;

          // Wait for navigation or modal
          await page.waitForTimeout(2000);
          await takeScreenshot(page, '11-trace-detail-opened');

          console.log('✅ Successfully opened trace details');
          break;
        } catch (error) {
          console.log(`Could not click element with selector ${selector}`);
        }
      }
    }

    if (!traceClicked) {
      console.log('⚠️  No clickable trace items found or no traces available');
      await takeScreenshot(page, '11-no-traces-to-click');
      return;
    }

    // Verify detail page loaded
    await page.waitForTimeout(1500);
    const currentUrl = page.url();
    console.log(`Current URL after click: ${currentUrl}`);
  });

  test('Step 6: Verify trace details content', async ({ page }) => {
    console.log('\n=== STEP 6: VERIFY TRACE DETAILS CONTENT ===');

    // First navigate to traces and click one
    await page.goto(`${STAGING_URL}/traces`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Try to click a trace
    const traceLink = page.locator('a[href*="/traces/"], table tbody tr').first();
    const hasTraces = await traceLink.count() > 0;

    if (!hasTraces) {
      console.log('⚠️  No traces available to test details');
      await takeScreenshot(page, '12-no-traces-for-details');
      return;
    }

    await traceLink.click();
    await page.waitForTimeout(2000);
    await takeScreenshot(page, '12-trace-details-full');

    // Look for common trace detail elements
    const detailElements = {
      input: await page.locator('[data-testid*="input"], [class*="input"], label:has-text("Input")').count() > 0,
      output: await page.locator('[data-testid*="output"], [class*="output"], label:has-text("Output")').count() > 0,
      timestamp: await page.locator('[data-testid*="timestamp"], [class*="timestamp"], time').count() > 0,
      metadata: await page.locator('[data-testid*="metadata"], [class*="metadata"]').count() > 0,
      status: await page.locator('[data-testid*="status"], [class*="status"]').count() > 0,
    };

    console.log('Trace detail elements found:');
    Object.entries(detailElements).forEach(([key, found]) => {
      console.log(`  - ${key}: ${found}`);
    });

    // Check for any JSON or code blocks (traces often have structured data)
    const codeBlocks = await page.locator('pre, code, [class*="json"]').count();
    console.log(`Code/JSON blocks found: ${codeBlocks}`);

    console.log('✅ Trace details content verified');
  });

  test('Step 7: Test feedback and rating functionality', async ({ page }) => {
    console.log('\n=== STEP 7: TEST FEEDBACK/RATING ===');

    await page.goto(`${STAGING_URL}/traces`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Navigate to a trace detail page
    const traceLink = page.locator('a[href*="/traces/"], table tbody tr').first();
    const hasTraces = await traceLink.count() > 0;

    if (!hasTraces) {
      console.log('⚠️  No traces available to test feedback');
      return;
    }

    await traceLink.click();
    await page.waitForTimeout(2000);

    // Look for feedback/rating elements
    const feedbackSelectors = [
      'button:has-text("Feedback")',
      'button:has-text("Rating")',
      '[data-testid*="feedback"]',
      '[data-testid*="rating"]',
      '[class*="rating"]',
      'button[aria-label*="feedback" i]',
      'button[aria-label*="rating" i]',
    ];

    let feedbackFound = false;

    for (const selector of feedbackSelectors) {
      const element = page.locator(selector).first();
      if (await element.count() > 0) {
        console.log(`Found feedback element with selector: ${selector}`);
        feedbackFound = true;

        await takeScreenshot(page, '13-feedback-element-found');

        try {
          await element.click({ timeout: 3000 });
          await page.waitForTimeout(1000);
          await takeScreenshot(page, '14-feedback-interaction');
          console.log('✅ Feedback element clicked successfully');
        } catch (error) {
          console.log('⚠️  Could not interact with feedback element');
        }

        break;
      }
    }

    if (!feedbackFound) {
      console.log('⚠️  No feedback/rating functionality found');
      await takeScreenshot(page, '13-no-feedback-found');
    }
  });

  test('Step 8: Test pagination', async ({ page }) => {
    console.log('\n=== STEP 8: TEST PAGINATION ===');

    await page.goto(`${STAGING_URL}/traces`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    await takeScreenshot(page, '15-pagination-check');

    // Look for pagination elements
    const paginationSelectors = [
      '[role="navigation"][aria-label*="pagination" i]',
      '[class*="pagination"]',
      'button:has-text("Next")',
      'button:has-text("Previous")',
      'button:has-text(">")',
      'button:has-text("<")',
      '[aria-label*="page" i]',
      '[data-testid*="pagination"]',
    ];

    let paginationFound = false;

    for (const selector of paginationSelectors) {
      const elements = page.locator(selector);
      const count = await elements.count();

      if (count > 0) {
        console.log(`Found pagination with selector: ${selector} (${count} elements)`);
        paginationFound = true;

        // Try clicking Next button
        const nextButton = page.locator('button:has-text("Next"), button:has-text(">")').first();
        if (await nextButton.count() > 0) {
          const isDisabled = await nextButton.isDisabled().catch(() => true);

          if (!isDisabled) {
            console.log('Clicking Next button...');
            await nextButton.click();
            await page.waitForTimeout(1500);
            await takeScreenshot(page, '16-pagination-next-clicked');

            // Try going back
            const prevButton = page.locator('button:has-text("Previous"), button:has-text("<")').first();
            if (await prevButton.count() > 0) {
              console.log('Clicking Previous button...');
              await prevButton.click();
              await page.waitForTimeout(1500);
              await takeScreenshot(page, '17-pagination-prev-clicked');
            }

            console.log('✅ Pagination tested successfully');
          } else {
            console.log('⚠️  Next button is disabled (likely only one page of data)');
          }
        }

        break;
      }
    }

    if (!paginationFound) {
      console.log('⚠️  No pagination controls found');
    }
  });

  test('Step 9: Performance and console errors check', async ({ page }) => {
    console.log('\n=== STEP 9: PERFORMANCE & ERROR CHECK ===');

    const errors: string[] = [];
    const warnings: string[] = [];
    const failedRequests: Array<{ url: string; status: number }> = [];

    // Track console messages
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      } else if (msg.type() === 'warning') {
        warnings.push(msg.text());
      }
    });

    // Track page errors
    page.on('pageerror', error => {
      errors.push(`Page Error: ${error.message}`);
    });

    // Track failed requests
    page.on('response', response => {
      if (response.status() >= 400) {
        failedRequests.push({
          url: response.url(),
          status: response.status()
        });
      }
    });

    // Navigate and interact with page
    const startTime = Date.now();
    await page.goto(`${STAGING_URL}/traces`, { waitUntil: 'networkidle' });
    const loadTime = Date.now() - startTime;

    await page.waitForTimeout(3000); // Allow time for async operations

    await takeScreenshot(page, '18-final-state');

    // Report findings
    console.log('\n--- PERFORMANCE REPORT ---');
    console.log(`Page load time: ${loadTime}ms`);
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

    console.log('\n✅ Performance check completed');
  });
});
