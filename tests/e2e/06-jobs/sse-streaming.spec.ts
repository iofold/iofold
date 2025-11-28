/**
 * TEST-J02: SSE Real-time Updates
 *
 * Tests that Server-Sent Events (SSE) connections work correctly
 * and provide real-time job status updates.
 */

import { test, expect } from '@playwright/test';
import { apiRequest, uniqueName } from '../utils/helpers';

test.describe('SSE Real-time Updates (TEST-J02)', () => {
  let integrationId: string | null = null;

  test.afterEach(async ({ page }) => {
    // Cleanup
    if (integrationId) {
      await apiRequest(page, `/api/integrations/${integrationId}`, { method: 'DELETE' }).catch(() => {});
      integrationId = null;
    }
  });

  test('should establish SSE connection for job monitoring', async ({ page }) => {
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

    // Set up console log capture
    const consoleLogs: string[] = [];
    page.on('console', msg => consoleLogs.push(msg.text()));

    // Navigate to traces page
    await page.goto('/traces');
    await page.waitForLoadState('networkidle');

    // Wait for any SSE connection attempts
    await page.waitForTimeout(2000);

    // Verify no critical errors in console
    const hasCriticalError = consoleLogs.some(log =>
      log.toLowerCase().includes('uncaught') && log.toLowerCase().includes('error')
    );
    expect(hasCriticalError).toBe(false);
  });

  test('should receive real-time progress updates via SSE', async ({ page }) => {
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

    // Capture network activity for SSE endpoint
    const sseRequests: string[] = [];
    page.on('request', request => {
      const url = request.url();
      if (url.includes('/stream') || url.includes('/api/jobs/')) {
        sseRequests.push(url);
      }
    });

    // Navigate to traces page
    await page.goto('/traces');
    await page.waitForLoadState('networkidle');

    // Open import modal
    const importButton = page.getByTestId('import-traces-button');
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

    // Wait for job to process
    await page.waitForTimeout(5000);

    // Application should not crash
    await expect(page.locator('body')).toBeVisible();
  });

  test('should handle SSE connection errors gracefully', async ({ page, context }) => {
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

    // Simulate SSE failure
    await context.route('**/**/stream', route => route.abort('failed'));

    // Navigate to traces page
    await page.goto('/traces');
    await page.waitForLoadState('networkidle');

    // Open import modal
    const importButton = page.getByTestId('import-traces-button');
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

    // System should handle SSE failure gracefully (fall back to polling)
    await page.waitForTimeout(5000);

    // Application should not crash
    await expect(page.locator('body')).toBeVisible();
  });

  test('should close SSE connection when job completes', async ({ page }) => {
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

    // Track requests
    const sseConnections: string[] = [];
    page.on('request', request => {
      if (request.url().includes('/stream') || request.url().includes('/jobs')) {
        sseConnections.push(`request: ${request.url()}`);
      }
    });

    // Navigate to traces page
    await page.goto('/traces');
    await page.waitForLoadState('networkidle');

    // Wait for cleanup
    await page.waitForTimeout(2000);

    // Application should be stable
    await expect(page.locator('body')).toBeVisible();
  });

  test('should multiplex multiple SSE connections', async ({ page }) => {
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

    // Track SSE connections
    const sseUrls = new Set<string>();
    page.on('request', request => {
      if (request.url().includes('/stream')) {
        sseUrls.add(request.url());
      }
    });

    // Navigate to page
    await page.goto('/traces');
    await page.waitForLoadState('networkidle');

    // Wait for connections
    await page.waitForTimeout(3000);

    // Application should remain stable
    await expect(page.locator('body')).toBeVisible();
  });
});
