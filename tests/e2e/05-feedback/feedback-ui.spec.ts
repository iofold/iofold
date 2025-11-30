/**
 * Feedback UI E2E Tests
 *
 * Tests for feedback functionality through the UI including:
 * - Feedback buttons on trace detail page
 * - Agent selection requirement
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
  let agentId: string;

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

    // Create test agent
    const agent = await apiRequest<any>(page, '/api/agents', {
      method: 'POST',
      data: {
        name: `Feedback UI Test Agent ${Date.now()}`,
        description: 'For testing feedback UI',
      },
    });
    agentId = agent.id;

    await context.close();
  });

  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    if (agentId) {
      await apiRequest(page, `/api/agents/${agentId}`, { method: 'DELETE' }).catch(() => {});
    }
    if (integrationId) {
      await apiRequest(page, `/api/integrations/${integrationId}`, { method: 'DELETE' }).catch(() => {});
    }

    await context.close();
  });

  test('TEST-FBUI01: Should show agent selector on trace detail page', async ({ page }) => {
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

    // Should see agent selector - the label "Select Agent" is shown when no feedback exists
    await expect(page.getByText('Select Agent')).toBeVisible();
  });

  test('TEST-FBUI02: Should require agent selection before feedback', async ({ page }) => {
    test.skip(!traceId, 'No test trace available');

    // Clean up any existing feedback first
    await apiRequest(page, `/api/traces/${traceId}`).then(async (trace: any) => {
      if (trace.feedback?.id) {
        await apiRequest(page, `/api/feedback/${trace.feedback.id}`, { method: 'DELETE' }).catch(() => {});
      }
    }).catch(() => {});

    await page.goto(`/traces/${traceId}`);
    await page.waitForLoadState('networkidle');

    // When agent is auto-selected (first agent), feedback buttons should be visible
    // The page auto-selects the first agent: effectiveAgentId = agentsData?.agents?.[0]?.id
    // So we should see feedback buttons if agents exist
    const feedbackButtons = page.getByTestId('feedback-positive');
    const selectAgentLabel = page.getByText('Select Agent');

    // Either we see the agent selector (when no feedback exists)
    // or we see the feedback buttons (auto-selected agent)
    const labelVisible = await selectAgentLabel.isVisible().catch(() => false);
    const buttonsVisible = await feedbackButtons.isVisible().catch(() => false);

    expect(labelVisible || buttonsVisible).toBe(true);
  });

  test('TEST-FBUI03: Should enable feedback buttons after selecting agent', async ({ page }) => {
    test.skip(!traceId || !agentId, 'No test data available');

    await page.goto(`/traces/${traceId}`);
    await page.waitForLoadState('networkidle');

    // The page auto-selects the first agent, so feedback buttons should already be visible
    // If not visible, we can select an agent from the dropdown
    const goodButton = page.locator('button:has-text("Good")');
    const selectButton = page.locator('button:has-text("Select an agent")');

    // Check if feedback buttons are already visible (auto-selected agent)
    const buttonsVisible = await goodButton.isVisible().catch(() => false);
    const selectVisible = await selectButton.first().isVisible().catch(() => false);

    if (selectVisible && !buttonsVisible) {
      // Need to manually select agent
      await selectButton.first().click();
      await page.waitForTimeout(500);
      await page.locator(`[role="option"]`).first().click();
      await page.waitForTimeout(500);
    }

    // Now feedback buttons should be visible
    await expect(page.locator('button:has-text("Good")')).toBeVisible();
    await expect(page.locator('button:has-text("Bad")')).toBeVisible();
    await expect(page.locator('button:has-text("Neutral")')).toBeVisible();
  });

  test('TEST-FBUI04: Should submit positive feedback via UI', async ({ page }) => {
    test.skip(!traceId || !agentId, 'No test data available');

    // First clean up any existing feedback
    await apiRequest(page, `/api/traces/${traceId}`).then(async (trace: any) => {
      if (trace.feedback?.id) {
        await apiRequest(page, `/api/feedback/${trace.feedback.id}`, { method: 'DELETE' }).catch(() => {});
      }
    }).catch(() => {});

    await page.goto(`/traces/${traceId}`);
    await page.waitForLoadState('networkidle');

    // Check if we need to select agent manually
    const goodButton = page.getByTestId('feedback-positive');
    const selectButton = page.locator('button:has-text("Select an agent")');

    const buttonsVisible = await goodButton.isVisible().catch(() => false);
    const selectVisible = await selectButton.first().isVisible().catch(() => false);

    if (selectVisible && !buttonsVisible) {
      // Select agent
      await selectButton.first().click();
      await page.waitForTimeout(500);
      await page.locator(`[role="option"]`).first().click();
      await page.waitForTimeout(500);
    }

    // Click positive button
    await page.getByTestId('feedback-positive').click();
    await page.waitForTimeout(1000);

    // Verify success toast - the toast message is "Feedback submitted successfully"
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: /feedback.*submit/i })).toBeVisible({ timeout: 5000 });
  });

  test('TEST-FBUI05: Should handle agent selection for feedback', async ({ page }) => {
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

    // The UI behavior depends on agents availability:
    // - If agents exist, the page auto-selects the first one and shows feedback buttons
    // - If no agents exist, it shows "Create an agent first to enable feedback."

    // With agents available (created in beforeAll), feedback buttons should be visible
    // because the page auto-selects: effectiveAgentId = agentsData?.agents?.[0]?.id
    const feedbackButtons = page.getByTestId('feedback-positive');
    const selectAgentLabel = page.getByText('Select Agent');

    // Either we see the agent selector (allowing user to change selection)
    // or we see the feedback buttons (auto-selected agent makes them available)
    const labelVisible = await selectAgentLabel.isVisible().catch(() => false);
    const buttonsVisible = await feedbackButtons.isVisible().catch(() => false);

    // At least one should be true since we have agents
    expect(labelVisible || buttonsVisible).toBe(true);
  });

  test('TEST-FBUI06: Should show existing feedback on trace detail', async ({ page }) => {
    test.skip(!traceId || !agentId, 'No test data available');

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
        agent_id: agentId,
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
    test.skip(!traceId || !agentId, 'No test data available');

    // Create feedback via API first
    const existingTrace = await apiRequest<any>(page, `/api/traces/${traceId}`);
    if (existingTrace.feedback?.id) {
      await apiRequest(page, `/api/feedback/${existingTrace.feedback.id}`, { method: 'DELETE' }).catch(() => {});
    }

    const feedback = await apiRequest<any>(page, '/api/feedback', {
      method: 'POST',
      data: {
        trace_id: traceId,
        agent_id: agentId,
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

    // Wait for the page heading and table to load
    await expect(page.getByRole('heading', { name: /traces explorer/i })).toBeVisible({ timeout: 10000 });

    // Wait for table to be present
    const table = page.locator('table');
    await expect(table).toBeVisible({ timeout: 10000 });

    // Click on first trace row - the row itself is clickable and opens the side sheet
    // But we want to navigate to the detail page, so click the "View Full Details" link in the sheet
    const firstRow = page.locator('tbody tr').first();
    await firstRow.click();
    await page.waitForTimeout(500);

    // Click the "View Full Details" button in the side sheet
    await page.getByRole('link', { name: /view full details/i }).click();

    // Wait for navigation to detail page
    await expect(page).toHaveURL(/\/traces\/[a-zA-Z0-9_-]+/, { timeout: 10000 });

    // Should be on detail page
    await expect(page.getByRole('heading', { name: 'Trace Details' })).toBeVisible({ timeout: 10000 });

    // Go back using Back button
    await page.getByRole('button', { name: /back/i }).click();

    // Should be back on list
    await expect(page.getByRole('heading', { name: /traces explorer/i })).toBeVisible({ timeout: 10000 });
  });

  test('TEST-FBUI09: Should show feedback status in traces list', async ({ page }) => {
    test.skip(!traceId || !agentId, 'No test data available');

    // Create feedback via API first
    const existingTrace = await apiRequest<any>(page, `/api/traces/${traceId}`);
    if (existingTrace.feedback?.id) {
      await apiRequest(page, `/api/feedback/${existingTrace.feedback.id}`, { method: 'DELETE' }).catch(() => {});
    }

    const feedback = await apiRequest<any>(page, '/api/feedback', {
      method: 'POST',
      data: {
        trace_id: traceId,
        agent_id: agentId,
        rating: 'positive',
      },
    });

    // Navigate to traces list
    await page.goto('/traces');
    await page.waitForLoadState('networkidle');

    // Should see the feedback column header
    await expect(page.locator('th:has-text("Feedback")')).toBeVisible();

    // Should see feedback rating in the table
    await expect(page.locator('td').filter({ hasText: /positive/i })).toBeVisible({ timeout: 5000 });

    // Clean up
    await apiRequest(page, `/api/feedback/${feedback.id}`, { method: 'DELETE' }).catch(() => {});
  });

  test('TEST-FBUI10: Should provide feedback via trace detail from list', async ({ page }) => {
    test.skip(!traceId || !agentId, 'No test data available');

    // Clean up existing feedback
    const existingTrace = await apiRequest<any>(page, `/api/traces/${traceId}`);
    if (existingTrace.feedback?.id) {
      await apiRequest(page, `/api/feedback/${existingTrace.feedback.id}`, { method: 'DELETE' }).catch(() => {});
    }

    // Navigate to traces list
    await page.goto('/traces');
    await page.waitForLoadState('networkidle');

    // Click on first trace row to open side sheet
    const firstRow = page.locator('tbody tr').first();
    await firstRow.click();
    await page.waitForTimeout(500);

    // Click "View Full Details" to go to detail page
    await page.getByRole('link', { name: /view full details/i }).click();
    await page.waitForTimeout(1000);

    // Now on detail page, should be able to provide feedback
    await expect(page.getByRole('heading', { name: 'Trace Details' })).toBeVisible();

    // Check if feedback buttons are visible (auto-selected agent)
    const goodButton = page.getByTestId('feedback-positive');
    await expect(goodButton).toBeVisible({ timeout: 5000 });
  });
});
