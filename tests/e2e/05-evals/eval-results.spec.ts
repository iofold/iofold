import { test, expect } from '@playwright/test';
import {
  checkAnthropicAPIKey,
  waitForJobCompletion,
  apiRequest,
  uniqueName,
} from '../utils/helpers';
import { createTestIntegration, deleteTestIntegration } from '../../fixtures/integrations';
import { importTestTraces, deleteTestTraces } from '../../fixtures/traces';
import { createTestEvalSet, deleteTestEvalSet, addTracesToEvalSet } from '../../fixtures/eval-sets';

/**
 * TEST-E05: View Eval Execution Results
 *
 * Tests viewing execution results with details about passes, failures, and contradictions.
 */
test.describe('Eval Results Viewing', () => {
  let integrationId: string;
  let traceIds: string[] = [];
  let evalSetId: string;
  let generatedEvalId: string | null = null;

  test.beforeAll(() => {
    // Check for required API key
    checkAnthropicAPIKey();
  });

  test.beforeEach(async ({ page }) => {
    // Setup: Create full pipeline and execute eval
    const integration = await createTestIntegration(page);
    integrationId = integration.id;

    traceIds = await importTestTraces(page, integrationId, { limit: 6 });

    const evalSet = await createTestEvalSet(page);
    evalSetId = evalSet.id;

    // Add feedback
    const ratings: ('positive' | 'negative')[] = [
      'positive',
      'positive',
      'positive',
      'negative',
      'negative',
      'negative',
    ];
    await addTracesToEvalSet(page, evalSetId, traceIds, ratings);

    // Generate eval
    const genJobResponse = await apiRequest<{ job_id: string }>(
      page,
      `/api/eval-sets/${evalSetId}/generate`,
      {
        method: 'POST',
        data: {
          name: uniqueName('Test Eval'),
          description: 'Test eval for results viewing',
        },
      }
    );
    await waitForJobCompletion(page, genJobResponse.job_id, { timeout: 120000 });

    // Get eval ID
    const evals = await apiRequest<{ evals: Array<{ id: string }> }>(
      page,
      `/api/evals?eval_set_id=${evalSetId}&limit=1`
    );
    if (evals.evals.length > 0) {
      generatedEvalId = evals.evals[0].id;

      // Execute eval
      const execJobResponse = await apiRequest<{ job_id: string }>(
        page,
        `/api/evals/${generatedEvalId}/execute`,
        {
          method: 'POST',
          data: {},
        }
      );
      await waitForJobCompletion(page, execJobResponse.job_id, { timeout: 60000 });
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

  test('TEST-E05: should view eval execution results', async ({ page }) => {
    if (!generatedEvalId) {
      throw new Error('No eval was generated in setup');
    }

    // Navigate to eval detail page
    await page.goto(`/evals/${generatedEvalId}`);
    await page.waitForLoadState('networkidle');

    // Verify execution results section exists
    await expect(page.locator('text=/results/i, text=/executions/i')).toBeVisible();

    // Verify summary statistics are displayed
    await expect(page.locator('text=/accuracy/i')).toBeVisible();
    await expect(page.locator('text=/passed/i, text=/failed/i')).toBeVisible();

    // Verify results table/list exists
    const resultsTable = page.locator('table, [role="table"], [data-testid*="results"]');
    await expect(resultsTable).toBeVisible();

    // Verify table headers/columns
    await expect(page.locator('text=/trace/i')).toBeVisible();
    await expect(page.locator('text=/feedback/i, text=/human/i')).toBeVisible();
    await expect(page.locator('text=/result/i, text=/eval/i')).toBeVisible();

    // Verify at least some results are shown
    const resultRows = page.locator(
      'tr[data-testid*="result"], [data-testid*="execution"], tbody tr'
    );
    const rowCount = await resultRows.count();
    expect(rowCount).toBeGreaterThan(0);

    // Check for match/contradiction indicators
    const hasMatchIndicators = await page
      .locator('text=/match/i, text=/contradiction/i, svg[data-testid*="check"], svg[data-testid*="x"]')
      .first()
      .isVisible({ timeout: 2000 })
      .catch(() => false);

    if (hasMatchIndicators) {
      console.log('Match/contradiction indicators found');
    }

    // Verify accuracy percentage is calculated
    const bodyText = await page.textContent('body');
    expect(bodyText).toMatch(/\d+%/); // Should have percentage somewhere

    // Check for contradictions section (if any exist)
    const hasContradictions = await page
      .locator('text=/contradiction/i')
      .first()
      .isVisible({ timeout: 2000 })
      .catch(() => false);

    if (hasContradictions) {
      console.log('Contradictions detected and displayed');
      // Contradictions should be highlighted
      await expect(
        page.locator('[class*="red"], [class*="warning"], [class*="error"]')
      ).toBeVisible();
    }

    // Verify error count (should be 0 for successful execution)
    const errorCount = bodyText?.match(/(\d+).*errors?/i);
    if (errorCount) {
      console.log('Error count displayed:', errorCount[1]);
    }
  });

  test('TEST-E06: should detect contradictions in results', async ({ page }) => {
    if (!generatedEvalId) {
      throw new Error('No eval was generated in setup');
    }

    // Fetch execution results via API
    const eval_ = await apiRequest<any>(page, `/api/evals/${generatedEvalId}`);

    // Get execution results
    const matrixResponse = await apiRequest<any>(
      page,
      `/api/eval-sets/${evalSetId}/matrix?eval_ids=${generatedEvalId}&filter=all`
    );

    // Check if there are any contradictions
    const contradictions = matrixResponse.rows?.filter((row: any) => {
      const feedback = row.human_feedback;
      const evalResult = row.eval_result;

      // Contradiction logic:
      // positive feedback + fail result = contradiction
      // negative feedback + pass result = contradiction
      return (
        (feedback === 'positive' && evalResult === 'fail') ||
        (feedback === 'negative' && evalResult === 'pass')
      );
    });

    if (contradictions && contradictions.length > 0) {
      console.log(`Found ${contradictions.length} contradictions`);

      // Navigate to eval detail page
      await page.goto(`/evals/${generatedEvalId}`);
      await page.waitForLoadState('networkidle');

      // Verify contradictions are highlighted
      await expect(page.locator('text=/contradiction/i')).toBeVisible();

      // Verify contradiction count is displayed
      const contradictionText = await page
        .locator('text=/contradiction/i')
        .locator('..')
        .textContent();
      expect(contradictionText).toMatch(new RegExp(contradictions.length.toString()));

      // Verify contradictions are visually distinct (red/warning color)
      await expect(
        page.locator('[class*="red"], [class*="warning"], [class*="error"]')
      ).toBeVisible();
    } else {
      console.log('No contradictions found (eval is accurate)');

      // Navigate to eval detail page
      await page.goto(`/evals/${generatedEvalId}`);
      await page.waitForLoadState('networkidle');

      // Verify high accuracy message
      await expect(
        page.locator('text=/100.*%/i, text=/perfect/i, text=/no.*contradiction/i')
      ).toBeVisible();
    }
  });
});
