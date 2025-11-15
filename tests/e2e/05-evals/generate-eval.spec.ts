import { test, expect } from '@playwright/test';
import {
  checkAnthropicAPIKey,
  uniqueName,
  fillField,
  waitForJobCompletion,
  apiRequest,
} from '../utils/helpers';
import { createTestIntegration, deleteTestIntegration } from '../../fixtures/integrations';
import { importTestTraces, deleteTestTraces } from '../../fixtures/traces';
import { createTestEvalSet, deleteTestEvalSet, addTracesToEvalSet } from '../../fixtures/eval-sets';

/**
 * TEST-E01: Generate Eval (Happy Path)
 *
 * Tests the ability to generate an eval from an eval set with sufficient feedback.
 * This test requires a real Anthropic API key as it performs actual eval generation.
 */
test.describe('Eval Generation', () => {
  let integrationId: string;
  let traceIds: string[] = [];
  let evalSetId: string;
  let generatedEvalId: string | null = null;

  test.beforeAll(() => {
    // Check for required API key
    checkAnthropicAPIKey();
  });

  test.beforeEach(async ({ page }) => {
    // Setup: Create integration, import traces, and create eval set with feedback
    const integration = await createTestIntegration(page);
    integrationId = integration.id;

    // Import more traces to ensure we have enough for good eval generation
    traceIds = await importTestTraces(page, integrationId, { limit: 10 });

    // Create eval set
    const evalSet = await createTestEvalSet(page);
    evalSetId = evalSet.id;

    // Add feedback: 5 positive, 5 negative (meet minimum requirements)
    const ratings: ('positive' | 'negative')[] = [
      'positive',
      'positive',
      'positive',
      'positive',
      'positive',
      'negative',
      'negative',
      'negative',
      'negative',
      'negative',
    ];
    await addTracesToEvalSet(page, evalSetId, traceIds, ratings);
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

  test('TEST-E01: should generate eval successfully', async ({ page }) => {
    const evalName = uniqueName('Accuracy Eval');
    const evalDescription = 'Checks response accuracy';

    // Navigate to eval set detail page
    await page.goto(`/eval-sets/${evalSetId}`);
    await page.waitForLoadState('networkidle');

    // Click "Generate Eval" button
    const generateButton = page.locator(
      'button:has-text("Generate Eval"), button:has-text("Generate")'
    );
    await expect(generateButton).toBeVisible();
    await expect(generateButton).toBeEnabled();
    await generateButton.click();

    // Wait for generation form/modal to open
    await page.waitForSelector('[role="dialog"], form', { state: 'visible', timeout: 10000 });

    // Fill in the form
    await fillField(page, 'input[name="name"], input[placeholder*="name" i]', evalName);
    await fillField(
      page,
      'textarea[name="description"], textarea[placeholder*="description" i], input[name="description"]',
      evalDescription
    );

    // Fill in instructions (optional but recommended)
    const instructionsField = page.locator(
      'textarea[name="instructions"], textarea[placeholder*="instructions" i]'
    );
    if (await instructionsField.isVisible({ timeout: 2000 }).catch(() => false)) {
      await instructionsField.fill('Focus on factual correctness and accuracy of responses');
    }

    // Select model (use default if dropdown exists)
    const modelSelect = page.locator('select[name="model"], select[name="model_name"]');
    if (await modelSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      await modelSelect.selectOption('claude-3-haiku-20240307');
    }

    // Submit the form
    await page.click('button[type="submit"]:has-text("Generate"), button:has-text("Generate Eval")');

    // Wait for job to be created (modal should close or show progress)
    await page.waitForTimeout(2000);

    // Extract job ID from UI or API response
    const bodyText = await page.textContent('body');
    const jobIdMatch = bodyText?.match(/job_[a-f0-9-]+/);

    if (!jobIdMatch) {
      // Try to get latest job from API
      const jobs = await apiRequest<{ jobs: Array<{ id: string; type: string }> }>(
        page,
        '/api/jobs?type=generate&limit=1'
      );
      if (jobs.jobs.length > 0) {
        const jobId = jobs.jobs[0].id;
        console.log('Found job ID from API:', jobId);

        // Wait for job completion (eval generation can take 60-90 seconds)
        await waitForJobCompletion(page, jobId, { timeout: 120000 });
      }
    } else {
      const jobId = jobIdMatch[0];
      console.log('Found job ID from UI:', jobId);

      // Wait for job completion
      await waitForJobCompletion(page, jobId, { timeout: 120000 });
    }

    // Wait for success message
    await page.waitForSelector(
      'text=/generated.*successfully/i, text=/completed/i',
      { timeout: 10000 }
    );

    // Verify redirect to evals list or eval detail page
    await page.waitForURL(/\/evals/, { timeout: 10000 });

    // Verify eval appears in the list
    const evalCard = page.locator(`text="${evalName}"`);
    await expect(evalCard).toBeVisible({ timeout: 10000 });

    // Extract eval ID for cleanup
    const url = page.url();
    const evalIdMatch = url.match(/evals\/([a-zA-Z0-9_-]+)/);
    if (evalIdMatch) {
      generatedEvalId = evalIdMatch[1];
    } else {
      // Try to get from page content
      const pageText = await page.textContent('body');
      const idMatch = pageText?.match(/eval_[a-f0-9-]+/);
      if (idMatch) {
        generatedEvalId = idMatch[0];
      }
    }

    // Verify eval details are visible
    if (generatedEvalId) {
      const eval_ = await apiRequest<any>(page, `/api/evals/${generatedEvalId}`);
      expect(eval_.name).toBe(evalName);
      expect(eval_.description).toBe(evalDescription);
      expect(eval_.eval_code).toBeTruthy();
      expect(eval_.training_accuracy).toBeGreaterThanOrEqual(0);
    }
  });

  test('TEST-E02: should show error when generating with insufficient feedback', async ({
    page,
  }) => {
    // Create a new eval set with insufficient feedback (only positive)
    const insufficientEvalSet = await createTestEvalSet(page, {
      name: uniqueName('Insufficient Eval Set'),
    });

    // Add only 2 positive traces
    await addTracesToEvalSet(page, insufficientEvalSet.id, traceIds.slice(0, 2), [
      'positive',
      'positive',
    ]);

    // Navigate to eval set detail page
    await page.goto(`/eval-sets/${insufficientEvalSet.id}`);
    await page.waitForLoadState('networkidle');

    // Verify "Generate Eval" button is disabled or shows warning
    const generateButton = page.locator(
      'button:has-text("Generate Eval"), button:has-text("Generate")'
    );

    const isDisabled = await generateButton.isDisabled().catch(() => false);

    if (!isDisabled) {
      // Button might be enabled but should show error when clicked
      await generateButton.click();
      await page.waitForSelector(
        'text=/need.*both.*positive.*negative/i, text=/insufficient/i',
        { timeout: 5000 }
      );
    } else {
      // Button is disabled, check for tooltip or message
      await expect(
        page.locator(
          'text=/need.*both.*positive.*negative/i, text=/insufficient/i, text=/minimum.*5/i'
        )
      ).toBeVisible();
    }

    // Cleanup
    await deleteTestEvalSet(page, insufficientEvalSet.id);
  });
});
