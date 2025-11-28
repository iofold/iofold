import { test, expect } from '@playwright/test'
import { apiRequest, createTestIntegration, createTestTrace, deleteTestIntegration, waitForToast } from '../utils/helpers'

test.describe('Trace Management - Feedback', () => {
  let integrationId: string | null = null
  let traceId: string | null = null
  let evalSetId: string | null = null

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()

    try {
      // Create integration (no external API needed)
      const integration = await createTestIntegration(page, `Feedback Test Integration ${Date.now()}`)
      integrationId = integration.id

      // Create eval set
      const evalSet = await apiRequest<any>(page, '/api/eval-sets', {
        method: 'POST',
        data: {
          name: `Test Eval Set ${Date.now()}`,
          description: 'For feedback testing',
        },
      })
      evalSetId = evalSet.id

      // Create test trace directly (no Langfuse import needed)
      const trace = await createTestTrace(page, integrationId, {
        input_preview: 'Test input for feedback testing',
        output_preview: 'Test output for feedback testing',
        steps: [
          {
            step_id: 'step_1',
            type: 'llm',
            input: { prompt: 'Test prompt' },
            output: { response: 'Test response' },
          },
        ],
      })
      traceId = trace.id
    } catch (error) {
      console.error('Failed to setup:', error)
    } finally {
      await page.close()
    }
  })

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage()
    try {
      if (integrationId) {
        await deleteTestIntegration(page, integrationId).catch(() => {})
      }
      if (evalSetId) {
        await apiRequest(page, `/api/eval-sets/${evalSetId}`, { method: 'DELETE' }).catch(() => {})
      }
    } finally {
      await page.close()
    }
  })

  test('TEST-T07: Submit positive feedback', async ({ page }) => {
    test.skip(!traceId || !evalSetId, 'No trace or eval set available')

    // Navigate to trace detail page
    await page.goto(`/traces/${traceId}`)
    await page.waitForLoadState('networkidle')

    // Wait for feedback buttons to appear (means eval set is selected)
    const positiveButton = page.locator('[data-testid="feedback-positive"]')
    await expect(positiveButton).toBeVisible({ timeout: 10000 })

    // Click thumbs up button
    await positiveButton.click()

    // Wait for success toast - the toast shows "Marked as positive"
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: /marked.*positive/i })).toBeVisible({ timeout: 10000 })

    // Verify button shows active state - check for bg-green or the selected class
    await expect(positiveButton).toHaveClass(/bg-green|active|selected/, { timeout: 5000 })
  })

  test('TEST-T11: Keyboard shortcuts', async ({ page }) => {
    test.skip(!traceId || !evalSetId, 'No trace or eval set available')

    // Navigate to trace detail page
    await page.goto(`/traces/${traceId}`)
    await page.waitForLoadState('networkidle')

    // Wait for feedback buttons to be visible (means eval set is auto-selected)
    const positiveButton = page.locator('[data-testid="feedback-positive"]')
    await expect(positiveButton).toBeVisible({ timeout: 10000 })

    // Press "1" for positive feedback
    await page.keyboard.press('1')

    // Wait for success toast - the toast shows "Marked as positive"
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: /marked.*positive/i })).toBeVisible({ timeout: 10000 })

    // Verify positive button is active
    await expect(positiveButton).toHaveClass(/bg-green|active|selected/, { timeout: 5000 })

    // Press "2" for neutral feedback
    await page.keyboard.press('2')

    // Wait for success toast - the toast shows "Marked as neutral"
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: /marked.*neutral/i })).toBeVisible({ timeout: 10000 })

    // Verify neutral button is active
    const neutralButton = page.locator('[data-testid="feedback-neutral"]')
    await expect(neutralButton).toHaveClass(/bg-gray|active|selected/, { timeout: 5000 })

    // Press "3" for negative feedback
    await page.keyboard.press('3')

    // Wait for success toast - the toast shows "Marked as negative"
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: /marked.*negative/i })).toBeVisible({ timeout: 10000 })

    // Verify negative button is active
    const negativeButton = page.locator('[data-testid="feedback-negative"]')
    await expect(negativeButton).toHaveClass(/bg-red|active|selected/, { timeout: 5000 })
  })
})
