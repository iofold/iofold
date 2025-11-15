import { test, expect } from '@playwright/test'
import { uniqueName, waitForToast } from '../utils/helpers'

test.describe('Integration Management - Error Cases', () => {

  test('TEST-I02: Add integration with invalid credentials', async ({ page }) => {
    // Navigate to integrations page
    await page.goto('/integrations')
    await page.waitForLoadState('networkidle')

    // Click "Add Integration" button
    await page.click('button:has-text("Add Integration")')

    // Wait for modal/dialog to appear
    await page.waitForSelector('form', { state: 'visible' })

    // Fill in the form with invalid credentials
    const integrationName = uniqueName('Invalid Integration')
    await page.fill('input[name="name"]', integrationName)

    // Select platform
    const platformSelect = await page.$('select[name="platform"]')
    if (platformSelect) {
      await page.selectOption('select[name="platform"]', 'langfuse')
    }

    // Fill with invalid API keys
    await page.fill('input[name="config.public_key"]', 'invalid_public_key')
    await page.fill('input[name="config.secret_key"]', 'invalid_secret_key')
    await page.fill('input[name="config.base_url"]', 'https://cloud.langfuse.com')

    // Submit the form
    await page.click('button[type="submit"]:has-text("Add")')

    // Wait for error toast (note: the actual error message may vary)
    // The test connection might fail or the integration might be created but marked as inactive
    // Adjust based on actual behavior
    try {
      // Check if error toast appears
      await page.waitForSelector('text=/error|failed|invalid/i', { timeout: 10000 })
    } catch {
      // Or check if modal stays open (indicating validation error)
      const form = await page.$('form')
      expect(form).not.toBeNull()
    }

    // Verify integration was NOT added to list (or was added with error status)
    await page.goto('/integrations')
    await page.waitForLoadState('networkidle')

    // Check if integration appears with error/inactive status
    const integrationExists = await page.locator(`text="${integrationName}"`).count() > 0
    if (integrationExists) {
      // If it was created, verify it's marked as inactive or has error status
      const integrationCard = page.locator(`text="${integrationName}"`).locator('..')
      const hasErrorIndicator = await integrationCard.locator('text=/inactive|error|failed/i').count() > 0
      expect(hasErrorIndicator).toBeTruthy()
    }
  })
})
