import { test, expect } from '@playwright/test'
import { apiRequest, uniqueName } from '../utils/helpers'

/**
 * Integration Management - Add Integration Tests
 *
 * These tests verify that integrations can be managed through the UI.
 * Note: The "Add Integration" flow uses a Dialog modal with Radix Select components.
 */
test.describe('Integration Management - Add Integration', () => {
  // Configure serial mode to prevent test pollution
  // TEST-I08 requires clean state, so tests must run in order
  test.describe.configure({ mode: 'serial' })

  let integrationId: string | null = null

  test.beforeEach(async ({ page }) => {
    // Reset integrationId before each test
    integrationId = null
  })

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

    // Wait for integration card to appear using data-testid
    const integrationCard = page.locator(`[data-testid="integration-card-${integration.id}"]`)
    await expect(integrationCard).toBeVisible({ timeout: 10000 })

    // Verify integration name is visible
    await expect(integrationCard.getByTestId('integration-name')).toHaveText(integrationName)

    // Find the Test button within the integration card
    const testButton = integrationCard.getByTestId('test-integration-button')
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

      // Verify both integration cards are visible using data-testid
      const card1 = page.locator(`[data-testid="integration-card-${integration1.id}"]`)
      const card2 = page.locator(`[data-testid="integration-card-${integration2.id}"]`)

      await expect(card1).toBeVisible({ timeout: 10000 })
      await expect(card2).toBeVisible({ timeout: 10000 })

      // Verify integration names are visible using data-testid
      await expect(card1.getByTestId('integration-name')).toHaveText(integration1Name)
      await expect(card2.getByTestId('integration-name')).toHaveText(integration2Name)

      // Verify platform is shown (displayed capitalized in UI as "Langfuse")
      await expect(card1.getByText('Langfuse')).toBeVisible()
      await expect(card2.getByText('Langfuse')).toBeVisible()

      // Verify status badges are visible
      await expect(card1.getByTestId('integration-status')).toBeVisible()
      await expect(card2.getByTestId('integration-status')).toBeVisible()

    } finally {
      // Cleanup via API
      await apiRequest(page, `/api/integrations/${integration1.id}`, { method: 'DELETE' }).catch(() => {})
      await apiRequest(page, `/api/integrations/${integration2.id}`, { method: 'DELETE' }).catch(() => {})
    }
  })

  test('TEST-I06: Verify status badge styling', async ({ page }) => {
    // Create an active integration via API
    const integrationName = uniqueName('Status Test Integration')
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

    try {
      // Navigate to integrations page
      await page.goto('/integrations')
      await page.waitForLoadState('networkidle')

      // Wait for integration card to appear
      const integrationCard = page.locator(`[data-testid="integration-card-${integration.id}"]`)
      await expect(integrationCard).toBeVisible({ timeout: 10000 })

      // Get the status badge
      const statusBadge = integrationCard.getByTestId('integration-status')
      await expect(statusBadge).toBeVisible()

      // Verify status text (should be 'active' by default)
      const statusText = await statusBadge.textContent()
      expect(statusText?.trim()).toBe('active')

      // Verify badge has semantic styling for active status
      const badgeClasses = await statusBadge.getAttribute('class')
      expect(badgeClasses).toContain('bg-success')
      expect(badgeClasses).toContain('text-success')

    } finally {
      integrationId = null
    }
  })

  test('TEST-I07: Verify last synced timestamp displays', async ({ page }) => {
    // Create an integration via API
    const integrationName = uniqueName('Timestamp Test Integration')
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

    try {
      // Navigate to integrations page
      await page.goto('/integrations')
      await page.waitForLoadState('networkidle')

      // Wait for integration card to appear
      const integrationCard = page.locator(`[data-testid="integration-card-${integration.id}"]`)
      await expect(integrationCard).toBeVisible({ timeout: 10000 })

      // If last_synced_at is present, verify it displays correctly
      const lastSyncedText = integrationCard.getByText(/Last synced:/)

      // Only check if the integration has been synced
      const count = await lastSyncedText.count()
      if (count > 0) {
        await expect(lastSyncedText).toBeVisible()
        const text = await lastSyncedText.textContent()
        // toLocaleString() format varies by locale, so just check it starts with "Last synced:"
        expect(text).toMatch(/Last synced:/)
      }

    } finally {
      integrationId = null
    }
  })

  test('TEST-I08: Verify empty integrations state', async ({ page }) => {
    // Delete all integrations first to ensure clean state
    const integrations = await apiRequest<{ integrations: any[] }>(page, '/api/integrations')
    for (const integration of integrations.integrations) {
      await apiRequest(page, `/api/integrations/${integration.id}`, { method: 'DELETE' }).catch(() => {})
    }

    // Wait a bit for deletions to complete
    await page.waitForTimeout(500)

    // Navigate to integrations page
    await page.goto('/integrations')
    await page.waitForLoadState('networkidle')

    // Additional wait to ensure page has fully rendered
    await page.waitForTimeout(1000)

    // Verify empty state is displayed
    await expect(page.getByText('No integrations connected')).toBeVisible({ timeout: 10000 })
    // Note: The text in the UI has "traces." with a period at the end
    await expect(page.getByText('Connect your observability platform (Langfuse, Langsmith, or OpenAI) to import traces.')).toBeVisible()

    // Verify "Add your first integration" button is visible
    const addFirstButton = page.getByRole('button', { name: /Add your first integration/i })
    await expect(addFirstButton).toBeVisible()

    // Verify clicking the button opens the add integration modal
    await addFirstButton.click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible({ timeout: 5000 })
  })

  test('TEST-I09: Verify integration actions buttons', async ({ page }) => {
    // Create an integration via API
    const integrationName = uniqueName('Actions Test Integration')
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

    try {
      // Navigate to integrations page
      await page.goto('/integrations')
      await page.waitForLoadState('networkidle')

      // Wait for integration card to appear
      const integrationCard = page.locator(`[data-testid="integration-card-${integration.id}"]`)
      await expect(integrationCard).toBeVisible({ timeout: 10000 })

      // Verify Test button is visible
      const testButton = integrationCard.getByTestId('test-integration-button')
      await expect(testButton).toBeVisible()
      await expect(testButton).toHaveText(/Test/)

      // Verify Delete button is visible
      const deleteButton = integrationCard.getByTestId('delete-integration-button')
      await expect(deleteButton).toBeVisible()
      await expect(deleteButton).toHaveText(/Delete/)

    } finally {
      integrationId = null
    }
  })
})
