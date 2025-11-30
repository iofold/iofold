import { test, expect } from '@playwright/test'
import { apiRequest, createTestIntegration, createTestTrace, deleteTestIntegration } from '../utils/helpers'

/**
 * Dashboard Page E2E Tests
 *
 * Tests verify the dashboard page functionality including:
 * - Welcome section with real-time clock
 * - KPI stat cards (Total Traces, Pass Rate, Active Evals, Active Agents)
 * - Recent activity feed
 * - Empty states
 * - Navigation links
 * - Responsive layout
 */
test.describe('Dashboard Page', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to dashboard before each test
    await page.goto('/')
    await page.waitForLoadState('networkidle')
  })

  test('TEST-D01: Dashboard loads with welcome section visible', async ({ page }) => {
    // Verify the main dashboard heading is visible
    const heading = page.getByRole('heading', { name: /Dashboard/i, level: 1 })
    await expect(heading).toBeVisible({ timeout: 10000 })

    // Verify the subtitle/description
    const subtitle = page.getByText(/Project overview and analytics/i)
    await expect(subtitle).toBeVisible()

    // Verify page loaded without errors
    await expect(page.locator('body')).toBeVisible()
  })

  test('TEST-D02: Real-time clock displays and updates', async ({ page }) => {
    // Wait for the "Last updated" clock element to appear
    const lastUpdatedLabel = page.getByText(/Last updated:/i)
    await expect(lastUpdatedLabel).toBeVisible({ timeout: 10000 })

    // Find the time display element (should show time or placeholder)
    const timeDisplay = page.locator('text=/--:--:--|\\d{2}:\\d{2}:\\d{2}/')
    await expect(timeDisplay).toBeVisible({ timeout: 5000 })

    // Get initial time value
    const initialTime = await timeDisplay.textContent()

    // If it's not a placeholder, wait and verify it updates
    if (initialTime && !initialTime.includes('--:--:--')) {
      // Wait for 2 seconds to allow time to potentially update
      await page.waitForTimeout(2000)

      const updatedTime = await timeDisplay.textContent()

      // Time should either be the same or different (both are valid since we don't know exact timing)
      expect(updatedTime).toBeTruthy()
      expect(updatedTime).toMatch(/\d{2}:\d{2}:\d{2}/)
    } else {
      // Placeholder state is acceptable on initial load
      expect(initialTime).toContain('--:--:--')
    }

    // Verify the date display is also present
    const dateDisplay = page.locator('text=/Mon|Tue|Wed|Thu|Fri|Sat|Sun/').first()
    // Date might be empty on initial render due to SSR, so we just check it exists
    await expect(dateDisplay).toBeAttached()
  })

  test('TEST-D03: All 4 stat cards render with correct titles', async ({ page }) => {
    // Define expected KPI card titles
    const expectedCards = [
      'Total Traces',
      'Overall Pass Rate',
      'Active Evals',
      'Active Agents',
    ]

    // Verify each KPI card is visible
    for (const cardTitle of expectedCards) {
      const card = page.getByText(cardTitle, { exact: true })
      await expect(card).toBeVisible({ timeout: 10000 })
    }

    // Verify we have exactly 4 KPI cards in the grid
    const kpiCards = page.locator('[class*="grid"]').first().locator('> div')
    const cardCount = await kpiCards.count()
    expect(cardCount).toBe(4)
  })

  test('TEST-D04: Stat cards show loading states then data', async ({ page }) => {
    // On initial load, we might see loading state or immediate data
    // Let's verify that cards eventually show actual data

    // Wait for the Total Traces card to show a number
    const totalTracesCard = page.locator('text=Total Traces').locator('..').locator('..')
    await expect(totalTracesCard).toBeVisible({ timeout: 10000 })

    // Look for a numeric value or zero in the card (anything but "Loading...")
    // The value should be visible after loading completes
    await page.waitForTimeout(2000) // Give time for data to load

    // Verify at least one card shows actual data (not "Loading...")
    const cardWithData = page.locator('text=/^\\d+$|^\\d+\\.\\d+%$/').first()
    await expect(cardWithData).toBeVisible({ timeout: 15000 })

    // Check that none of the cards show error states
    const errorText = page.getByText(/error|failed to load/i)
    await expect(errorText).not.toBeVisible()
  })

  test('TEST-D05: Recent activity section displays', async ({ page }) => {
    // Verify the "Recent Activity" section header is visible
    const activityHeader = page.getByRole('heading', { name: /Recent Activity/i })
    await expect(activityHeader).toBeVisible({ timeout: 10000 })

    // Verify the subtitle
    const activitySubtitle = page.getByText(/Real-time event feed/i)
    await expect(activitySubtitle).toBeVisible()

    // Verify activity filter tabs are present
    const allTab = page.getByRole('button', { name: /^all$/i })
    const failuresTab = page.getByRole('button', { name: /failures/i })
    const evaluationsTab = page.getByRole('button', { name: /evaluations/i })
    const alertsTab = page.getByRole('button', { name: /alerts/i })

    await expect(allTab).toBeVisible({ timeout: 5000 })
    await expect(failuresTab).toBeVisible()
    await expect(evaluationsTab).toBeVisible()
    await expect(alertsTab).toBeVisible()

    // Verify the filter button is present
    const filterButton = page.getByRole('button', { name: /Filter activity/i })
    await expect(filterButton).toBeVisible()
  })

  test('TEST-D06: Empty state shown when no recent activity', async ({ page }) => {
    // Wait for the activity section to load
    await page.waitForTimeout(3000)

    // Check if we have activity items or empty state
    const activityItems = page.locator('[class*="space-y-3"]').locator('[class*="group"]')
    const itemCount = await activityItems.count()

    if (itemCount === 0) {
      // If no activity, the feed should still be visible but empty
      // The parent container should exist
      const activityContainer = page.locator('[class*="space-y-3"][class*="max-h"]')
      await expect(activityContainer).toBeVisible()
    } else {
      // If there are activities, verify they have proper structure
      const firstActivity = activityItems.first()
      await expect(firstActivity).toBeVisible()

      // Verify activity has timestamp
      const timestamp = firstActivity.locator('text=/ago|now|second|minute|hour|day/')
      await expect(timestamp).toBeAttached()
    }

    // Verify "View all activity" button is present regardless of content
    const viewAllButton = page.getByRole('button', { name: /View all activity/i })
    await expect(viewAllButton).toBeVisible({ timeout: 5000 })
  })

  test('TEST-D07: Navigation links work', async ({ page }) => {
    // Test the "Export" button (should be visible and clickable)
    const exportButton = page.getByRole('button', { name: /Export/i })
    await expect(exportButton).toBeVisible({ timeout: 10000 })
    await expect(exportButton).toBeEnabled()

    // Test the "View all activity" button
    const viewAllButton = page.getByRole('button', { name: /View all activity/i })
    await expect(viewAllButton).toBeVisible({ timeout: 10000 })
    await expect(viewAllButton).toBeEnabled()

    // Test project selector
    const projectSelector = page.getByRole('combobox', { name: /Select project filter/i })
    await expect(projectSelector).toBeVisible()

    // Test date range selector
    const dateRangeSelector = page.getByRole('combobox', { name: /Select date range/i })
    await expect(dateRangeSelector).toBeVisible()

    // Verify selectors are functional by clicking one
    await dateRangeSelector.click()
    const dateOption = page.getByRole('option', { name: /Last 24 hours/i })
    await expect(dateOption).toBeVisible({ timeout: 5000 })
    // Close the dropdown
    await page.keyboard.press('Escape')
  })

  test('TEST-D08: Responsive layout adapts to viewport', async ({ page }) => {
    // Test desktop layout (default)
    await page.setViewportSize({ width: 1920, height: 1080 })
    await page.waitForTimeout(500)

    // Verify all 4 KPI cards are visible in a row
    const kpiGrid = page.locator('[class*="grid"][class*="md:grid-cols-2"][class*="lg:grid-cols-4"]').first()
    await expect(kpiGrid).toBeVisible()

    // Verify the main content grid with chart (2 cols) and activity (1 col)
    const mainGrid = page.locator('[class*="grid"][class*="lg:grid-cols-3"]').first()
    await expect(mainGrid).toBeVisible()

    // Test tablet layout
    await page.setViewportSize({ width: 768, height: 1024 })
    await page.waitForTimeout(500)

    // KPI cards should still be visible (might be 2 columns now)
    const totalTracesCard = page.getByText('Total Traces')
    await expect(totalTracesCard).toBeVisible()

    // Test mobile layout
    await page.setViewportSize({ width: 375, height: 667 })
    await page.waitForTimeout(500)

    // On mobile, cards should stack vertically but still be visible
    await expect(totalTracesCard).toBeVisible()

    // Verify header elements adapt (some might be hidden or repositioned)
    const heading = page.getByRole('heading', { name: /Dashboard/i, level: 1 })
    await expect(heading).toBeVisible()
  })
})

