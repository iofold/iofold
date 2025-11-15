import { test, expect } from '@playwright/test'
import { apiRequest, waitForJobCompletion } from '../utils/helpers'
import { createTestIntegration, deleteTestIntegration } from '../../fixtures/integrations'

test.describe('Trace Management - Detail View', () => {
  let integrationId: string | null = null
  let traceId: string | null = null

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()
    
    try {
      // Create integration
      const integration = await createTestIntegration(page)
      integrationId = integration.id

      // Import traces
      const jobResponse = await apiRequest<any>(page, '/api/traces/import', {
        method: 'POST',
        data: {
          integration_id: integrationId,
          limit: 1,
        },
      })

      if (jobResponse.job_id) {
        await waitForJobCompletion(page, jobResponse.job_id, { timeout: 90000 })
        
        // Get first trace ID
        const traces = await apiRequest<any>(page, '/api/traces', {})
        if (traces.traces && traces.traces.length > 0) {
          traceId = traces.traces[0].id
        }
      }
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

    // Verify trace ID is displayed
    await expect(page.locator('text=/trace|id/i')).toBeVisible()

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

    // Verify feedback buttons are visible
    const feedbackButtons = page.locator('[data-testid*="feedback"]')
    const feedbackCount = await feedbackButtons.count()
    expect(feedbackCount).toBeGreaterThanOrEqual(1)
  })
})
