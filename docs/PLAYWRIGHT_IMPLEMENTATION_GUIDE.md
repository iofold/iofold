# Playwright Implementation Guide - Quick Start

**Companion to**: E2E_TESTING_PLAN.md
**Purpose**: Practical code examples and setup instructions

---

## Quick Setup

### 1. Install Playwright

```bash
cd /home/ygupta/workspace/iofold
npm install -D @playwright/test
npx playwright install
```

### 2. Create Project Structure

```bash
mkdir -p tests/e2e/{01-smoke,02-integrations,03-traces,04-eval-sets,05-evals,06-jobs,07-integration,08-error-handling}
mkdir -p tests/{fixtures,helpers}
```

### 3. Configuration File

Create `playwright.config.ts`:

```typescript
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120 * 1000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 4,

  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['list'],
  ],

  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 15000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: [
    {
      command: 'npm run dev',
      port: 8787,
      timeout: 30000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'cd frontend && npm run dev',
      port: 3000,
      timeout: 30000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
```

---

## Helper Functions

### API Client Helper

`tests/helpers/api-client.ts`:

```typescript
export class TestAPIClient {
  private baseURL: string;
  private workspaceId: string;

  constructor() {
    this.baseURL = process.env.API_URL || 'http://localhost:8787/v1';
    this.workspaceId = 'workspace_default';
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Workspace-Id': this.workspaceId,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`API Error: ${error.error?.message || response.statusText}`);
    }

    if (response.status === 204) return null;
    return response.json();
  }

  // Integrations
  async createIntegration(data: {
    platform: string;
    name: string;
    api_key: string;
    base_url?: string;
  }) {
    return this.request('/api/integrations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteIntegration(id: string) {
    return this.request(`/api/integrations/${id}`, { method: 'DELETE' });
  }

  // Traces
  async importTraces(data: {
    integration_id: string;
    limit?: number;
    date_from?: string;
    date_to?: string;
  }) {
    return this.request('/api/traces/import', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getJob(jobId: string) {
    return this.request(`/api/jobs/${jobId}`);
  }

  async listTraces(params?: { limit?: number }) {
    const query = params?.limit ? `?limit=${params.limit}` : '';
    return this.request(`/api/traces${query}`);
  }

  // Feedback
  async submitFeedback(data: {
    trace_id: string;
    eval_set_id: string;
    rating: 'positive' | 'negative' | 'neutral';
    notes?: string;
  }) {
    return this.request('/api/feedback', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Eval Sets
  async createEvalSet(data: { name: string; description?: string }) {
    return this.request('/api/eval-sets', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Evals
  async generateEval(evalSetId: string, data: {
    name: string;
    description?: string;
    model: string;
    instructions?: string;
  }) {
    return this.request(`/api/eval-sets/${evalSetId}/generate`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async executeEval(evalId: string, data?: { trace_ids?: string[] }) {
    return this.request(`/api/evals/${evalId}/execute`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    });
  }
}

export function getAPIClient(): TestAPIClient {
  return new TestAPIClient();
}
```

### Wait Helpers

`tests/helpers/wait-for.ts`:

```typescript
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
  message: string,
  options: { timeout?: number } = {}
): Promise<void> {
  await page.waitForSelector(`text="${message}"`, {
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
```

### Fixtures

`tests/fixtures/integrations.ts`:

```typescript
import { TestAPIClient } from '../helpers/api-client';

export async function seedIntegration(apiClient: TestAPIClient) {
  const name = `Test Integration ${Date.now()}`;
  const integration = await apiClient.createIntegration({
    platform: 'langfuse',
    name,
    api_key: process.env.TEST_LANGFUSE_KEY || 'test_key',
    base_url: 'https://cloud.langfuse.com',
  });

  return integration;
}

export async function cleanupIntegration(apiClient: TestAPIClient, integrationId: string) {
  try {
    await apiClient.deleteIntegration(integrationId);
  } catch (error) {
    console.error(`Failed to cleanup integration ${integrationId}:`, error);
  }
}
```

`tests/fixtures/traces.ts`:

```typescript
import { TestAPIClient } from '../helpers/api-client';
import { waitForJobCompletion } from '../helpers/wait-for';

export async function seedTraces(
  apiClient: TestAPIClient,
  integrationId: string,
  count: number = 10
): Promise<string[]> {
  const jobResponse = await apiClient.importTraces({
    integration_id: integrationId,
    limit: count,
  });

  await waitForJobCompletion(apiClient, jobResponse.job_id);

  const tracesResponse = await apiClient.listTraces({ limit: count });
  return tracesResponse.traces.map(t => t.id);
}
```

