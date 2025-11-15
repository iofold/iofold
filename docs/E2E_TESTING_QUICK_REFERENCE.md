# E2E Testing Quick Reference

Quick copy-paste snippets for implementing Playwright tests.

---

## Test Structure Template

```typescript
import { test, expect } from '@playwright/test';
import { getAPIClient } from '../../helpers/api-client';
import { waitForJobCompletion, waitForToast } from '../../helpers/wait-for';

test.describe('Feature Name', () => {
  let apiClient: ReturnType<typeof getAPIClient>;
  let cleanupIds: { integrations: string[]; evalSets: string[] } = {
    integrations: [],
    evalSets: [],
  };

  test.beforeEach(async () => {
    apiClient = getAPIClient();
  });

  test.afterEach(async () => {
    // Cleanup
    for (const id of cleanupIds.integrations) {
      await apiClient.deleteIntegration(id).catch(console.error);
    }
  });

  test('should do something when condition met', async ({ page }) => {
    // Arrange

    // Act

    // Assert
  });
});
```

---

## Common Assertions

### Page Navigation
```typescript
await expect(page).toHaveURL(/\/traces/);
await expect(page).toHaveTitle(/iofold/);
```

### Element Visibility
```typescript
await expect(page.getByRole('heading', { name: /traces/i })).toBeVisible();
await expect(page.getByText('Import complete')).toBeVisible();
await expect(page.getByRole('dialog')).toBeVisible();
await expect(page.getByRole('dialog')).not.toBeVisible();
```

### Element State
```typescript
await expect(page.locator('[data-testid="button"]')).toBeDisabled();
await expect(page.locator('[data-testid="button"]')).toBeEnabled();
await expect(page.locator('[data-testid="feedback-positive"]')).toHaveClass(/bg-green-100/);
```

### Count Assertions
```typescript
const count = await page.locator('[data-testid="trace-row"]').count();
expect(count).toBe(10);
expect(count).toBeGreaterThan(5);
expect(count).toBeGreaterThanOrEqual(10);
```

### Text Content
```typescript
const text = await page.textContent('[data-testid="accuracy"]');
expect(text).toMatch(/\d+%/);
expect(text).toContain('80%');
```

---

## Common Actions

### Click
```typescript
await page.click('button:has-text("Add Integration")');
await page.click('[data-testid="feedback-positive"]');
await page.getByRole('button', { name: /import/i }).click();
```

### Fill Forms
```typescript
await page.fill('[name="name"]', 'Test Integration');
await page.fill('[name="limit"]', '10');
await page.selectOption('[name="platform"]', 'langfuse');
await page.check('[name="agree"]'); // Checkbox
```

### Keyboard
```typescript
await page.keyboard.press('1');
await page.keyboard.press('Enter');
await page.keyboard.type('Hello World');
```

### Upload Files
```typescript
await page.setInputFiles('[name="file"]', 'path/to/file.txt');
```

### Hover
```typescript
await page.hover('[data-testid="tooltip-trigger"]');
```

---

## Waiting Patterns

### Wait for Element
```typescript
await page.waitForSelector('[data-testid="trace-row"]', {
  timeout: 30000,
  state: 'visible',
});
```

### Wait for Navigation
```typescript
await page.waitForURL(/\/traces\/[a-z0-9_-]+/);
await page.waitForLoadState('networkidle');
```

### Wait for API Response
```typescript
const response = await page.waitForResponse(
  resp => resp.url().includes('/api/traces'),
  { timeout: 30000 }
);
const data = await response.json();
```

### Wait for Job Completion (Custom)
```typescript
import { waitForJobCompletion } from '../../helpers/wait-for';

const jobId = 'job_123';
await waitForJobCompletion(apiClient, jobId, { timeout: 90000 });
```

### Wait for Toast (Custom)
```typescript
import { waitForToast } from '../../helpers/wait-for';

await waitForToast(page, /import complete/i);
await waitForToast(page, 'Feedback updated');
```

---

## Test Data Patterns

### Create Integration
```typescript
const integration = await apiClient.createIntegration({
  platform: 'langfuse',
  name: `Test Integration ${Date.now()}`,
  api_key: process.env.TEST_LANGFUSE_KEY!,
  base_url: 'https://cloud.langfuse.com',
});
cleanupIds.integrations.push(integration.id);
```

