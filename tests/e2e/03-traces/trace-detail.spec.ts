import { test, expect } from '@playwright/test'
import { createTestIntegration, createTestTrace, deleteTestIntegration } from '../utils/helpers'

test.describe('Trace Management - Detail View', () => {
  let integrationId: string | null = null
  let traceId: string | null = null

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()

    try {
      // Create integration (no external API needed)
      const integration = await createTestIntegration(page, `Trace Detail Test Integration ${Date.now()}`)
      integrationId = integration.id

      // Create test trace directly (no Langfuse import needed)
      const trace = await createTestTrace(page, integrationId, {
        input_preview: 'Test input for detail view',
        output_preview: 'Test output for detail view',
        steps: [
          {
            step_id: 'step_1',
            type: 'llm',
            input: { prompt: 'What is the capital of France?' },
            output: { response: 'Paris is the capital of France.' },
          },
        ],
      })
      traceId = trace.id
    } catch (error) {
      console.error('Failed to setup trace:', error)
    } finally {
      await page.close()
    }
  })

  test.afterAll(async ({ browser }) => {
    if (integrationId) {
      const page = await browser.newPage()
      await deleteTestIntegration(page, integrationId).catch(() => {})
      await page.close()
    }
  })

  test('TEST-T06: Trace detail view', async ({ page }) => {
    test.skip(!traceId, 'No trace available for testing')

    // Navigate to trace detail page
    await page.goto(`/traces/${traceId}`)
    await page.waitForLoadState('networkidle')

    // Verify trace detail page loaded - the h1 heading says "Trace Details"
    const traceDetailsHeading = page.getByRole('heading', { name: 'Trace Details' })
    await expect(traceDetailsHeading).toBeVisible({ timeout: 10000 })

    // Verify we're on the correct page
    expect(page.url()).toContain('/traces/')

    // Verify trace ID is displayed (in a code element)
    const traceIdCode = page.locator('code.font-mono')
    await expect(traceIdCode.first()).toBeVisible()

    // Verify "Back to Traces" button is visible
    const backButton = page.getByRole('button', { name: /Back to Traces/i })
    await expect(backButton).toBeVisible()

    // Verify observation tree or timeline section is visible
    const observationSection = page.locator('text=/Observation Tree|Timeline/i')
    await expect(observationSection.first()).toBeVisible()

    // Verify feedback section is visible - look for "Add Feedback" or "Update Feedback" heading
    const feedbackSection = page.locator('text=/Add Feedback|Update Feedback/i')
    await expect(feedbackSection).toBeVisible()
  })
})
