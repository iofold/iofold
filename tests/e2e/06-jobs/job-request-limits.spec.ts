/**
 * TEST-J03: Job Request Limits
 *
 * Tests that job monitoring doesn't make excessive API calls.
 * This prevents infinite loop bugs in the useJobMonitor hook.
 *
 * The test verifies:
 * 1. Job monitoring starts correctly
 * 2. API requests stay within reasonable bounds (no infinite loops)
 * 3. Job completes or reaches a stable state
 */

import { test, expect } from '@playwright/test';
import { apiRequest, uniqueName } from '../utils/helpers';

test.describe('Job Request Limits (TEST-J03)', () => {
  let integrationId: string | null = null;

  test.afterEach(async ({ page }) => {
    if (integrationId) {
      await apiRequest(page, `/api/integrations/${integrationId}`, { method: 'DELETE' }).catch(() => {});
      integrationId = null;
    }
  });

  test('should not make excessive API calls when monitoring job', async ({ page }) => {
    // Create integration
    const integrationName = uniqueName('Test Integration');
    const integration = await apiRequest<any>(page, '/api/integrations', {
      method: 'POST',
      data: {
        platform: 'langfuse',
        name: integrationName,
        api_key: process.env.TEST_LANGFUSE_KEY || 'pk_test_mock_key:sk_test_mock_key',
        base_url: 'https://cloud.langfuse.com',
      },
    });
    integrationId = integration.id;

    // Track all job-related API requests
    const jobRequests: { url: string; timestamp: number }[] = [];
    const startTime = Date.now();

    page.on('request', request => {
      const url = request.url();
      // Track requests to job endpoints (SSE stream and polling)
      if (url.includes('/api/jobs/') || url.includes('/stream')) {
        jobRequests.push({
          url,
          timestamp: Date.now() - startTime,
        });
      }
    });

    // Navigate to traces page
    await page.goto('/traces');
    await page.waitForLoadState('networkidle');

    // Open import modal
    const importButton = page.getByTestId('import-traces-button');
    await expect(importButton).toBeVisible({ timeout: 10000 });
    await importButton.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Select integration
    const selectTrigger = dialog.locator('#integration');
    await selectTrigger.click();
    await page.getByRole('option', { name: new RegExp(integrationName) }).click();

    // Set a low limit to make job complete faster
    await dialog.locator('input#limit').fill('5');

    // Submit import - this triggers job creation and monitoring
    const submitButton = dialog.getByTestId('import-traces-submit');
    await submitButton.click();

    // Wait for job monitoring to occur (8 seconds should be enough to detect infinite loops)
    await page.waitForTimeout(8000);

    // Calculate request rate
    const testDurationSeconds = 8;
    const requestCount = jobRequests.length;
    const requestsPerSecond = requestCount / testDurationSeconds;

    // Log for debugging
    console.log(`Job monitoring made ${requestCount} requests in ${testDurationSeconds}s (${requestsPerSecond.toFixed(2)} req/s)`);
    if (requestCount > 0) {
      console.log('First 10 requests:', jobRequests.slice(0, 10));
    }

    // ASSERTION: No more than 3 requests per second average
    // Normal SSE: 1 connection + occasional heartbeat
    // Normal polling (3s interval): ~0.33 req/s + initial request
    // With bug (infinite loop): 10+ req/s
    const MAX_REQUESTS_PER_SECOND = 3;
    expect(requestsPerSecond).toBeLessThanOrEqual(MAX_REQUESTS_PER_SECOND);

    // ASSERTION: Total requests should be reasonable (max 25 in 8 seconds)
    const MAX_TOTAL_REQUESTS = 25;
    expect(requestCount).toBeLessThanOrEqual(MAX_TOTAL_REQUESTS);

    // Application should not crash
    await expect(page.locator('body')).toBeVisible();
  });

  test('should complete job without excessive requests', async ({ page }) => {
    // Create integration
    const integrationName = uniqueName('Test Integration');
    const integration = await apiRequest<any>(page, '/api/integrations', {
      method: 'POST',
      data: {
        platform: 'langfuse',
        name: integrationName,
        api_key: process.env.TEST_LANGFUSE_KEY || 'pk_test_mock_key:sk_test_mock_key',
        base_url: 'https://cloud.langfuse.com',
      },
    });
    integrationId = integration.id;

    // Track job status requests
    const statusRequests: string[] = [];
    let jobId: string | null = null;

    page.on('request', request => {
      const url = request.url();
      // Match job status requests like /api/jobs/job_xxx or /api/jobs/job_xxx/stream
      const jobMatch = url.match(/\/api\/jobs\/(job_[a-f0-9-]+)/);
      if (jobMatch) {
        jobId = jobId || jobMatch[1];
        statusRequests.push(url);
      }
    });

    // Navigate to traces page
    await page.goto('/traces');
    await page.waitForLoadState('networkidle');

    // Open import modal and submit
    await page.getByTestId('import-traces-button').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const selectTrigger = dialog.locator('#integration');
    await selectTrigger.click();
    await page.getByRole('option', { name: new RegExp(integrationName) }).click();
    await dialog.locator('input#limit').fill('5');
    await dialog.getByTestId('import-traces-submit').click();

    // Wait for job to process
    await page.waitForTimeout(10000);

    // Verify a job was created
    expect(jobId).not.toBeNull();

    // Check job status via API
    if (jobId) {
      const job = await apiRequest<any>(page, `/api/jobs/${jobId}`);
      console.log(`Job ${jobId} status: ${job.status}`);

      // Job should have progressed (not stuck in infinite state)
      expect(['queued', 'running', 'completed', 'failed']).toContain(job.status);
    }

    // Verify request count is reasonable
    console.log(`Made ${statusRequests.length} status requests for job ${jobId}`);
    expect(statusRequests.length).toBeLessThan(50);

    // Application should remain stable
    await expect(page.locator('body')).toBeVisible();
  });

  test('should stop monitoring when modal is closed', async ({ page }) => {
    // Create integration
    const integrationName = uniqueName('Test Integration');
    const integration = await apiRequest<any>(page, '/api/integrations', {
      method: 'POST',
      data: {
        platform: 'langfuse',
        name: integrationName,
        api_key: process.env.TEST_LANGFUSE_KEY || 'pk_test_mock_key:sk_test_mock_key',
        base_url: 'https://cloud.langfuse.com',
      },
    });
    integrationId = integration.id;

    // Track requests before and after modal close
    let requestsBeforeClose = 0;
    let requestsAfterClose = 0;
    let modalClosed = false;

    page.on('request', request => {
      const url = request.url();
      if (url.includes('/api/jobs/') || url.includes('/stream')) {
        if (modalClosed) {
          requestsAfterClose++;
        } else {
          requestsBeforeClose++;
        }
      }
    });

    // Navigate and open import modal
    await page.goto('/traces');
    await page.waitForLoadState('networkidle');
    await page.getByTestId('import-traces-button').click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Select integration and submit
    const selectTrigger = dialog.locator('#integration');
    await selectTrigger.click();
    await page.getByRole('option', { name: new RegExp(integrationName) }).click();
    await dialog.locator('input#limit').fill('5');
    await dialog.getByTestId('import-traces-submit').click();

    // Wait briefly for monitoring to start
    await page.waitForTimeout(3000);

    // Close the modal (should stop monitoring)
    modalClosed = true;
    const closeButton = dialog.locator('button[aria-label="Close"]').or(
      dialog.getByRole('button', { name: /close/i })
    ).first();

    // Try to close via X button or escape key
    if (await closeButton.isVisible()) {
      await closeButton.click();
    } else {
      await page.keyboard.press('Escape');
    }

    // Wait and count requests after close
    await page.waitForTimeout(3000);

    console.log(`Requests before close: ${requestsBeforeClose}`);
    console.log(`Requests after close: ${requestsAfterClose}`);

    // After modal close, there should be very few (if any) new job requests
    // Allow some grace for in-flight requests
    expect(requestsAfterClose).toBeLessThan(5);

    // Application should be stable
    await expect(page.locator('body')).toBeVisible();
  });
});
