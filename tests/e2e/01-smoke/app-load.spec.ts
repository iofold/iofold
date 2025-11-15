import { test, expect } from '@playwright/test';

/**
 * TEST-S01: Application Loads
 * Priority: P0
 * Expected Results:
 * - Page loads in < 2s
 * - No console errors
 * - Navigation menu shows: Home, Integrations, Traces, Eval Sets, Evals
 */
test.describe('TEST-S01: Application Loads', () => {
  test('should load home page without errors', async ({ page }) => {
    const errors: string[] = [];

    // Capture console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Navigate to home
    const startTime = Date.now();
    await page.goto('/');
    const loadTime = Date.now() - startTime;

    // Verify page loads in < 2s
    expect(loadTime).toBeLessThan(2000);

    // Wait for page to be fully loaded
    await page.waitForLoadState('networkidle');

    // Check that page has loaded (look for any heading or main content)
    await expect(page.locator('body')).toBeVisible();

    // Verify no console errors (after a short delay to catch any late errors)
    await page.waitForTimeout(1000);
    expect(errors).toHaveLength(0);
  });

  test('should display navigation menu with all required links', async ({ page }) => {
    await page.goto('/');

    // Wait for navigation to be visible
    await page.waitForLoadState('networkidle');

    // Check for main navigation links (case-insensitive)
    const nav = page.locator('nav').first();
    await expect(nav).toBeVisible();

    // Scope to nav element only to avoid duplicate links in page content
    const integrations = nav.getByRole('link', { name: /integrations/i });
    const traces = nav.getByRole('link', { name: /traces/i });
    const evalSets = nav.getByRole('link', { name: /eval.?sets/i });
    const evals = nav.getByRole('link', { name: /^evals$/i });

    // Check if at least these core navigation items exist
    await expect(integrations).toBeVisible();
    await expect(traces).toBeVisible();
    await expect(evalSets).toBeVisible();
    await expect(evals).toBeVisible();
  });
});
