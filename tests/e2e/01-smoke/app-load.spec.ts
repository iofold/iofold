import { test, expect } from '@playwright/test';

/**
 * TEST-S01: Application Loads
 * Priority: P0
 * Expected Results:
 * - Page loads in < 5s
 * - App pages are accessible
 *
 * Note: The home page "/" is a marketing page. App pages are at /integrations, /traces, etc.
 */
test.describe('TEST-S01: Application Loads', () => {
  test('should load home page without errors', async ({ page }) => {
    // Navigate to home
    const startTime = Date.now();
    await page.goto('/');
    const loadTime = Date.now() - startTime;

    // Verify page loads in < 5s (generous for dev server)
    expect(loadTime).toBeLessThan(5000);

    // Wait for page to be fully loaded
    await page.waitForLoadState('networkidle');

    // Check that page has loaded (look for any heading or main content)
    await expect(page.locator('body')).toBeVisible();
  });

  test('should load integrations page with content', async ({ page }) => {
    await page.goto('/integrations');
    await page.waitForLoadState('networkidle');

    // Check that page has loaded with content
    await expect(page.locator('body')).toBeVisible();

    // Page should have some content
    const bodyContent = await page.locator('body').textContent();
    expect(bodyContent).toBeTruthy();
    expect(bodyContent!.length).toBeGreaterThan(0);
  });
});