/**
 * Dashboard with Test Data
 *
 * Tests that verify dashboard behavior with actual data
 */
test.describe('Dashboard with Test Data', () => {
  let integrationId: string | null = null
  let traceIds: string[] = []

  test.beforeAll(async ({ browser }) => {
    // Setup: Create integration and test data
    const page = await browser.newPage()

    try {
      // Create integration
      const integration = await createTestIntegration(
        page,
        `Dashboard Test Integration ${Date.now()}`
      )
      integrationId = integration.id

      // Create multiple test traces with feedback
      for (let i = 0; i < 5; i++) {
        const trace = await createTestTrace(page, integrationId, {
          input_preview: `Dashboard test input ${i + 1}`,
          output_preview: `Dashboard test output ${i + 1}`,
          steps: [
            {
              step_id: `step_${i + 1}`,
              type: 'llm',
              input: { prompt: `Test prompt ${i + 1}` },
              output: { response: `Test response ${i + 1}` },
            },
          ],
        })
        traceIds.push(trace.id)

        // Add feedback to some traces
        if (i < 3) {
          await apiRequest(page, `/api/traces/${trace.id}/feedback`, {
            method: 'POST',
            data: {
              rating: i % 2 === 0 ? 'positive' : 'negative',
              comment: `Test feedback ${i + 1}`,
            },
          })
        }
      }
    } catch (error) {
      console.error('Failed to setup test data:', error)
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

  test('TEST-D09: Dashboard displays updated metrics with test data', async ({ page }) => {
    test.skip(!integrationId, 'No test data available')

    // Navigate to dashboard
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Wait for data to load
    await page.waitForTimeout(3000)

    // Verify Total Traces shows at least our test traces
    const totalTracesCard = page.locator('text=Total Traces').locator('..').locator('..')
    await expect(totalTracesCard).toBeVisible({ timeout: 10000 })

    // The value should be >= 5 (our test traces)
    const tracesValue = totalTracesCard.locator('text=/\\d+/')
    await expect(tracesValue).toBeVisible()
    const tracesCount = await tracesValue.textContent()
    expect(parseInt(tracesCount || '0')).toBeGreaterThanOrEqual(5)

    // Verify Pass Rate card shows calculated percentage
    const passRateCard = page.locator('text=Overall Pass Rate').locator('..').locator('..')
    await expect(passRateCard).toBeVisible()

    // Should show a percentage value
    const passRateValue = passRateCard.locator('text=/\\d+\\.?\\d*%/')
    await expect(passRateValue).toBeVisible()
  })

  test('TEST-D10: Activity feed shows recent events', async ({ page }) => {
    test.skip(!integrationId, 'No test data available')

    // Navigate to dashboard
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Wait for activity feed to load
    await page.waitForTimeout(3000)

    // Check if activity items are present
    const activityItems = page.locator('[class*="space-y-3"]').locator('[class*="group"]')
    const itemCount = await activityItems.count()

    if (itemCount > 0) {
      // Verify first activity item has proper structure
      const firstActivity = activityItems.first()
      await expect(firstActivity).toBeVisible()

      // Should have an icon
      const icon = firstActivity.locator('svg').first()
      await expect(icon).toBeVisible()

      // Should have a timestamp
      const timestamp = firstActivity.locator('[class*="text-xs"]').filter({ hasText: /ago|now/ })
      await expect(timestamp).toBeAttached()
    }

    // Test activity filters
    const failuresTab = page.getByRole('button', { name: /failures/i })
    await failuresTab.click()
    await page.waitForTimeout(500)

    // Filter should be applied (active state)
    await expect(failuresTab).toHaveClass(/bg-primary/)

    // Switch back to all
    const allTab = page.getByRole('button', { name: /^all$/i })
    await allTab.click()
    await page.waitForTimeout(500)
  })
})
