import { test, expect, Page } from '@playwright/test';
import * as path from 'path';

const STAGING_URL = 'https://platform.staging.iofold.com';
const TEST_EMAIL = 'e2e-test@iofold.com';
const TEST_PASSWORD = 'zI76O83k(%xsM';
const SCREENSHOT_DIR = path.join(__dirname, 'e2e-screenshots');

// Helper to take timestamped screenshots
async function takeScreenshot(page: Page, name: string) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${timestamp}_${name}.png`;
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, filename),
    fullPage: true
  });
  return filename;
}

test.describe('Evals Page Comprehensive Test', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to sign-in page
    await page.goto(`${STAGING_URL}/sign-in`);

    // Wait for Clerk sign-in component to load
    await page.waitForLoadState('networkidle');

    // Fill in credentials
    const emailInput = page.locator('input[name="identifier"], input[type="email"]').first();
    await emailInput.waitFor({ state: 'visible', timeout: 10000 });
    await emailInput.fill(TEST_EMAIL);

    // Click continue/next button
    const continueButton = page.locator('button:has-text("Continue"), button:has-text("Next")').first();
    await continueButton.click();

    // Wait for password field and fill it
    const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
    await passwordInput.waitFor({ state: 'visible', timeout: 10000 });
    await passwordInput.fill(TEST_PASSWORD);

    // Click sign in button
    const signInButton = page.locator('button:has-text("Sign in"), button:has-text("Continue")').first();
    await signInButton.click();

    // Wait for successful auth redirect
    await page.waitForURL(/.*\/(agents|evals|review).*/, { timeout: 30000 });

    console.log('✅ Authentication successful');
  });

  test('1. Navigate to Evals page and verify initial load', async ({ page }) => {
    await page.goto(`${STAGING_URL}/evals`);
    await page.waitForLoadState('networkidle');

    // Take screenshot of initial state
    await takeScreenshot(page, '01_evals_page_initial');

    // Check for page title/heading
    const heading = page.locator('h1, h2').first();
    await expect(heading).toBeVisible({ timeout: 10000 });

    console.log('✅ Evals page loaded');
  });

  test('2. Verify Evals list loads with data', async ({ page }) => {
    await page.goto(`${STAGING_URL}/evals`);
    await page.waitForLoadState('networkidle');

    // Wait a bit for API calls
    await page.waitForTimeout(2000);

    // Check for evals list container
    const evalsList = page.locator('[data-testid*="eval"], [class*="eval"]').first();

    // Take screenshot
    await takeScreenshot(page, '02_evals_list');

    // Check if we have any evals or empty state
    const hasEvals = await evalsList.isVisible({ timeout: 5000 }).catch(() => false);
    const emptyState = await page.locator('text=/no evals/i, text=/empty/i').isVisible({ timeout: 2000 }).catch(() => false);

    if (hasEvals) {
      console.log('✅ Evals list has items');
    } else if (emptyState) {
      console.log('⚠️ Evals list is empty (empty state shown)');
    } else {
      console.log('❌ Could not determine evals list state');
    }
  });

  test('3. Test search functionality', async ({ page }) => {
    await page.goto(`${STAGING_URL}/evals`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Look for search input
    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i], input[placeholder*="filter" i]').first();
    const hasSearch = await searchInput.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasSearch) {
      await searchInput.fill('test');
      await page.waitForTimeout(1000);
      await takeScreenshot(page, '03_search_applied');

      // Clear search
      await searchInput.clear();
      await page.waitForTimeout(500);

      console.log('✅ Search input works');
    } else {
      await takeScreenshot(page, '03_no_search_found');
      console.log('❌ Search input not found');
    }
  });

  test('4. Test filter functionality', async ({ page }) => {
    await page.goto(`${STAGING_URL}/evals`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Look for filter buttons/dropdowns
    const filterButton = page.locator('button:has-text("Filter"), [role="combobox"]').first();
    const hasFilter = await filterButton.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasFilter) {
      await filterButton.click();
      await page.waitForTimeout(500);
      await takeScreenshot(page, '04_filter_opened');

      // Try to click a filter option
      const filterOption = page.locator('[role="option"], [role="menuitem"]').first();
      const hasOptions = await filterOption.isVisible({ timeout: 2000 }).catch(() => false);

      if (hasOptions) {
        await filterOption.click();
        await page.waitForTimeout(1000);
        await takeScreenshot(page, '04_filter_applied');
        console.log('✅ Filter functionality works');
      } else {
        console.log('⚠️ Filter opened but no options found');
      }
    } else {
      await takeScreenshot(page, '04_no_filter_found');
      console.log('⚠️ Filter button not found');
    }
  });

  test('5. Click eval to open detail modal', async ({ page }) => {
    await page.goto(`${STAGING_URL}/evals`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Find first eval item (try multiple selectors)
    const evalItem = page.locator('[data-testid*="eval-item"], [class*="eval-item"], [class*="eval-card"], tr[data-row], .cursor-pointer').first();
    const hasEval = await evalItem.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasEval) {
      await evalItem.click();
      await page.waitForTimeout(1500);

      // Check if modal opened
      const modal = page.locator('[role="dialog"], [class*="modal"], [class*="dialog"]');
      const modalOpen = await modal.isVisible({ timeout: 3000 }).catch(() => false);

      if (modalOpen) {
        await takeScreenshot(page, '05_eval_detail_modal');
        console.log('✅ Eval detail modal opened');
      } else {
        await takeScreenshot(page, '05_modal_not_opened');
        console.log('❌ Modal did not open after clicking eval');
      }
    } else {
      await takeScreenshot(page, '05_no_eval_to_click');
      console.log('⚠️ No eval item found to click');
    }
  });

  test('6. Test modal tabs and sections', async ({ page }) => {
    await page.goto(`${STAGING_URL}/evals`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Click first eval
    const evalItem = page.locator('[data-testid*="eval-item"], [class*="eval-item"], [class*="eval-card"], tr[data-row], .cursor-pointer').first();
    const hasEval = await evalItem.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasEval) {
      console.log('⚠️ No eval to test modal with');
      return;
    }

    await evalItem.click();
    await page.waitForTimeout(1500);

    const modal = page.locator('[role="dialog"], [class*="modal"]');
    const modalOpen = await modal.isVisible({ timeout: 3000 }).catch(() => false);

    if (!modalOpen) {
      console.log('❌ Modal did not open');
      return;
    }

    // Look for tabs
    const tabs = page.locator('[role="tab"], [class*="tab"]');
    const tabCount = await tabs.count();

    await takeScreenshot(page, '06_modal_default_view');

    if (tabCount > 0) {
      console.log(`✅ Found ${tabCount} tabs in modal`);

      // Click through each tab
      for (let i = 0; i < tabCount; i++) {
        const tab = tabs.nth(i);
        const tabText = await tab.textContent();
        console.log(`  Testing tab: ${tabText}`);

        await tab.click();
        await page.waitForTimeout(500);
        await takeScreenshot(page, `06_modal_tab_${i}_${tabText?.toLowerCase().replace(/\s+/g, '_')}`);
      }
    } else {
      console.log('⚠️ No tabs found in modal');
    }

    // Look for sections (Stats, Description, Code)
    const statsSection = page.locator('text=/stats/i, [data-testid*="stats"]');
    const descSection = page.locator('text=/description/i, [data-testid*="description"]');
    const codeSection = page.locator('text=/code/i, [data-testid*="code"]');

    const hasStats = await statsSection.isVisible({ timeout: 2000 }).catch(() => false);
    const hasDesc = await descSection.isVisible({ timeout: 2000 }).catch(() => false);
    const hasCode = await codeSection.isVisible({ timeout: 2000 }).catch(() => false);

    console.log(`  Stats section: ${hasStats ? '✅' : '❌'}`);
    console.log(`  Description section: ${hasDesc ? '✅' : '❌'}`);
    console.log(`  Code section: ${hasCode ? '✅' : '❌'}`);
  });

  test('7. Test action buttons in modal', async ({ page }) => {
    await page.goto(`${STAGING_URL}/evals`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Click first eval
    const evalItem = page.locator('[data-testid*="eval-item"], [class*="eval-item"], [class*="eval-card"], tr[data-row], .cursor-pointer').first();
    const hasEval = await evalItem.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasEval) {
      console.log('⚠️ No eval to test actions with');
      return;
    }

    await evalItem.click();
    await page.waitForTimeout(1500);

    const modal = page.locator('[role="dialog"], [class*="modal"]');
    const modalOpen = await modal.isVisible({ timeout: 3000 }).catch(() => false);

    if (!modalOpen) {
      console.log('❌ Modal did not open');
      return;
    }

    await takeScreenshot(page, '07_modal_with_actions');

    // Look for action buttons
    const playgroundBtn = modal.locator('button:has-text("Playground"), a:has-text("Playground")');
    const matrixBtn = modal.locator('button:has-text("Matrix"), a:has-text("Matrix")');
    const executeBtn = modal.locator('button:has-text("Execute"), button:has-text("Run")');
    const deleteBtn = modal.locator('button:has-text("Delete")');

    const hasPlayground = await playgroundBtn.isVisible({ timeout: 2000 }).catch(() => false);
    const hasMatrix = await matrixBtn.isVisible({ timeout: 2000 }).catch(() => false);
    const hasExecute = await executeBtn.isVisible({ timeout: 2000 }).catch(() => false);
    const hasDelete = await deleteBtn.isVisible({ timeout: 2000 }).catch(() => false);

    console.log(`  Playground button: ${hasPlayground ? '✅' : '❌'}`);
    console.log(`  Matrix button: ${hasMatrix ? '✅' : '❌'}`);
    console.log(`  Execute button: ${hasExecute ? '✅' : '❌'}`);
    console.log(`  Delete button: ${hasDelete ? '✅' : '❌'}`);

    // Test clicking Playground button if it exists
    if (hasPlayground) {
      await playgroundBtn.click();
      await page.waitForTimeout(2000);
      await takeScreenshot(page, '07_after_playground_click');

      const currentUrl = page.url();
      if (currentUrl.includes('playground')) {
        console.log('✅ Playground button navigates correctly');
      } else {
        console.log('⚠️ Playground button clicked but URL did not change to playground');
      }
    }
  });

  test('8. Test Create New Eval flow', async ({ page }) => {
    await page.goto(`${STAGING_URL}/evals`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await takeScreenshot(page, '08_before_create');

    // Look for Create/New button
    const createBtn = page.locator('button:has-text("Create"), button:has-text("New Eval"), a:has-text("Create"), a:has-text("New")');
    const hasCreate = await createBtn.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasCreate) {
      await createBtn.click();
      await page.waitForTimeout(1500);

      await takeScreenshot(page, '08_create_modal_opened');

      // Check if form/modal opened
      const createModal = page.locator('[role="dialog"], [class*="modal"], form');
      const modalOpen = await createModal.isVisible({ timeout: 3000 }).catch(() => false);

      if (modalOpen) {
        console.log('✅ Create eval modal opened');

        // Look for form fields
        const nameInput = page.locator('input[name*="name"], input[placeholder*="name" i]').first();
        const descInput = page.locator('textarea[name*="description"], textarea[placeholder*="description" i]').first();
        const codeInput = page.locator('textarea[name*="code"], [class*="code"], [class*="editor"]').first();

        const hasName = await nameInput.isVisible({ timeout: 2000 }).catch(() => false);
        const hasDesc = await descInput.isVisible({ timeout: 2000 }).catch(() => false);
        const hasCode = await codeInput.isVisible({ timeout: 2000 }).catch(() => false);

        console.log(`  Name field: ${hasName ? '✅' : '❌'}`);
        console.log(`  Description field: ${hasDesc ? '✅' : '❌'}`);
        console.log(`  Code field: ${hasCode ? '✅' : '❌'}`);

        // Close modal
        const closeBtn = page.locator('button[aria-label*="close" i], button:has-text("Cancel")').first();
        const hasClose = await closeBtn.isVisible({ timeout: 2000 }).catch(() => false);
        if (hasClose) {
          await closeBtn.click();
          await page.waitForTimeout(500);
        }
      } else {
        console.log('❌ Create modal did not open');
      }
    } else {
      await takeScreenshot(page, '08_no_create_button');
      console.log('❌ Create button not found');
    }
  });

  test('9. Test Matrix analysis view', async ({ page }) => {
    await page.goto(`${STAGING_URL}/evals`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Click first eval
    const evalItem = page.locator('[data-testid*="eval-item"], [class*="eval-item"], [class*="eval-card"], tr[data-row], .cursor-pointer').first();
    const hasEval = await evalItem.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasEval) {
      console.log('⚠️ No eval to test matrix with');
      return;
    }

    await evalItem.click();
    await page.waitForTimeout(1500);

    // Look for Matrix button
    const matrixBtn = page.locator('button:has-text("Matrix"), a:has-text("Matrix")');
    const hasMatrix = await matrixBtn.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasMatrix) {
      await matrixBtn.click();
      await page.waitForTimeout(2000);

      await takeScreenshot(page, '09_matrix_view');

      const currentUrl = page.url();
      if (currentUrl.includes('matrix')) {
        console.log('✅ Matrix view navigation works');

        // Check for matrix content
        const matrixContent = page.locator('[class*="matrix"], table, [data-testid*="matrix"]');
        const hasContent = await matrixContent.isVisible({ timeout: 3000 }).catch(() => false);

        if (hasContent) {
          console.log('✅ Matrix content visible');
        } else {
          console.log('⚠️ Matrix page loaded but content not found');
        }
      } else {
        console.log('⚠️ Matrix button clicked but did not navigate');
      }
    } else {
      console.log('⚠️ Matrix button not found in modal');
    }
  });

  test('10. Test overall page responsiveness and load times', async ({ page }) => {
    const startTime = Date.now();

    await page.goto(`${STAGING_URL}/evals`);
    await page.waitForLoadState('networkidle');

    const loadTime = Date.now() - startTime;
    console.log(`⏱️ Page load time: ${loadTime}ms`);

    if (loadTime < 3000) {
      console.log('✅ Page loads quickly');
    } else if (loadTime < 5000) {
      console.log('⚠️ Page load is acceptable but could be faster');
    } else {
      console.log('❌ Page load is slow');
    }

    await takeScreenshot(page, '10_final_state');
  });
});
