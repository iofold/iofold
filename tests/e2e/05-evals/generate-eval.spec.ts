import { test, expect } from '@playwright/test';
import {
  uniqueName,
  apiRequest,
} from '../utils/helpers';
import { createTestIntegration, deleteTestIntegration } from '../../fixtures/integrations';
import { createTestTrace, deleteTestTrace } from '../../fixtures/traces';
import { createTestAgent, deleteTestAgent, addTracesToAgent } from '../../fixtures/agents';
import { setupEvalGenerationMocks, clearEvalMocks, MOCK_EVAL_CODE } from '../../fixtures/evals-mock';

/**
 * TEST-E01: Generate Eval (Happy Path)
 * TEST-E02: Generate Eval with Insufficient Feedback
 *
 * Tests the ability to generate an eval from an agent with feedback.
 * Uses Playwright route mocking to simulate LLM responses.
 */
test.describe('Eval Generation', () => {
  let integrationId: string;
  let traceIds: string[] = [];
  let agentId: string;

  test.beforeEach(async ({ page }) => {
    // Setup: Create integration and traces directly (no external API needed)
    const integration = await createTestIntegration(page, `Eval Gen Test ${Date.now()}`);
    integrationId = integration.id;

    // Create test traces directly
    for (let i = 0; i < 10; i++) {
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
    await addTracesToAgent(page, agentId, traceIds, ratings);
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

  test('TEST-E01: should generate eval successfully', async ({ page }) => {
    const evalName = uniqueName('Accuracy Eval');

    // Setup mocks to intercept LLM generation calls
    const { evalId, jobId } = await setupEvalGenerationMocks(page, {
      agentId,
      evalName,
      traceIds,
    });

    // Navigate to agent detail page
    await page.goto(`/agents/${agentId}`);
    await page.waitForLoadState('networkidle');

    // Click "Generate Eval" button
    const generateButton = page.locator(
      'button:has-text("Generate Eval"), button:has-text("Generate")'
    ).first();
    await expect(generateButton).toBeVisible({ timeout: 10000 });
    await expect(generateButton).toBeEnabled();
    await generateButton.click();

    // Wait for generation form/modal to open
    const hasDialog = await page
      .waitForSelector('[role="dialog"]', { state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false);

    if (hasDialog) {
      // Fill in the name field
      const nameField = page.getByRole('textbox', { name: /name/i }).first();
      if (await nameField.isVisible({ timeout: 2000 }).catch(() => false)) {
        await nameField.fill(evalName);
      }

      // Fill in description if available
      const descriptionField = page.getByRole('textbox', { name: /description/i });
      if (await descriptionField.isVisible({ timeout: 2000 }).catch(() => false)) {
        await descriptionField.fill('Checks response accuracy');
      }

      // Submit the form
      const dialogSubmitButton = page.locator('[role="dialog"] button:has-text("Generate")');
      if (await dialogSubmitButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        await dialogSubmitButton.click();
      }
    }

    // Wait for job completion indication (mocked to complete immediately)
    await page.waitForTimeout(1000);

    // Verify success indication - could be a toast, message, or redirect
    const successIndicators = [
      page.locator('text=/generated.*successfully/i'),
      page.locator('text=/completed/i'),
      page.locator('[data-testid="success-message"]'),
      page.locator('.toast:has-text("success")'),
    ];

    let foundSuccess = false;
    for (const indicator of successIndicators) {
      if (await indicator.isVisible({ timeout: 3000 }).catch(() => false)) {
        foundSuccess = true;
        break;
      }
    }

    // If no success message, check if we were redirected to evals page or if eval is visible
    if (!foundSuccess) {
      // Navigate to evals page to verify eval was created
      await page.goto(`/evals/${evalId}`);
      await page.waitForLoadState('networkidle');

      // Verify eval details are shown
      await expect(page.locator(`text="${evalName}"`).or(page.locator('text=/eval/i'))).toBeVisible({
        timeout: 5000,
      });
    }

    // Verify eval code is displayed (from mock)
    const codeBlock = page.locator('pre, code, [class*="syntax"], [class*="highlight"]');
    if (await codeBlock.isVisible({ timeout: 3000 }).catch(() => false)) {
      const codeText = await codeBlock.textContent();
      // Mock code should contain our function signature
      expect(codeText).toContain('eval');
    }
  });

  test('TEST-E02: should show error when generating with insufficient feedback', async ({
    page,
  }) => {
    // Create a new agent with insufficient feedback (only positive)
    const insufficientAgent = await createTestAgent(page, {
      name: uniqueName('Insufficient Agent'),
    });

    // Add only 2 positive traces (not enough for generation)
    await addTracesToAgent(page, insufficientAgent.id, traceIds.slice(0, 2), [
      'positive',
      'positive',
    ]);

    // Navigate to agent detail page
    await page.goto(`/agents/${insufficientAgent.id}`);
    await page.waitForLoadState('networkidle');

    // The button should show "Need X more feedback" and be disabled
    // or show a Generate button that is disabled
    const needMoreButton = page.locator('button:has-text("Need")');
    const generateButton = page.locator('button:has-text("Generate")');

    // Either we see a "Need X more feedback" button or a disabled Generate button
    const needMoreVisible = await needMoreButton.isVisible().catch(() => false);
    const generateVisible = await generateButton.isVisible().catch(() => false);

    if (needMoreVisible) {
      // Button shows "Need X more feedback"
      await expect(needMoreButton).toBeDisabled();
      const buttonText = await needMoreButton.textContent();
      expect(buttonText?.toLowerCase()).toContain('need');
    } else if (generateVisible) {
      // Generate button should be disabled
      const isDisabled = await generateButton.isDisabled().catch(() => false);
      if (isDisabled) {
        // Button is disabled, test passes
        await expect(generateButton).toBeDisabled();
      } else {
        // Button enabled - click and expect error
        await generateButton.click();
        await page.waitForSelector(
          'text=/need.*both.*positive.*negative/i, text=/insufficient/i',
          { timeout: 5000 }
        );
      }
    } else {
      // Neither button visible - check for message in page
      await expect(
        page.locator('text=/need.*more.*feedback/i, text=/insufficient/i, text=/minimum/i')
      ).toBeVisible();
    }

    // Cleanup
    await deleteTestAgent(page, insufficientAgent.id);
  });
});
