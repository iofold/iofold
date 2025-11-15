import { Page } from '@playwright/test';

/**
 * Helper to get API client for backend requests during tests
 */
export function getAPIBaseURL(): string {
  return process.env.API_URL || 'http://localhost:8787/v1';
}

/**
 * Helper to get default workspace ID
 */
export function getWorkspaceId(): string {
  return process.env.WORKSPACE_ID || 'workspace_default';
}

/**
 * Helper to make authenticated API requests
 */
export async function apiRequest<T>(
  page: Page,
  endpoint: string,
  options: RequestInit & { data?: any } = {}
): Promise<T> {
  const baseURL = getAPIBaseURL();
  const workspaceId = getWorkspaceId();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Workspace-Id': workspaceId,
  };

  // Convert data to body if provided
  const { data, ...restOptions } = options;

  // Prepare request options for Playwright's request API
  const requestOptions: any = {
    ...restOptions,
    headers: {
      ...headers,
      ...restOptions.headers,
    },
  };

  // For Playwright's request API, use 'data' property for JSON bodies
  if (data !== undefined) {
    requestOptions.data = data;
  } else if (restOptions.body) {
    // If body is already set (not via data), keep it
    requestOptions.data = typeof restOptions.body === 'string'
      ? JSON.parse(restOptions.body)
      : restOptions.body;
  }

  // Debug logging
  if (process.env.DEBUG_API) {
    console.log('[apiRequest] URL:', `${baseURL}${endpoint}`);
    console.log('[apiRequest] Method:', requestOptions.method);
    console.log('[apiRequest] Headers:', requestOptions.headers);
    console.log('[apiRequest] Data:', requestOptions.data);
  }

  const response = await page.request.fetch(`${baseURL}${endpoint}`, requestOptions);

  if (!response.ok()) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`API request failed: ${response.status()} ${JSON.stringify(error)}`);
  }

  // Handle 204 No Content
  if (response.status() === 204) {
    return {} as T;
  }

  return response.json();
}

/**
 * Wait for a job to complete with polling
 */
export async function waitForJobCompletion(
  page: Page,
  jobId: string,
  options: { timeout?: number; pollInterval?: number } = {}
): Promise<any> {
  const timeout = options.timeout || 120000; // 2 minutes default
  const pollInterval = options.pollInterval || 2000; // 2 seconds
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const job = await apiRequest(page, `/api/jobs/${jobId}`);

    if ((job as any).status === 'completed') {
      return job;
    }

    if ((job as any).status === 'failed') {
      throw new Error(`Job failed: ${(job as any).error_message || 'Unknown error'}`);
    }

    if ((job as any).status === 'cancelled') {
      throw new Error('Job was cancelled');
    }

    // Wait before polling again
    await page.waitForTimeout(pollInterval);
  }

  throw new Error(`Job ${jobId} did not complete within ${timeout}ms`);
}

/**
 * Wait for a toast message to appear
 */
export async function waitForToast(
  page: Page,
  message: string,
  timeout: number = 5000
): Promise<void> {
  await page.waitForSelector(`text="${message}"`, { timeout, state: 'visible' });
}

/**
 * Generate a unique name with timestamp
 */
export function uniqueName(prefix: string): string {
  return `${prefix} ${Date.now()}`;
}

/**
 * Check if ANTHROPIC_API_KEY is set
 */
export function checkAnthropicAPIKey(): void {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      'ANTHROPIC_API_KEY environment variable is required for eval generation tests. ' +
      'Please set it in your .env file or environment.'
    );
  }
}

/**
 * Wait for element and click
 */
export async function clickElement(page: Page, selector: string, options?: { timeout?: number }) {
  await page.waitForSelector(selector, { timeout: options?.timeout || 10000, state: 'visible' });
  await page.click(selector);
}

/**
 * Wait for navigation to complete
 */
export async function waitForNavigation(page: Page, url: string, timeout: number = 10000) {
  await page.waitForURL(url, { timeout });
}

/**
 * Get text content safely
 */
export async function getTextContent(page: Page, selector: string): Promise<string> {
  const element = await page.waitForSelector(selector, { state: 'visible' });
  const text = await element.textContent();
  return text || '';
}

/**
 * Fill form field
 */
export async function fillField(page: Page, selector: string, value: string) {
  await page.waitForSelector(selector, { state: 'visible' });
  await page.fill(selector, value);
}

/**
 * Select dropdown option
 */
export async function selectOption(page: Page, selector: string, value: string) {
  await page.waitForSelector(selector, { state: 'visible' });
  await page.selectOption(selector, value);
}

/**
 * Wait for element to be removed
 */
export async function waitForElementRemoved(page: Page, selector: string, timeout: number = 10000) {
  await page.waitForSelector(selector, { state: 'detached', timeout });
}

/**
 * Check if element exists
 */
export async function elementExists(page: Page, selector: string): Promise<boolean> {
  const element = await page.$(selector);
  return element !== null;
}

/**
 * Get element count
 */
export async function getElementCount(page: Page, selector: string): Promise<number> {
  return page.locator(selector).count();
}

/**
 * Wait for job ID to appear in the UI
 */
export async function extractJobId(page: Page, timeout: number = 10000): Promise<string> {
  // Wait for job ID to appear in text content (adjust selector based on your UI)
  await page.waitForTimeout(1000); // Brief wait for UI update

  // Try to find job ID in various places
  const bodyText = await page.textContent('body');
  const jobIdMatch = bodyText?.match(/job_[a-f0-9-]+/);

  if (!jobIdMatch) {
    throw new Error('Could not extract job ID from page');
  }

  return jobIdMatch[0];
}