---

## Example Test Implementations

### Smoke Test

`tests/e2e/01-smoke/home.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

test.describe('Smoke Tests', () => {
  test('should load home page without errors', async ({ page }) => {
    // Navigate to home
    await page.goto('/');

    // Verify page loads
    await expect(page).toHaveTitle(/iofold/i);

    // Check navigation menu
    await expect(page.getByRole('link', { name: /integrations/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /traces/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /eval sets/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /evals/i })).toBeVisible();

    // No console errors
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    expect(errors).toHaveLength(0);
  });

  test('should navigate between pages', async ({ page }) => {
    await page.goto('/');

    // Navigate to integrations
    await page.click('text=Integrations');
    await expect(page).toHaveURL(/\/integrations/);
    await expect(page.getByRole('heading', { name: /integrations/i })).toBeVisible();

    // Navigate to traces
    await page.click('text=Traces');
    await expect(page).toHaveURL(/\/traces/);
    await expect(page.getByRole('heading', { name: /traces/i })).toBeVisible();

    // Navigate to eval sets
    await page.click('text=Eval Sets');
    await expect(page).toHaveURL(/\/eval-sets/);
    await expect(page.getByRole('heading', { name: /eval sets/i })).toBeVisible();
  });
});
```

### Integration Test

`tests/e2e/02-integrations/add-integration.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { getAPIClient } from '../../helpers/api-client';
import { waitForToast } from '../../helpers/wait-for';

test.describe('Integration Management', () => {
  let apiClient: ReturnType<typeof getAPIClient>;
  let integrationId: string | null = null;

  test.beforeEach(() => {
    apiClient = getAPIClient();
  });

  test.afterEach(async () => {
    if (integrationId) {
      try {
        await apiClient.deleteIntegration(integrationId);
      } catch (error) {
        console.error('Cleanup failed:', error);
      }
    }
  });

  test('should create Langfuse integration successfully', async ({ page }) => {
    await page.goto('/integrations');

    // Click add integration button
    await page.click('button:has-text("Add Integration")');

    // Verify modal opens
    await expect(page.getByRole('dialog')).toBeVisible();

    // Fill form
    await page.selectOption('[name="platform"]', 'langfuse');
    await page.fill('[name="name"]', `Test Integration ${Date.now()}`);
    await page.fill('[name="public_key"]', process.env.TEST_LANGFUSE_PUBLIC_KEY || 'pk_test');
    await page.fill('[name="secret_key"]', process.env.TEST_LANGFUSE_SECRET_KEY || 'sk_test');
    await page.fill('[name="base_url"]', 'https://cloud.langfuse.com');

    // Submit form
    await page.click('button:has-text("Add Integration")');

    // Wait for success toast
    await waitForToast(page, /integration added successfully/i);

    // Verify modal closes
    await expect(page.getByRole('dialog')).not.toBeVisible();

    // Verify integration appears in list
    await expect(page.getByText(`Test Integration`)).toBeVisible();
    await expect(page.getByText('active')).toBeVisible();

    // Store integration ID for cleanup
    const integrationCard = page.locator('[data-testid="integration-card"]').first();
    integrationId = await integrationCard.getAttribute('data-integration-id');
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/integrations');

    await page.click('button:has-text("Add Integration")');
    await page.selectOption('[name="platform"]', 'langfuse');
    await page.fill('[name="name"]', 'Invalid Integration');
    await page.fill('[name="public_key"]', 'invalid_key');
    await page.fill('[name="secret_key"]', 'invalid_secret');
    await page.fill('[name="base_url"]', 'https://cloud.langfuse.com');

    await page.click('button:has-text("Add Integration")');

    // Wait for error toast (integration may be created but marked as error status)
    // OR modal stays open with error
    // This depends on your implementation
    await waitForToast(page, /error|failed/i, { timeout: 10000 });
  });
});
```

### Trace Import Test

