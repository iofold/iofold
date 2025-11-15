import { test, expect } from '@playwright/test'
import { apiRequest, waitForJobCompletion, waitForToast } from '../utils/helpers'
import { createTestIntegration, deleteTestIntegration } from '../../fixtures/integrations'

test.describe('Trace Management - Feedback', () => {
  let integrationId: string | null = null
  let traceId: string | null = null
  let evalSetId: string | null = null

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage()
    
    try {
      // Create integration
      const integration = await createTestIntegration(page)
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

    // Click thumbs up button
    const positiveButton = page.locator('[data-testid="feedback-positive"]')
    await positiveButton.click()

    // Wait for success toast
    await waitForToast(page, 'Feedback', 10000)

    // Verify button shows active state
    await expect(positiveButton).toHaveClass(/active|selected|bg-green/)
  })

  test('TEST-T11: Keyboard shortcuts', async ({ page }) => {
    test.skip(!traceId || !evalSetId, 'No trace or eval set available')

    // Navigate to trace detail page
    await page.goto(`/traces/${traceId}`)
    await page.waitForLoadState('networkidle')

    // Press "1" for positive feedback
    await page.keyboard.press('1')
    
    // Wait for feedback to be submitted
    await page.waitForTimeout(1000)

    // Verify positive button is active
    const positiveButton = page.locator('[data-testid="feedback-positive"]')
    await expect(positiveButton).toHaveClass(/active|selected|bg-green/)

    // Press "2" for neutral feedback
    await page.keyboard.press('2')
    await page.waitForTimeout(1000)

    // Verify neutral button is active
    const neutralButton = page.locator('[data-testid="feedback-neutral"]')
    await expect(neutralButton).toHaveClass(/active|selected|bg-gray/)

    // Press "3" for negative feedback
    await page.keyboard.press('3')
    await page.waitForTimeout(1000)

    // Verify negative button is active
    const negativeButton = page.locator('[data-testid="feedback-negative"]')
    await expect(negativeButton).toHaveClass(/active|selected|bg-red/)
  })
})
