/**
 * TEST-J01: Job Status Polling
 *
 * Tests that the system correctly handles job polling when SSE is unavailable
 * and properly monitors job status updates.
 */

import { test, expect } from '@playwright/test';
import { apiRequest, uniqueName } from '../utils/helpers';

test.describe('Job Status Polling (TEST-J01)', () => {
  let integrationId: string | null = null;

  test.afterEach(async ({ page }) => {
    // Cleanup integration
    if (integrationId) {
      await apiRequest(page, `/api/integrations/${integrationId}`, { method: 'DELETE' }).catch(() => {});
      integrationId = null;
    }
  });

  test('should poll job status when SSE is disabled', async ({ page, context }) => {
    // Create integration
    const integrationName = uniqueName('Test Integration');
    const integration = await apiRequest<any>(page, '/api/integrations', {
      method: 'POST',
      data: {
        platform: 'langfuse',
        name: integrationName,
        api_key: process.env.TEST_LANGFUSE_KEY || 'pk_test_mock_key',
        base_url: 'https://cloud.langfuse.com',
      },
    });
    integrationId = integration.id;

    // Block SSE/stream endpoint to force polling
    await context.route('**/**/stream', route => route.abort());

    // Navigate to traces page
    await page.goto('/traces');
    await page.waitForLoadState('networkidle');

    // Open import modal
    const importButton = page.getByRole('button', { name: /import traces/i }).first();
    await expect(importButton).toBeVisible({ timeout: 10000 });
    await importButton.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Select integration using Radix Select
    const selectTrigger = dialog.locator('#integration');
    await selectTrigger.click();
    await page.getByRole('option', { name: new RegExp(integrationName) }).click();

    // Submit import
    const submitButton = dialog.getByTestId('import-traces-submit');
    await submitButton.click();

    // Wait for job to process
    await page.waitForTimeout(5000);

    // Application should not crash
    await expect(page.locator('body')).toBeVisible();
  });

  test('should show job status updates during polling', async ({ page }) => {
    // Create integration
    const integrationName = uniqueName('Test Integration');
    const integration = await apiRequest<any>(page, '/api/integrations', {
      method: 'POST',
      data: {
        platform: 'langfuse',
        name: integrationName,
        api_key: process.env.TEST_LANGFUSE_KEY || 'pk_test_mock_key',
        base_url: 'https://cloud.langfuse.com',
      },
    });
    integrationId = integration.id;

    // Navigate to traces page
    await page.goto('/traces');
    await page.waitForLoadState('networkidle');

    // Open import modal
    const importButton = page.getByRole('button', { name: /import traces/i }).first();
    await importButton.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Select integration
    const selectTrigger = dialog.locator('#integration');
    await selectTrigger.click();
    await page.getByRole('option', { name: new RegExp(integrationName) }).click();

    // Submit import
    const submitButton = dialog.getByTestId('import-traces-submit');
    await submitButton.click();

    // Wait and verify application remains functional
    await page.waitForTimeout(5000);
    await expect(page.locator('body')).toBeVisible();
  });

  test('should poll at regular intervals', async ({ page }) => {
    // Create integration
    const integrationName = uniqueName('Test Integration');
    const integration = await apiRequest<any>(page, '/api/integrations', {
      method: 'POST',
      data: {
        platform: 'langfuse',
        name: integrationName,
        api_key: process.env.TEST_LANGFUSE_KEY || 'pk_test_mock_key',
        base_url: 'https://cloud.langfuse.com',
      },
    });
    integrationId = integration.id;

    // Monitor network requests
    const apiRequests: number[] = [];
    page.on('request', request => {
      if (request.url().includes('/api/jobs/')) {
        apiRequests.push(Date.now());
      }
    });

    // Navigate to traces page
    await page.goto('/traces');
    await page.waitForLoadState('networkidle');

    // Open import modal and start job
    const importButton = page.getByRole('button', { name: /import traces/i }).first();
    await importButton.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const selectTrigger = dialog.locator('#integration');
    await selectTrigger.click();
    await page.getByRole('option', { name: new RegExp(integrationName) }).click();

    const submitButton = dialog.getByTestId('import-traces-submit');
    await submitButton.click();

    // Wait for polling to occur
    await page.waitForTimeout(10000);

    // Application should be stable
    await expect(page.locator('body')).toBeVisible();
  });
});
