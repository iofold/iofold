import { test, expect } from '@playwright/test';
import { apiRequest, uniqueName } from '../utils/helpers';

/**
 * TEST-ES01-API: Create Eval Set via API
 * TEST-ES06-API: Delete Eval Set via API
 *
 * These tests verify the API endpoints work correctly.
 * UI tests are blocked by BUG-001 (Create Eval Set modal not implemented).
 */
test.describe('Eval Set API Tests', () => {
  let createdEvalSetId: string | null = null;

  test.afterEach(async ({ page }) => {
    // Cleanup: Delete created eval set
    if (createdEvalSetId) {
      try {
        await apiRequest(page, `/api/eval-sets/${createdEvalSetId}`, {
          method: 'DELETE',
        });
      } catch (error) {
        console.error('Failed to cleanup eval set:', error);
      }
      createdEvalSetId = null;
    }
  });

  test('TEST-ES01-API: should create eval set via API', async ({ page }) => {
    const evalSetName = uniqueName('Quality Evaluation Set');
    const evalSetDescription = 'Testing accuracy of responses';

    // Create eval set via API
    const evalSet = await apiRequest<any>(page, '/api/eval-sets', {
      method: 'POST',
      data: {
        name: evalSetName,
        description: evalSetDescription,
      },
    });

    // Verify response
    expect(evalSet.id).toBeTruthy();
    expect(evalSet.name).toBe(evalSetName);
    expect(evalSet.description).toBe(evalSetDescription);

    createdEvalSetId = evalSet.id;

    // Verify it appears in the list via API
    const listResponse = await apiRequest<{ eval_sets: any[] }>(page, '/api/eval-sets');
    const found = listResponse.eval_sets.find((es) => es.id === evalSet.id);
    expect(found).toBeTruthy();
    expect(found.name).toBe(evalSetName);

    // Verify it appears in the UI
    await page.goto('/eval-sets');
    await page.waitForLoadState('networkidle');
    await expect(page.locator(`text="${evalSetName}"`)).toBeVisible({ timeout: 10000 });
  });

  test('TEST-ES06-API: should delete eval set via API', async ({ page }) => {
    const evalSetName = uniqueName('To Delete Eval Set');

    // Create eval set via API
    const evalSet = await apiRequest<any>(page, '/api/eval-sets', {
      method: 'POST',
      data: {
        name: evalSetName,
      },
    });

    createdEvalSetId = evalSet.id;

    // Verify it exists in UI
    await page.goto('/eval-sets');
    await page.waitForLoadState('networkidle');
    await expect(page.locator(`text="${evalSetName}"`)).toBeVisible();

    // Delete via API
    await apiRequest(page, `/api/eval-sets/${evalSet.id}`, {
      method: 'DELETE',
    });

    // Mark as cleaned up
    createdEvalSetId = null;

    // Reload page and verify it's gone
    await page.reload();
    await page.waitForLoadState('networkidle');
    await expect(page.locator(`text="${evalSetName}"`)).not.toBeVisible();

    // Verify via API it's gone
    const listResponse = await apiRequest<{ eval_sets: any[] }>(page, '/api/eval-sets');
    const found = listResponse.eval_sets.find((es) => es.id === evalSet.id);
    expect(found).toBeUndefined();
  });
});
