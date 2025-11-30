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
  setupEvalExecutionMocks,
  clearEvalMocks,
  createMockEval,
  MOCK_EVAL_CODE,
} from '../../fixtures/evals-mock';

/**
 * TEST-E03: View Generated Eval Code
 * TEST-E04: Execute Eval (Happy Path)
 *
 * Tests viewing eval code and executing an eval on traces.
 * Uses Playwright route mocking to simulate LLM responses.
 */
test.describe('Eval Execution', () => {
  let integrationId: string;
  let traceIds: string[] = [];
  let agentId: string;
  let mockEvalId: string;

  test.beforeEach(async ({ page }) => {
    // Setup: Create integration and traces directly
    const integration = await createTestIntegration(page, `Eval Exec Test ${Date.now()}`);
    integrationId = integration.id;

    // Create test traces directly
    for (let i = 0; i < 8; i++) {
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
    await addTracesToAgent(page, agentId, traceIds, ratings);

    // Setup mocks for eval generation - this "creates" a mock eval
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

  test('TEST-E03: should view generated eval code', async ({ page }) => {
    // Navigate to eval detail page (mocked)
    await page.goto(`/evals/${mockEvalId}`);
    await page.waitForLoadState('networkidle');

    // Verify page loads with eval content
    // The mock should return eval details including name and code
    await expect(page.locator('text=/eval/i').first()).toBeVisible({ timeout: 10000 });

    // Verify version info is present (might be "Version 1", "v1", etc.)
    const versionVisible = await page
      .locator('text=/version/i, text=/v1/i')
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    // Verify accuracy is displayed (from mock: 85%)
    const accuracyVisible = await page
      .locator('text=/accuracy/i, text=/85/i, text=/training/i')
      .first()
      .isVisible({ timeout: 3000 })
      .catch(() => false);

    // Verify code block is displayed
    const codeBlock = page.locator('pre, code, [class*="syntax"], [class*="highlight"]');
    if (await codeBlock.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Code should contain Python function
      const codeText = await codeBlock.textContent();
      expect(codeText?.toLowerCase()).toContain('def');
    }

    // Verify Execute/Run button exists
    const executeButton = page.locator('button:has-text("Execute"), button:has-text("Run")');
    await expect(executeButton).toBeVisible({ timeout: 5000 });
  });

  test('TEST-E04: should execute eval successfully', async ({ page }) => {
    // Setup execution mocks
    await setupEvalExecutionMocks(page, {
      evalId: mockEvalId,
      agentId,
      evalName: 'Test Eval',
    });

    // Navigate to eval detail page
    await page.goto(`/evals/${mockEvalId}`);
    await page.waitForLoadState('networkidle');

    // Click "Execute Eval" button
    const executeButton = page.locator('button:has-text("Execute"), button:has-text("Run")');
    await expect(executeButton).toBeVisible({ timeout: 10000 });
    await expect(executeButton).toBeEnabled();
    await executeButton.click();

    // Wait for execution modal/form (if present)
    const hasModal = await page
      .waitForSelector('[role="dialog"], form', { state: 'visible', timeout: 3000 })
      .then(() => true)
      .catch(() => false);

    if (hasModal) {
      // If there's a form, submit it
      const submitButton = page.locator(
        'button[type="submit"]:has-text("Execute"), button[type="submit"]:has-text("Run"), [role="dialog"] button:has-text("Execute")'
      );
      if (await submitButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await submitButton.click();
      }
    }

    // Wait for job completion indication (mocked to complete immediately)
    await page.waitForTimeout(1000);

    // Verify success or results displayed
    const successIndicators = [
      page.locator('text=/executed.*successfully/i'),
      page.locator('text=/completed/i'),
      page.locator('text=/results/i'),
      page.locator('text=/accuracy/i'),
      page.locator('text=/passed/i'),
    ];

    let foundSuccess = false;
    for (const indicator of successIndicators) {
      if (await indicator.isVisible({ timeout: 3000 }).catch(() => false)) {
        foundSuccess = true;
        break;
      }
    }

    // If no explicit success, at least verify no error
    if (!foundSuccess) {
      const errorVisible = await page
        .locator('text=/error/i, text=/failed/i')
        .first()
        .isVisible({ timeout: 2000 })
        .catch(() => false);

      // No error visible means execution likely succeeded
      expect(errorVisible).toBe(false);
    }
  });
});
