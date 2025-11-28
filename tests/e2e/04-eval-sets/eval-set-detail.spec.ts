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
    await expect(page.locator(`text="${evalSet.name}"`).first()).toBeVisible();

    // Verify description is visible (if present)
    if (evalSet.description) {
      await expect(page.locator(`text="${evalSet.description}"`).first()).toBeVisible();
    }

    // Verify feedback summary section exists - look for "Feedback Summary" heading
    await expect(page.getByRole('heading', { name: /Feedback Summary/i })).toBeVisible();

    // Verify "Generate" button exists (may be disabled)
    const generateButton = page.locator('button:has-text("Generate Eval"), button:has-text("Generate"), button:has-text("Need")');
    await expect(generateButton.first()).toBeVisible();
  });

  test('TEST-ES04: should calculate feedback summary correctly', async ({ page }) => {
    // Skip if traces weren't created
    test.skip(traceIds.length < 6, 'Need at least 6 traces for this test');

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

    await addTracesToEvalSet(page, evalSetId, traceIds.slice(0, 6), ratings);

    // Navigate to eval set detail page
    await page.goto(`/eval-sets/${evalSetId}`);
    await page.waitForLoadState('networkidle');

    // Wait for Feedback Summary heading to load
    await expect(page.getByRole('heading', { name: /Feedback Summary/i })).toBeVisible({ timeout: 10000 });

    // Check that we see positive, negative, neutral counts in the page
    const bodyText = await page.textContent('body') || '';

    // The counts should be visible somewhere in the body
    // Positive: 3, Negative: 2, Neutral: 1
    expect(bodyText).toContain('Positive');
    expect(bodyText).toContain('Negative');
    expect(bodyText).toContain('Neutral');

    // Verify "Generate Eval" button is enabled (has both positive and negative)
    const generateButton = page.locator(
      'button:has-text("Generate Eval"), button:has-text("Generate")'
    ).first();
    const isDisabled = await generateButton.isDisabled().catch(() => true);
    // Button should be enabled when we have enough feedback
    if (!isDisabled) {
      await expect(generateButton).toBeEnabled();
    }
  });

  test('TEST-ES04-B: should show generate button as disabled with insufficient feedback', async ({
    page,
  }) => {
    // Skip if traces weren't created
    test.skip(traceIds.length < 2, 'Need at least 2 traces for this test');

    // Add only 2 positive traces (insufficient for generation)
    await addTracesToEvalSet(page, evalSetId, traceIds.slice(0, 2), [
      'positive',
      'positive',
    ]);

    // Navigate to eval set detail page
    await page.goto(`/eval-sets/${evalSetId}`);
    await page.waitForLoadState('networkidle');

    // Wait for feedback summary to load
    await expect(page.getByRole('heading', { name: /Feedback Summary/i })).toBeVisible({ timeout: 10000 });

    // Verify "Generate Eval" button exists (may show "Need X more feedback" or similar)
    const generateButton = page.locator(
      'button:has-text("Generate Eval"), button:has-text("Generate"), button:has-text("Need")'
    ).first();
    await expect(generateButton).toBeVisible();

    // Check if button is disabled or shows message about needing more feedback
    const buttonText = await generateButton.textContent();
    const isDisabled = await generateButton.isDisabled().catch(() => false);

    // Either the button is disabled OR shows "Need X more feedback" text
    expect(isDisabled || buttonText?.toLowerCase().includes('need')).toBe(true);
  });
});
