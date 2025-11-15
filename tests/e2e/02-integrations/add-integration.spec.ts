import { test, expect } from '@playwright/test'
import { apiRequest, uniqueName, waitForToast } from '../utils/helpers'
import { deleteTestIntegration } from '../../fixtures/integrations'

test.describe('Integration Management - Add Integration', () => {
  let integrationId: string | null = null

  test.afterEach(async ({ page }) => {
    // Cleanup created integration
    if (integrationId) {
      await deleteTestIntegration(page, integrationId).catch(() => {
        // Ignore cleanup errors
      })
      integrationId = null
    }
  })

  test('TEST-I01: Add Langfuse integration (happy path)', async ({ page }) => {
    // Navigate to integrations page
    await page.goto('/integrations')

    // Wait for page to load
    await page.waitForLoadState('networkidle')

    // Click "Add Integration" button
    await page.click('button:has-text("Add Integration")')

    // Wait for modal/dialog to appear
    await page.waitForSelector('form', { state: 'visible' })

    // Fill in the form
    const integrationName = uniqueName('Test Integration')
    await page.fill('input[name="name"]', integrationName)

    // Select platform (if it's a dropdown)
    const platformSelect = await page.$('select[name="platform"]')
    if (platformSelect) {
      await page.selectOption('select[name="platform"]', 'langfuse')
    }

    // Fill in API keys
    const publicKey = process.env.LANGFUSE_PUBLIC_KEY
    const secretKey = process.env.LANGFUSE_SECRET_KEY
    const baseUrl = process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com'

    if (!publicKey || !secretKey) {
      throw new Error('LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY must be set')
    }

    // Fill config fields (structure depends on your form implementation)
    await page.fill('input[name="config.public_key"]', publicKey)
    await page.fill('input[name="config.secret_key"]', secretKey)
    await page.fill('input[name="config.base_url"]', baseUrl)

    // Submit the form
    await page.click('button[type="submit"]:has-text("Add")')

    // Wait for success toast
    await waitForToast(page, 'Integration added successfully', 10000)

    // Verify the integration appears in the list
    await page.waitForSelector(`text="${integrationName}"`, { timeout: 10000 })

    // Verify integration has active status
    const integrationCard = page.locator(`text="${integrationName}"`).locator('..')
    await expect(integrationCard).toContainText('active')

    // Store integration ID for cleanup
    // Extract from the page or API
    const integrations = await apiRequest<{ integrations: any[] }>(page, '/api/integrations')
    const createdIntegration = integrations.integrations.find((i: any) => i.name === integrationName)
    if (createdIntegration) {
      integrationId = createdIntegration.id
    }
  })

  test('TEST-I03: Test integration connection', async ({ page }) => {
    // First create an integration via API
    const publicKey = process.env.LANGFUSE_PUBLIC_KEY
    const secretKey = process.env.LANGFUSE_SECRET_KEY
    const baseUrl = process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com'

    if (!publicKey || !secretKey) {
      throw new Error('LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY must be set')
    }

    const integrationName = uniqueName('Test Integration')
    const integration = await apiRequest<any>(page, '/api/integrations', {
      method: 'POST',
      data: {
        platform: 'langfuse',
        name: integrationName,
        config: {
          public_key: publicKey,
          secret_key: secretKey,
          base_url: baseUrl,
        },
      },
    })
    integrationId = integration.id

    // Navigate to integrations page
    await page.goto('/integrations')
    await page.waitForLoadState('networkidle')

    // Find the integration card and click "Test Connection" button
    const integrationCard = page.locator(`text="${integrationName}"`).locator('..')
    await integrationCard.locator('button:has-text("Test Connection")').click()

    // Wait for toast message
    await waitForToast(page, 'Connection successful', 15000)
  })

  test('TEST-I04: Delete integration', async ({ page }) => {
    // Create an integration via API
    const integrationName = uniqueName('Test Integration')
    const integration = await apiRequest<any>(page, '/api/integrations', {
      method: 'POST',
      data: {
        platform: 'langfuse',
        name: integrationName,
        config: {
          public_key: process.env.LANGFUSE_PUBLIC_KEY,
          secret_key: process.env.LANGFUSE_SECRET_KEY,
          base_url: process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com',
        },
      },
    })
    integrationId = integration.id

    // Navigate to integrations page
    await page.goto('/integrations')
    await page.waitForLoadState('networkidle')

    // Find and click delete button
    const integrationCard = page.locator(`text="${integrationName}"`).locator('..')
    await integrationCard.locator('button:has-text("Delete")').click()

    // Confirm deletion (if there's a confirmation modal)
    const confirmButton = await page.$('button:has-text("Confirm")')
    if (confirmButton) {
      await confirmButton.click()
    }

    // Wait for success toast
    await waitForToast(page, 'Integration deleted', 10000)

    // Verify integration is removed from list
    await expect(page.locator(`text="${integrationName}"`)).not.toBeVisible()

    // Clear integrationId so afterEach doesn't try to delete again
    integrationId = null
  })

  test('TEST-I05: List integrations', async ({ page }) => {
    // Create 2 test integrations via API
    const integration1Name = uniqueName('Test Integration 1')
    const integration2Name = uniqueName('Test Integration 2')

    const integration1 = await apiRequest<any>(page, '/api/integrations', {
      method: 'POST',
      data: {
        platform: 'langfuse',
        name: integration1Name,
        config: {
          public_key: process.env.LANGFUSE_PUBLIC_KEY,
          secret_key: process.env.LANGFUSE_SECRET_KEY,
          base_url: process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com',
        },
      },
    })

    const integration2 = await apiRequest<any>(page, '/api/integrations', {
      method: 'POST',
      data: {
        platform: 'langfuse',
        name: integration2Name,
        config: {
          public_key: process.env.LANGFUSE_PUBLIC_KEY,
          secret_key: process.env.LANGFUSE_SECRET_KEY,
          base_url: process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com',
        },
      },
    })

    try {
      // Navigate to integrations page
      await page.goto('/integrations')
      await page.waitForLoadState('networkidle')

      // Verify both integrations are visible
      await expect(page.locator(`text="${integration1Name}"`)).toBeVisible()
      await expect(page.locator(`text="${integration2Name}"`)).toBeVisible()

      // Verify they show platform name
      const integration1Card = page.locator(`text="${integration1Name}"`).locator('..')
      await expect(integration1Card).toContainText('langfuse')

    } finally {
      // Cleanup
      await deleteTestIntegration(page, integration1.id).catch(() => {})
      await deleteTestIntegration(page, integration2.id).catch(() => {})
    }
  })
})
