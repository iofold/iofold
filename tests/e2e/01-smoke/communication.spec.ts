import { test, expect } from '@playwright/test';

/**
 * TEST-S04: Frontend-Backend Communication
 * Priority: P0
 * Expected Results:
 * - API request fires automatically
 * - No CORS errors
 * - Data displays or "No integrations" message
 */
test.describe('TEST-S04: Frontend-Backend Communication', () => {
  test('should make API request on page load', async ({ page }) => {
    // Set up request listener
    const requests: string[] = [];
    page.on('request', request => {
      const url = request.url();
      if (url.includes('/api/')) {
        requests.push(url);
      }
    });

    // Navigate to integrations page
    await page.goto('/integrations');

    // Wait for network to be idle
    await page.waitForLoadState('networkidle');

    // Verify API request was made
    expect(requests.length).toBeGreaterThan(0);
    expect(requests.some(url => url.includes('/api/integrations'))).toBe(true);
  });

  test('should not have CORS errors', async ({ page }) => {
    const errors: string[] = [];

    // Capture console errors
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Navigate to integrations page
    await page.goto('/integrations');
    await page.waitForLoadState('networkidle');

    // Check for CORS errors
    const corsErrors = errors.filter(err =>
      err.toLowerCase().includes('cors') ||
      err.toLowerCase().includes('cross-origin')
    );
    expect(corsErrors).toHaveLength(0);
  });

  test('should display data or empty state message', async ({ page }) => {
    await page.goto('/integrations');
    await page.waitForLoadState('networkidle');

    // Wait for either data to load or empty state to show
    await page.waitForTimeout(2000);

    // Check if page has content (either data cards/table or empty state)
    const hasContent = await page.locator('body').textContent();
    expect(hasContent).toBeTruthy();
    expect(hasContent.length).toBeGreaterThan(0);

    // Should either have integration cards/rows OR an empty state message
    const hasIntegrations = await page.locator('[data-testid*="integration"]').count();
    const hasEmptyState = await page.getByText(/no integrations/i).count();
    const hasAddButton = await page.getByRole('button', { name: /add integration/i }).count();

    // At least one of these should be true
    expect(hasIntegrations > 0 || hasEmptyState > 0 || hasAddButton > 0).toBe(true);
  });
});
