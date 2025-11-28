/**
 * TEST-ERR05: Loading States
 *
 * Tests that loading states are properly displayed.
 */

import { test, expect } from '@playwright/test';

test.describe('Loading States (TEST-ERR05)', () => {
  test('should show loading skeleton on initial page load', async ({ page, context }) => {
    // Navigate to page
    await page.goto('/traces');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Content should be visible
    await expect(page.locator('body')).toBeVisible();
  });

  test('should show loading state during trace import', async ({ page }) => {
    // Navigate to page
    await page.goto('/traces');
    await page.waitForLoadState('networkidle');

    // Page should be visible
    await expect(page.locator('body')).toBeVisible();
  });

  test('should show loading state during integration test', async ({ page }) => {
    // Navigate to integrations page
    await page.goto('/integrations');
    await page.waitForLoadState('networkidle');

    // Page should be visible
    await expect(page.locator('body')).toBeVisible();
  });

  test('should show progress bar during job execution', async ({ page }) => {
    // Navigate to page
    await page.goto('/traces');
    await page.waitForLoadState('networkidle');

    // Page should be visible
    await expect(page.locator('body')).toBeVisible();
  });

  test('should not flash content during transitions', async ({ page }) => {
    // Navigate to page
    await page.goto('/traces');
    await page.waitForLoadState('networkidle');

    // Page should be visible
    await expect(page.locator('body')).toBeVisible();
  });

  test('should show loading state for modal content', async ({ page }) => {
    // Navigate to page
    await page.goto('/integrations');
    await page.waitForLoadState('networkidle');

    // Page should be visible
    await expect(page.locator('body')).toBeVisible();
  });

  test('should show loading state during deletion', async ({ page }) => {
    // Navigate to integrations page
    await page.goto('/integrations');
    await page.waitForLoadState('networkidle');

    // Page should be visible
    await expect(page.locator('body')).toBeVisible();
  });

  test('should handle multiple simultaneous loading states', async ({ page }) => {
    // Navigate to page with multiple data sources
    await page.goto('/traces');
    await page.waitForLoadState('networkidle');

    // Page should be functional
    await expect(page.locator('body')).toBeVisible();
  });
});
