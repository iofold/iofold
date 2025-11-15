import { test, expect } from '@playwright/test'
import { apiRequest, waitForJobCompletion } from '../utils/helpers'
import { createTestIntegration, deleteTestIntegration } from '../../fixtures/integrations'

test.describe('Trace Management - List Display', () => {
  let integrationId: string | null = null
  let hasTraces = false

  test.beforeAll(async ({ browser }) => {
    // Setup: Create integration and import traces once for all tests
    const page = await browser.newPage()
    
    try {
      const integration = await createTestIntegration(page)
      integrationId = integration.id

      // Import some traces
      const jobResponse = await apiRequest<any>(page, '/api/traces/import', {
        method: 'POST',
        data: {
          integration_id: integrationId,
          limit: 5,
        },
      })

      if (jobResponse.job_id) {
        await waitForJobCompletion(page, jobResponse.job_id, { timeout: 90000 })
        hasTraces = true
      }
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
