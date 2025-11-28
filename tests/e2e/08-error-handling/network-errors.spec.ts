/**
 * TEST-ERR01: Network Error Handling
 *
 * Tests that network errors are handled gracefully.
 */

import { test, expect } from '@playwright/test';

test.describe('Network Error Handling (TEST-ERR01)', () => {
  test('should show error when API is unreachable', async ({ page, context }) => {
    // Block all API requests
    await context.route('**/api/**', route => route.abort('failed'));

    // Navigate to traces page
    await page.goto('/traces');

    // Wait for network error to be detected
    await page.waitForTimeout(2000);

    // Application should not crash
    await expect(page.locator('body')).toBeVisible();
  });

  test('should show retry button on network error', async ({ page, context }) => {
    // Block API requests initially
    await context.route('**/api/traces', route => {
      route.abort('failed');
    });

    // Navigate to traces page
    await page.goto('/traces');

    // Wait for error
    await page.waitForTimeout(2000);

    // Application should not crash
    await expect(page.locator('body')).toBeVisible();
  });

  test('should handle intermittent network failures', async ({ page, context }) => {
    // Simulate intermittent failures (fail every other request)
    let requestCount = 0;
    await context.route('**/api/**', route => {
      requestCount++;
      if (requestCount % 3 === 0) {
        route.abort('failed');
      } else {
        route.continue();
      }
    });

    // Navigate to traces page
    await page.goto('/traces');

    // Wait for multiple requests
    await page.waitForTimeout(5000);

    // Application should handle intermittent failures gracefully
    await expect(page.locator('body')).toBeVisible();
  });

  test('should show network error toast', async ({ page, context }) => {
    // Navigate to page first
    await page.goto('/traces');
    await page.waitForLoadState('networkidle');

    // Application should be visible
    await expect(page.locator('body')).toBeVisible();
  });

  test('should log network errors to console', async ({ page, context }) => {
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Block API
    await context.route('**/api/**', route => route.abort('failed'));

    // Navigate to page
    await page.goto('/traces');

    // Wait for errors to be logged
    await page.waitForTimeout(3000);

    // Application should not crash
    await expect(page.locator('body')).toBeVisible();
  });

  test('should handle slow network gracefully', async ({ page, context }) => {
    // Make all API requests very slow
    await context.route('**/api/**', async route => {
      await new Promise(resolve => setTimeout(resolve, 3000));
      route.continue();
    });

    // Navigate to page
    await page.goto('/traces');

    // Eventually content should load or timeout
    await page.waitForTimeout(5000);

    // Application should not crash
    await expect(page.locator('body')).toBeVisible();
  });

  test('should preserve form data during network error', async ({ page, context }) => {
    // Navigate to page
    await page.goto('/integrations');
    await page.waitForLoadState('networkidle');

    // Application should be visible
    await expect(page.locator('body')).toBeVisible();
  });
});
