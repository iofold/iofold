/**
 * TEST-J04: Job Failure Handling
 *
 * Tests that job failures are handled gracefully with proper
 * error messages and no application crashes.
 */

import { test, expect } from '@playwright/test';
import { getAPIClient } from '../../helpers/api-client';
import { expectErrorToast } from '../../helpers/assertions';

test.describe('Job Failure Handling (TEST-J04)', () => {
  let apiClient: ReturnType<typeof getAPIClient>;

  test.beforeEach(async () => {
    apiClient = getAPIClient();
  });

  test('should handle job failure with invalid integration', async ({ page }) => {
    // Navigate to traces page
    await page.goto('/traces');

    // Try to import traces with invalid integration ID
    await page.click('button:has-text("Import Traces")');
    await expect(page.getByRole('dialog')).toBeVisible();

    // Try to submit with no integration selected
    await page.fill('input[name="limit"]', '5');
    await page.click('button:has-text("Import")');

    // Should show validation error or API error
    await expect(
      page.locator('text=/invalid|error|required/i').first()
    ).toBeVisible({ timeout: 10000 });

    // Application should not crash
    await expect(page.locator('body')).toBeVisible();
  });

  test('should show error message when job fails', async ({ page, context }) => {
    // Create integration with invalid credentials
    const integration = await apiClient.createIntegration({
      platform: 'langfuse',
      name: `Invalid Integration ${Date.now()}`,
      api_key: 'invalid_key_that_will_fail',
      base_url: 'https://cloud.langfuse.com',
    });

    // Navigate to traces page
    await page.goto('/traces');

    // Start import with invalid integration
    await page.click('button:has-text("Import Traces")');
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.selectOption('select[name="integration_id"]', integration.id);
    await page.fill('input[name="limit"]', '3');
    await page.click('button:has-text("Import")');

    // Wait for job to fail
    await page.waitForTimeout(5000);

    // Should show error toast or message
    await expect(
      page.locator('text=/failed|error|invalid/i').first()
    ).toBeVisible({ timeout: 30000 });

    // Cleanup
    await apiClient.deleteIntegration(integration.id);
  });

  test('should not crash when job status check fails', async ({ page, context }) => {
    // Create valid integration
    const integration = await apiClient.createIntegration({
      platform: 'langfuse',
      name: `Test Integration ${Date.now()}`,
      api_key: process.env.TEST_LANGFUSE_KEY || 'pk_test_mock_key',
      base_url: 'https://cloud.langfuse.com',
    });

    // Start import
    const jobResponse = await apiClient.importTraces({
      integration_id: integration.id,
      limit: 3,
    });

    // Block job status endpoint after initial request
    let requestCount = 0;
    await context.route(`**/api/jobs/${jobResponse.job_id}`, route => {
      requestCount++;
      if (requestCount > 2) {
        route.abort('failed');
      } else {
        route.continue();
      }
    });

    // Navigate to page that monitors job
    await page.goto('/traces');

    // Wait for polling to encounter error
    await page.waitForTimeout(10000);

    // Application should handle the error gracefully
    // Check that page is still functional
    await expect(page.locator('body')).toBeVisible();
    await expect(page.getByRole('navigation')).toBeVisible();

    // Cleanup
    await apiClient.deleteIntegration(integration.id);
  });

  test('should display job error message to user', async ({ page }) => {
    // Create integration
    const integration = await apiClient.createIntegration({
      platform: 'langfuse',
      name: `Test Integration ${Date.now()}`,
      api_key: 'invalid_credentials_for_error_test',
      base_url: 'https://cloud.langfuse.com',
    });

    // Navigate and start import
    await page.goto('/traces');
    await page.click('button:has-text("Import Traces")');
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.selectOption('select[name="integration_id"]', integration.id);
    await page.fill('input[name="limit"]', '3');
    await page.click('button:has-text("Import")');

    // Wait for job to process and fail
    await page.waitForTimeout(10000);

    // Check for error notification
    // Should show specific error message from job
    const errorVisible = await Promise.race([
      page.locator('[data-sonner-toast][data-type="error"]').first().isVisible(),
      page.locator('text=/Job failed|Import failed|Authentication failed/i').first().isVisible(),
      new Promise<boolean>(resolve => setTimeout(() => resolve(false), 30000)),
    ]);

    // Some error indication should be present
    expect(errorVisible).toBe(true);

    // Cleanup
    await apiClient.deleteIntegration(integration.id);
  });

  test('should allow retry after job failure', async ({ page }) => {
    // Create valid integration
    const integration = await apiClient.createIntegration({
      platform: 'langfuse',
      name: `Test Integration ${Date.now()}`,
      api_key: process.env.TEST_LANGFUSE_KEY || 'pk_test_mock_key',
      base_url: 'https://cloud.langfuse.com',
    });

    // Navigate to traces page
    await page.goto('/traces');

    // Try import (might fail if no data available)
    await page.click('button:has-text("Import Traces")');
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.selectOption('select[name="integration_id"]', integration.id);
    await page.fill('input[name="limit"]', '3');
    await page.click('button:has-text("Import")');

    // Wait a bit
    await page.waitForTimeout(5000);

    // Should be able to close modal and retry
    const modalVisible = await page.getByRole('dialog').isVisible();
    if (modalVisible) {
      await page.keyboard.press('Escape');
    }

    // Should be able to open import modal again
    await page.click('button:has-text("Import Traces")');
    await expect(page.getByRole('dialog')).toBeVisible();

    // Form should be functional for retry
    await expect(page.locator('select[name="integration_id"]')).toBeEnabled();

    // Cleanup
    await apiClient.deleteIntegration(integration.id);
  });

  test('should handle timeout errors gracefully', async ({ page, context }) => {
    // Create integration
    const integration = await apiClient.createIntegration({
      platform: 'langfuse',
      name: `Test Integration ${Date.now()}`,
      api_key: process.env.TEST_LANGFUSE_KEY || 'pk_test_mock_key',
      base_url: 'https://cloud.langfuse.com',
    });

    // Make trace import endpoint very slow
    await context.route('**/api/traces/import', async route => {
      await new Promise(resolve => setTimeout(resolve, 2000));
      route.continue();
    });

    // Navigate and try import
    await page.goto('/traces');
    await page.click('button:has-text("Import Traces")');
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.selectOption('select[name="integration_id"]', integration.id);
    await page.fill('input[name="limit"]', '3');
    await page.click('button:has-text("Import")');

    // Wait for slow response
    await page.waitForTimeout(5000);

    // Application should handle slow responses
    await expect(page.locator('body')).toBeVisible();

    // Cleanup
    await apiClient.deleteIntegration(integration.id);
  });
});
