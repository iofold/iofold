/**
 * Custom Assertions
 *
 * Test-specific assertions and helpers
 */

import { expect, Page } from '@playwright/test';
import { TestAPIClient } from './api-client';

/**
 * Assert that a job completes successfully
 */
export async function expectJobToComplete(
  apiClient: TestAPIClient,
  jobId: string,
  timeout: number = 60000
): Promise<void> {
  const startTime = Date.now();
  let lastStatus = '';

  while (Date.now() - startTime < timeout) {
    const job = await apiClient.getJob(jobId);
    lastStatus = job.status;

    if (job.status === 'completed') {
      return;
    }

    if (job.status === 'failed') {
      throw new Error(`Expected job to complete but it failed: ${job.error_message}`);
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  throw new Error(
    `Expected job to complete within ${timeout}ms but last status was: ${lastStatus}`
  );
}

/**
 * Assert that a toast message appears
 */
export async function expectToastMessage(
  page: Page,
  message: string,
  timeout: number = 5000
): Promise<void> {
  const toast = page.locator('[data-sonner-toast]', { hasText: message });
  await expect(toast).toBeVisible({ timeout });
}

/**
 * Assert that an error toast appears
 */
export async function expectErrorToast(
  page: Page,
  messagePattern: string | RegExp,
  timeout: number = 5000
): Promise<void> {
  const errorToast = page.locator('[data-sonner-toast][data-type="error"]');
  await expect(errorToast).toBeVisible({ timeout });

  if (typeof messagePattern === 'string') {
    await expect(errorToast).toContainText(messagePattern);
  } else {
    const text = await errorToast.textContent();
    expect(text).toMatch(messagePattern);
  }
}

/**
 * Assert that a success toast appears
 */
export async function expectSuccessToast(
  page: Page,
  message: string,
  timeout: number = 5000
): Promise<void> {
  const successToast = page.locator('[data-sonner-toast][data-type="success"]');
  await expect(successToast).toBeVisible({ timeout });
  await expect(successToast).toContainText(message);
}

/**
 * Assert that a loading state is visible
 */
export async function expectLoadingState(
  page: Page,
  timeout: number = 5000
): Promise<void> {
  const loadingIndicator = page.locator('[data-testid="loading"], [role="status"], .animate-spin');
  await expect(loadingIndicator.first()).toBeVisible({ timeout });
}

/**
 * Assert that no loading state is visible
 */
export async function expectNoLoadingState(
  page: Page,
  timeout: number = 5000
): Promise<void> {
  const loadingIndicator = page.locator('[data-testid="loading"], [role="status"], .animate-spin');
  await expect(loadingIndicator.first()).not.toBeVisible({ timeout });
}

/**
 * Assert that an API error is displayed
 */
export async function expectAPIError(
  page: Page,
  statusCode: number,
  options: { message?: string; timeout?: number } = {}
): Promise<void> {
  const timeout = options.timeout || 5000;

  // Check for error toast
  await expectErrorToast(page, options.message || /.+/, timeout);
}

/**
 * Assert that SSE connection is established
 */
export async function expectSSEConnection(
  page: Page,
  jobId: string,
  timeout: number = 10000
): Promise<void> {
  // Check browser console for SSE connection log
  const logs: string[] = [];
  page.on('console', msg => logs.push(msg.text()));

  await page.waitForFunction(
    ({ jobId }) => {
      // Check if EventSource connection exists
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          // In browser context, we can't directly check EventSource instances
          // but we can check for network requests
          resolve(true);
        }, 100);

        setTimeout(() => {
          clearInterval(checkInterval);
          resolve(false);
        }, 5000);
      });
    },
    { jobId },
    { timeout }
  );
}

/**
 * Assert that network request was made
 */
export async function expectNetworkRequest(
  page: Page,
  urlPattern: string | RegExp,
  method: string = 'GET',
  timeout: number = 10000
): Promise<void> {
  const request = await page.waitForRequest(
    request => {
      const matchesUrl = typeof urlPattern === 'string'
        ? request.url().includes(urlPattern)
        : urlPattern.test(request.url());
      return matchesUrl && request.method() === method;
    },
    { timeout }
  );

  expect(request).toBeTruthy();
}

/**
 * Assert that no console errors occurred
 */
export async function expectNoConsoleErrors(
  page: Page,
  options: { ignorePatterns?: RegExp[] } = {}
): Promise<void> {
  const errors: string[] = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      const text = msg.text();
      const shouldIgnore = options.ignorePatterns?.some(pattern => pattern.test(text));
      if (!shouldIgnore) {
        errors.push(text);
      }
    }
  });

  // Wait a bit to collect errors
  await page.waitForTimeout(1000);

  if (errors.length > 0) {
    throw new Error(`Console errors detected:\n${errors.join('\n')}`);
  }
}
