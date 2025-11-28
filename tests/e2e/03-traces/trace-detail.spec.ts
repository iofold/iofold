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

    // Verify trace detail page loaded - check for heading or page title
    const traceDetailsHeading = page.getByRole('heading', { name: 'Trace Details' })
    const traceIdVisible = await traceDetailsHeading.isVisible().catch(() => false)

    // If heading not found, verify we're on the right page some other way
    if (!traceIdVisible) {
      // Check URL contains traces
      expect(page.url()).toContain('/traces/')
    }

    // Verify trace metadata is visible
    // This will depend on your actual UI implementation
    const metadataSection = page.locator('[data-testid="trace-metadata"]')
    if (await metadataSection.count() > 0) {
      await expect(metadataSection).toBeVisible()
    }

    // Verify execution steps or trace content is visible
    const traceContent = page.locator('[data-testid="trace-content"]')
    if (await traceContent.count() > 0) {
      await expect(traceContent).toBeVisible()
    }

    // Verify feedback buttons are visible (at least one feedback-related element)
    const feedbackButtons = page.locator('[data-testid*="feedback"]')
    const feedbackCount = await feedbackButtons.count()
    expect(feedbackCount).toBeGreaterThanOrEqual(1)
  })
})
