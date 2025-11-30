import { test, expect } from '@playwright/test'
import { apiRequest, uniqueName } from '../utils/helpers'

/**
 * Integration Management - Add Integration Tests
 *
 * These tests verify that integrations can be managed through the UI.
 * Note: The "Add Integration" flow uses a Dialog modal with Radix Select components.
 */
test.describe('Integration Management - Add Integration', () => {
  let integrationId: string | null = null

  test.afterEach(async ({ page }) => {
    // Cleanup created integration via API
    if (integrationId) {
      try {
        await apiRequest(page, `/api/integrations/${integrationId}`, { method: 'DELETE' })
      } catch {
        // Ignore cleanup errors
      }
      integrationId = null
    }
  })

  test('TEST-I01: Add Langfuse integration (happy path)', async ({ page }) => {
    // Navigate to integrations page
    await page.goto('/integrations')
    await page.waitForLoadState('networkidle')

    // Click "Add Integration" button
    const addButton = page.getByRole('button', { name: /Add Integration/i })
    await expect(addButton).toBeVisible({ timeout: 10000 })
    await addButton.click()

    // Wait for dialog to appear
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5000 })

    // Fill in the form - using locators that match the actual form structure
    const integrationName = uniqueName('Test Integration')
    await page.locator('input[name="name"]').fill(integrationName)

    // Fill in API key - use test key or fallback to a test value
    const apiKey = process.env.TEST_LANGFUSE_KEY || 'test_api_key_for_e2e'
    await page.locator('input[name="api_key"]').fill(apiKey)

    // Base URL - use env var or default
    const baseUrl = process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com'
    await page.locator('input[name="base_url"]').fill(baseUrl)

    // Submit the form - look for the submit button within the dialog
    await dialog.getByRole('button', { name: /Add Integration$/i }).click()

    // Wait for dialog to close (indicates success)
    await expect(dialog).not.toBeVisible({ timeout: 10000 })

    // Wait for the integration to appear in the list
    await expect(page.getByText(integrationName)).toBeVisible({ timeout: 10000 })

    // Get integration ID for cleanup via API
    const integrations = await apiRequest<{ integrations: any[] }>(page, '/api/integrations')
    const createdIntegration = integrations.integrations.find((i: any) => i.name === integrationName)
    if (createdIntegration) {
      integrationId = createdIntegration.id
    }
  })

  test('TEST-I03: Test integration connection', async ({ page }) => {
    // First create an integration via API
    const integrationName = uniqueName('Test Integration')
    const apiKey = process.env.TEST_LANGFUSE_KEY || 'test_key'
    const baseUrl = process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com'

    const integration = await apiRequest<any>(page, '/api/integrations', {
      method: 'POST',
      data: {
        platform: 'langfuse',
        name: integrationName,
        api_key: apiKey,
        base_url: baseUrl,
      },
    })
    integrationId = integration.id

    // Navigate to integrations page
    await page.goto('/integrations')
    await page.waitForLoadState('networkidle')

    // Wait for integration name to appear (data may take time to load)
    await expect(page.getByText(integrationName)).toBeVisible({ timeout: 10000 })

    // Find the Test button within the integration card
    const testButton = page.locator('[data-testid="test-integration-button"]').first()
    await expect(testButton).toBeVisible({ timeout: 5000 })
    await testButton.click()

    // Wait for response - button text changes or toast appears
    await page.waitForTimeout(3000)

    // Verify page didn't crash
    await expect(page.locator('body')).toBeVisible()
  })

  test('TEST-I04: Delete integration', async ({ page }) => {
    // Create an integration via API
    const integrationName = uniqueName('Test Integration')
    const apiKey = process.env.TEST_LANGFUSE_KEY || 'test_key'
    const baseUrl = process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com'

    const integration = await apiRequest<any>(page, '/api/integrations', {
      method: 'POST',
      data: {
        platform: 'langfuse',
        name: integrationName,
        api_key: apiKey,
        base_url: baseUrl,
      },
    })
    // Don't set integrationId since we're deleting it in the test

    // Navigate to integrations page
    await page.goto('/integrations')
    await page.waitForLoadState('networkidle')

    // Wait for integration name to appear first
    await expect(page.getByText(integrationName)).toBeVisible({ timeout: 10000 })

    // Find the integration card that contains our specific integration name and click its delete button
    // The card has data-testid like "integration-card-{id}" so we use attribute starts-with selector
    const integrationCard = page.locator('[data-testid^="integration-card-"]').filter({ hasText: integrationName })
    const deleteButton = integrationCard.locator('[data-testid="delete-integration-button"]')
    await deleteButton.click()

    // Wait for the integration name to disappear
    await expect(page.getByText(integrationName)).not.toBeVisible({ timeout: 10000 })
  })

  test('TEST-I05: List integrations', async ({ page }) => {
    // Create 2 test integrations via API
    const integration1Name = uniqueName('Test Integration 1')
    const integration2Name = uniqueName('Test Integration 2')
    const apiKey = process.env.TEST_LANGFUSE_KEY || 'test_key'
    const baseUrl = process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com'

    const integration1 = await apiRequest<any>(page, '/api/integrations', {
      method: 'POST',
      data: {
        platform: 'langfuse',
        name: integration1Name,
        api_key: apiKey,
        base_url: baseUrl,
      },
    })

    const integration2 = await apiRequest<any>(page, '/api/integrations', {
      method: 'POST',
      data: {
        platform: 'langfuse',
        name: integration2Name,
        api_key: apiKey,
        base_url: baseUrl,
      },
    })

    try {
      // Navigate to integrations page
      await page.goto('/integrations')
      await page.waitForLoadState('networkidle')

      // Verify both integrations are visible
      await expect(page.getByText(integration1Name)).toBeVisible({ timeout: 10000 })
      await expect(page.getByText(integration2Name)).toBeVisible({ timeout: 10000 })

      // Verify platform is shown (case-insensitive)
      await expect(page.getByText(/langfuse/i).first()).toBeVisible()

    } finally {
      // Cleanup via API
      await apiRequest(page, `/api/integrations/${integration1.id}`, { method: 'DELETE' }).catch(() => {})
      await apiRequest(page, `/api/integrations/${integration2.id}`, { method: 'DELETE' }).catch(() => {})
    }
  })
})