### Import Traces
```typescript
const jobResponse = await apiClient.importTraces({
  integration_id: integrationId,
  limit: 10,
});
await waitForJobCompletion(apiClient, jobResponse.job_id);

const traces = await apiClient.listTraces({ limit: 10 });
```

### Submit Feedback
```typescript
await apiClient.submitFeedback({
  trace_id: traceId,
  eval_set_id: evalSetId,
  rating: 'positive',
  notes: 'Great response',
});
```

### Create Eval Set
```typescript
const evalSet = await apiClient.createEvalSet({
  name: `Test Eval Set ${Date.now()}`,
  description: 'Testing',
});
cleanupIds.evalSets.push(evalSet.id);
```

---

## Parallel Test Groups

Organize tests into groups that can run in parallel:

```typescript
// Group 1: smoke
test.describe('Smoke Tests', () => {
  test.describe.configure({ mode: 'parallel' });
  // Tests here run in parallel
});

// Group 2: integrations-1
test.describe('Integration Management - Group 1', () => {
  test.describe.configure({ mode: 'parallel' });
  // Tests here run in parallel
});
```

---

## Debugging Snippets

### Take Screenshot
```typescript
await page.screenshot({ path: 'debug.png', fullPage: true });
await page.locator('[data-testid="card"]').screenshot({ path: 'card.png' });
```

### Log Console Messages
```typescript
page.on('console', msg => console.log('Browser:', msg.text()));
page.on('pageerror', error => console.log('Page error:', error));
```

### Pause Execution
```typescript
await page.pause(); // Opens Playwright Inspector
```

### Slow Motion
```typescript
test.use({ launchOptions: { slowMo: 500 } });
```

---

## API Test Helpers (Copy to helpers/api-client.ts)

