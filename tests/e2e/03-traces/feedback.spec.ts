import { test, expect } from '@playwright/test'
import { apiRequest, createTestIntegration, createTestTrace, deleteTestIntegration, waitForToast } from '../utils/helpers'

test.describe('Trace Management - Feedback', () => {
  let integrationId: string | null = null
  let traceId: string | null = null
  let agentId: string | null = null

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()

    try {
      // Create integration (no external API needed)
      const integration = await createTestIntegration(page, `Feedback Test Integration ${Date.now()}`)
      integrationId = integration.id

      // Create agent
      const agent = await apiRequest<any>(page, '/api/agents', {
        method: 'POST',
        data: {
          name: `Test Agent ${Date.now()}`,
          description: 'For feedback testing',
        },
      })
      agentId = agent.id

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

      // Wait a bit to ensure all data is persisted
      await page.waitForTimeout(500)
    } catch (error) {
      console.error('Failed to setup:', error)
      throw error
    } finally {
      await page.close()
    }
  })

  test.beforeEach(async ({ page }) => {
    // Clean up any existing feedback before each test
    if (traceId) {
      try {
        const trace = await apiRequest<any>(page, `/api/traces/${traceId}`)
        if (trace?.feedback?.id) {
          await apiRequest(page, `/api/feedback/${trace.feedback.id}`, { method: 'DELETE' }).catch(() => {})
        }
      } catch {
        // Ignore if trace not found
      }
      // Wait for deletion to complete
      await page.waitForTimeout(500)
    }
  })

  test.afterAll(async ({ browser }) => {
    const page = await browser.newPage()
    try {
      if (integrationId) {
        await deleteTestIntegration(page, integrationId).catch(() => {})
      }
      if (agentId) {
        await apiRequest(page, `/api/agents/${agentId}`, { method: 'DELETE' }).catch(() => {})
      }
    } finally {
      await page.close()
    }
  })

  test('TEST-T07: Submit positive feedback', async ({ page }) => {
    test.skip(!traceId || !agentId, 'No trace or agent available')

    // Navigate to trace detail page
    await page.goto(`/traces/${traceId}`)
    await page.waitForLoadState('networkidle')

    // Wait longer for page to fully render and agent data to load
    await page.waitForTimeout(1000)

    // Wait for feedback buttons to appear (means agent is selected)
    const positiveButton = page.locator('[data-testid="feedback-positive"]')
    await expect(positiveButton).toBeVisible({ timeout: 15000 })

    // Ensure button is enabled before clicking
    await expect(positiveButton).toBeEnabled({ timeout: 5000 })

    // Click thumbs up button
    await positiveButton.click()

    // Wait for success toast - the toast shows "Feedback submitted successfully"
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: /feedback submitted successfully/i })).toBeVisible({ timeout: 10000 })

    // Verify button shows active state - check for bg-success (the actual class used)
    await expect(positiveButton).toHaveClass(/bg-success/, { timeout: 5000 })
  })

  test('TEST-T11: Keyboard shortcuts', async ({ page }) => {
    test.skip(!traceId || !agentId, 'No trace or agent available')

    // Navigate to trace detail page
    await page.goto(`/traces/${traceId}`)
    await page.waitForLoadState('networkidle')

    // Wait longer for page to fully render and agent data to load
    await page.waitForTimeout(1000)

    // Wait for feedback buttons to be visible (means agent is auto-selected)
    const positiveButton = page.locator('[data-testid="feedback-positive"]')
    await expect(positiveButton).toBeVisible({ timeout: 15000 })

    // Ensure buttons are enabled before sending keyboard shortcuts
    await expect(positiveButton).toBeEnabled({ timeout: 5000 })

    // Press "1" for positive feedback
    await page.keyboard.press('1')

    // Wait for success toast - keyboard shortcuts show "Marked as positive"
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: /marked as positive/i })).toBeVisible({ timeout: 10000 })

    // Verify positive button is active - check for bg-success (the actual class used)
    await expect(positiveButton).toHaveClass(/bg-success/, { timeout: 5000 })

    // Wait a bit before next action
    await page.waitForTimeout(500)

    // Press "2" for neutral feedback
    await page.keyboard.press('2')

    // Wait for success toast - keyboard shortcuts show "Marked as neutral"
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: /marked as neutral/i })).toBeVisible({ timeout: 10000 })

    // Verify neutral button is active - check for bg-muted or neutral styling
    const neutralButton = page.locator('[data-testid="feedback-neutral"]')
    await expect(neutralButton).toHaveClass(/bg-muted|bg-accent/, { timeout: 5000 })

    // Wait a bit before next action
    await page.waitForTimeout(500)

    // Press "3" for negative feedback
    await page.keyboard.press('3')

    // Wait for success toast - keyboard shortcuts show "Marked as negative"
    await expect(page.locator('[data-sonner-toast]').filter({ hasText: /marked as negative/i })).toBeVisible({ timeout: 10000 })

    // Verify negative button is active - check for bg-destructive (the actual class used)
    const negativeButton = page.locator('[data-testid="feedback-negative"]')
    await expect(negativeButton).toHaveClass(/bg-destructive/, { timeout: 5000 })
  })
})
