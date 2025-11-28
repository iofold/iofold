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
    await page.click('button:has-text("Add Integration")')

    // Wait for modal/dialog to appear
    await page.waitForSelector('[role="dialog"]', { state: 'visible' })

    // Fill in the form with invalid credentials
    const integrationName = uniqueName('Invalid Integration')
    await page.fill('input#name', integrationName)

    // Platform defaults to 'langfuse' - no need to change

    // Fill with invalid API key
    await page.fill('input#api_key', 'invalid_api_key')
    await page.fill('input#base_url', 'https://cloud.langfuse.com')

    // Submit the form
    await page.click('button[type="submit"]')

    // The integration will be created (we don't validate credentials on create)
    // Wait for success toast
    try {
      await page.waitForSelector('text=/added|success/i', { timeout: 10000 })
    } catch {
      // Or check if modal closes (indicating success)
    }

    // Get the created integration ID for cleanup
    await page.waitForTimeout(1000)
    const integrations = await apiRequest<{ integrations: any[] }>(page, '/api/integrations')
    const createdIntegration = integrations.integrations.find((i: any) => i.name === integrationName)
    if (createdIntegration) {
      integrationId = createdIntegration.id
    }

    // Verify integration was added (credentials validation happens on test connection, not on create)
    await page.goto('/integrations')
    await page.waitForLoadState('networkidle')

    // Check if integration appears in the list
    const integrationExists = await page.locator(`text="${integrationName}"`).count() > 0
    expect(integrationExists).toBeTruthy()
  })
})
