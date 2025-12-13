import { test, expect, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const STAGING_URL = 'https://platform.staging.iofold.com';
const SCREENSHOTS_DIR = '/home/ygupta/workspace/iofold/.tmp/e2e-screenshots';
const TEST_EMAIL = 'e2e-test@iofold.com';
const TEST_PASSWORD = 'zI76O83k(%xsM';

// Helper to get timestamp for screenshots
function getTimestamp(): string {
  const now = new Date();
  return now.toISOString().replace(/[:.]/g, '-').slice(0, -5);
}

// Helper to take screenshot with timestamp
async function takeScreenshot(page: Page, name: string) {
  const timestamp = getTimestamp();
  const filename = `${timestamp}_${name}.png`;
  await page.screenshot({
    path: path.join(SCREENSHOTS_DIR, filename),
    fullPage: true
  });
  console.log(`Screenshot saved: ${filename}`);
  return filename;
}

// Helper to wait for any network activity to settle
async function waitForNetworkIdle(page: Page, timeout = 5000) {
  try {
    await page.waitForLoadState('networkidle', { timeout });
  } catch (e) {
    // Continue even if timeout - some pages may have long polling
  }
}

test.describe('Analytics and Matrix Analysis Pages - Comprehensive Testing', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();

    // Step 1: Navigate to sign-in
    console.log('Navigating to sign-in page...');
    await page.goto(`${STAGING_URL}/sign-in`);
    await page.waitForLoadState('domcontentloaded');
    await takeScreenshot(page, 'signin-page-loaded');

    // Step 2: Authenticate
    console.log('Attempting authentication...');

    // Try to find email input with multiple selectors
    const emailInput = page.locator('input[type="email"], input[name="email"], input[name="identifier"], input[placeholder*="email" i]').first();
    await emailInput.waitFor({ state: 'visible', timeout: 10000 });
    await emailInput.fill(TEST_EMAIL);
    await takeScreenshot(page, 'email-entered');

    // Look for continue/next button
    const continueButton = page.locator('button:has-text("Continue"), button:has-text("Next"), button[type="submit"]').first();
    await continueButton.click();
    await page.waitForTimeout(2000);
    await takeScreenshot(page, 'after-email-submit');

    // Try to find password input
    const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
    await passwordInput.waitFor({ state: 'visible', timeout: 10000 });
    await passwordInput.fill(TEST_PASSWORD);
    await takeScreenshot(page, 'password-entered');

    // Submit password
    const signInButton = page.locator('button:has-text("Sign in"), button:has-text("Continue"), button[type="submit"]').first();
    await signInButton.click();

    // Wait for successful authentication
    await page.waitForURL(/\/(dashboard|agents|analytics|matrix)/, { timeout: 30000 });
    await waitForNetworkIdle(page);
    await takeScreenshot(page, 'authentication-successful');
    console.log('Authentication successful!');
  });

  test('Analytics Page - Comprehensive Testing', async () => {
    console.log('\n=== TESTING ANALYTICS PAGE ===\n');

    // Navigate to analytics page
    await page.goto(`${STAGING_URL}/analytics`);
    await waitForNetworkIdle(page);
    await page.waitForTimeout(2000);
    await takeScreenshot(page, 'analytics-page-initial');

    // Test 1: Page loads correctly
    console.log('Test 1: Checking page load...');
    const pageTitle = await page.textContent('h1, h2, [data-testid="page-title"]').catch(() => null);
    console.log(`Page title: ${pageTitle}`);

    // Test 2: Check for charts/data visualizations
    console.log('Test 2: Checking for charts/visualizations...');
    const charts = await page.locator('canvas, svg[class*="chart"], [data-testid*="chart"], [class*="recharts"]').count();
    console.log(`Found ${charts} chart elements`);
    await takeScreenshot(page, 'analytics-charts-visible');

    // Test 3: Check for data tables
    console.log('Test 3: Checking for data tables...');
    const tables = await page.locator('table, [role="table"], [class*="table"]').count();
    console.log(`Found ${tables} table elements`);

    // Test 4: Check for filters/date selectors
    console.log('Test 4: Checking for filters and date selectors...');
    const filters = await page.locator('select, [role="combobox"], input[type="date"], [class*="filter"], [class*="select"]').count();
    console.log(`Found ${filters} filter/selector elements`);

    if (filters > 0) {
      await takeScreenshot(page, 'analytics-filters-visible');

      // Try to interact with first filter
      const firstFilter = page.locator('select, [role="combobox"]').first();
      if (await firstFilter.count() > 0) {
        await firstFilter.click();
        await page.waitForTimeout(1000);
        await takeScreenshot(page, 'analytics-filter-opened');
        await page.keyboard.press('Escape');
      }
    }

    // Test 5: Try to interact with charts (hover, click)
    console.log('Test 5: Testing chart interactions...');
    const firstChart = page.locator('canvas, svg[class*="chart"]').first();
    if (await firstChart.count() > 0) {
      const chartBox = await firstChart.boundingBox();
      if (chartBox) {
        // Hover over different parts of the chart
        await page.mouse.move(chartBox.x + chartBox.width * 0.3, chartBox.y + chartBox.height * 0.5);
        await page.waitForTimeout(1000);
        await takeScreenshot(page, 'analytics-chart-hover-1');

        await page.mouse.move(chartBox.x + chartBox.width * 0.7, chartBox.y + chartBox.height * 0.5);
        await page.waitForTimeout(1000);
        await takeScreenshot(page, 'analytics-chart-hover-2');

        // Try clicking on chart
        await page.mouse.click(chartBox.x + chartBox.width * 0.5, chartBox.y + chartBox.height * 0.5);
        await page.waitForTimeout(1000);
        await takeScreenshot(page, 'analytics-chart-click');
      }
    }

    // Test 6: Check for loading states or errors
    console.log('Test 6: Checking for loading states or errors...');
    const loadingIndicators = await page.locator('[data-testid*="loading"], [class*="loading"], [class*="spinner"]').count();
    const errorMessages = await page.locator('[role="alert"], [class*="error"]').count();
    console.log(`Loading indicators: ${loadingIndicators}, Error messages: ${errorMessages}`);

    if (errorMessages > 0) {
      await takeScreenshot(page, 'analytics-error-found');
      const errorText = await page.locator('[role="alert"], [class*="error"]').first().textContent();
      console.log(`Error message: ${errorText}`);
    }

    // Test 7: Check page responsiveness
    console.log('Test 7: Testing page responsiveness...');
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(1000);
    await takeScreenshot(page, 'analytics-tablet-view');

    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(1000);
    await takeScreenshot(page, 'analytics-mobile-view');

    // Reset to desktop
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(1000);

    // Test 8: Check for export/download buttons
    console.log('Test 8: Checking for export/download functionality...');
    const exportButtons = await page.locator('button:has-text("Export"), button:has-text("Download"), [data-testid*="export"]').count();
    console.log(`Found ${exportButtons} export buttons`);

    if (exportButtons > 0) {
      await takeScreenshot(page, 'analytics-export-button-visible');
    }

    // Test 9: Scroll through entire page
    console.log('Test 9: Scrolling through entire page...');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await page.waitForTimeout(1000);
    await takeScreenshot(page, 'analytics-scrolled-middle');

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);
    await takeScreenshot(page, 'analytics-scrolled-bottom');

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);

    console.log('Analytics page testing complete!\n');
  });

  test('Matrix Analysis Page - Comprehensive Testing', async () => {
    console.log('\n=== TESTING MATRIX ANALYSIS PAGE ===\n');

    // Navigate to matrix page
    await page.goto(`${STAGING_URL}/matrix`);
    await waitForNetworkIdle(page);
    await page.waitForTimeout(2000);
    await takeScreenshot(page, 'matrix-page-initial');

    // Test 1: Page loads correctly
    console.log('Test 1: Checking page load...');
    const pageTitle = await page.textContent('h1, h2, [data-testid="page-title"]').catch(() => null);
    console.log(`Page title: ${pageTitle}`);

    // Test 2: Check for matrix view/grid
    console.log('Test 2: Checking for matrix view...');
    const matrixElements = await page.locator('[class*="matrix"], [class*="grid"], table, [role="grid"]').count();
    console.log(`Found ${matrixElements} matrix/grid elements`);
    await takeScreenshot(page, 'matrix-view-visible');

    // Test 3: Check for agent/eval selectors
    console.log('Test 3: Checking for agent/eval selectors...');
    const selectors = await page.locator('select, [role="combobox"], [class*="select"], [data-testid*="selector"]').count();
    console.log(`Found ${selectors} selector elements`);

    if (selectors > 0) {
      await takeScreenshot(page, 'matrix-selectors-visible');

      // Try to interact with first selector
      const firstSelector = page.locator('select, [role="combobox"]').first();
      if (await firstSelector.count() > 0) {
        await firstSelector.click();
        await page.waitForTimeout(1000);
        await takeScreenshot(page, 'matrix-selector-opened');

        // Try to select an option
        const options = await page.locator('[role="option"], option').count();
        if (options > 0) {
          await page.locator('[role="option"], option').nth(1).click().catch(() => {});
          await page.waitForTimeout(2000);
          await waitForNetworkIdle(page);
          await takeScreenshot(page, 'matrix-after-selection');
        } else {
          await page.keyboard.press('Escape');
        }
      }
    }

    // Test 4: Check for color coding/legend
    console.log('Test 4: Checking for color coding explanation/legend...');
    const legend = await page.locator('[class*="legend"], [data-testid*="legend"], [class*="color-scale"]').count();
    console.log(`Found ${legend} legend elements`);

    if (legend > 0) {
      await takeScreenshot(page, 'matrix-legend-visible');
    }

    // Test 5: Test cell interactions
    console.log('Test 5: Testing matrix cell interactions...');
    const cells = await page.locator('td, [role="gridcell"], [class*="cell"]').count();
    console.log(`Found ${cells} cell elements`);

    if (cells > 0) {
      // Hover over first few cells
      for (let i = 0; i < Math.min(3, cells); i++) {
        const cell = page.locator('td, [role="gridcell"], [class*="cell"]').nth(i);
        await cell.hover();
        await page.waitForTimeout(1000);
        await takeScreenshot(page, `matrix-cell-${i}-hover`);
      }

      // Click on a cell to view details
      const clickableCell = page.locator('td[role="button"], [role="gridcell"][role*="button"], td[class*="clickable"], [class*="cell"][class*="clickable"]').first();
      if (await clickableCell.count() > 0) {
        await clickableCell.click();
        await page.waitForTimeout(2000);
        await takeScreenshot(page, 'matrix-cell-clicked-details');

        // Check if modal/drawer opened
        const modal = await page.locator('[role="dialog"], [class*="modal"], [class*="drawer"]').count();
        if (modal > 0) {
          console.log('Modal/drawer opened after cell click');
          await takeScreenshot(page, 'matrix-details-modal');

          // Close modal
          const closeButton = page.locator('button[aria-label*="close" i], button:has-text("Close"), [data-testid*="close"]').first();
          if (await closeButton.count() > 0) {
            await closeButton.click();
            await page.waitForTimeout(1000);
          } else {
            await page.keyboard.press('Escape');
            await page.waitForTimeout(1000);
          }
        }
      } else {
        // Try clicking any cell
        await page.locator('td, [role="gridcell"]').first().click();
        await page.waitForTimeout(2000);
        await takeScreenshot(page, 'matrix-any-cell-clicked');
      }
    }

    // Test 6: Check for filter options
    console.log('Test 6: Checking for filter options...');
    const filters = await page.locator('[class*="filter"], input[type="search"], input[placeholder*="filter" i]').count();
    console.log(`Found ${filters} filter elements`);

    if (filters > 0) {
      await takeScreenshot(page, 'matrix-filters-visible');

      // Try using a filter
      const filterInput = page.locator('input[type="search"], input[placeholder*="filter" i]').first();
      if (await filterInput.count() > 0) {
        await filterInput.fill('test');
        await page.waitForTimeout(2000);
        await takeScreenshot(page, 'matrix-filter-applied');
        await filterInput.clear();
        await page.waitForTimeout(1000);
      }
    }

    // Test 7: Check for export functionality
    console.log('Test 7: Checking for export functionality...');
    const exportButtons = await page.locator('button:has-text("Export"), button:has-text("Download"), [data-testid*="export"]').count();
    console.log(`Found ${exportButtons} export buttons`);

    if (exportButtons > 0) {
      await takeScreenshot(page, 'matrix-export-button-visible');

      // Try clicking export button
      const exportBtn = page.locator('button:has-text("Export"), button:has-text("Download")').first();
      await exportBtn.click();
      await page.waitForTimeout(2000);
      await takeScreenshot(page, 'matrix-export-clicked');
    }

    // Test 8: Check for loading states or errors
    console.log('Test 8: Checking for loading states or errors...');
    const loadingIndicators = await page.locator('[data-testid*="loading"], [class*="loading"], [class*="spinner"]').count();
    const errorMessages = await page.locator('[role="alert"], [class*="error"]').count();
    console.log(`Loading indicators: ${loadingIndicators}, Error messages: ${errorMessages}`);

    if (errorMessages > 0) {
      await takeScreenshot(page, 'matrix-error-found');
      const errorText = await page.locator('[role="alert"], [class*="error"]').first().textContent();
      console.log(`Error message: ${errorText}`);
    }

    // Test 9: Check page responsiveness
    console.log('Test 9: Testing page responsiveness...');
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(1000);
    await takeScreenshot(page, 'matrix-tablet-view');

    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(1000);
    await takeScreenshot(page, 'matrix-mobile-view');

    // Reset to desktop
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.waitForTimeout(1000);

    // Test 10: Scroll through entire page
    console.log('Test 10: Scrolling through entire page...');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await page.waitForTimeout(1000);
    await takeScreenshot(page, 'matrix-scrolled-middle');

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);
    await takeScreenshot(page, 'matrix-scrolled-bottom');

    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);

    // Test 11: Check for tooltips or help text
    console.log('Test 11: Checking for tooltips or help text...');
    const helpIcons = await page.locator('[data-testid*="help"], [aria-label*="help" i], [class*="tooltip"]').count();
    console.log(`Found ${helpIcons} help/tooltip elements`);

    if (helpIcons > 0) {
      const helpIcon = page.locator('[data-testid*="help"], [aria-label*="help" i]').first();
      await helpIcon.hover();
      await page.waitForTimeout(2000);
      await takeScreenshot(page, 'matrix-help-tooltip');
    }

    console.log('Matrix page testing complete!\n');
  });

  test.afterAll(async () => {
    await page.close();
    console.log('\nAll tests completed! Check screenshots and findings document.');
  });
});
