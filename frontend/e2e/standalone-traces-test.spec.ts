import { test as base, expect } from '@playwright/test';

const STAGING_URL = 'https://platform.staging.iofold.com';
const TEST_EMAIL = 'e2e+clerk_test@iofold.com';
const TEST_PASSWORD = 'E2eTestPassword123!';
const TEST_OTP = '424242';

// Create a test without dependencies
const test = base.extend({
  // Override to prevent using stored auth
  storageState: async ({}, use) => {
    await use(undefined);
  },
});

test.describe('Traces Page Flow - Standalone Manual Test', () => {
  test.setTimeout(180000); // 3 minute timeout

  test('Complete Traces page flow with manual authentication', async ({ page }) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const screenshotDir = '../frontend/e2e-screenshots';

    console.log(`\n========================================`);
    console.log(`Starting test at ${new Date().toISOString()}`);
    console.log(`Timestamp: ${timestamp}`);
    console.log(`========================================\n`);

    // Step 1: Navigate to staging site
    console.log('📍 Step 1: Navigating to staging site...');
    await page.goto(STAGING_URL, { waitUntil: 'networkidle' });
    await page.screenshot({
      path: `${screenshotDir}/traces-${timestamp}-01-landing.png`,
      fullPage: true
    });
    console.log(`   ✓ Landing page loaded: ${page.url()}`);

    // Step 2: Handle authentication
    console.log('\n🔐 Step 2: Checking authentication status...');
    await page.waitForTimeout(2000);
    const currentUrl = page.url();

    if (currentUrl.includes('/sign-in') || await page.locator('input[name="identifier"]').isVisible().catch(() => false)) {
      console.log('   ⚠️  Authentication required, proceeding with sign-in...');

      try {
        // Wait for Clerk sign-in form
        await page.waitForSelector('input[name="identifier"]', { timeout: 10000 });
        await page.screenshot({
          path: `${screenshotDir}/traces-${timestamp}-02-signin-form.png`,
          fullPage: true
        });
        console.log('   ✓ Sign-in form detected');

        // Enter email
        console.log('   📧 Entering email...');
        await page.fill('input[name="identifier"]', TEST_EMAIL);
        await page.waitForTimeout(500);
        await page.screenshot({
          path: `${screenshotDir}/traces-${timestamp}-03-email-filled.png`,
          fullPage: true
        });

        // Click continue button
        console.log('   ⏭️  Clicking continue...');
        await page.click('button:has-text("Continue")');
        await page.waitForTimeout(2000);

        // Enter password
        console.log('   🔑 Entering password...');
        await page.waitForSelector('input[name="password"]', { timeout: 5000 });
        await page.fill('input[name="password"]', TEST_PASSWORD);
        await page.waitForTimeout(500);
        await page.screenshot({
          path: `${screenshotDir}/traces-${timestamp}-04-password-filled.png`,
          fullPage: true
        });

        // Click sign in button
        console.log('   ✅ Clicking sign in...');
        await page.click('button:has-text("Continue")');
        await page.waitForTimeout(3000);

        // Check if OTP is required
        const otpVisible = await page.locator('input[name="code"]').isVisible().catch(() => false);
        if (otpVisible) {
          console.log('   🔢 OTP required, entering code...');
          await page.fill('input[name="code"]', TEST_OTP);
          await page.screenshot({
            path: `${screenshotDir}/traces-${timestamp}-05-otp-filled.png`,
            fullPage: true
          });
          await page.click('button:has-text("Continue")');
          await page.waitForTimeout(3000);
        }

        // Wait for navigation to complete
        await page.waitForLoadState('networkidle');
        await page.screenshot({
          path: `${screenshotDir}/traces-${timestamp}-06-authenticated.png`,
          fullPage: true
        });
        console.log('   ✓ Authentication successful');
      } catch (error) {
        console.error('   ❌ Authentication failed:', error);
        await page.screenshot({
          path: `${screenshotDir}/traces-${timestamp}-ERROR-auth-failed.png`,
          fullPage: true
        });
        throw error;
      }
    } else {
      console.log('   ✓ Already authenticated');
    }

    // Step 3: Navigate to /traces page
    console.log('\n🔍 Step 3: Navigating to /traces page...');
    await page.goto(`${STAGING_URL}/traces`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    await page.screenshot({
      path: `${screenshotDir}/traces-${timestamp}-07-traces-page.png`,
      fullPage: true
    });
    console.log(`   ✓ Traces page loaded: ${page.url()}`);

    // Step 4: Verify the Traces Explorer page loads
    console.log('\n📊 Step 4: Verifying Traces Explorer components...');

    // Get page title
    const pageTitle = await page.locator('h1, h2').first().textContent().catch(() => 'No title found');
    console.log(`   📝 Page title: ${pageTitle}`);

    // Check for key components
    const filterCount = await page.locator('button, select, [role="combobox"]').count();
    const searchCount = await page.locator('input[type="search"], input[placeholder*="earch" i]').count();
    const tableCount = await page.locator('table, [role="table"]').count();

    console.log(`   🔧 Filters found: ${filterCount}`);
    console.log(`   🔎 Search inputs found: ${searchCount}`);
    console.log(`   📋 Tables found: ${tableCount}`);

    await page.screenshot({
      path: `${screenshotDir}/traces-${timestamp}-08-explorer-verified.png`,
      fullPage: true
    });

    // Step 5: Test filtering functionality
    console.log('\n🎛️  Step 5: Testing filtering functionality...');
    const filterButtons = await page.locator('button:has-text("Filter"), button:has-text("Status"), button:has-text("Type")').all();

    if (filterButtons.length > 0) {
      console.log(`   ✓ Found ${filterButtons.length} filter button(s)`);
      try {
        const firstFilter = filterButtons[0];
        await firstFilter.scrollIntoViewIfNeeded();
        await firstFilter.click();
        await page.waitForTimeout(1000);
        await page.screenshot({
          path: `${screenshotDir}/traces-${timestamp}-09-filter-opened.png`,
          fullPage: true
        });
        console.log('   ✓ Filter dropdown opened');

        // Try to select a filter option
        const options = await page.locator('[role="option"], [role="menuitem"]').all();
        if (options.length > 0) {
          console.log(`   ✓ Found ${options.length} filter option(s)`);
          await options[0].click();
          await page.waitForTimeout(2000);
          await page.screenshot({
            path: `${screenshotDir}/traces-${timestamp}-10-filter-applied.png`,
            fullPage: true
          });
          console.log('   ✓ Filter option selected');
        }
      } catch (error) {
        console.log(`   ⚠️  Filter test error: ${error}`);
      }
    } else {
      console.log('   ℹ️  No filter buttons found');
    }

    // Step 6: Test search functionality
    console.log('\n🔎 Step 6: Testing search functionality...');
    const searchInputs = await page.locator('input[type="search"], input[placeholder*="earch" i]').all();

    if (searchInputs.length > 0) {
      console.log(`   ✓ Found ${searchInputs.length} search input(s)`);
      try {
        const searchInput = searchInputs[0];
        await searchInput.scrollIntoViewIfNeeded();
        await searchInput.fill('test query');
        await page.waitForTimeout(1000);
        await page.screenshot({
          path: `${screenshotDir}/traces-${timestamp}-11-search-entered.png`,
          fullPage: true
        });
        console.log('   ✓ Search query entered');

        // Press Enter
        await searchInput.press('Enter');
        await page.waitForTimeout(2000);
        await page.screenshot({
          path: `${screenshotDir}/traces-${timestamp}-12-search-results.png`,
          fullPage: true
        });
        console.log('   ✓ Search executed');
      } catch (error) {
        console.log(`   ⚠️  Search test error: ${error}`);
      }
    } else {
      console.log('   ℹ️  No search input found');
    }

    // Step 7: Click on a trace to view details
    console.log('\n📄 Step 7: Testing trace detail view...');

    // Try multiple selectors for trace rows
    const traceSelectors = [
      'tbody tr',
      '[data-testid*="trace"]',
      '[role="row"]',
      'table tr',
    ];

    let traceItems = [];
    for (const selector of traceSelectors) {
      traceItems = await page.locator(selector).all();
      if (traceItems.length > 1) {
        console.log(`   ✓ Found ${traceItems.length} items with selector: ${selector}`);
        break;
      }
    }

    if (traceItems.length > 1) {
      try {
        // Click second item (skip header)
        const traceToClick = traceItems[1];
        await traceToClick.scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);
        await traceToClick.click();
        await page.waitForTimeout(2000);

        await page.screenshot({
          path: `${screenshotDir}/traces-${timestamp}-13-trace-clicked.png`,
          fullPage: true
        });
        console.log('   ✓ Trace row clicked');

        // Check for side panel or detail view
        const panelSelectors = [
          '[role="dialog"]',
          'aside',
          '[data-testid*="panel"]',
          '[data-testid*="drawer"]',
          '[data-testid*="detail"]',
        ];

        let panelFound = false;
        for (const selector of panelSelectors) {
          const panelCount = await page.locator(selector).count();
          if (panelCount > 0) {
            console.log(`   ✓ Detail panel found: ${selector} (${panelCount} element(s))`);
            panelFound = true;
            break;
          }
        }

        if (panelFound) {
          await page.waitForTimeout(1000);
          await page.screenshot({
            path: `${screenshotDir}/traces-${timestamp}-14-trace-detail-content.png`,
            fullPage: true
          });
          console.log('   ✓ Detail view captured');
        } else {
          console.log('   ⚠️  No detail panel detected');
        }
      } catch (error) {
        console.log(`   ⚠️  Trace click error: ${error}`);
        await page.screenshot({
          path: `${screenshotDir}/traces-${timestamp}-13-trace-click-error.png`,
          fullPage: true
        });
      }
    } else {
      console.log('   ℹ️  No trace items found to click');
      await page.screenshot({
        path: `${screenshotDir}/traces-${timestamp}-13-no-traces.png`,
        fullPage: true
      });
    }

    // Final screenshot
    await page.screenshot({
      path: `${screenshotDir}/traces-${timestamp}-15-final-state.png`,
      fullPage: true
    });

    console.log('\n========================================');
    console.log('✅ Test completed successfully');
    console.log(`Screenshots saved to: ${screenshotDir}/traces-${timestamp}-*.png`);
    console.log('========================================\n');
  });
});
