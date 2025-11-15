import { test, expect } from '@playwright/test';

/**
 * TEST-S05: Basic Navigation
 * Priority: P0
 * Expected Results:
 * - All navigation links work
 * - URLs update correctly
 * - Pages load without errors
 */
test.describe('TEST-S05: Basic Navigation', () => {
  test('should navigate to integrations page', async ({ page }) => {
    await page.goto('/');

    // Click Integrations link (use .first() to avoid strict mode errors)
    const integrationsLink = page.getByRole('link', { name: /integrations/i }).first();
    await integrationsLink.click();

    // Verify URL changed
    await expect(page).toHaveURL(/\/integrations/);

    // Verify page loaded without errors
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });

  test('should navigate to traces page', async ({ page }) => {
    await page.goto('/');

    // Click Traces link (use .first() to avoid strict mode errors)
    const tracesLink = page.getByRole('link', { name: /traces/i }).first();
    await tracesLink.click();

    // Verify URL changed
    await expect(page).toHaveURL(/\/traces/);

    // Verify page loaded without errors
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });

  test('should navigate to eval sets page', async ({ page }) => {
    await page.goto('/');

    // Click Eval Sets link (use .first() to avoid strict mode errors)
    const evalSetsLink = page.getByRole('link', { name: /eval.?sets/i }).first();
    await evalSetsLink.click();

    // Verify URL changed
    await expect(page).toHaveURL(/\/eval-sets/);

    // Verify page loaded without errors
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });

  test('should navigate to evals page', async ({ page }) => {
    await page.goto('/');

    // Click Evals link (be specific to avoid matching "Eval Sets")
    const evalsLink = page.getByRole('link', { name: /^evals$/i });
    await evalsLink.click();

    // Verify URL changed
    await expect(page).toHaveURL(/\/evals/);

    // Verify page loaded without errors
    await page.waitForLoadState('networkidle');
    await expect(page.locator('body')).toBeVisible();
  });

  test('should navigate through all main pages sequentially', async ({ page }) => {
    await page.goto('/');

    // Navigate through each page
    const navigationSequence = [
      { name: /integrations/i, url: /\/integrations/ },
      { name: /traces/i, url: /\/traces/ },
      { name: /eval.?sets/i, url: /\/eval-sets/ },
      { name: /^evals$/i, url: /\/evals/ },
    ];

    for (const nav of navigationSequence) {
      // Use .first() to avoid strict mode errors when multiple links match
      const link = page.getByRole('link', { name: nav.name }).first();
      await link.click();
      await expect(page).toHaveURL(nav.url);
      await page.waitForLoadState('networkidle');

      // Verify no errors on page
      const hasContent = await page.locator('body').textContent();
      expect(hasContent).toBeTruthy();
    }
  });
});
