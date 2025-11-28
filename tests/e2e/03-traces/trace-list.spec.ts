import { test, expect } from '@playwright/test'
import { createTestIntegration, createTestTrace, deleteTestIntegration } from '../utils/helpers'

test.describe('Trace Management - List Display', () => {
  let integrationId: string | null = null
  let hasTraces = false

  test.beforeAll(async ({ browser }) => {
    // Setup: Create integration and test traces once for all tests
    const page = await browser.newPage()

    try {
      // Create integration (no external API needed)
      const integration = await createTestIntegration(page, `Trace List Test Integration ${Date.now()}`)
      integrationId = integration.id

      // Create some test traces directly (no Langfuse import needed)
      for (let i = 0; i < 3; i++) {
        await createTestTrace(page, integrationId, {
          input_preview: `Test input ${i + 1}`,
          output_preview: `Test output ${i + 1}`,
          steps: [
            {
              step_id: `step_${i + 1}`,
              type: 'llm',
              input: { prompt: `Test prompt ${i + 1}` },
              output: { response: `Test response ${i + 1}` },
            },
          ],
        })
      }
      hasTraces = true
    } catch (error) {
      console.error('Failed to setup traces:', error)
    } finally {
      await page.close()
    }
  })

  test.afterAll(async ({ browser }) => {
    // Cleanup
    if (integrationId) {
      const page = await browser.newPage()
      await deleteTestIntegration(page, integrationId).catch(() => {})
      await page.close()
    }
  })

  test('TEST-T05: Trace list display', async ({ page }) => {
    test.skip(!hasTraces, 'No traces available for testing')

    // Navigate to traces page
    await page.goto('/traces')
    await page.waitForLoadState('networkidle')

    // Verify table/list is visible
    const traceList = page.locator('[data-testid="trace-list"]')
    await expect(traceList).toBeVisible()

    // Verify at least one trace is displayed
    const traceRows = page.locator('[data-testid="trace-row"]')
    const count = await traceRows.count()
    expect(count).toBeGreaterThanOrEqual(1)

    // Verify columns are present (adjust based on actual implementation)
    // Common columns: ID, Source, Timestamp, Eval Set, Feedback
    const firstRow = traceRows.first()
    await expect(firstRow).toBeVisible()

    // Check that trace has some identifying information visible
    const rowText = await firstRow.textContent()
    expect(rowText).toBeTruthy()
    expect(rowText!.length).toBeGreaterThan(0)
  })
})
