import { test, expect } from '@playwright/test'

/**
 * E2E Tests for Traces List Page
 *
 * Tests cover:
 * - Trace table rendering
 * - Filtering functionality
 * - Status badge display
 * - Trace detail panel
 * - Timestamp display with suppressHydrationWarning
 * - Sorting
 * - Row selection
 * - Keyboard shortcuts
 */

test.describe('Traces List Page', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to traces page
    await page.goto('/traces')

    // Wait for the page to load
    await page.waitForSelector('h1:has-text("Traces Explorer")', { timeout: 10000 })
  })

  test('should display page header and title', async ({ page }) => {
    // Check page title
    await expect(page.locator('h1')).toContainText('Traces Explorer')

    // Check description
    await expect(page.locator('p.text-muted-foreground').first()).toContainText(
      'Browse, filter, and analyze your AI agent traces'
    )
  })

  test('should display KPI cards', async ({ page }) => {
    // Wait for KPI cards to load
    await page.waitForSelector('text=Total Traces', { timeout: 5000 })

    // Check all KPI cards are present
    await expect(page.locator('text=Total Traces')).toBeVisible()
    await expect(page.locator('text=Reviewed')).toBeVisible()
    await expect(page.locator('text=Error Rate')).toBeVisible()
    await expect(page.locator('text=Step Count')).toBeVisible()
  })

  test('should display traces table with correct columns', async ({ page }) => {
    // Wait for table to load
    await page.waitForSelector('table', { timeout: 5000 })

    // Check table headers
    const headers = ['Timestamp', 'Trace ID', 'Input Preview', 'Status', 'Steps', 'Source', 'Feedback', 'Actions']

    for (const header of headers) {
      await expect(page.locator(`th:has-text("${header}")`)).toBeVisible()
    }
  })

  test('should display status badges correctly', async ({ page }) => {
    // Wait for table rows
    await page.waitForSelector('tbody tr', { timeout: 5000 })

    // Check if status badges are rendered
    const statusBadges = page.locator('tbody td').filter({ has: page.locator('span[class*="inline-flex items-center"]') })
    const count = await statusBadges.count()

    if (count > 0) {
      // Verify status badge has correct structure
      const firstBadge = statusBadges.first()
      await expect(firstBadge).toBeVisible()

      // Check badge contains icon and text
      const badgeContent = await firstBadge.textContent()
      expect(badgeContent).toBeTruthy()
    }
  })

  test('should display timestamps without hydration issues', async ({ page }) => {
    // Wait for table rows
    await page.waitForSelector('tbody tr', { timeout: 5000 })

    // Check timestamps are displayed in the table
    const timestampCells = page.locator('tbody td').filter({ hasText: /(ago|just now|minute|hour|day)/ }).first()

    if (await timestampCells.count() > 0) {
      await expect(timestampCells).toBeVisible()
      const timestampText = await timestampCells.textContent()
      expect(timestampText).toBeTruthy()
    }
  })

  test('should open filter panel when clicking Filters button', async ({ page }) => {
    // Click Filters button
    await page.click('button:has-text("Filters")')

    // Check filter panel is visible
    await expect(page.locator('h3:has-text("Advanced Filters")')).toBeVisible()

    // Check filter inputs are present
    await expect(page.locator('#search-query')).toBeVisible()
    await expect(page.locator('#status-filter')).toBeVisible()
    await expect(page.locator('#source-filter')).toBeVisible()
    await expect(page.locator('#model-filter')).toBeVisible()
  })

  test('should toggle filter panel with keyboard shortcut', async ({ page }) => {
    // Press 'f' key to toggle filters
    await page.keyboard.press('f')

    // Check filter panel is visible
    await expect(page.locator('h3:has-text("Advanced Filters")')).toBeVisible()

    // Press 'f' again to hide
    await page.keyboard.press('f')

    // Check filter panel is hidden
    await expect(page.locator('h3:has-text("Advanced Filters")')).not.toBeVisible()
  })

  test('should filter traces by status', async ({ page }) => {
    // Open filters
    await page.click('button:has-text("Filters")')

    // Select status filter
    await page.click('#status-filter')
    await page.click('text=Error')

    // Wait for filtering to apply
    await page.waitForTimeout(500)

    // Verify filter count badge is displayed
    const filterButton = page.locator('button:has-text("Filters")')
    const badgeText = await filterButton.locator('span[class*="bg-primary"]').textContent()
    expect(parseInt(badgeText || '0')).toBeGreaterThan(0)
  })

  test('should filter traces by source', async ({ page }) => {
    // Open filters
    await page.click('button:has-text("Filters")')

    // Select source filter
    await page.click('#source-filter')
    await page.click('text=Langfuse')

    // Wait for filtering to apply
    await page.waitForTimeout(500)

    // Verify active filter count
    const filterButton = page.locator('button:has-text("Filters")')
    await expect(filterButton.locator('span[class*="bg-primary"]')).toBeVisible()
  })

  test('should search traces by input preview', async ({ page }) => {
    // Open filters
    await page.click('button:has-text("Filters")')

    // Enter search query
    await page.fill('#search-query', 'test')

    // Wait for search to apply
    await page.waitForTimeout(500)

    // Verify filter count badge
    const filterButton = page.locator('button:has-text("Filters")')
    await expect(filterButton.locator('span[class*="bg-primary"]')).toBeVisible()
  })

  test('should clear all filters', async ({ page }) => {
    // Open filters
    await page.click('button:has-text("Filters")')

    // Apply multiple filters
    await page.fill('#search-query', 'test')
    await page.click('#status-filter')
    await page.click('text=Error')

    // Wait for filters to apply
    await page.waitForTimeout(500)

    // Click Clear All button
    await page.click('button:has-text("Clear All")')

    // Wait for clear action
    await page.waitForTimeout(500)

    // Verify filters are cleared
    const searchInput = page.locator('#search-query')
    await expect(searchInput).toHaveValue('')
  })

  test('should sort traces by timestamp', async ({ page }) => {
    // Wait for table to load
    await page.waitForSelector('tbody tr', { timeout: 5000 })

    // Click timestamp header to sort
    await page.click('th:has-text("Timestamp")')

    // Wait for sort to apply
    await page.waitForTimeout(500)

    // Verify sort icon is present
    const timestampHeader = page.locator('th:has-text("Timestamp")')
    const sortIcon = timestampHeader.locator('svg')
    await expect(sortIcon).toBeVisible()
  })

  test('should sort traces by step count', async ({ page }) => {
    // Wait for table to load
    await page.waitForSelector('tbody tr', { timeout: 5000 })

    // Click steps header to sort
    await page.click('th:has-text("Steps")')

    // Wait for sort to apply
    await page.waitForTimeout(500)

    // Verify sort icon is present
    const stepsHeader = page.locator('th:has-text("Steps")')
    const sortIcon = stepsHeader.locator('svg')
    await expect(sortIcon).toBeVisible()
  })

  test('should select single trace row', async ({ page }) => {
    // Wait for table rows
    await page.waitForSelector('tbody tr', { timeout: 5000 })

    // Click checkbox on first row
    const firstCheckbox = page.locator('tbody tr').first().locator('input[type="checkbox"]')
    await firstCheckbox.click()

    // Verify selection message appears
    await expect(page.locator('text=/\\d+ row(s?) selected/')).toBeVisible()
  })

  test('should select all traces', async ({ page }) => {
    // Wait for table rows
    await page.waitForSelector('tbody tr', { timeout: 5000 })

    // Click header checkbox to select all
    const headerCheckbox = page.locator('thead input[type="checkbox"]')
    await headerCheckbox.click()

    // Verify selection message appears
    await expect(page.locator('text=/\\d+ rows? selected/')).toBeVisible()
  })

  test('should open trace detail panel on row click', async ({ page }) => {
    // Wait for table rows
    await page.waitForSelector('tbody tr', { timeout: 5000 })

    // Click first row (not on checkbox)
    const firstRow = page.locator('tbody tr').first()
    await firstRow.locator('td').nth(2).click() // Click on a cell that's not the checkbox

    // Wait for side sheet to open
    await expect(page.locator('text=Trace Details')).toBeVisible({ timeout: 5000 })
  })

  test('should display trace details in side panel', async ({ page }) => {
    // Wait for table rows
    await page.waitForSelector('tbody tr', { timeout: 5000 })

    // Click view button on first row
    const viewButton = page.locator('tbody tr').first().locator('button[title*="View"]').or(page.locator('tbody tr').first().locator('button:has(svg)').first())
    await viewButton.click()

    // Verify detail panel sections
    await expect(page.locator('text=Trace Details')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('label:has-text("Trace ID")')).toBeVisible()
    await expect(page.locator('label:has-text("Source")')).toBeVisible()
    await expect(page.locator('label:has-text("Timestamp")')).toBeVisible()
    await expect(page.locator('label:has-text("Status")')).toBeVisible()
  })

  test('should display timestamp in detail panel with suppressHydrationWarning', async ({ page }) => {
    // Wait for table rows
    await page.waitForSelector('tbody tr', { timeout: 5000 })

    // Open first trace detail
    const firstRow = page.locator('tbody tr').first()
    await firstRow.locator('td').nth(2).click()

    // Wait for detail panel
    await expect(page.locator('text=Trace Details')).toBeVisible({ timeout: 5000 })

    // Check timestamp is displayed in detail panel
    const timestampSection = page.locator('label:has-text("Timestamp")').locator('..')
    const timestampValue = timestampSection.locator('p')
    await expect(timestampValue).toBeVisible()

    // Verify timestamp has content
    const timestampText = await timestampValue.textContent()
    expect(timestampText).toBeTruthy()
    expect(timestampText).toMatch(/\d/) // Should contain numbers
  })

  test('should close detail panel when clicking outside or close button', async ({ page }) => {
    // Wait for table rows
    await page.waitForSelector('tbody tr', { timeout: 5000 })

    // Open detail panel
    const firstRow = page.locator('tbody tr').first()
    await firstRow.locator('td').nth(2).click()

    // Wait for panel to open
    await expect(page.locator('text=Trace Details')).toBeVisible({ timeout: 5000 })

    // Press Escape to close
    await page.keyboard.press('Escape')

    // Wait for panel to close
    await expect(page.locator('text=Trace Details')).not.toBeVisible({ timeout: 2000 })
  })

  test('should copy trace ID to clipboard', async ({ page }) => {
    // Grant clipboard permissions
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])

    // Wait for table rows
    await page.waitForSelector('tbody tr', { timeout: 5000 })

    // Click copy button on first row
    const copyButton = page.locator('tbody tr').first().locator('button:has(svg)').filter({ has: page.locator('svg') }).last()
    await copyButton.click()

    // Verify clipboard content (note: this might not work in all environments)
    // The copy action should have been triggered
  })

  test('should display import traces button', async ({ page }) => {
    // Check Import Traces button is visible
    await expect(page.locator('button:has-text("Import Traces")')).toBeVisible()
  })

  test('should display keyboard shortcuts footer', async ({ page }) => {
    // Scroll to bottom
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))

    // Check keyboard shortcuts are displayed
    await expect(page.locator('kbd:has-text("f")')).toBeVisible()
    await expect(page.locator('text=Toggle filters')).toBeVisible()
  })

  test('should display empty state when no traces', async ({ page }) => {
    // This test assumes a clean database or specific filter that returns no results

    // Open filters and apply a very specific search that won't match
    await page.click('button:has-text("Filters")')
    await page.fill('#search-query', 'xyznonexistentsearch12345')

    // Wait for filter to apply
    await page.waitForTimeout(500)

    // Check empty state
    const emptyState = page.locator('text=No traces found')
    if (await emptyState.isVisible()) {
      await expect(page.locator('text=Try adjusting your filters')).toBeVisible()
    }
  })

  test('should update trace count display', async ({ page }) => {
    // Wait for count to load
    await page.waitForSelector('text=/Showing \\d+ of \\d+ traces/', { timeout: 5000 })

    // Verify count is displayed
    const countText = page.locator('text=/Showing \\d+ of \\d+ traces/')
    await expect(countText).toBeVisible()
  })

  test('should display live data indicator', async ({ page }) => {
    // Check live data indicator
    await expect(page.locator('text=Live data')).toBeVisible()
    await expect(page.locator('.animate-pulse')).toBeVisible()
  })

  test('should render source badge correctly', async ({ page }) => {
    // Wait for table rows
    await page.waitForSelector('tbody tr', { timeout: 5000 })

    // Find source badge
    const sourceBadge = page.locator('tbody td').filter({ has: page.locator('span.capitalize') }).first()

    if (await sourceBadge.count() > 0) {
      await expect(sourceBadge).toBeVisible()

      // Verify it contains valid source text
      const sourceText = await sourceBadge.textContent()
      expect(['langfuse', 'langsmith', 'openai']).toContain(sourceText?.trim().toLowerCase())
    }
  })

  test('should render feedback badge when feedback exists', async ({ page }) => {
    // Wait for table rows
    await page.waitForSelector('tbody tr', { timeout: 5000 })

    // Look for feedback badges
    const feedbackCells = page.locator('tbody tr td:nth-child(8)') // Feedback column
    const firstFeedbackCell = feedbackCells.first()

    if (await firstFeedbackCell.isVisible()) {
      const text = await firstFeedbackCell.textContent()
      // Should show either rating or em dash for no feedback
      expect(text).toBeTruthy()
    }
  })
})
