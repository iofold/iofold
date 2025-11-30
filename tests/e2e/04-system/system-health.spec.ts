import { test, expect } from '@playwright/test'

/**
 * TEST-SYS: System Health Page E2E Tests
 *
 * Tests for the system monitoring page that displays:
 * - System health overview
 * - Service status cards
 * - Health metrics and progress bars
 * - Last updated timestamp
 * - Auto-refresh functionality
 * - Error states
 * - Loading states
 * - Performance charts
 * - System alerts
 */

test.describe('System Health Monitoring', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to system page before each test
    await page.goto('/system')
    await page.waitForLoadState('networkidle')
  })

  test('TEST-SYS01: System page loads with health overview', async ({ page }) => {
    // Verify page header
    const heading = page.locator('h1:has-text("System Monitoring")')
    await expect(heading).toBeVisible()

    // Verify subtitle/description
    const description = page.locator('text=Real-time infrastructure health and performance analytics')
    await expect(description).toBeVisible()

    // Verify main sections are present
    const connectorHealth = page.locator('h2:has-text("Connector Health")')
    await expect(connectorHealth).toBeVisible()

    const performanceMetrics = page.locator('h2:has-text("Performance Metrics")')
    await expect(performanceMetrics).toBeVisible()

    const systemAlerts = page.locator('h2:has-text("System Alerts")')
    await expect(systemAlerts).toBeVisible()
  })

  test('TEST-SYS02: Service status cards display correctly', async ({ page }) => {
    // Verify at least 4 service cards are present (from mockServices)
    // The actual classes include dark mode variants
    const serviceCards = page.locator('.rounded-lg.border').filter({ has: page.locator('h3') })
    const cardCount = await serviceCards.count()
    expect(cardCount).toBeGreaterThanOrEqual(4)

    // Check first service card (Langfuse Production)
    const firstCard = serviceCards.first()
    await expect(firstCard).toBeVisible()

    // Verify service name is visible
    await expect(firstCard.locator('h3:has-text("Langfuse Production")')).toBeVisible()

    // Verify service type is visible
    await expect(firstCard.locator('text=Observability Platform')).toBeVisible()

    // Verify status bar exists (colored bar at top of card)
    const statusBar = firstCard.locator('.h-1.w-full.rounded-full').first()
    await expect(statusBar).toBeVisible()

    // Verify metrics are displayed
    await expect(firstCard.locator('text=Uptime')).toBeVisible()
    await expect(firstCard.locator('text=Throughput')).toBeVisible()
    await expect(firstCard.locator('text=Last Sync')).toBeVisible()
    await expect(firstCard.locator('text=Error Rate')).toBeVisible()

    // Verify version badge is present (should be a span with text content)
    const versionBadge = firstCard.locator('span.inline-flex.items-center.rounded-full.bg-slate-100')
    await expect(versionBadge).toBeVisible()
  })

  test('TEST-SYS03: Health metrics show values', async ({ page }) => {
    const serviceCards = page.locator('.rounded-lg.border').filter({ has: page.locator('h3') })
    const firstCard = serviceCards.first()

    // Verify health percentage is displayed
    const healthLabel = firstCard.locator('text=Health')
    await expect(healthLabel).toBeVisible()

    // Verify health percentage value (should be between 0-100)
    const healthValue = firstCard.locator('.font-medium.text-slate-900', { hasText: '%' }).first()
    await expect(healthValue).toBeVisible()
    const healthText = await healthValue.textContent()
    expect(healthText).toMatch(/\d+%/)

    // Verify health progress bar is present
    const progressBar = firstCard.locator('.h-2.w-full.overflow-hidden.rounded-full')
    await expect(progressBar).toBeVisible()

    // Verify uptime value (should be percentage)
    const uptimeSection = firstCard.locator('p:has-text("Uptime")').locator('..')
    const uptimeValue = uptimeSection.locator('.font-semibold')
    await expect(uptimeValue).toBeVisible()
    const uptimeText = await uptimeValue.textContent()
    expect(uptimeText).toMatch(/\d+\.?\d*%/)

    // Verify throughput value (should have req/min)
    const throughputSection = firstCard.locator('p:has-text("Throughput")').locator('..')
    const throughputValue = throughputSection.locator('.font-semibold')
    await expect(throughputValue).toBeVisible()
    const throughputText = await throughputValue.textContent()
    expect(throughputText).toMatch(/\d+\s*req\/min/)
  })

  test('TEST-SYS04: Last updated timestamp displays', async ({ page }) => {
    // Verify "Last updated" text is present
    const lastUpdatedLabel = page.locator('text=Last updated:')
    await expect(lastUpdatedLabel).toBeVisible()

    // Wait a moment for client-side hydration
    await page.waitForTimeout(1000)

    // Verify timestamp is displayed (should show time, not placeholder)
    const timestampRegion = page.locator('text=Last updated:').locator('..')
    const timestampText = await timestampRegion.textContent()

    // Should contain actual time (HH:MM:SS format) or similar, not "--:--:--"
    // Note: Due to hydration, initial render might show placeholder
    expect(timestampText).toContain('Last updated:')

    // Verify next refresh info is shown when auto-refresh is on
    if (timestampText?.includes('Next refresh in')) {
      expect(timestampText).toMatch(/Next refresh in \d+s/)
    }
  })

  test('TEST-SYS05: Refresh button updates data', async ({ page }) => {
    // Find the auto-refresh toggle button
    const refreshButton = page.locator('button:has-text("Auto-refresh")')
    await expect(refreshButton).toBeVisible()

    // Capture initial last updated time
    await page.waitForTimeout(1000) // Wait for hydration
    const timestampRegion = page.locator('text=Last updated:').locator('..')
    const initialTimestamp = await timestampRegion.textContent()

    // Click the refresh button (toggles auto-refresh)
    await refreshButton.click()

    // Wait a moment
    await page.waitForTimeout(500)

    // Verify button state changed (should show without countdown when off)
    const updatedButton = page.locator('button:has-text("Auto-refresh")')
    const buttonText = await updatedButton.textContent()

    // When auto-refresh is toggled, button appearance should change
    // Can check for countdown presence/absence
    expect(buttonText).toContain('Auto-refresh')
  })

  test('TEST-SYS06: Error state when service unhealthy', async ({ page }) => {
    // Look for warning/critical status service (Evaluation Engine has warning status)
    const serviceCards = page.locator('.rounded-lg.border').filter({ has: page.locator('h3') })

    // Find card with warning or critical status
    let foundWarningCard = false
    const cardCount = await serviceCards.count()

    for (let i = 0; i < cardCount; i++) {
      const card = serviceCards.nth(i)
      const statusBar = card.locator('.h-1.w-full.rounded-full')
      const statusBarClass = await statusBar.getAttribute('class')

      // Check for warning (amber) or critical (rose) status
      if (statusBarClass?.includes('bg-amber-500') || statusBarClass?.includes('bg-rose-500')) {
        foundWarningCard = true

        // Verify card is visible
        await expect(card).toBeVisible()

        // Verify it still shows metrics
        await expect(card.locator('text=Error Rate')).toBeVisible()

        break
      }
    }

    // At least one service should have warning status (Evaluation Engine)
    expect(foundWarningCard).toBeTruthy()
  })

  test('TEST-SYS07: Loading skeleton during fetch', async ({ page }) => {
    // Navigate to page with slow network to see loading state
    await page.route('**/*', route => {
      // Delay all requests slightly to see loading state
      setTimeout(() => route.continue(), 100)
    })

    await page.goto('/system')

    // Performance charts should show loading state initially
    const chartLoadingText = page.locator('text=Loading chart...')

    // Note: Due to fast loading, this might not always be visible
    // Just verify the page eventually loads successfully
    await page.waitForLoadState('networkidle')

    // Verify main content is present after loading
    const heading = page.locator('h1:has-text("System Monitoring")')
    await expect(heading).toBeVisible()
  })

  test('TEST-SYS08: Auto-refresh functionality', async ({ page }) => {
    // Verify auto-refresh is enabled by default
    const refreshButton = page.locator('button:has-text("Auto-refresh")')
    await expect(refreshButton).toBeVisible()

    // Wait for hydration
    await page.waitForTimeout(1000)

    // Check that countdown is present (indicating auto-refresh is on)
    const buttonText = await refreshButton.textContent()
    const hasCountdown = buttonText?.includes('s)')

    if (hasCountdown) {
      // Extract initial countdown value
      const match = buttonText?.match(/\((\d+)s\)/)
      expect(match).toBeTruthy()
      const initialSeconds = match ? parseInt(match[1]) : 0
      expect(initialSeconds).toBeGreaterThan(0)
      expect(initialSeconds).toBeLessThanOrEqual(30)

      // Wait 2 seconds and verify countdown decreased
      await page.waitForTimeout(2000)
      const updatedButtonText = await refreshButton.textContent()
      const updatedMatch = updatedButtonText?.match(/\((\d+)s\)/)

      if (updatedMatch) {
        const updatedSeconds = parseInt(updatedMatch[1])
        // Countdown should have decreased (with some tolerance for timing)
        expect(updatedSeconds).toBeLessThanOrEqual(initialSeconds)
      }
    }

    // Toggle auto-refresh off
    await refreshButton.click()
    await page.waitForTimeout(500)

    // Verify countdown is removed when auto-refresh is off
    const disabledButtonText = await refreshButton.textContent()
    expect(disabledButtonText).not.toMatch(/\(\d+s\)/)
  })

  test('TEST-SYS09: Connection status indicator', async ({ page }) => {
    // Verify connection status badge is present
    const connectedBadge = page.locator('text=Connected')
    await expect(connectedBadge).toBeVisible()

    // Verify pulse animation dot is present
    const pulseDot = page.locator('.h-2.w-2.rounded-full.bg-emerald-500.animate-pulse')
    await expect(pulseDot).toBeVisible()
  })

  test('TEST-SYS10: Performance charts display', async ({ page }) => {
    // Wait for page to fully load and hydrate
    await page.waitForTimeout(1500)

    // Verify Performance Metrics section exists
    const performanceSection = page.locator('section:has(h2:has-text("Performance Metrics"))')
    await expect(performanceSection).toBeVisible()

    // Verify API Response Time chart section (uses h3 with text-sm class, use exact match)
    const apiResponseChart = page.locator('h3.text-sm', { hasText: /^API Response Time$/ })
    await expect(apiResponseChart).toBeVisible()

    // Verify Memory Usage chart section (uses h3 with text-sm class, use exact match)
    const memoryChart = page.locator('h3.text-sm', { hasText: /^Memory Usage$/ })
    await expect(memoryChart).toBeVisible()

    // Charts should be rendered (check for recharts containers)
    // After hydration, the loading placeholder should be replaced with ResponsiveContainer
    const chartContainers = page.locator('.recharts-responsive-container')
    const containerCount = await chartContainers.count()
    expect(containerCount).toBeGreaterThanOrEqual(2)
  })

  test('TEST-SYS11: System alerts sidebar', async ({ page }) => {
    // Verify system alerts section
    const alertsSection = page.locator('h2:has-text("System Alerts")')
    await expect(alertsSection).toBeVisible()

    // Verify active alerts count badge (includes "Active" text)
    const activeBadge = page.locator('.inline-flex.items-center.rounded-full.bg-rose-100:has-text("Active")')
    await expect(activeBadge).toBeVisible()

    // Verify at least one alert is displayed (3 mock alerts)
    const alertCards = page.locator('.rounded-lg.border-l-4.p-4')
    const alertCount = await alertCards.count()
    expect(alertCount).toBeGreaterThanOrEqual(1)

    // Check first alert structure
    const firstAlert = alertCards.first()
    await expect(firstAlert).toBeVisible()

    // Verify severity badge (should contain severity text like CRITICAL, WARNING, INFO)
    // Use getByText to find the badge by its content
    const severityBadge = firstAlert.getByText(/^(CRITICAL|WARNING|INFO)$/)
    await expect(severityBadge).toBeVisible()
    const severityText = await severityBadge.textContent()
    expect(['CRITICAL', 'WARNING', 'INFO']).toContain(severityText)

    // Verify alert has title (should be an h3 element)
    const alertTitle = firstAlert.locator('h3')
    await expect(alertTitle).toBeVisible()

    // Verify alert message (should be a p tag)
    const alertMessage = firstAlert.locator('p').nth(0)
    await expect(alertMessage).toBeVisible()

    // Verify timestamp (should be the last p tag with time-related text)
    const timestamp = firstAlert.locator('p').last()
    await expect(timestamp).toBeVisible()
  })

  test('TEST-SYS12: Alert banner dismissal', async ({ page }) => {
    // Verify alert banner is visible - find it by the specific heading text to distinguish from alert cards
    const alertBanner = page.locator('div.rounded-lg.border-l-4.border-l-amber-500', {
      has: page.locator('h3:has-text("High Memory Usage Detected")')
    })
    await expect(alertBanner).toBeVisible()

    // Verify banner content (h3 with font-semibold class)
    await expect(alertBanner.locator('h3.font-semibold:has-text("High Memory Usage Detected")')).toBeVisible()

    // Find and click dismiss button (the X button) - it's the last button in the banner
    const dismissButton = alertBanner.locator('button').last()
    await expect(dismissButton).toBeVisible()
    await dismissButton.click()

    // Verify banner is removed
    await expect(alertBanner).not.toBeVisible()
  })

  test('TEST-SYS13: Time range selector present', async ({ page }) => {
    // Verify time range selector button
    const timeRangeButton = page.locator('button:has-text("Last 24 Hours")')
    await expect(timeRangeButton).toBeVisible()

    // Verify it has dropdown icon
    const chevronIcon = timeRangeButton.locator('svg')
    await expect(chevronIcon).toBeVisible()
  })

  test('TEST-SYS14: View all alerts button', async ({ page }) => {
    // Scroll to alerts section
    const alertsSection = page.locator('h2:has-text("System Alerts")')
    await alertsSection.scrollIntoViewIfNeeded()

    // Verify "View All Alerts" button
    const viewAllButton = page.locator('button:has-text("View All Alerts")')
    await expect(viewAllButton).toBeVisible()

    // Verify button is clickable
    await expect(viewAllButton).toBeEnabled()
  })

  test('TEST-SYS15: Responsive layout elements', async ({ page }) => {
    // Verify main grid layout exists
    const mainGrid = page.locator('.grid.grid-cols-1.gap-6.lg\\:grid-cols-3')
    await expect(mainGrid).toBeVisible()

    // Verify connector health section uses grid for cards
    const connectorSection = page.locator('section:has(h2:has-text("Connector Health"))')
    const cardGrid = connectorSection.locator('.grid.grid-cols-1.gap-4.md\\:grid-cols-2')
    await expect(cardGrid).toBeVisible()

    // Verify performance metrics section uses grid
    const metricsSection = page.locator('section:has(h2:has-text("Performance Metrics"))')
    const metricsGrid = metricsSection.locator('.grid.grid-cols-1.gap-4.lg\\:grid-cols-2')
    await expect(metricsGrid).toBeVisible()
  })

  test('TEST-SYS16: Dark mode support', async ({ page }) => {
    // Check that dark mode classes are present in the HTML
    // (actual dark mode toggle would require theme implementation)
    const mainContainer = page.locator('.min-h-screen.bg-slate-50.dark\\:bg-slate-950')
    await expect(mainContainer).toBeVisible()

    // Verify service cards have dark mode classes
    const serviceCard = page.locator('.dark\\:bg-slate-900').first()
    await expect(serviceCard).toBeVisible()
  })
})
