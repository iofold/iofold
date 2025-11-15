import { test, expect } from '@playwright/test';
import { apiRequest } from '../utils/helpers';
import { createTestIntegration, deleteTestIntegration } from '../../fixtures/integrations';
import { importTestTraces, deleteTestTraces } from '../../fixtures/traces';
import { createTestEvalSet, deleteTestEvalSet, addTracesToEvalSet } from '../../fixtures/eval-sets';

/**
 * TEST-ES03: View Eval Set Detail
 * TEST-ES04: Feedback Summary Calculation
 *
 * Tests viewing eval set details and verifying feedback summary calculations.
 */
test.describe('Eval Set Detail & Feedback Summary', () => {
  let integrationId: string;
  let traceIds: string[] = [];
  let evalSetId: string;

  test.beforeEach(async ({ page }) => {
    // Setup: Create integration and import traces
    const integration = await createTestIntegration(page);
    integrationId = integration.id;

    traceIds = await importTestTraces(page, integrationId, { limit: 6 });

    // Create eval set
    const evalSet = await createTestEvalSet(page);
    evalSetId = evalSet.id;
  });

  test.afterEach(async ({ page }) => {
    // Cleanup
    try {
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

  test('TEST-ES03: should view eval set detail page', async ({ page }) => {
    // Navigate to eval set detail page
    await page.goto(`/eval-sets/${evalSetId}`);
    await page.waitForLoadState('networkidle');

    // Verify eval set name is visible
    const evalSet = await apiRequest<any>(page, `/api/eval-sets/${evalSetId}`);
    await expect(page.locator(`text="${evalSet.name}"`)).toBeVisible();

    // Verify description is visible (if present)
    if (evalSet.description) {
      await expect(page.locator(`text="${evalSet.description}"`)).toBeVisible();
    }

    // Verify trace count section exists
    await expect(page.locator('text=/traces/i')).toBeVisible();

    // Verify feedback summary section exists
    await expect(
      page.locator('text=/feedback/i, text=/summary/i, text=/positive/i')
    ).toBeVisible();

    // Verify "Generate Eval" button exists
    await expect(
      page.locator('button:has-text("Generate Eval"), button:has-text("Generate")')
    ).toBeVisible();
  });

  test('TEST-ES04: should calculate feedback summary correctly', async ({ page }) => {
    // Add traces to eval set with specific feedback
    // 3 positive, 2 negative, 1 neutral
    const ratings: ('positive' | 'negative' | 'neutral')[] = [
      'positive',
      'positive',
      'positive',
      'negative',
      'negative',
      'neutral',
    ];

    await addTracesToEvalSet(page, evalSetId, traceIds, ratings);

    // Navigate to eval set detail page
    await page.goto(`/eval-sets/${evalSetId}`);
    await page.waitForLoadState('networkidle');

    // Wait for feedback summary to load
    await page.waitForSelector('text=/positive/i', { timeout: 10000 });

    // Verify trace count
    await expect(page.locator('text=/6.*traces/i, text=/traces.*6/i')).toBeVisible();

    // Verify positive count (3)
    const positiveText = await page
      .locator('text=/positive/i')
      .locator('..')
      .textContent();
    expect(positiveText).toMatch(/3/);

    // Verify negative count (2)
    const negativeText = await page
      .locator('text=/negative/i')
      .locator('..')
      .textContent();
    expect(negativeText).toMatch(/2/);

    // Verify neutral count (1)
    const neutralText = await page
      .locator('text=/neutral/i')
      .locator('..')
      .textContent();
    expect(neutralText).toMatch(/1/);

    // Verify percentages if displayed
    // 3/6 = 50%, 2/6 = 33%, 1/6 = 17%
    const bodyText = await page.textContent('body');
    if (bodyText?.includes('%')) {
      expect(bodyText).toMatch(/50.*%/); // Positive percentage
      expect(bodyText).toMatch(/33.*%/); // Negative percentage
      expect(bodyText).toMatch(/17.*%|16.*%/); // Neutral percentage (rounded)
    }

    // Verify "Generate Eval" button is enabled (has both positive and negative)
    const generateButton = page.locator(
      'button:has-text("Generate Eval"), button:has-text("Generate")'
    );
    await expect(generateButton).toBeEnabled();
  });

  test('TEST-ES04-B: should show generate button as disabled with insufficient feedback', async ({
    page,
  }) => {
    // Add only 2 positive traces (insufficient for generation)
    await addTracesToEvalSet(page, evalSetId, traceIds.slice(0, 2), [
      'positive',
      'positive',
    ]);

    // Navigate to eval set detail page
    await page.goto(`/eval-sets/${evalSetId}`);
    await page.waitForLoadState('networkidle');

    // Verify trace count
    await expect(page.locator('text=/2.*traces/i, text=/traces.*2/i')).toBeVisible();

    // Verify "Generate Eval" button is disabled
    const generateButton = page.locator(
      'button:has-text("Generate Eval"), button:has-text("Generate")'
    );

    // Check if button is disabled or has tooltip explaining requirement
    const isDisabled = await generateButton.isDisabled().catch(() => false);
    if (!isDisabled) {
      // Check for tooltip or message explaining requirement
      await expect(
        page.locator(
          'text=/need.*both.*positive.*negative/i, text=/insufficient.*feedback/i'
        )
      ).toBeVisible();
    } else {
      expect(isDisabled).toBe(true);
    }
  });
});
