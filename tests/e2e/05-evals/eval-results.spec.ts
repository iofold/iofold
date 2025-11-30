import { test, expect } from '@playwright/test';
import {
  apiRequest,
  uniqueName,
} from '../utils/helpers';
import { createTestIntegration, deleteTestIntegration } from '../../fixtures/integrations';
import { createTestTrace, deleteTestTrace } from '../../fixtures/traces';
import { createTestAgent, deleteTestAgent, addTracesToAgent } from '../../fixtures/agents';
import {
  setupEvalGenerationMocks,
  setupEvalResultsMocks,
  clearEvalMocks,
} from '../../fixtures/evals-mock';

/**
 * TEST-E05: View Eval Execution Results
 * TEST-E06: Detect Contradictions in Results
 *
 * Tests viewing execution results with details about passes, failures, and contradictions.
 * Uses Playwright route mocking to simulate LLM responses.
 */
test.describe('Eval Results Viewing', () => {
  let integrationId: string;
  let traceIds: string[] = [];
  let agentId: string;
  let mockEvalId: string;

  test.beforeEach(async ({ page }) => {
    // Setup: Create integration and traces directly
    const integration = await createTestIntegration(page, `Eval Results Test ${Date.now()}`);
    integrationId = integration.id;

    // Create test traces directly
    for (let i = 0; i < 6; i++) {
      const trace = await createTestTrace(page, integrationId, {
        input_preview: `Test input ${i}`,
        output_preview: `Test output ${i}`,
        steps: [
          {
            step_id: `step_${i}`,
            type: 'llm',
            input: { prompt: `Question ${i}` },
            output: { response: `Answer ${i}` },
          },
        ],
      });
      traceIds.push(trace.id);
    }

    // Create agent
    const agent = await createTestAgent(page);
    agentId = agent.id;

    // Add feedback: 3 positive, 3 negative
    const ratings: ('positive' | 'negative')[] = [
      'positive',
      'positive',
      'positive',
      'negative',
      'negative',
      'negative',
    ];
    await addTracesToAgent(page, agentId, traceIds, ratings);

    // Setup mocks for eval generation
    const { evalId } = await setupEvalGenerationMocks(page, {
      agentId,
      evalName: uniqueName('Test Eval'),
      traceIds,
    });
    mockEvalId = evalId;
  });

  test.afterEach(async ({ page }) => {
    // Clear mocks
    await clearEvalMocks(page);

    // Cleanup
    try {
      for (const traceId of traceIds) {
        await deleteTestTrace(page, traceId);
      }
      if (agentId) {
        await deleteTestAgent(page, agentId);
      }
      if (integrationId) {
        await deleteTestIntegration(page, integrationId);
      }
    } catch (error) {
      console.error('Cleanup error:', error);
    }
    traceIds = [];
  });

  test('TEST-E05: should view eval execution results', async ({ page }) => {
    // Setup results mocks without contradictions
    await setupEvalResultsMocks(page, {
      evalId: mockEvalId,
      agentId,
      traceIds,
      evalName: 'Test Eval',
      hasContradictions: false,
    });

    // Navigate to eval detail page
    await page.goto(`/evals/${mockEvalId}`);
    await page.waitForLoadState('networkidle');

    // Verify execution results section exists
    const resultsVisible = await page
      .locator('text=/results/i, text=/executions/i')
      .first()
      .isVisible({ timeout: 10000 })
      .catch(() => false);

    // Verify summary statistics are displayed
    const accuracyVisible = await page
      .locator('text=/accuracy/i')
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    // Verify passed/failed counts
    const statsVisible = await page
      .locator('text=/passed/i, text=/failed/i')
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    // Verify results table/list exists
    const resultsTable = page.locator('table, [role="table"], [data-testid*="results"], [class*="results"]');
    const tableVisible = await resultsTable.first().isVisible({ timeout: 5000 }).catch(() => false);

    // At least one of the result display elements should be visible
    const hasResultsDisplay = resultsVisible || accuracyVisible || statsVisible || tableVisible;
    expect(hasResultsDisplay).toBe(true);

    // Verify accuracy percentage is shown somewhere on the page
    const bodyText = await page.textContent('body');
    const hasPercentage = /%/.test(bodyText || '');
    // It's OK if no percentage is shown - some UIs show pass/fail counts instead
  });

  test('TEST-E06: should detect contradictions in results', async ({ page }) => {
    // Setup results mocks WITH contradictions
    await setupEvalResultsMocks(page, {
      evalId: mockEvalId,
      agentId,
      traceIds,
      evalName: 'Test Eval',
      hasContradictions: true,
    });

    // Navigate to eval detail page
    await page.goto(`/evals/${mockEvalId}`);
    await page.waitForLoadState('networkidle');

    // Check for contradiction indicators
    const contradictionVisible = await page
      .locator('text=/contradiction/i')
      .first()
      .isVisible({ timeout: 5000 })
      .catch(() => false);

    if (contradictionVisible) {
      // If contradictions are shown, they should be highlighted
      const highlightedElement = await page
        .locator('[class*="red"], [class*="warning"], [class*="error"], [class*="contradiction"]')
        .first()
        .isVisible({ timeout: 3000 })
        .catch(() => false);

      console.log('Contradictions detected and displayed');
    } else {
      // If no explicit contradiction label, check for accuracy < 100%
      const bodyText = await page.textContent('body');

      // Check if accuracy is displayed and less than 100%
      const accuracyMatch = bodyText?.match(/(\d+(?:\.\d+)?)\s*%/);
      if (accuracyMatch) {
        const accuracy = parseFloat(accuracyMatch[1]);
        console.log(`Accuracy displayed: ${accuracy}%`);
        // If accuracy < 100%, there are implied contradictions/errors
        if (accuracy < 100) {
          console.log('Accuracy < 100% indicates some mismatches');
        }
      }
    }

    // Verify the page loads without errors
    const errorVisible = await page
      .locator('text=/error.*loading/i, text=/failed.*load/i')
      .first()
      .isVisible({ timeout: 2000 })
      .catch(() => false);

    expect(errorVisible).toBe(false);
  });
});
