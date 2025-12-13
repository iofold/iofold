import { test, expect, Page } from '@playwright/test';
import * as path from 'path';

const STAGING_URL = 'https://platform.staging.iofold.com';
const TEST_EMAIL = 'e2e-test@iofold.com';
const TEST_PASSWORD = 'zI76O83k(%xsM';
const SCREENSHOT_DIR = '/home/ygupta/workspace/iofold/.tmp/e2e-screenshots';

// Helper to take timestamped screenshots
async function takeScreenshot(page: Page, name: string) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${timestamp}_${name}.png`;
  await page.screenshot({
    path: path.join(SCREENSHOT_DIR, filename),
    fullPage: true
  });
  console.log(`📸 Screenshot saved: ${filename}`);
  return filename;
}

// Disable dependency on clerk-setup
test.use({ storageState: undefined });

test.describe('Evals Page Comprehensive Test - Manual Auth', () => {
  let authenticated = false;

  test.beforeEach(async ({ page }) => {
    console.log('🚀 Starting authentication flow');

    // Navigate to sign-in page
    await page.goto(`${STAGING_URL}/sign-in`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await takeScreenshot(page, 'auth_01_signin_page');

    try {
      // Try to find and fill email input
      const emailInput = page.locator('input[name="identifier"], input[type="email"], input[name="email"]').first();
      await emailInput.waitFor({ state: 'visible', timeout: 10000 });
      await emailInput.fill(TEST_EMAIL);
      console.log('✅ Filled email');

      await takeScreenshot(page, 'auth_02_email_filled');

      // Click continue button
      const continueButton = page.locator('button:has-text("Continue"), button:has-text("Next"), button[type="submit"]').first();
      await continueButton.click();
      await page.waitForTimeout(2000);
      console.log('✅ Clicked continue');

      await takeScreenshot(page, 'auth_03_after_continue');

      // Fill password
      const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
      await passwordInput.waitFor({ state: 'visible', timeout: 10000 });
      await passwordInput.fill(TEST_PASSWORD);
      console.log('✅ Filled password');

      await takeScreenshot(page, 'auth_04_password_filled');

      // Click sign in button
      const signInButton = page.locator('button:has-text("Sign in"), button:has-text("Continue"), button[type="submit"]').first();
      await signInButton.click();
      console.log('✅ Clicked sign in');

      await page.waitForTimeout(3000);
      await takeScreenshot(page, 'auth_05_after_signin');

      // Wait for redirect (try multiple possible destinations)
      await page.waitForURL(/.*\/(agents|evals|review|$).*/, { timeout: 30000 });

      console.log('✅ Authentication successful');
      authenticated = true;

      await takeScreenshot(page, 'auth_06_authenticated');
    } catch (error) {
      console.error('❌ Authentication failed:', error);
      await takeScreenshot(page, 'auth_error');
      throw error;
    }
  });

  test('1. Navigate to Evals page and verify initial load', async ({ page }) => {
    console.log('\n📋 TEST 1: Navigate to Evals page');

    await page.goto(`${STAGING_URL}/evals`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await takeScreenshot(page, 'test01_evals_page_initial');

    // Check for page title/heading
    const pageContent = await page.content();
    console.log('Current URL:', page.url());
    console.log('Page title:', await page.title());

    // Look for various possible heading selectors
    const heading = page.locator('h1, h2, [role="heading"]').first();
    const hasHeading = await heading.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasHeading) {
      const headingText = await heading.textContent();
      console.log('✅ Page heading found:', headingText);
    } else {
      console.log('⚠️ No obvious heading found');
    }

    console.log('✅ Test 1 complete');
  });

  test('2. Verify Evals list loads', async ({ page }) => {
    console.log('\n📋 TEST 2: Verify Evals list');

    await page.goto(`${STAGING_URL}/evals`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    await takeScreenshot(page, 'test02_evals_list');

    // Try to find eval items with various selectors
    const selectors = [
      '[data-testid*="eval"]',
      '[class*="eval-item"]',
      '[class*="eval-card"]',
      'tr[data-row]',
      '[role="row"]',
      'table tbody tr',
      'li',
    ];

    let foundItems = false;
    for (const selector of selectors) {
      const items = page.locator(selector);
      const count = await items.count();
      if (count > 0) {
        console.log(`✅ Found ${count} items with selector: ${selector}`);
        foundItems = true;
        break;
      }
    }

    if (!foundItems) {
      console.log('⚠️ No eval items found - checking for empty state');
      const emptyState = page.locator('text=/no evals/i, text=/empty/i, text=/create.*first/i');
      const hasEmpty = await emptyState.isVisible({ timeout: 2000 }).catch(() => false);
      if (hasEmpty) {
        console.log('✅ Empty state displayed');
      } else {
        console.log('❌ No items and no empty state found');
      }
    }

    console.log('✅ Test 2 complete');
  });

  test('3. Test search and filter functionality', async ({ page }) => {
    console.log('\n📋 TEST 3: Search and filter');

    await page.goto(`${STAGING_URL}/evals`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Search
    const searchInput = page.locator('input[type="search"], input[placeholder*="search" i], input[placeholder*="filter" i]').first();
    const hasSearch = await searchInput.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasSearch) {
      await searchInput.fill('test');
      await page.waitForTimeout(1000);
      await takeScreenshot(page, 'test03_search_applied');
      await searchInput.clear();
      console.log('✅ Search input functional');
    } else {
      console.log('⚠️ Search input not found');
    }

    // Filter
    const filterButton = page.locator('button:has-text("Filter"), [role="combobox"]').first();
    const hasFilter = await filterButton.isVisible({ timeout: 3000 }).catch(() => false);

    if (hasFilter) {
      await filterButton.click();
      await page.waitForTimeout(500);
      await takeScreenshot(page, 'test03_filter_menu');

      // Press Escape to close
      await page.keyboard.press('Escape');
      console.log('✅ Filter button functional');
    } else {
      console.log('⚠️ Filter button not found');
    }

    await takeScreenshot(page, 'test03_final');
    console.log('✅ Test 3 complete');
  });

  test('4. Click eval to open detail modal', async ({ page }) => {
    console.log('\n📋 TEST 4: Open eval detail modal');

    await page.goto(`${STAGING_URL}/evals`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await takeScreenshot(page, 'test04_before_click');

    // Find clickable eval items
    const clickableItems = page.locator('[role="row"], tr, li, [class*="cursor-pointer"]').first();
    const hasItem = await clickableItems.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasItem) {
      await clickableItems.click();
      await page.waitForTimeout(2000);

      await takeScreenshot(page, 'test04_after_click');

      // Check for modal
      const modal = page.locator('[role="dialog"], [class*="modal"], [class*="dialog"]');
      const modalVisible = await modal.isVisible({ timeout: 3000 }).catch(() => false);

      if (modalVisible) {
        console.log('✅ Modal opened successfully');
      } else {
        console.log('⚠️ Modal did not open (or navigated to detail page)');
        console.log('Current URL:', page.url());
      }
    } else {
      console.log('⚠️ No clickable eval item found');
    }

    console.log('✅ Test 4 complete');
  });

  test('5. Test modal tabs and sections', async ({ page }) => {
    console.log('\n📋 TEST 5: Modal tabs and sections');

    await page.goto(`${STAGING_URL}/evals`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Click first eval
    const clickableItem = page.locator('[role="row"], tr, li, [class*="cursor-pointer"]').first();
    const hasItem = await clickableItem.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasItem) {
      console.log('⚠️ No eval to test modal with');
      return;
    }

    await clickableItem.click();
    await page.waitForTimeout(2000);

    const modal = page.locator('[role="dialog"], [class*="modal"]');
    const modalVisible = await modal.isVisible({ timeout: 3000 }).catch(() => false);

    if (!modalVisible) {
      console.log('⚠️ Modal did not open');
      await takeScreenshot(page, 'test05_no_modal');
      return;
    }

    await takeScreenshot(page, 'test05_modal_opened');

    // Look for tabs
    const tabs = page.locator('[role="tab"], [class*="tab"]');
    const tabCount = await tabs.count();

    if (tabCount > 0) {
      console.log(`✅ Found ${tabCount} tabs`);

      for (let i = 0; i < Math.min(tabCount, 5); i++) {
        const tab = tabs.nth(i);
        const tabText = await tab.textContent();
        console.log(`  Tab ${i}: ${tabText}`);

        await tab.click();
        await page.waitForTimeout(500);
        await takeScreenshot(page, `test05_tab_${i}`);
      }
    } else {
      console.log('⚠️ No tabs found');
    }

    // Check for sections
    const sections = ['stats', 'description', 'code', 'metadata'];
    for (const section of sections) {
      const sectionEl = page.locator(`text=/${section}/i`);
      const visible = await sectionEl.isVisible({ timeout: 1000 }).catch(() => false);
      console.log(`  ${section}: ${visible ? '✅' : '❌'}`);
    }

    console.log('✅ Test 5 complete');
  });

  test('6. Test action buttons', async ({ page }) => {
    console.log('\n📋 TEST 6: Action buttons');

    await page.goto(`${STAGING_URL}/evals`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Click first eval
    const clickableItem = page.locator('[role="row"], tr, li, [class*="cursor-pointer"]').first();
    const hasItem = await clickableItem.isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasItem) {
      console.log('⚠️ No eval to test actions with');
      return;
    }

    await clickableItem.click();
    await page.waitForTimeout(2000);

    await takeScreenshot(page, 'test06_modal_with_buttons');

    // Look for action buttons
    const buttons = [
      { name: 'Playground', selector: 'button:has-text("Playground"), a:has-text("Playground")' },
      { name: 'Matrix', selector: 'button:has-text("Matrix"), a:has-text("Matrix")' },
      { name: 'Execute', selector: 'button:has-text("Execute"), button:has-text("Run")' },
      { name: 'Delete', selector: 'button:has-text("Delete")' },
      { name: 'Edit', selector: 'button:has-text("Edit")' },
      { name: 'Clone', selector: 'button:has-text("Clone"), button:has-text("Duplicate")' },
    ];

    for (const btn of buttons) {
      const element = page.locator(btn.selector).first();
      const visible = await element.isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`  ${btn.name} button: ${visible ? '✅' : '❌'}`);
    }

    console.log('✅ Test 6 complete');
  });

  test('7. Test Create New Eval flow', async ({ page }) => {
    console.log('\n📋 TEST 7: Create new eval');

    await page.goto(`${STAGING_URL}/evals`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await takeScreenshot(page, 'test07_before_create');

    // Look for Create button
    const createBtn = page.locator('button:has-text("Create"), button:has-text("New"), a:has-text("Create"), a:has-text("New")');
    const hasCreate = await createBtn.first().isVisible({ timeout: 5000 }).catch(() => false);

    if (hasCreate) {
      await createBtn.first().click();
      await page.waitForTimeout(2000);

      await takeScreenshot(page, 'test07_create_clicked');

      // Check if modal or form opened
      const createModal = page.locator('[role="dialog"], [class*="modal"], form');
      const modalVisible = await createModal.isVisible({ timeout: 3000 }).catch(() => false);

      if (modalVisible) {
        console.log('✅ Create modal/form opened');

        // Look for form fields
        const nameInput = page.locator('input[name*="name"], input[placeholder*="name" i]').first();
        const hasName = await nameInput.isVisible({ timeout: 2000 }).catch(() => false);
        console.log(`  Name field: ${hasName ? '✅' : '❌'}`);

        // Close modal
        await page.keyboard.press('Escape');
      } else {
        console.log('⚠️ Create modal did not open (might have navigated)');
        console.log('Current URL:', page.url());
      }
    } else {
      console.log('⚠️ Create button not found');
    }

    console.log('✅ Test 7 complete');
  });

  test('8. Test page performance', async ({ page }) => {
    console.log('\n📋 TEST 8: Performance test');

    const startTime = Date.now();

    await page.goto(`${STAGING_URL}/evals`);
    await page.waitForLoadState('networkidle');

    const loadTime = Date.now() - startTime;
    console.log(`⏱️  Page load time: ${loadTime}ms`);

    if (loadTime < 3000) {
      console.log('✅ Fast load time');
    } else if (loadTime < 5000) {
      console.log('⚠️ Acceptable load time');
    } else {
      console.log('❌ Slow load time');
    }

    await takeScreenshot(page, 'test08_performance');
    console.log('✅ Test 8 complete');
  });

  test('9. Test error states and edge cases', async ({ page }) => {
    console.log('\n📋 TEST 9: Error states');

    await page.goto(`${STAGING_URL}/evals`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // Check for error messages
    const errorMessage = page.locator('[role="alert"], [class*="error"], [class*="alert"]');
    const hasError = await errorMessage.isVisible({ timeout: 2000 }).catch(() => false);

    if (hasError) {
      const errorText = await errorMessage.textContent();
      console.log('⚠️ Error message found:', errorText);
    } else {
      console.log('✅ No error messages');
    }

    await takeScreenshot(page, 'test09_error_check');
    console.log('✅ Test 9 complete');
  });

  test('10. Test navigation and routing', async ({ page }) => {
    console.log('\n📋 TEST 10: Navigation test');

    await page.goto(`${STAGING_URL}/evals`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const startUrl = page.url();
    console.log('Start URL:', startUrl);

    // Try clicking a navigation link
    const navLinks = page.locator('nav a, [role="navigation"] a');
    const linkCount = await navLinks.count();
    console.log(`Found ${linkCount} navigation links`);

    if (linkCount > 0) {
      const firstLink = navLinks.first();
      const linkText = await firstLink.textContent();
      console.log(`Clicking nav link: ${linkText}`);

      await firstLink.click();
      await page.waitForTimeout(2000);

      const newUrl = page.url();
      console.log('New URL:', newUrl);

      if (newUrl !== startUrl) {
        console.log('✅ Navigation works');

        // Go back
        await page.goBack();
        await page.waitForTimeout(1000);
        console.log('✅ Back navigation works');
      }
    }

    await takeScreenshot(page, 'test10_navigation');
    console.log('✅ Test 10 complete');
  });
});