```typescript
export class TestAPIClient {
  private baseURL = 'http://localhost:8787/v1';
  private workspaceId = 'workspace_default';

  private async request(endpoint: string, options: RequestInit = {}) {
    const response = await fetch(`${this.baseURL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'X-Workspace-Id': this.workspaceId,
        ...options.headers,
      },
    });

    if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
    if (response.status === 204) return null;
    return response.json();
  }

  async createIntegration(data: any) {
    return this.request('/api/integrations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteIntegration(id: string) {
    return this.request(`/api/integrations/${id}`, { method: 'DELETE' });
  }

  async importTraces(data: any) {
    return this.request('/api/traces/import', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getJob(jobId: string) {
    return this.request(`/api/jobs/${jobId}`);
  }

  async listTraces(params?: any) {
    const query = params?.limit ? `?limit=${params.limit}` : '';
    return this.request(`/api/traces${query}`);
  }

  async submitFeedback(data: any) {
    return this.request('/api/feedback', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async createEvalSet(data: any) {
    return this.request('/api/eval-sets', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async generateEval(evalSetId: string, data: any) {
    return this.request(`/api/eval-sets/${evalSetId}/generate`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async executeEval(evalId: string, data?: any) {
    return this.request(`/api/evals/${evalId}/execute`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    });
  }
}

export function getAPIClient() {
  return new TestAPIClient();
}
```

---

## Wait Helpers (Copy to helpers/wait-for.ts)

```typescript
import { Page } from '@playwright/test';

export async function waitForJobCompletion(
  apiClient: any,
  jobId: string,
  options: { timeout?: number; interval?: number } = {}
) {
  const timeout = options.timeout || 90000;
  const interval = options.interval || 2000;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const job = await apiClient.getJob(jobId);
    if (job.status === 'completed') return job;
    if (job.status === 'failed') throw new Error(`Job failed: ${job.error_message}`);
    await new Promise(resolve => setTimeout(resolve, interval));
  }

  throw new Error(`Job ${jobId} did not complete within ${timeout}ms`);
}

export async function waitForToast(
  page: Page,
  message: string | RegExp,
  options: { timeout?: number } = {}
) {
  const selector = typeof message === 'string'
    ? `text="${message}"`
    : `text=${message}`;

  await page.waitForSelector(selector, {
    timeout: options.timeout || 10000,
  });
}

export async function waitForAPIResponse(
  page: Page,
  urlPattern: string | RegExp
) {
  const response = await page.waitForResponse(
    resp => {
      const url = resp.url();
      return typeof urlPattern === 'string'
        ? url.includes(urlPattern)
        : urlPattern.test(url);
    },
    { timeout: 30000 }
  );
  return response.json();
}
```

---

## Common Test Scenarios

### Test Modal Interaction
```typescript
test('should open and close modal', async ({ page }) => {
  await page.goto('/traces');

  // Open modal
  await page.click('button:has-text("Import Traces")');
  await expect(page.getByRole('dialog')).toBeVisible();

  // Close modal (X button)
  await page.click('[data-testid="close-modal"]');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});
```

### Test Form Submission
```typescript
test('should submit form successfully', async ({ page }) => {
  await page.goto('/integrations');
  await page.click('button:has-text("Add Integration")');

  // Fill form
  await page.selectOption('[name="platform"]', 'langfuse');
  await page.fill('[name="name"]', 'Test');
  await page.fill('[name="api_key"]', 'key_123');

  // Submit
  await page.click('button[type="submit"]');

  // Verify success
  await waitForToast(page, /integration added/i);
  await expect(page.getByText('Test')).toBeVisible();
});
```

### Test Table Interaction
```typescript
test('should display and interact with table', async ({ page }) => {
  await page.goto('/traces');

  // Wait for table to load
  await page.waitForSelector('[data-testid="trace-row"]');

  // Count rows
  const count = await page.locator('[data-testid="trace-row"]').count();
  expect(count).toBeGreaterThan(0);

  // Click first row
  await page.locator('[data-testid="trace-row"]').first().click();

  // Verify navigation
  await expect(page).toHaveURL(/\/traces\/[a-z0-9_-]+/);
});
```

### Test Error Handling
```typescript
test('should show error when API fails', async ({ page }) => {
  // Setup: Stop backend or mock failure

  await page.goto('/traces');

  // Trigger API call
  await page.reload();

  // Verify error state
  await expect(page.getByText(/error|failed/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /retry/i })).toBeVisible();
});
```

### Test Job Progress
```typescript
test('should show job progress', async ({ page }) => {
  const apiClient = getAPIClient();

  await page.goto('/traces');
  await page.click('button:has-text("Import Traces")');

  // Fill and submit
  await page.selectOption('[name="integration_id"]', integrationId);
  await page.fill('[name="limit"]', '10');
  await page.click('button:has-text("Import")');

  // Verify progress bar appears
  await expect(page.locator('[data-testid="progress-bar"]')).toBeVisible();

  // Wait for completion
  const jobIdText = await page.textContent('[data-testid="job-id"]');
  const jobId = jobIdText?.match(/job_[a-f0-9-]+/)?.[0];
  await waitForJobCompletion(apiClient, jobId!, { timeout: 90000 });

  // Verify completion message
  await waitForToast(page, /import complete/i);
});
```

---

## Running Tests

```bash
# All tests
npx playwright test

# Specific file
npx playwright test tests/e2e/03-traces/import-traces.spec.ts

# By pattern
npx playwright test --grep "should import traces"

# Headed mode
npx playwright test --headed

# Debug mode
npx playwright test --debug

# Specific workers
npx playwright test --workers=2

# Show report
npx playwright show-report
```

---

## Test Priorities

**P0 (Must Pass)**: Critical user flows
- Smoke tests (5 tests)
- Create integration (1 test)
- Import traces (1 test)
- Submit feedback (1 test)
- Generate eval (1 test)
- Execute eval (1 test)

**P1 (Should Pass)**: Major features
- All integration management (4 tests)
- All trace management (8 tests)
- All feedback submission (3 tests)
- All eval set management (6 tests)

**P2 (Nice to Have)**: Edge cases and errors
- Error handling (6 tests)
- Empty states (4 tests)
- Boundary conditions (5 tests)

---

## Test Timing Estimates

| Test Category | Count | Time (Parallel) |
|---------------|-------|-----------------|
| Smoke | 5 | 30s |
| Integrations | 5 | 60s |
| Traces | 8 | 120s |
| Feedback | 3 | 45s |
| Eval Sets | 6 | 90s |
| Evals | 5 | 180s |
| Jobs | 4 | 60s |
| Integration | 3 | 180s |
| Errors | 6 | 60s |
| **Total** | **48** | **< 5 min** |

---

_Quick Reference - Copy, paste, and modify as needed_
