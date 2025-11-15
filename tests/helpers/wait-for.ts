import { Page } from '@playwright/test';
import { TestAPIClient } from './api-client';

export async function waitForJobCompletion(
  apiClient: TestAPIClient,
  jobId: string,
  options: { timeout?: number; interval?: number } = {}
): Promise<any> {
  const timeout = options.timeout || 90000;
  const interval = options.interval || 2000;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const job = await apiClient.getJob(jobId);

    if (job.status === 'completed') {
      return job;
    }

    if (job.status === 'failed') {
      throw new Error(`Job failed: ${job.error_message}`);
    }

    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error(`Job ${jobId} did not complete within ${timeout}ms`);
}

export async function waitForSelector(
  page: Page,
  selector: string,
  options: { timeout?: number; state?: 'attached' | 'detached' | 'visible' | 'hidden' } = {}
) {
  return page.waitForSelector(selector, {
    timeout: options.timeout || 30000,
    state: options.state || 'visible',
  });
}

export async function waitForToast(
  page: Page,
  message: string | RegExp,
  options: { timeout?: number } = {}
): Promise<void> {
  const selector = typeof message === 'string'
    ? `text="${message}"`
    : `text=${message}`;

  await page.waitForSelector(selector, {
    timeout: options.timeout || 10000,
  });
}

export async function waitForAPIResponse(
  page: Page,
  urlPattern: string | RegExp,
  options: { timeout?: number } = {}
): Promise<any> {
  const response = await page.waitForResponse(
    resp => {
      const url = resp.url();
      return typeof urlPattern === 'string'
        ? url.includes(urlPattern)
        : urlPattern.test(url);
    },
    { timeout: options.timeout || 30000 }
  );

  return response.json();
}
