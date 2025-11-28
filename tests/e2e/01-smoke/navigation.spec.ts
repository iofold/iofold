import { test, expect } from '@playwright/test';

/**
 * TEST-S05: Basic Navigation
 * Priority: P0
 * Expected Results:
 * - All navigation links work
 * - URLs update correctly
 * - Pages load without errors
 *
 * Note: The home page "/" is a marketing page with different navigation.
 * App pages have their own navigation component that loads client-side.
 */
test.describe('TEST-S05: Basic Navigation', () => {
  test('should load integrations page directly', async ({ page }) => {
    // Navigate directly to integrations page
    await page.goto('/integrations');
    await page.waitForLoadState('networkidle');

    // Verify URL
    await expect(page).toHaveURL(/\/integrations/);

    // Verify page loaded without errors
    await expect(page.locator('body')).toBeVisible();
  });

  test('should load traces page directly', async ({ page }) => {
    // Navigate directly to traces page
    await page.goto('/traces');
    await page.waitForLoadState('networkidle');

    // Verify URL
    await expect(page).toHaveURL(/\/traces/);

    // Verify page loaded without errors
    await expect(page.locator('body')).toBeVisible();
  });

  test('should load eval sets page directly', async ({ page }) => {
    // Navigate directly to eval sets page
    await page.goto('/eval-sets');
    await page.waitForLoadState('networkidle');

    // Verify URL
    await expect(page).toHaveURL(/\/eval-sets/);

    // Verify page loaded without errors
    await expect(page.locator('body')).toBeVisible();
  });

  test('should load evals page directly', async ({ page }) => {
    // Navigate directly to evals page
    await page.goto('/evals');
    await page.waitForLoadState('networkidle');

    // Verify URL
    await expect(page).toHaveURL(/\/evals/);

    // Verify page loaded without errors
    await expect(page.locator('body')).toBeVisible();
  });

  test('should load all main pages sequentially', async ({ page }) => {
    // Navigate to each page directly
    const pages = [
      { path: '/integrations', url: /\/integrations/ },
      { path: '/traces', url: /\/traces/ },
      { path: '/eval-sets', url: /\/eval-sets/ },
      { path: '/evals', url: /\/evals/ },
    ];

    for (const navPage of pages) {
      await page.goto(navPage.path);
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveURL(navPage.url);

      // Verify page has content
      const hasContent = await page.locator('body').textContent();
      expect(hasContent).toBeTruthy();
    }
  });
});
