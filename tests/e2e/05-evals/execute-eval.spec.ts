import { test, expect } from '@playwright/test';
import {
  checkAnthropicAPIKey,
  waitForJobCompletion,
  apiRequest,
  uniqueName,
  fillField,
} from '../utils/helpers';
import { createTestIntegration, deleteTestIntegration } from '../../fixtures/integrations';
import { importTestTraces, deleteTestTraces } from '../../fixtures/traces';
import { createTestEvalSet, deleteTestEvalSet, addTracesToEvalSet } from '../../fixtures/eval-sets';

/**
 * TEST-E03: View Generated Eval Code
 * TEST-E04: Execute Eval (Happy Path)
 *
 * Tests viewing eval code and executing an eval on traces.
 */
test.describe('Eval Execution', () => {
  let integrationId: string;
  let traceIds: string[] = [];
  let evalSetId: string;
  let generatedEvalId: string | null = null;

  test.beforeAll(() => {
    // Check for required API key
    checkAnthropicAPIKey();
  });

  test.beforeEach(async ({ page }) => {
    // Setup: Create integration, import traces, create eval set, and generate eval
    const integration = await createTestIntegration(page);
    integrationId = integration.id;

    traceIds = await importTestTraces(page, integrationId, { limit: 8 });

    const evalSet = await createTestEvalSet(page);
    evalSetId = evalSet.id;

    // Add feedback
    const ratings: ('positive' | 'negative')[] = [
      'positive',
      'positive',
      'positive',
      'positive',
      'negative',
      'negative',
      'negative',
      'negative',
    ];
    await addTracesToEvalSet(page, evalSetId, traceIds, ratings);

    // Generate eval via API to speed up test
    const jobResponse = await apiRequest<{ job_id: string }>(
      page,
      `/api/eval-sets/${evalSetId}/generate`,
      {
        method: 'POST',
        data: {
          name: uniqueName('Test Eval'),
          description: 'Test eval for execution',
          instructions: 'Check response quality',
        },
      }
    );

    // Wait for generation to complete
    await waitForJobCompletion(page, jobResponse.job_id, { timeout: 120000 });

    // Get the generated eval ID
    const evals = await apiRequest<{ evals: Array<{ id: string }> }>(
      page,
      `/api/evals?eval_set_id=${evalSetId}&limit=1`
    );
    if (evals.evals.length > 0) {
      generatedEvalId = evals.evals[0].id;
    }
  });

  test.afterEach(async ({ page }) => {
    // Cleanup
    try {
      if (generatedEvalId) {
        await apiRequest(page, `/api/evals/${generatedEvalId}`, { method: 'DELETE' });
      }
      if (traceIds.length > 0) {
        await deleteTestTraces(page, traceIds);
      }
      if (evalSetId) {
        await deleteTestEvalSet(page, evalSetId);
      }
      if (integrationId) {
        await deleteTestIntegration(page, integrationId);
      }
    } catch (error) {
      console.error('Cleanup error:', error);
    }
  });

  test('TEST-E03: should view generated eval code', async ({ page }) => {
    if (!generatedEvalId) {
      throw new Error('No eval was generated in setup');
    }

    // Navigate to eval detail page
    await page.goto(`/evals/${generatedEvalId}`);
    await page.waitForLoadState('networkidle');

    // Verify eval name is visible
    const eval_ = await apiRequest<any>(page, `/api/evals/${generatedEvalId}`);
    await expect(page.locator(`text="${eval_.name}"`)).toBeVisible();

    // Verify description is visible
    if (eval_.description) {
      await expect(page.locator(`text="${eval_.description}"`)).toBeVisible();
    }

    // Verify version is visible
    await expect(page.locator('text=/version/i, text=/v1/i')).toBeVisible();

    // Verify training accuracy is displayed
    await expect(
      page.locator('text=/accuracy/i, text=/training/i')
    ).toBeVisible();

    // Verify Python code is displayed
    await expect(page.locator('text=/def.*eval/i, text=/return/i')).toBeVisible();

    // Verify code is syntax-highlighted (check for code block)
    await expect(
      page.locator('pre, code, [class*="syntax"], [class*="highlight"]')
    ).toBeVisible();

    // Verify "Execute Eval" button exists
    await expect(
      page.locator('button:has-text("Execute"), button:has-text("Run")')
    ).toBeVisible();
  });

  test('TEST-E04: should execute eval successfully', async ({ page }) => {
    if (!generatedEvalId) {
      throw new Error('No eval was generated in setup');
    }

    // Navigate to eval detail page
    await page.goto(`/evals/${generatedEvalId}`);
    await page.waitForLoadState('networkidle');

    // Click "Execute Eval" button
    const executeButton = page.locator(
      'button:has-text("Execute"), button:has-text("Run")'
    );
    await expect(executeButton).toBeVisible();
    await expect(executeButton).toBeEnabled();
    await executeButton.click();

    // Wait for execution modal/form (if present)
    const hasModal = await page
      .waitForSelector('[role="dialog"], form', { state: 'visible', timeout: 2000 })
      .then(() => true)
      .catch(() => false);

    if (hasModal) {
      // If there's a form, submit it
      const submitButton = page.locator(
        'button[type="submit"]:has-text("Execute"), button:has-text("Run")'
      );
      if (await submitButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await submitButton.click();
      }
    }

    // Wait for job to be created
    await page.waitForTimeout(2000);

    // Extract job ID
    const bodyText = await page.textContent('body');
    const jobIdMatch = bodyText?.match(/job_[a-f0-9-]+/);

    if (!jobIdMatch) {
      // Try to get latest job from API
      const jobs = await apiRequest<{ jobs: Array<{ id: string; type: string }> }>(
        page,
        '/api/jobs?type=execute&limit=1'
      );
      if (jobs.jobs.length > 0) {
        const jobId = jobs.jobs[0].id;
        console.log('Found execution job ID from API:', jobId);

        // Wait for job completion (execution should be fast, < 30s)
        await waitForJobCompletion(page, jobId, { timeout: 60000 });
      }
    } else {
      const jobId = jobIdMatch[0];
      console.log('Found execution job ID from UI:', jobId);

      // Wait for job completion
      await waitForJobCompletion(page, jobId, { timeout: 60000 });
    }

    // Wait for success message
    await page.waitForSelector(
      'text=/executed.*successfully/i, text=/completed/i',
      { timeout: 10000 }
    );

    // Verify results are displayed
    await page.waitForSelector(
      'text=/results/i, text=/accuracy/i, text=/passed/i',
      { timeout: 10000 }
    );

    // Verify statistics are shown
    await expect(page.locator('text=/passed/i, text=/failed/i')).toBeVisible();

    // Verify accuracy percentage is shown
    await expect(page.locator('text=/%/i')).toBeVisible();
  });
});
