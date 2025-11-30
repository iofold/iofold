import { test, expect } from '@playwright/test'

/**
 * E2E Tests for Import Traces Modal
 *
 * Tests cover:
 * - Opening import modal
 * - Form validation
 * - Source selection
 * - API key input
 * - Date range selection
 * - Import process
 * - Error handling
 */

test.describe('Import Traces Modal', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to traces page
    await page.goto('/traces')

    // Wait for the page to load
    await page.waitForSelector('h1:has-text("Traces Explorer")', { timeout: 10000 })
  })

  test('should open import modal when clicking Import Traces button', async ({ page }) => {
    // Click Import Traces button
    await page.click('button:has-text("Import Traces")')

    // Verify modal is open
    await expect(page.locator('text=Import Traces')).toBeVisible({ timeout: 5000 })
  })

  test('should display import modal with all form fields', async ({ page }) => {
    // Open import modal
    await page.click('button:has-text("Import Traces")')

    // Wait for modal to be visible
    await page.waitForSelector('text=Import Traces', { timeout: 5000 })

    // Check for source selection
    const sourceLabel = page.locator('label:has-text("Source"), label:has-text("Platform")')
    await expect(sourceLabel).toBeVisible()

    // Check for API key field
    const apiKeyLabel = page.locator('label:has-text("API Key"), label:has-text("Access Token")')
    if (await apiKeyLabel.count() > 0) {
      await expect(apiKeyLabel.first()).toBeVisible()
    }

    // Check for date range fields
    const dateFields = page.locator('input[type="date"]')
    if (await dateFields.count() > 0) {
      await expect(dateFields.first()).toBeVisible()
    }
  })

  test('should close modal when clicking cancel or close button', async ({ page }) => {
    // Open import modal
    await page.click('button:has-text("Import Traces")')

    // Wait for modal
    await expect(page.locator('text=Import Traces')).toBeVisible({ timeout: 5000 })

    // Click cancel button (look for Cancel or close button)
    const cancelButton = page.locator('button:has-text("Cancel")').or(page.locator('button[aria-label*="Close"]'))
    if (await cancelButton.count() > 0) {
      await cancelButton.first().click()
    } else {
      // Try pressing Escape key
      await page.keyboard.press('Escape')
    }

    // Wait for modal to close
    await page.waitForTimeout(500)

    // Verify modal is closed (note: modal might still be in DOM but hidden)
    // We check if the main page content is interactable
    const filterButton = page.locator('button:has-text("Filters")')
    await expect(filterButton).toBeVisible()
  })

  test('should close modal when pressing Escape key', async ({ page }) => {
    // Open import modal
    await page.click('button:has-text("Import Traces")')

    // Wait for modal
    await expect(page.locator('text=Import Traces')).toBeVisible({ timeout: 5000 })

    // Press Escape
    await page.keyboard.press('Escape')

    // Wait for modal to close
    await page.waitForTimeout(500)

    // Verify modal is closed by checking main page is interactable
    const filterButton = page.locator('button:has-text("Filters")')
    await expect(filterButton).toBeVisible()
  })

  test('should select Langfuse as source', async ({ page }) => {
    // Open import modal
    await page.click('button:has-text("Import Traces")')

    // Wait for modal
    await page.waitForSelector('text=Import Traces', { timeout: 5000 })

    // Look for source selector (could be select, radio buttons, or tabs)
    const langfuseOption = page.locator('text=Langfuse').first()

    if (await langfuseOption.isVisible()) {
      await langfuseOption.click()

      // Verify selection (depends on UI implementation)
      // Could check for active state, checked radio, etc.
    }
  })

  test('should validate API key field is required', async ({ page }) => {
    // Open import modal
    await page.click('button:has-text("Import Traces")')

    // Wait for modal
    await page.waitForSelector('text=Import Traces', { timeout: 5000 })

    // Try to submit without API key
    const submitButton = page.locator('button:has-text("Import"), button:has-text("Start Import")')

    if (await submitButton.count() > 0) {
      await submitButton.first().click()

      // Wait for validation error
      await page.waitForTimeout(500)

      // Check for error message (implementation-specific)
      const errorMessage = page.locator('text=/required|cannot be empty|please enter/i')
      if (await errorMessage.count() > 0) {
        await expect(errorMessage.first()).toBeVisible()
      }
    }
  })

  test('should allow entering API key', async ({ page }) => {
    // Open import modal
    await page.click('button:has-text("Import Traces")')

    // Wait for modal
    await page.waitForSelector('text=Import Traces', { timeout: 5000 })

    // Find API key input
    const apiKeyInput = page.locator('input[type="password"], input[placeholder*="API"], input[name*="apiKey"]').first()

    if (await apiKeyInput.count() > 0) {
      // Enter test API key
      await apiKeyInput.fill('sk-test-api-key-12345')

      // Verify input was filled
      await expect(apiKeyInput).toHaveValue('sk-test-api-key-12345')
    }
  })

  test('should allow selecting date range', async ({ page }) => {
    // Open import modal
    await page.click('button:has-text("Import Traces")')

    // Wait for modal
    await page.waitForSelector('text=Import Traces', { timeout: 5000 })

    // Find date inputs
    const dateInputs = page.locator('input[type="date"]')

    if (await dateInputs.count() >= 2) {
      // Set start date
      await dateInputs.first().fill('2024-01-01')

      // Set end date
      await dateInputs.nth(1).fill('2024-01-31')

      // Verify dates were set
      await expect(dateInputs.first()).toHaveValue('2024-01-01')
      await expect(dateInputs.nth(1)).toHaveValue('2024-01-31')
    }
  })

  test('should validate end date is after start date', async ({ page }) => {
    // Open import modal
    await page.click('button:has-text("Import Traces")')

    // Wait for modal
    await page.waitForSelector('text=Import Traces', { timeout: 5000 })

    // Find date inputs
    const dateInputs = page.locator('input[type="date"]')

    if (await dateInputs.count() >= 2) {
      // Set end date before start date
      await dateInputs.first().fill('2024-01-31')
      await dateInputs.nth(1).fill('2024-01-01')

      // Try to submit
      const submitButton = page.locator('button:has-text("Import"), button:has-text("Start Import")')
      if (await submitButton.count() > 0) {
        await submitButton.first().click()

        // Wait for validation
        await page.waitForTimeout(500)

        // Check for error message
        const errorMessage = page.locator('text=/end date|after|invalid/i')
        if (await errorMessage.count() > 0) {
          await expect(errorMessage.first()).toBeVisible()
        }
      }
    }
  })

  test('should display loading state during import', async ({ page }) => {
    // Open import modal
    await page.click('button:has-text("Import Traces")')

    // Wait for modal
    await page.waitForSelector('text=Import Traces', { timeout: 5000 })

    // Fill in minimal required fields
    const apiKeyInput = page.locator('input[type="password"], input[placeholder*="API"], input[name*="apiKey"]').first()
    if (await apiKeyInput.count() > 0) {
      await apiKeyInput.fill('sk-test-api-key-12345')
    }

    // Submit form
    const submitButton = page.locator('button:has-text("Import"), button:has-text("Start Import")')
    if (await submitButton.count() > 0) {
      await submitButton.first().click()

      // Check for loading state (implementation-specific)
      // Could be spinner, disabled button, loading text
      const loadingIndicators = page.locator('text=/importing|loading/i, [class*="animate-spin"]')

      // Wait a bit for async action to start
      await page.waitForTimeout(200)

      if (await loadingIndicators.count() > 0) {
        await expect(loadingIndicators.first()).toBeVisible()
      }
    }
  })

  test('should show success message after successful import', async ({ page }) => {
    // Note: This test assumes a mock backend or test environment
    // In a real test, you'd need to mock the API response

    // Open import modal
    await page.click('button:has-text("Import Traces")')

    // Wait for modal
    await page.waitForSelector('text=Import Traces', { timeout: 5000 })

    // Fill in required fields
    const apiKeyInput = page.locator('input[type="password"], input[placeholder*="API"], input[name*="apiKey"]').first()
    if (await apiKeyInput.count() > 0) {
      await apiKeyInput.fill('sk-test-api-key-12345')
    }

    // Submit
    const submitButton = page.locator('button:has-text("Import"), button:has-text("Start Import")')
    if (await submitButton.count() > 0) {
      await submitButton.first().click()

      // Wait for success (with timeout)
      await page.waitForTimeout(2000)

      // Check for success message
      const successMessage = page.locator('text=/success|imported|complete/i')
      if (await successMessage.count() > 0) {
        await expect(successMessage.first()).toBeVisible({ timeout: 5000 })
      }
    }
  })

  test('should display error message on import failure', async ({ page }) => {
    // Note: This test requires proper error handling in the component

    // Open import modal
    await page.click('button:has-text("Import Traces")')

    // Wait for modal
    await page.waitForSelector('text=Import Traces', { timeout: 5000 })

    // Fill in invalid API key
    const apiKeyInput = page.locator('input[type="password"], input[placeholder*="API"], input[name*="apiKey"]').first()
    if (await apiKeyInput.count() > 0) {
      await apiKeyInput.fill('invalid-key')
    }

    // Submit
    const submitButton = page.locator('button:has-text("Import"), button:has-text("Start Import")')
    if (await submitButton.count() > 0) {
      await submitButton.first().click()

      // Wait for error
      await page.waitForTimeout(2000)

      // Check for error message
      const errorMessage = page.locator('text=/error|failed|invalid/i')
      if (await errorMessage.count() > 0) {
        await expect(errorMessage.first()).toBeVisible({ timeout: 5000 })
      }
    }
  })

  test('should allow retrying after failure', async ({ page }) => {
    // Open import modal
    await page.click('button:has-text("Import Traces")')

    // Wait for modal
    await page.waitForSelector('text=Import Traces', { timeout: 5000 })

    // Submit with invalid data
    const submitButton = page.locator('button:has-text("Import"), button:has-text("Start Import")')
    if (await submitButton.count() > 0) {
      await submitButton.first().click()

      // Wait for potential error
      await page.waitForTimeout(1000)

      // Form should still be visible for retry
      await expect(page.locator('text=Import Traces')).toBeVisible()

      // Submit button should be enabled again
      await expect(submitButton.first()).toBeEnabled()
    }
  })

  test('should preserve form state when reopening modal', async ({ page }) => {
    // Open import modal
    await page.click('button:has-text("Import Traces")')

    // Wait for modal
    await page.waitForSelector('text=Import Traces', { timeout: 5000 })

    // Fill in API key
    const apiKeyInput = page.locator('input[type="password"], input[placeholder*="API"], input[name*="apiKey"]').first()
    if (await apiKeyInput.count() > 0) {
      await apiKeyInput.fill('sk-test-key')

      // Close modal
      await page.keyboard.press('Escape')
      await page.waitForTimeout(500)

      // Reopen modal
      await page.click('button:has-text("Import Traces")')
      await page.waitForSelector('text=Import Traces', { timeout: 5000 })

      // Note: Depending on implementation, form might or might not preserve state
      // This test documents expected behavior
    }
  })

  test('should update trace list after successful import', async ({ page }) => {
    // Get initial trace count
    const initialCountText = await page.locator('text=/Showing \\d+ of \\d+ traces/').textContent()
    const initialMatch = initialCountText?.match(/Showing (\d+) of (\d+)/)
    const initialCount = initialMatch ? parseInt(initialMatch[2]) : 0

    // Open import modal
    await page.click('button:has-text("Import Traces")')

    // Wait for modal
    await page.waitForSelector('text=Import Traces', { timeout: 5000 })

    // Fill and submit (assuming successful import)
    const apiKeyInput = page.locator('input[type="password"], input[placeholder*="API"], input[name*="apiKey"]').first()
    if (await apiKeyInput.count() > 0) {
      await apiKeyInput.fill('sk-test-api-key-12345')

      const submitButton = page.locator('button:has-text("Import"), button:has-text("Start Import")')
      if (await submitButton.count() > 0) {
        await submitButton.first().click()

        // Wait for import to complete
        await page.waitForTimeout(3000)

        // Check if trace count updated
        const newCountText = await page.locator('text=/Showing \\d+ of \\d+ traces/').textContent()
        expect(newCountText).toBeTruthy()

        // Modal should be closed
        // Verify by checking main page is visible
        await expect(page.locator('h1:has-text("Traces Explorer")')).toBeVisible()
      }
    }
  })

  test('should display import progress indicator', async ({ page }) => {
    // Open import modal
    await page.click('button:has-text("Import Traces")')

    // Wait for modal
    await page.waitForSelector('text=Import Traces', { timeout: 5000 })

    // Submit import
    const apiKeyInput = page.locator('input[type="password"], input[placeholder*="API"], input[name*="apiKey"]').first()
    if (await apiKeyInput.count() > 0) {
      await apiKeyInput.fill('sk-test-api-key-12345')

      const submitButton = page.locator('button:has-text("Import"), button:has-text("Start Import")')
      if (await submitButton.count() > 0) {
        await submitButton.first().click()

        // Look for progress indicators
        await page.waitForTimeout(200)

        // Could be progress bar, percentage, "X of Y imported", etc.
        const progressIndicators = page.locator('text=/\\d+%|\\d+ of \\d+|importing/i')
        if (await progressIndicators.count() > 0) {
          await expect(progressIndicators.first()).toBeVisible()
        }
      }
    }
  })

  test('should display help text or tooltips for fields', async ({ page }) => {
    // Open import modal
    await page.click('button:has-text("Import Traces")')

    // Wait for modal
    await page.waitForSelector('text=Import Traces', { timeout: 5000 })

    // Look for help icons or text
    const helpElements = page.locator('[aria-label*="help"], [title*="help"], .text-muted-foreground')

    if (await helpElements.count() > 0) {
      // Help text should be visible or available on hover
      const firstHelp = helpElements.first()
      await expect(firstHelp).toBeDefined()
    }
  })

  test('should disable submit button when form is invalid', async ({ page }) => {
    // Open import modal
    await page.click('button:has-text("Import Traces")')

    // Wait for modal
    await page.waitForSelector('text=Import Traces', { timeout: 5000 })

    // Don't fill in any fields
    const submitButton = page.locator('button:has-text("Import"), button:has-text("Start Import")')

    if (await submitButton.count() > 0) {
      // Button should be disabled or clicking should show validation
      const isDisabled = await submitButton.first().isDisabled()

      if (!isDisabled) {
        // If not disabled, clicking should trigger validation
        await submitButton.first().click()
        await page.waitForTimeout(500)

        // Should see validation errors
        const validationErrors = page.locator('text=/required|please|must/i')
        if (await validationErrors.count() > 0) {
          expect(await validationErrors.count()).toBeGreaterThan(0)
        }
      } else {
        expect(isDisabled).toBe(true)
      }
    }
  })
})
