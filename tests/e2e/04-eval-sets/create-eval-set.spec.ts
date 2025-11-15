import { test, expect } from '@playwright/test';
import { uniqueName, waitForToast, fillField } from '../utils/helpers';
import { deleteTestEvalSet } from '../../fixtures/eval-sets';

/**
 * TEST-ES01: Create Eval Set (Happy Path)
 *
 * Tests the ability to create a new eval set through the UI.
 */
test.describe('Eval Set Creation', () => {
  let createdEvalSetId: string | null = null;

  test.afterEach(async ({ page }) => {
    // Cleanup: Delete created eval set
    if (createdEvalSetId) {
      try {
        await deleteTestEvalSet(page, createdEvalSetId);
      } catch (error) {
        console.error('Failed to cleanup eval set:', error);
      }
      createdEvalSetId = null;
    }
  });

  test('TEST-ES01: should create eval set successfully', async ({ page }) => {
    const evalSetName = uniqueName('Quality Evaluation Set');
    const evalSetDescription = 'Testing accuracy of responses';

    // Navigate to eval sets page
    await page.goto('/eval-sets');
    await page.waitForLoadState('networkidle');

    // Click "Create Eval Set" button
    await page.click('button:has-text("Create Eval Set"), button:has-text("New Eval Set")');

    // Wait for modal/form to open
    await page.waitForSelector('[role="dialog"], form', { state: 'visible' });

    // Fill in the form
    await fillField(page, 'input[name="name"], input[placeholder*="name" i]', evalSetName);
    await fillField(
      page,
      'textarea[name="description"], textarea[placeholder*="description" i], input[name="description"]',
      evalSetDescription
    );

    // Submit the form
    await page.click('button[type="submit"]:has-text("Create"), button:has-text("Create Eval Set")');

    // Wait for success toast
    try {
      await waitForToast(page, 'Eval set created');
    } catch {
      // Alternative success messages
      await page.waitForSelector('text=/created.*successfully/i', { timeout: 5000 });
    }

    // Verify redirect to eval sets list or detail page
    await page.waitForURL(/\/eval-sets/, { timeout: 10000 });

    // Verify eval set appears in the list
    const evalSetCard = page.locator(`text="${evalSetName}"`);
    await expect(evalSetCard).toBeVisible({ timeout: 10000 });

    // Extract eval set ID for cleanup
    const url = page.url();
    const match = url.match(/eval-sets\/([a-zA-Z0-9_-]+)/);
    if (match) {
      createdEvalSetId = match[1];
    } else {
      // Try to get ID from the page
      const bodyText = await page.textContent('body');
      const idMatch = bodyText?.match(/evalset_[a-f0-9-]+/);
      if (idMatch) {
        createdEvalSetId = idMatch[0];
      }
    }

    // Verify description is visible
    const description = page.locator(`text="${evalSetDescription}"`);
    await expect(description).toBeVisible();
  });

  test('TEST-ES06: should delete eval set successfully', async ({ page }) => {
    const evalSetName = uniqueName('To Delete Eval Set');

    // Navigate to eval sets page
    await page.goto('/eval-sets');
    await page.waitForLoadState('networkidle');

    // Create eval set via UI
    await page.click('button:has-text("Create Eval Set"), button:has-text("New Eval Set")');
    await page.waitForSelector('[role="dialog"], form', { state: 'visible' });
    await fillField(page, 'input[name="name"], input[placeholder*="name" i]', evalSetName);
    await page.click('button[type="submit"]:has-text("Create"), button:has-text("Create Eval Set")');

    // Wait for creation to complete
    await page.waitForSelector(`text="${evalSetName}"`, { timeout: 10000 });

    // Extract eval set ID
    const bodyText = await page.textContent('body');
    const idMatch = bodyText?.match(/evalset_[a-f0-9-]+/);
    if (idMatch) {
      createdEvalSetId = idMatch[0];
    }

    // Find and click delete button
    const evalSetCard = page.locator(`text="${evalSetName}"`).locator('..').locator('..'); // Navigate up to card
    await evalSetCard.locator('button:has-text("Delete"), button[aria-label*="delete" i]').click();

    // Confirm deletion if modal appears
    const confirmButton = page.locator('button:has-text("Delete"), button:has-text("Confirm")');
    if (await confirmButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await confirmButton.click();
    }

    // Wait for deletion toast
    try {
      await waitForToast(page, 'deleted');
    } catch {
      await page.waitForSelector('text=/deleted.*successfully/i', { timeout: 5000 });
    }

    // Verify eval set is removed from list
    await expect(page.locator(`text="${evalSetName}"`)).not.toBeVisible({ timeout: 5000 });

    // Mark as cleaned up
    createdEvalSetId = null;
  });
});
