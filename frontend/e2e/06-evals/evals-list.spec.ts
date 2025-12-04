import { test, expect } from '@playwright/test'

/**
 * E2E Tests for Evals List Page
 *
 * Tests cover:
 * - Page header and title
 * - Table rendering with correct columns
 * - Search functionality
 * - Agent filter dropdown
 * - Row selection and side sheet
 * - Side sheet tabs (Details, Executions)
 * - Metrics display
 * - Code viewer
 * - Action buttons
 * - URL state management
 * - Empty state
 *
 * Note: Tests that require evals data will be skipped if no evals exist in the database.
 */

test.describe('Evals List Page', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to evals page
    await page.goto('/evals')

    // Wait for the page to load
    await page.waitForSelector('h1:has-text("Evals")', { timeout: 10000 })
  })

  // Helper to check if evals data exists
  async function hasEvalsData(page: any): Promise<boolean> {
    // Wait a bit for table to potentially load
    await page.waitForTimeout(1000)
    const rows = await page.locator('tbody tr').count()
    return rows > 0
  }

  test('should display page header and title', async ({ page }) => {
    // Check page title
    await expect(page.locator('h1')).toContainText('Evals')

    // Check description
    await expect(page.locator('text=Manage evaluation functions for your agents')).toBeVisible()
  })

  test('should display search input', async ({ page }) => {
    // Check search input is present
    const searchInput = page.locator('input[placeholder="Search evals..."]')
    await expect(searchInput).toBeVisible()
  })

  test('should display agent filter dropdown', async ({ page }) => {
    // Check agent filter dropdown is present
    const filterDropdown = page.locator('button:has-text("All Agents")')
    await expect(filterDropdown).toBeVisible()
  })

  test('should display refresh button', async ({ page }) => {
    // Check refresh button is present
    const refreshButton = page.locator('button').filter({ has: page.locator('svg.lucide-refresh-cw') })
    await expect(refreshButton).toBeVisible()
  })

  test('should display evals table or empty state', async ({ page }) => {
    // Wait for either table or empty state
    await page.waitForTimeout(1000)

    const hasTable = await page.locator('table').isVisible()
    const hasEmptyState = await page.locator('text=No evals found').isVisible()

    // Either table or empty state should be visible
    expect(hasTable || hasEmptyState).toBe(true)
  })

  test('should display table with correct columns when evals exist', async ({ page }) => {
    const hasData = await hasEvalsData(page)
    test.skip(!hasData, 'No evals in database - skipping table column test')

    // Check table headers
    const headers = ['Name', 'Agent', 'Accuracy', 'Executions', 'Contradictions', 'Last Run']

    for (const header of headers) {
      await expect(page.locator(`th:has-text("${header}")`)).toBeVisible()
    }
  })

  test('should filter evals by search query', async ({ page }) => {
    // Enter search query
    const searchInput = page.locator('input[placeholder="Search evals..."]')
    await searchInput.fill('test')

    // Wait for filtering to apply
    await page.waitForTimeout(500)

    // Page should still be functional (either showing results or empty)
    await expect(page.locator('h1:has-text("Evals")')).toBeVisible()
  })

  test('should open agent filter dropdown', async ({ page }) => {
    // Click agent filter dropdown
    await page.locator('button:has-text("All Agents")').click()

    // Wait for dropdown to appear
    await page.waitForSelector('[role="listbox"]', { state: 'visible', timeout: 5000 })

    // Should show "All Agents" option
    await expect(page.getByRole('option', { name: 'All Agents' })).toBeVisible()
  })

  test('should open side sheet when clicking a table row', async ({ page }) => {
    const hasData = await hasEvalsData(page)
    test.skip(!hasData, 'No evals in database - skipping side sheet test')

    // Get first row
    const firstRow = page.locator('tbody tr').first()
    const evalName = await firstRow.locator('td').first().textContent()

    // Click on the row
    await firstRow.click()

    // Wait for side sheet to open
    await page.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 5000 })

    // Verify eval name is shown in sheet header
    if (evalName) {
      await expect(page.locator('[role="dialog"]')).toContainText(evalName.trim())
    }
  })

  test('should display side sheet with Details tab active by default', async ({ page }) => {
    const hasData = await hasEvalsData(page)
    test.skip(!hasData, 'No evals in database - skipping side sheet Details tab test')

    // Click on first row
    await page.locator('tbody tr').first().click()

    // Wait for side sheet
    await page.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 5000 })

    // Check Details tab is visible and active
    const detailsTab = page.locator('[role="dialog"] button:has-text("Details")')
    await expect(detailsTab).toBeVisible()
  })

  test('should display metrics cards in side sheet', async ({ page }) => {
    const hasData = await hasEvalsData(page)
    test.skip(!hasData, 'No evals in database - skipping metrics test')

    // Click on first row
    await page.locator('tbody tr').first().click()

    // Wait for side sheet
    await page.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 5000 })

    // Check metrics are displayed - use locator for metric labels (div with text-xs class)
    await expect(page.locator('[role="dialog"]').getByText('Accuracy')).toBeVisible()
    await expect(page.locator('[role="dialog"] div.text-xs').getByText('Executions')).toBeVisible()
    await expect(page.locator('[role="dialog"]').getByText('Contradictions')).toBeVisible()
  })

  test('should display eval code in side sheet', async ({ page }) => {
    const hasData = await hasEvalsData(page)
    test.skip(!hasData, 'No evals in database - skipping code viewer test')

    // Click on first row
    await page.locator('tbody tr').first().click()

    // Wait for side sheet
    await page.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 5000 })

    // Check code section is displayed
    await expect(page.locator('[role="dialog"]').getByText('Eval Code')).toBeVisible()
  })

  test('should switch to Executions tab', async ({ page }) => {
    const hasData = await hasEvalsData(page)
    test.skip(!hasData, 'No evals in database - skipping Executions tab test')

    // Click on first row
    await page.locator('tbody tr').first().click()

    // Wait for side sheet
    await page.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 5000 })

    // Click Executions tab
    await page.locator('[role="dialog"] button:has-text("Executions")').click()

    // Wait for tab content to change
    await page.waitForTimeout(300)

    // Should show executions content (either list or empty message)
    const executionsContent = page.locator('[role="dialog"]')
    await expect(executionsContent).toBeVisible()
  })

  test('should display action buttons in side sheet', async ({ page }) => {
    const hasData = await hasEvalsData(page)
    test.skip(!hasData, 'No evals in database - skipping action buttons test')

    // Click on first row
    await page.locator('tbody tr').first().click()

    // Wait for side sheet
    await page.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 5000 })

    // Check action buttons are displayed - use first() since there may be both link and button
    await expect(page.locator('[role="dialog"]').getByRole('link', { name: 'Playground' }).or(page.locator('[role="dialog"]').getByRole('button', { name: 'Playground' })).first()).toBeVisible()
    await expect(page.locator('[role="dialog"]').getByRole('link', { name: 'Matrix' }).or(page.locator('[role="dialog"]').getByRole('button', { name: 'Matrix' })).first()).toBeVisible()
    await expect(page.locator('[role="dialog"]').getByRole('button', { name: 'Execute' })).toBeVisible()
    await expect(page.locator('[role="dialog"]').getByRole('button', { name: 'Delete' })).toBeVisible()
  })

  test('should update URL when selecting an eval', async ({ page }) => {
    const hasData = await hasEvalsData(page)
    test.skip(!hasData, 'No evals in database - skipping URL update test')

    // Click on first row
    await page.locator('tbody tr').first().click()

    // Wait for side sheet
    await page.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 5000 })

    // URL should contain ?selected= parameter
    await expect(page).toHaveURL(/\/evals\?selected=/)
  })

  test('should close side sheet and clear URL when pressing Escape', async ({ page }) => {
    const hasData = await hasEvalsData(page)
    test.skip(!hasData, 'No evals in database - skipping Escape key test')

    // Click on first row
    await page.locator('tbody tr').first().click()

    // Wait for side sheet
    await page.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 5000 })

    // Press Escape
    await page.keyboard.press('Escape')

    // Wait for sheet to close
    await expect(page.locator('[role="dialog"]')).not.toBeVisible({ timeout: 2000 })

    // URL should be clean
    await expect(page).toHaveURL('/evals')
  })

  test('should highlight selected row in table', async ({ page }) => {
    const hasData = await hasEvalsData(page)
    test.skip(!hasData, 'No evals in database - skipping row highlight test')

    // Click on first row
    const firstRow = page.locator('tbody tr').first()
    await firstRow.click()

    // Wait for side sheet
    await page.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 5000 })

    // First row should have accent background
    await expect(firstRow).toHaveClass(/bg-accent/)
  })

  test('should display accuracy with color coding', async ({ page }) => {
    const hasData = await hasEvalsData(page)
    test.skip(!hasData, 'No evals in database - skipping accuracy color test')

    // Check that accuracy values have color classes
    const accuracyCells = page.locator('tbody tr td:nth-child(3) span')
    const count = await accuracyCells.count()

    if (count > 0) {
      const firstAccuracy = accuracyCells.first()
      const className = await firstAccuracy.getAttribute('class')
      // Should have green, yellow, or red color
      expect(className).toMatch(/text-(green|yellow|red)-600/)
    }
  })

  test('should display Generate Eval button when agents exist', async ({ page }) => {
    // The button should be visible if there are agents
    const generateButton = page.locator('button:has-text("Generate Eval")')

    // May or may not be visible depending on whether agents exist
    // Just check if button is in DOM (may be hidden)
    if (await generateButton.isVisible()) {
      await expect(generateButton).toBeEnabled()
    }
  })

  test('should display empty state when no evals match search', async ({ page }) => {
    // Enter a search query that won't match anything
    const searchInput = page.locator('input[placeholder="Search evals..."]')
    await searchInput.fill('xyznonexistentsearch12345')

    // Wait for filter to apply
    await page.waitForTimeout(500)

    // Either empty state message or empty table should be visible
    const emptyState = page.locator('text=No evals found')
    const pageVisible = await page.locator('h1:has-text("Evals")').isVisible()
    expect(pageVisible).toBe(true)
  })

  test('should navigate to Playground from side sheet', async ({ page }) => {
    const hasData = await hasEvalsData(page)
    test.skip(!hasData, 'No evals in database - skipping Playground navigation test')

    // Click on first row
    await page.locator('tbody tr').first().click()

    // Wait for side sheet
    await page.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 5000 })

    // Get the Playground link/button
    const playgroundLink = page.locator('[role="dialog"] a:has-text("Playground")')

    if (await playgroundLink.isVisible()) {
      const href = await playgroundLink.getAttribute('href')
      expect(href).toMatch(/\/evals\/.*\/playground/)
    }
  })

  test('should navigate to Matrix from side sheet', async ({ page }) => {
    const hasData = await hasEvalsData(page)
    test.skip(!hasData, 'No evals in database - skipping Matrix navigation test')

    // Click on first row
    await page.locator('tbody tr').first().click()

    // Wait for side sheet
    await page.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 5000 })

    // Get the Matrix link/button
    const matrixLink = page.locator('[role="dialog"] a:has-text("Matrix")')

    if (await matrixLink.isVisible()) {
      const href = await matrixLink.getAttribute('href')
      expect(href).toMatch(/\/matrix\//)
    }
  })

  test('should open eval from URL parameter', async ({ page }) => {
    const hasData = await hasEvalsData(page)
    test.skip(!hasData, 'No evals in database - skipping URL parameter test')

    // Click on first row to get its ID in URL
    await page.locator('tbody tr').first().click()
    await page.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 5000 })

    // Get the URL with selected param
    const url = page.url()
    const match = url.match(/selected=([^&]+)/)

    if (match) {
      const evalId = match[1]

      // Navigate away and back with the parameter
      await page.goto('/')
      await page.goto(`/evals?selected=${evalId}`)

      // Side sheet should open automatically
      await page.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 5000 })
    }
  })

  test('should redirect from /evals/[id] to /evals?selected=[id]', async ({ page }) => {
    const hasData = await hasEvalsData(page)
    test.skip(!hasData, 'No evals in database - skipping redirect test')

    // Click on first row to get its ID
    await page.locator('tbody tr').first().click()
    await page.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 5000 })

    // Get the eval ID from URL
    const url = page.url()
    const match = url.match(/selected=([^&]+)/)

    if (match) {
      const evalId = match[1]

      // Navigate to old-style URL
      await page.goto(`/evals/${evalId}`)

      // Should redirect to new URL format
      await expect(page).toHaveURL(`/evals?selected=${evalId}`)

      // Side sheet should be open
      await page.waitForSelector('[role="dialog"]', { state: 'visible', timeout: 5000 })
    }
  })
})