`tests/e2e/03-traces/import-traces.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { getAPIClient } from '../../helpers/api-client';
import { waitForJobCompletion, waitForToast } from '../../helpers/wait-for';
import { seedIntegration } from '../../fixtures/integrations';

test.describe('Trace Import', () => {
  let apiClient: ReturnType<typeof getAPIClient>;
  let integrationId: string;

  test.beforeEach(async () => {
    apiClient = getAPIClient();
    const integration = await seedIntegration(apiClient);
    integrationId = integration.id;
  });

  test.afterEach(async () => {
    if (integrationId) {
      await apiClient.deleteIntegration(integrationId);
    }
  });

  test('should import traces successfully', async ({ page }) => {
    await page.goto('/traces');

    // Open import modal
    await page.click('button:has-text("Import Traces")');
    await expect(page.getByRole('dialog')).toBeVisible();

    // Fill form
    await page.selectOption('[name="integration_id"]', integrationId);
    await page.fill('[name="limit"]', '10');

    // Submit
    await page.click('button:has-text("Import")');

    // Wait for job to be created
    const jobIdText = await page.textContent('[data-testid="job-id"]');
    const jobId = jobIdText?.match(/job_[a-f0-9-]+/)?.[0];
    expect(jobId).toBeTruthy();

    // Monitor progress
    await expect(page.locator('[data-testid="progress-bar"]')).toBeVisible();

    // Wait for completion using API
    await waitForJobCompletion(apiClient, jobId!, { timeout: 90000 });

    // Wait for UI to update
    await waitForToast(page, /import complete/i, { timeout: 10000 });

    // Verify modal closes
    await expect(page.getByRole('dialog')).not.toBeVisible({ timeout: 5000 });

    // Verify traces appear in list
    await page.waitForLoadState('networkidle');
    const traceCount = await page.locator('[data-testid="trace-row"]').count();
    expect(traceCount).toBeGreaterThanOrEqual(10);
  });

  test('should handle import with date range', async ({ page }) => {
    await page.goto('/traces');
    await page.click('button:has-text("Import Traces")');

    await page.selectOption('[name="integration_id"]', integrationId);
    await page.fill('[name="limit"]', '5');
    await page.fill('[name="date_from"]', '2025-11-01');
    await page.fill('[name="date_to"]', '2025-11-13');

    await page.click('button:has-text("Import")');

    const jobIdText = await page.textContent('[data-testid="job-id"]');
    const jobId = jobIdText?.match(/job_[a-f0-9-]+/)?.[0];

    await waitForJobCompletion(apiClient, jobId!, { timeout: 90000 });
    await waitForToast(page, /import complete/i);

    // Verify traces within date range
    const traces = await apiClient.listTraces({ limit: 50 });
    traces.traces.forEach(trace => {
      const traceDate = new Date(trace.timestamp);
      expect(traceDate.getTime()).toBeGreaterThanOrEqual(new Date('2025-11-01').getTime());
      expect(traceDate.getTime()).toBeLessThanOrEqual(new Date('2025-11-13').getTime());
    });
  });
});
```

### Feedback Test

