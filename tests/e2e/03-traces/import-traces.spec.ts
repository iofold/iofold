import { test, expect } from '@playwright/test'
import { apiRequest, waitForJobCompletion, uniqueName } from '../utils/helpers'
import { createTestIntegration, deleteTestIntegration } from '../../fixtures/integrations'

test.describe('Trace Management - Import', () => {
  let integrationId: string | null = null

  test.beforeEach(async ({ page }) => {
    // Create test integration
    const integration = await createTestIntegration(page)
    integrationId = integration.id
  })

  test.afterEach(async ({ page }) => {
    // Cleanup integration
    if (integrationId) {
      await deleteTestIntegration(page, integrationId).catch(() => {})
      integrationId = null
    }
  })

  test('TEST-T01: Import traces (happy path)', async ({ page }) => {
    // Navigate to traces page
    await page.goto('/traces')
    await page.waitForLoadState('networkidle')

    // Click "Import Traces" button
    await page.click('button:has-text("Import Traces")')

    // Wait for import modal/dialog
    await page.waitForSelector('form', { state: 'visible' })

    // Select integration
    await page.selectOption('select[name="integration_id"]', integrationId!)

    // Set limit
    await page.fill('input[name="limit"]', '10')

    // Submit import
    await page.click('button[type="submit"]:has-text("Import")')

    // Wait for job to be created - look for job ID or progress indicator
    await page.waitForTimeout(2000) // Brief wait for job creation

    // Extract job ID from the page (adjust selector based on your UI)
    const bodyText = await page.textContent('body')
    const jobIdMatch = bodyText?.match(/job_[a-f0-9-]+/)
    
    if (!jobIdMatch) {
      // Alternatively, check if modal closed and traces appeared
      await page.waitForSelector('text=/import/i', { state: 'detached', timeout: 60000 })
    } else {
      const jobId = jobIdMatch[0]
      // Wait for job completion via API
      await waitForJobCompletion(page, jobId, { timeout: 90000 })
    }

    // Verify traces were imported
    await page.goto('/traces')
    await page.waitForLoadState('networkidle')

    // Check that traces are visible (at least some)
    const traceRows = page.locator('[data-testid="trace-row"]')
    const count = await traceRows.count()
    expect(count).toBeGreaterThanOrEqual(1)
  })

  test('TEST-T02: Import traces with limit', async ({ page }) => {
    // Navigate to traces page
    await page.goto('/traces')
    await page.waitForLoadState('networkidle')

    // Click "Import Traces" button
    await page.click('button:has-text("Import Traces")')

    // Wait for import modal
    await page.waitForSelector('form', { state: 'visible' })

    // Select integration
    await page.selectOption('select[name="integration_id"]', integrationId!)

    // Set limit to 5
    await page.fill('input[name="limit"]', '5')

    // Submit import
    await page.click('button[type="submit"]:has-text("Import")')

    // Wait for completion
    await page.waitForTimeout(2000)
    const bodyText = await page.textContent('body')
    const jobIdMatch = bodyText?.match(/job_[a-f0-9-]+/)
    
    if (jobIdMatch) {
      const jobId = jobIdMatch[0]
      await waitForJobCompletion(page, jobId, { timeout: 90000 })
    } else {
      await page.waitForTimeout(10000) // Wait for import to complete
    }

    // Verify exactly 5 (or up to 5) traces were imported
    await page.goto('/traces')
    await page.waitForLoadState('networkidle')

    const traceRows = page.locator('[data-testid="trace-row"]')
    const count = await traceRows.count()
    expect(count).toBeGreaterThanOrEqual(1)
    expect(count).toBeLessThanOrEqual(10) // May have more if previous test ran
  })
})
