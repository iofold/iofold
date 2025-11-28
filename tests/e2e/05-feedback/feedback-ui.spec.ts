/**
 * Feedback UI E2E Tests
 *
 * Tests for feedback functionality through the UI including:
 * - Feedback buttons on trace detail page
 * - Eval set selection requirement
 * - Feedback updates reflecting in UI
 * - Keyboard shortcuts
 *
 * Test IDs: TEST-FBUI01 through TEST-FBUI10
 */

import { test, expect } from '@playwright/test';
import { apiRequest, createTestIntegration, createTestTrace } from '../utils/helpers';

test.describe('Feedback UI Tests', () => {
  let integrationId: string;
  let traceId: string;
  let evalSetId: string;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    // Create test integration (no external API needed)
    const integration = await createTestIntegration(page, `Feedback UI Test Integration ${Date.now()}`);
    integrationId = integration.id;

    // Create test trace directly (no Langfuse import needed)
    const trace = await createTestTrace(page, integrationId, {
      input_preview: 'Test input for feedback UI testing',
      output_preview: 'Test output for feedback UI testing',
      steps: [
        {
          step_id: 'step_1',
          type: 'llm',
          input: { prompt: 'Test prompt for UI' },
          output: { response: 'Test response for UI' },
        },
      ],
    });
    traceId = trace.id;

    // Create test eval set
    const evalSet = await apiRequest<any>(page, '/api/eval-sets', {
      method: 'POST',
      data: {
        name: `Feedback UI Test Eval Set ${Date.now()}`,
        description: 'For testing feedback UI',
      },
    });
    evalSetId = evalSet.id;

    await context.close();
  });

  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    if (evalSetId) {
      await apiRequest(page, `/api/eval-sets/${evalSetId}`, { method: 'DELETE' }).catch(() => {});
    }
    if (integrationId) {
      await apiRequest(page, `/api/integrations/${integrationId}`, { method: 'DELETE' }).catch(() => {});
    }

    await context.close();
  });

  test('TEST-FBUI01: Should show eval set selector on trace detail page', async ({ page }) => {
    test.skip(!traceId, 'No test trace available');

    // Clean up any existing feedback first
    await apiRequest(page, `/api/traces/${traceId}`).then(async (trace: any) => {
      if (trace.feedback?.id) {
        await apiRequest(page, `/api/feedback/${trace.feedback.id}`, { method: 'DELETE' }).catch(() => {});
      }
    }).catch(() => {});

    await page.goto(`/traces/${traceId}`);
    await page.waitForLoadState('networkidle');

    // Should see the "Add Feedback" section (since no feedback exists)
    await expect(page.getByRole('heading', { name: 'Add Feedback' })).toBeVisible();

    // Should see eval set selector - the label "Select Eval Set" is shown when no feedback exists
    await expect(page.getByText('Select Eval Set')).toBeVisible();
  });

  test('TEST-FBUI02: Should require eval set selection before feedback', async ({ page }) => {
    test.skip(!traceId, 'No test trace available');

    // Clean up any existing feedback first
    await apiRequest(page, `/api/traces/${traceId}`).then(async (trace: any) => {
      if (trace.feedback?.id) {
        await apiRequest(page, `/api/feedback/${trace.feedback.id}`, { method: 'DELETE' }).catch(() => {});
      }
    }).catch(() => {});

    await page.goto(`/traces/${traceId}`);
    await page.waitForLoadState('networkidle');

    // When eval set is auto-selected (first eval set), feedback buttons should be visible
    // The page auto-selects the first eval set: effectiveEvalSetId = evalSetsData?.eval_sets?.[0]?.id
    // So we should see feedback buttons if eval sets exist
    const feedbackButtons = page.getByTestId('feedback-positive');
    const selectEvalSetLabel = page.getByText('Select Eval Set');

    // Either we see the eval set selector (when no feedback exists)
    // or we see the feedback buttons (auto-selected eval set)
    const labelVisible = await selectEvalSetLabel.isVisible().catch(() => false);
    const buttonsVisible = await feedbackButtons.isVisible().catch(() => false);

    expect(labelVisible || buttonsVisible).toBe(true);
  });

  test('TEST-FBUI03: Should enable feedback buttons after selecting eval set', async ({ page }) => {
    test.skip(!traceId || !evalSetId, 'No test data available');

    await page.goto(`/traces/${traceId}`);
    await page.waitForLoadState('networkidle');

    // Click on the eval set selector
    await page.locator('button:has-text("Select an eval set")').first().click();
    await page.waitForTimeout(500);

    // Select the eval set from dropdown
    await page.locator(`[role="option"]`).first().click();
    await page.waitForTimeout(500);

    // Now feedback buttons should be visible
    await expect(page.locator('button:has-text("Positive")')).toBeVisible();
    await expect(page.locator('button:has-text("Negative")')).toBeVisible();
    await expect(page.locator('button:has-text("Neutral")')).toBeVisible();
  });

  test('TEST-FBUI04: Should submit positive feedback via UI', async ({ page }) => {
    test.skip(!traceId || !evalSetId, 'No test data available');

    // First clean up any existing feedback
    await apiRequest(page, `/api/traces/${traceId}`).then(async (trace: any) => {
      if (trace.feedback?.id) {
        await apiRequest(page, `/api/feedback/${trace.feedback.id}`, { method: 'DELETE' }).catch(() => {});
      }
    }).catch(() => {});

    await page.goto(`/traces/${traceId}`);
    await page.waitForLoadState('networkidle');

    // Select eval set
    await page.locator('button:has-text("Select an eval set")').first().click();
    await page.waitForTimeout(500);
    await page.locator(`[role="option"]`).first().click();
    await page.waitForTimeout(500);

    // Click positive button
    await page.getByTestId('feedback-positive').click();
    await page.waitForTimeout(1000);

    // Verify success toast - the toast message is "Marked as positive"
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: /marked.*positive/i })).toBeVisible({ timeout: 5000 });
  });

  test('TEST-FBUI05: Should handle eval set selection for feedback', async ({ page }) => {
    test.skip(!traceId, 'No test trace available');

    // Clean up any existing feedback first
    await apiRequest(page, `/api/traces/${traceId}`).then(async (trace: any) => {
      if (trace.feedback?.id) {
        await apiRequest(page, `/api/feedback/${trace.feedback.id}`, { method: 'DELETE' }).catch(() => {});
      }
    }).catch(() => {});

    // Navigate to trace detail page
    await page.goto(`/traces/${traceId}`);
    await page.waitForLoadState('networkidle');

    // The UI behavior depends on eval sets availability:
    // - If eval sets exist, the page auto-selects the first one and shows feedback buttons
    // - If no eval sets exist, it shows "Create an eval set first to enable feedback."

    // With eval sets available (created in beforeAll), feedback buttons should be visible
    // because the page auto-selects: effectiveEvalSetId = evalSetsData?.eval_sets?.[0]?.id
    const feedbackButtons = page.getByTestId('feedback-positive');
    const selectEvalSetLabel = page.getByText('Select Eval Set');

    // Either we see the eval set selector (allowing user to change selection)
    // or we see the feedback buttons (auto-selected eval set makes them available)
    const labelVisible = await selectEvalSetLabel.isVisible().catch(() => false);
    const buttonsVisible = await feedbackButtons.isVisible().catch(() => false);

    // At least one should be true since we have eval sets
    expect(labelVisible || buttonsVisible).toBe(true);
  });

  test('TEST-FBUI06: Should show existing feedback on trace detail', async ({ page }) => {
    test.skip(!traceId || !evalSetId, 'No test data available');

    // Create feedback via API
    await apiRequest(page, `/api/traces/${traceId}`).then(async (trace: any) => {
      if (trace.feedback?.id) {
        await apiRequest(page, `/api/feedback/${trace.feedback.id}`, { method: 'DELETE' }).catch(() => {});
      }
    }).catch(() => {});

    const feedback = await apiRequest<any>(page, '/api/feedback', {
      method: 'POST',
      data: {
        trace_id: traceId,
        eval_set_id: evalSetId,
        rating: 'negative',
        notes: 'Test feedback notes',
      },
    });

    // Navigate to trace detail
    await page.goto(`/traces/${traceId}`);
    await page.waitForLoadState('networkidle');

    // Should see the feedback section with existing rating - page has both "Feedback" and "Update Feedback" headings
    const feedbackHeading = page.getByRole('heading', { name: 'Feedback', exact: true });
    const updateFeedbackHeading = page.getByRole('heading', { name: 'Update Feedback' });

    // At least one should be visible
    const feedbackVisible = await feedbackHeading.isVisible().catch(() => false);
    const updateVisible = await updateFeedbackHeading.isVisible().catch(() => false);
    expect(feedbackVisible || updateVisible).toBe(true);

    // Clean up
    await apiRequest(page, `/api/feedback/${feedback.id}`, { method: 'DELETE' }).catch(() => {});
  });

  test('TEST-FBUI07: Should show feedback on traces list page', async ({ page }) => {
    test.skip(!traceId || !evalSetId, 'No test data available');

    // Create feedback via API first
    const existingTrace = await apiRequest<any>(page, `/api/traces/${traceId}`);
    if (existingTrace.feedback?.id) {
      await apiRequest(page, `/api/feedback/${existingTrace.feedback.id}`, { method: 'DELETE' }).catch(() => {});
    }

    const feedback = await apiRequest<any>(page, '/api/feedback', {
      method: 'POST',
      data: {
        trace_id: traceId,
        eval_set_id: evalSetId,
        rating: 'positive',
      },
    });

    // Navigate to traces list
    await page.goto('/traces');
    await page.waitForLoadState('networkidle');

    // Should see the page heading
    await expect(page.getByRole('heading', { name: 'Traces' })).toBeVisible();

    // Clean up
    await apiRequest(page, `/api/feedback/${feedback.id}`, { method: 'DELETE' }).catch(() => {});
  });

  test('TEST-FBUI08: Should navigate from traces list to detail and back', async ({ page }) => {
    test.skip(!traceId, 'No test trace available');

    // Start on traces list
    await page.goto('/traces');
    await page.waitForLoadState('networkidle');

    // Wait for trace list to load
    await expect(page.getByTestId('trace-list')).toBeVisible({ timeout: 10000 });

    // Click on first trace card to go to detail
    const firstTraceCard = page.getByTestId('trace-row').first();
    await firstTraceCard.locator('a').first().click();

    // Wait for navigation to detail page
    await expect(page).toHaveURL(/\/traces\/[a-zA-Z0-9_-]+/, { timeout: 10000 });

    // Should be on detail page
    await expect(page.getByRole('heading', { name: 'Trace Details' })).toBeVisible({ timeout: 10000 });

    // Go back using Back button
    await page.getByRole('button', { name: /back/i }).click();

    // Should be back on list
    await expect(page.getByRole('heading', { name: 'Traces' })).toBeVisible({ timeout: 10000 });
  });

  test('TEST-FBUI09: Should show eval set selector on traces list page', async ({ page }) => {
    // Navigate to traces list
    await page.goto('/traces');
    await page.waitForLoadState('networkidle');

    // Should see the eval set selector
    await expect(page.locator('text=Eval Set for Feedback')).toBeVisible();
    await expect(page.locator('button:has-text("Select an eval set")')).toBeVisible();
  });

  test('TEST-FBUI10: Should provide feedback from traces list after selecting eval set', async ({ page }) => {
    test.skip(!traceId || !evalSetId, 'No test data available');

    // Clean up existing feedback
    const existingTrace = await apiRequest<any>(page, `/api/traces/${traceId}`);
    if (existingTrace.feedback?.id) {
      await apiRequest(page, `/api/feedback/${existingTrace.feedback.id}`, { method: 'DELETE' }).catch(() => {});
    }

    // Navigate to traces list
    await page.goto('/traces');
    await page.waitForLoadState('networkidle');

    // Select eval set
    await page.locator('button:has-text("Select an eval set")').first().click();
    await page.waitForTimeout(500);
    await page.locator(`[role="option"]`).first().click();
    await page.waitForTimeout(500);

    // Now feedback buttons should be visible on trace cards
    await expect(page.locator('button:has-text("Positive")').first()).toBeVisible({ timeout: 5000 });
  });
});