`tests/e2e/03-traces/feedback-submission.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { getAPIClient } from '../../helpers/api-client';
import { seedIntegration } from '../../fixtures/integrations';
import { seedTraces } from '../../fixtures/traces';
import { waitForToast } from '../../helpers/wait-for';

test.describe('Feedback Submission', () => {
  let apiClient: ReturnType<typeof getAPIClient>;
  let integrationId: string;
  let traceIds: string[];

  test.beforeEach(async () => {
    apiClient = getAPIClient();
    const integration = await seedIntegration(apiClient);
    integrationId = integration.id;
    traceIds = await seedTraces(apiClient, integrationId, 5);
  });

  test.afterEach(async () => {
    if (integrationId) {
      await apiClient.deleteIntegration(integrationId);
    }
  });

  test('should submit positive feedback', async ({ page }) => {
    const traceId = traceIds[0];
    await page.goto(`/traces/${traceId}`);

    // Wait for page to load
    await expect(page.getByRole('heading', { name: /trace detail/i })).toBeVisible();

    // Click positive feedback button
    await page.click('[data-testid="feedback-positive"]');

    // Wait for success toast
    await waitForToast(page, /feedback updated/i);

    // Verify button shows active state
    await expect(page.locator('[data-testid="feedback-positive"]')).toHaveClass(/bg-green-100/);
  });

  test('should change feedback rating', async ({ page }) => {
    const traceId = traceIds[0];
    await page.goto(`/traces/${traceId}`);

    // Submit positive
    await page.click('[data-testid="feedback-positive"]');
    await waitForToast(page, /feedback updated/i);
    await expect(page.locator('[data-testid="feedback-positive"]')).toHaveClass(/bg-green-100/);

    // Change to negative
    await page.click('[data-testid="feedback-negative"]');
    await waitForToast(page, /feedback updated/i);

    // Verify state updated
    await expect(page.locator('[data-testid="feedback-negative"]')).toHaveClass(/bg-red-100/);
    await expect(page.locator('[data-testid="feedback-positive"]')).not.toHaveClass(/bg-green-100/);
  });

  test('should handle keyboard shortcuts', async ({ page }) => {
    const traceId = traceIds[0];
    await page.goto(`/traces/${traceId}`);

    // Press "1" for positive
    await page.keyboard.press('1');
    await waitForToast(page, /feedback updated/i);
    await expect(page.locator('[data-testid="feedback-positive"]')).toHaveClass(/bg-green-100/);

    // Press "2" for neutral
    await page.keyboard.press('2');
    await waitForToast(page, /feedback updated/i);
    await expect(page.locator('[data-testid="feedback-neutral"]')).toHaveClass(/bg-gray-100/);

    // Press "3" for negative
    await page.keyboard.press('3');
    await waitForToast(page, /feedback updated/i);
    await expect(page.locator('[data-testid="feedback-negative"]')).toHaveClass(/bg-red-100/);
  });
});
```

### Complete Workflow Test

`tests/e2e/07-integration/complete-workflow.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';
import { getAPIClient } from '../../helpers/api-client';
import { waitForJobCompletion, waitForToast } from '../../helpers/wait-for';

test.describe('Complete Workflow', () => {
  test('should complete full eval generation workflow', async ({ page }) => {
    const apiClient = getAPIClient();
    let integrationId: string;
    let evalSetId: string;

    test.setTimeout(300000); // 5 minutes for full workflow

    // Step 1: Create integration via UI
    await page.goto('/integrations');
    await page.click('button:has-text("Add Integration")');
    await page.selectOption('[name="platform"]', 'langfuse');
    await page.fill('[name="name"]', `Workflow Test ${Date.now()}`);
    await page.fill('[name="public_key"]', process.env.TEST_LANGFUSE_PUBLIC_KEY!);
    await page.fill('[name="secret_key"]', process.env.TEST_LANGFUSE_SECRET_KEY!);
    await page.fill('[name="base_url"]', 'https://cloud.langfuse.com');
    await page.click('button:has-text("Add Integration")');
    await waitForToast(page, /integration added/i);

    // Get integration ID
    const integrationCard = page.locator('[data-testid="integration-card"]').first();
    integrationId = (await integrationCard.getAttribute('data-integration-id'))!;

    // Step 2: Import traces
    await page.goto('/traces');
    await page.click('button:has-text("Import Traces")');
    await page.selectOption('[name="integration_id"]', integrationId);
    await page.fill('[name="limit"]', '10');
    await page.click('button:has-text("Import")');

    const importJobId = (await page.textContent('[data-testid="job-id"]'))?.match(/job_[a-f0-9-]+/)?.[0];
    await waitForJobCompletion(apiClient, importJobId!, { timeout: 90000 });
    await waitForToast(page, /import complete/i);

    // Step 3: Create eval set
    await page.goto('/eval-sets');
    await page.click('button:has-text("Create Eval Set")');
    await page.fill('[name="name"]', `Workflow Eval Set ${Date.now()}`);
    await page.fill('[name="description"]', 'Testing complete workflow');
    await page.click('button:has-text("Create")');
    await waitForToast(page, /eval set created/i);

    // Get eval set ID
    evalSetId = (await page.url()).match(/eval-sets\/([a-z0-9_-]+)/)?.[1]!;

    // Step 4: Submit feedback on traces
    const traces = await apiClient.listTraces({ limit: 10 });

    // Submit 3 positive
    for (let i = 0; i < 3; i++) {
      await page.goto(`/traces/${traces.traces[i].id}`);
      await page.keyboard.press('1');
      await waitForToast(page, /feedback updated/i);
    }

    // Submit 2 negative
    for (let i = 3; i < 5; i++) {
      await page.goto(`/traces/${traces.traces[i].id}`);
      await page.keyboard.press('3');
      await waitForToast(page, /feedback updated/i);
    }

    // Step 5: Generate eval
    await page.goto(`/eval-sets/${evalSetId}`);
    await page.click('button:has-text("Generate Eval")');
    await page.fill('[name="name"]', `Workflow Eval ${Date.now()}`);
    await page.fill('[name="description"]', 'Generated via workflow test');
    await page.selectOption('[name="model"]', 'claude-3-haiku-20240307');
    await page.click('button:has-text("Generate")');

    const genJobId = (await page.textContent('[data-testid="job-id"]'))?.match(/job_[a-f0-9-]+/)?.[0];
    await waitForJobCompletion(apiClient, genJobId!, { timeout: 120000 });
    await waitForToast(page, /eval generated/i);

    // Step 6: Execute eval
    await page.goto('/evals');
    const evalCard = page.locator('[data-testid="eval-card"]').first();
    const evalId = (await evalCard.getAttribute('data-eval-id'))!;

    await page.goto(`/evals/${evalId}`);
    await page.click('button:has-text("Execute Eval")');
    await page.click('button:has-text("Execute")');

    const execJobId = (await page.textContent('[data-testid="job-id"]'))?.match(/job_[a-f0-9-]+/)?.[0];
    await waitForJobCompletion(apiClient, execJobId!, { timeout: 90000 });
    await waitForToast(page, /eval executed/i);

    // Step 7: Verify results
    await page.goto(`/evals/${evalId}`);
    await expect(page.getByText(/accuracy:/i)).toBeVisible();

    const accuracyText = await page.textContent('[data-testid="accuracy"]');
    expect(accuracyText).toMatch(/\d+%/);

    // Cleanup
    await apiClient.deleteIntegration(integrationId);
  });
});
```

