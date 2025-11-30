import { test, expect } from '@playwright/test'
import { uniqueName, apiRequest } from '../utils/helpers'
import { deleteTestIntegration } from '../../fixtures/integrations'

test.describe('Integration Management - Error Cases', () => {
  let integrationId: string | null = null

  test.afterEach(async ({ page }) => {
    // Cleanup created integration if any
    if (integrationId) {
      await deleteTestIntegration(page, integrationId).catch(() => {})
      integrationId = null
    }
  })

  test('TEST-I02: Add integration with invalid credentials', async ({ page }) => {
    // Navigate to integrations page
    await page.goto('/integrations')
    await page.waitForLoadState('networkidle')

    // Click "Add Integration" button
    const addButton = page.getByRole('button', { name: /Add Integration/i })
    await expect(addButton).toBeVisible({ timeout: 10000 })
    await addButton.click()

    // Wait for modal/dialog to appear
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    // Fill in the form with invalid credentials
    const integrationName = uniqueName('Invalid Integration')
    await page.locator('input#name').fill(integrationName)

    // Platform defaults to 'langfuse' - no need to change

    // Fill with invalid API key
    await page.locator('input#api_key').fill('invalid_api_key')
    await page.locator('input#base_url').fill('https://cloud.langfuse.com')

    // Submit the form
    await dialog.getByRole('button', { name: /Add Integration$/i }).click()

    // The integration will be created (we don't validate credentials on create)
    // Wait for dialog to close (indicates success)
    await expect(dialog).not.toBeVisible({ timeout: 10000 })

    // Wait for the integration to appear in the list
    await expect(page.getByText(integrationName)).toBeVisible({ timeout: 10000 })

    // Get the created integration ID for cleanup
    const integrations = await apiRequest<{ integrations: any[] }>(page, '/api/integrations')
    const createdIntegration = integrations.integrations.find((i: any) => i.name === integrationName)
    if (createdIntegration) {
      integrationId = createdIntegration.id
    }

    // Verify integration was added (credentials validation happens on test connection, not on create)
    // The integration should be visible in the list even with invalid credentials
    expect(createdIntegration).toBeDefined()
  })
})