---

## Running Tests

### Basic Commands

```bash
# Run all tests
npx playwright test

# Run specific test file
npx playwright test tests/e2e/01-smoke/home.spec.ts

# Run tests matching pattern
npx playwright test --grep "should import traces"

# Run in headed mode (see browser)
npx playwright test --headed

# Run in debug mode (step through)
npx playwright test --debug

# Run with specific workers
npx playwright test --workers=2

# Run only failed tests
npx playwright test --last-failed
```

### Useful Flags

```bash
# Update snapshots
npx playwright test --update-snapshots

# Show browser during test
npx playwright test --headed --slowmo=500

# Generate HTML report
npx playwright test && npx playwright show-report

# Run in specific browser
npx playwright test --project=chromium
npx playwright test --project=firefox
npx playwright test --project=webkit
```

---

## Debugging Tips

### 1. Use Page Screenshots

```typescript
test('debug test', async ({ page }) => {
  await page.goto('/traces');
  await page.screenshot({ path: 'debug-screenshot.png', fullPage: true });
});
```

### 2. Use Playwright Inspector

```bash
npx playwright test --debug
```

### 3. Use Console Logs

```typescript
test('debug test', async ({ page }) => {
  page.on('console', msg => console.log('Browser console:', msg.text()));
  await page.goto('/traces');
});
```

### 4. Use Slow Motion

```typescript
test.use({ launchOptions: { slowMo: 1000 } });
```

---

## CI/CD Integration

### GitHub Actions

`.github/workflows/e2e-tests.yml`:

```yaml
name: E2E Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright
        run: npx playwright install --with-deps

      - name: Run E2E tests
        run: npx playwright test
        env:
          CI: true
          TEST_LANGFUSE_PUBLIC_KEY: ${{ secrets.TEST_LANGFUSE_PUBLIC_KEY }}
          TEST_LANGFUSE_SECRET_KEY: ${{ secrets.TEST_LANGFUSE_SECRET_KEY }}

      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 30
```

---

## Next Steps

1. **Install Playwright**: `npm install -D @playwright/test`
2. **Create config file**: `playwright.config.ts`
3. **Create helpers and fixtures**: From examples above
4. **Write smoke tests first**: Start with 5 critical tests
5. **Expand coverage**: Add feature tests incrementally
6. **Run tests**: `npx playwright test`
7. **Fix flaky tests**: Monitor and stabilize
8. **Add to CI/CD**: GitHub Actions workflow

---

**Quick Start Time**: ~30 minutes to setup, ~2 hours to write first 10 tests

_End of Implementation Guide_
