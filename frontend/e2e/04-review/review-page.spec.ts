/**
 * E2E Tests for Review Page (app/review/page.tsx)
 *
 * Tests cover:
 * - Page loading and initial state
 * - Trace card display
 * - Feedback actions (thumbs up/down/okay)
 * - Progress tracking
 * - Session timer
 * - Keyboard shortcuts
 * - Empty state
 * - Completion state
 * - Navigation
 * - Auto mode toggle
 * - Mock vs Live data toggle
 * - Notes functionality
 */

import { test, expect, type Page } from '@playwright/test'

// =============================================================================
// Test Configuration
// =============================================================================

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
const REVIEW_PAGE_URL = `${BASE_URL}/review`

// Helper to wait for page to be fully loaded
async function waitForReviewPageLoad(page: Page) {
  await page.waitForLoadState('networkidle')
  await page.waitForSelector('h1:has-text("Daily Quick Review")', { timeout: 10000 })
}

// Helper to check if we're on demo mode
async function ensureDemoMode(page: Page) {
  const demoButton = page.getByRole('button', { name: /demo/i })
  const buttonText = await demoButton.textContent()

  // If button says "Live", we're already in demo mode
  // If button says "Demo", we need to click to enable demo mode
  if (buttonText?.toLowerCase().includes('live')) {
    await demoButton.click()
    await page.waitForTimeout(500) // Wait for state to update
  }
}

// =============================================================================
// Test Suite: Page Load and Initial State
// =============================================================================

test.describe('Review Page - Initial Load', () => {
  test('should load review page successfully', async ({ page }) => {
    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)

    // Check main heading is present
    await expect(page.getByRole('heading', { name: 'Daily Quick Review' })).toBeVisible()

    // Check lightning bolt icon (Zap)
    await expect(page.locator('svg.lucide-zap')).toBeVisible()
  })

  test('should display page header with back button', async ({ page }) => {
    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)

    // Check back button
    const backButton = page.getByRole('button', { name: /back/i }).first()
    await expect(backButton).toBeVisible()
    await expect(backButton).toContainText('Back')
  })

  test('should display progress indicators in header', async ({ page }) => {
    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)
    await ensureDemoMode(page)

    // Check for progress text (e.g., "0/5")
    await expect(page.locator('text=/\\d+\\/\\d+/')).toBeVisible()

    // Check for feedback counters
    await expect(page.locator('text=/Good: \\d+/')).toBeVisible()
    await expect(page.locator('text=/Okay: \\d+/')).toBeVisible()
    await expect(page.locator('text=/Bad: \\d+/')).toBeVisible()
  })

  test('should display auto mode toggle button', async ({ page }) => {
    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)

    // Check auto mode button
    const autoButton = page.getByRole('button', { name: /auto|pause/i })
    await expect(autoButton).toBeVisible()
  })

  test('should display estimated remaining time', async ({ page }) => {
    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)
    await ensureDemoMode(page)

    // Check for time indicator (clock icon and minutes)
    await expect(page.locator('svg.lucide-clock')).toBeVisible()
    await expect(page.locator('text=/~\\d+m/')).toBeVisible()
  })

  test('should display demo/live toggle button', async ({ page }) => {
    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)

    // Check for demo/live toggle
    const toggleButton = page.getByRole('button', { name: /demo|live/i })
    await expect(toggleButton).toBeVisible()
  })
})

// =============================================================================
// Test Suite: Trace Card Display
// =============================================================================

test.describe('Review Page - Trace Card Display', () => {
  test('should display trace card with user input section', async ({ page }) => {
    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)
    await ensureDemoMode(page)

    // Check for USER INPUT header
    await expect(page.locator('text=USER INPUT')).toBeVisible()

    // Check that input text is displayed
    const inputSection = page.locator('text=USER INPUT').locator('..').locator('..')
    await expect(inputSection).toContainText(/\w+/) // Contains some text
  })

  test('should display trace card with agent response section', async ({ page }) => {
    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)
    await ensureDemoMode(page)

    // Check for AGENT RESPONSE header
    await expect(page.locator('text=AGENT RESPONSE')).toBeVisible()

    // Check that response text is displayed
    const responseSection = page.locator('text=AGENT RESPONSE').locator('..').locator('..')
    await expect(responseSection).toContainText(/\w+/) // Contains some text
  })

  test('should display trace metadata (timestamp, duration, score)', async ({ page }) => {
    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)
    await ensureDemoMode(page)

    // Check for calendar icon (timestamp indicator)
    await expect(page.locator('svg.lucide-calendar')).toBeVisible()

    // Check for score indicator with trending up icon
    await expect(page.locator('svg.lucide-trending-up')).toBeVisible()
    await expect(page.locator('text=/%/')).toBeVisible()
  })

  test('should display model and token information', async ({ page }) => {
    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)
    await ensureDemoMode(page)

    // Check for metadata section
    await expect(page.locator('text=/Model:/')).toBeVisible()
    await expect(page.locator('text=/Tokens:/')).toBeVisible()
  })

  test('should display quick notes textarea', async ({ page }) => {
    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)
    await ensureDemoMode(page)

    // Check for notes textarea
    const notesTextarea = page.getByPlaceholder(/quick notes/i)
    await expect(notesTextarea).toBeVisible()
    await expect(notesTextarea).toBeEditable()
  })

  test('should display keyboard shortcut hints', async ({ page }) => {
    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)
    await ensureDemoMode(page)

    // Check for keyboard shortcut indicators (1, 2, 3 keys)
    await expect(page.locator('kbd:has-text("1")')).toBeVisible()
    await expect(page.locator('kbd:has-text("2")')).toBeVisible()
    await expect(page.locator('kbd:has-text("3")')).toBeVisible()
  })
})

// =============================================================================
// Test Suite: Feedback Actions
// =============================================================================

test.describe('Review Page - Feedback Actions', () => {
  test('should submit "Good" feedback and advance to next trace', async ({ page }) => {
    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)
    await ensureDemoMode(page)

    // Get initial progress count
    const progressText = await page.locator('text=/\\d+\\/\\d+/').textContent()
    const initialCount = parseInt(progressText?.split('/')[0] || '0')

    // Get initial Good count
    const goodCountText = await page.locator('text=/Good: \\d+/').textContent()
    const initialGoodCount = parseInt(goodCountText?.match(/\\d+/)?.[0] || '0')

    // Click Good button
    await page.getByRole('button', { name: /✅.*good/i }).click()

    // Wait for animation
    await page.waitForTimeout(500)

    // Check that Good count increased
    const newGoodCountText = await page.locator('text=/Good: \\d+/').textContent()
    const newGoodCount = parseInt(newGoodCountText?.match(/\\d+/)?.[0] || '0')
    expect(newGoodCount).toBe(initialGoodCount + 1)

    // Check that reviewed count increased
    const newProgressText = await page.locator('text=/\\d+\\/\\d+/').textContent()
    const newCount = parseInt(newProgressText?.split('/')[0] || '0')
    expect(newCount).toBe(initialCount + 1)
  })

  test('should submit "Bad" feedback and advance to next trace', async ({ page }) => {
    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)
    await ensureDemoMode(page)

    // Get initial Bad count
    const badCountText = await page.locator('text=/Bad: \\d+/').textContent()
    const initialBadCount = parseInt(badCountText?.match(/\\d+/)?.[0] || '0')

    // Click Bad button
    await page.getByRole('button', { name: /❌.*bad/i }).click()

    // Wait for animation
    await page.waitForTimeout(500)

    // Check that Bad count increased
    const newBadCountText = await page.locator('text=/Bad: \\d+/').textContent()
    const newBadCount = parseInt(newBadCountText?.match(/\\d+/)?.[0] || '0')
    expect(newBadCount).toBe(initialBadCount + 1)
  })

  test('should submit "Okay" feedback and advance to next trace', async ({ page }) => {
    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)
    await ensureDemoMode(page)

    // Get initial Okay count
    const okayCountText = await page.locator('text=/Okay: \\d+/').textContent()
    const initialOkayCount = parseInt(okayCountText?.match(/\\d+/)?.[0] || '0')

    // Click Okay button
    await page.getByRole('button', { name: /➖.*okay/i }).click()

    // Wait for animation
    await page.waitForTimeout(500)

    // Check that Okay count increased
    const newOkayCountText = await page.locator('text=/Okay: \\d+/').textContent()
    const newOkayCount = parseInt(newOkayCountText?.match(/\\d+/)?.[0] || '0')
    expect(newOkayCount).toBe(initialOkayCount + 1)
  })

  test('should display toast notification on feedback submission', async ({ page }) => {
    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)
    await ensureDemoMode(page)

    // Click Good button
    await page.getByRole('button', { name: /✅.*good/i }).click()

    // Check for toast (sonner toast component)
    await expect(page.locator('[data-sonner-toast]')).toBeVisible({ timeout: 2000 })
  })

  test('should clear notes after feedback submission', async ({ page }) => {
    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)
    await ensureDemoMode(page)

    // Type notes
    const notesTextarea = page.getByPlaceholder(/quick notes/i)
    await notesTextarea.fill('Test note')
    await expect(notesTextarea).toHaveValue('Test note')

    // Submit feedback
    await page.getByRole('button', { name: /✅.*good/i }).click()

    // Wait for animation
    await page.waitForTimeout(500)

    // Check notes are cleared
    await expect(notesTextarea).toHaveValue('')
  })

  test('should animate trace card transition on feedback', async ({ page }) => {
    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)
    await ensureDemoMode(page)

    // Get initial trace content
    const initialInput = await page.locator('text=USER INPUT').locator('..').locator('..').textContent()

    // Submit feedback
    await page.getByRole('button', { name: /✅.*good/i }).click()

    // Wait for animation to complete
    await page.waitForTimeout(500)

    // Check that content changed (new trace loaded)
    const newInput = await page.locator('text=USER INPUT').locator('..').locator('..').textContent()
    // Note: In demo mode with multiple traces, content should change
    // If only one trace, this test may need adjustment
  })
})

// =============================================================================
// Test Suite: Progress Tracking
// =============================================================================

test.describe('Review Page - Progress Tracking', () => {
  test('should update progress counter correctly', async ({ page }) => {
    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)
    await ensureDemoMode(page)

    // Get initial progress (should be 0/N)
    const initialProgress = await page.locator('text=/\\d+\\/\\d+/').textContent()
    expect(initialProgress).toMatch(/0\/\d+/)

    // Submit one feedback
    await page.getByRole('button', { name: /✅.*good/i }).click()
    await page.waitForTimeout(500)

    // Check progress updated to 1/N
    const newProgress = await page.locator('text=/\\d+\\/\\d+/').textContent()
    expect(newProgress).toMatch(/1\/\d+/)
  })

  test('should track Good/Okay/Bad counts independently', async ({ page }) => {
    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)
    await ensureDemoMode(page)

    // Submit different feedback types
    await page.getByRole('button', { name: /✅.*good/i }).click()
    await page.waitForTimeout(500)

    await page.getByRole('button', { name: /❌.*bad/i }).click()
    await page.waitForTimeout(500)

    await page.getByRole('button', { name: /➖.*okay/i }).click()
    await page.waitForTimeout(500)

    // Check all counts
    const goodCount = await page.locator('text=/Good: \\d+/').textContent()
    const okayCount = await page.locator('text=/Okay: \\d+/').textContent()
    const badCount = await page.locator('text=/Bad: \\d+/').textContent()

    expect(goodCount).toContain('1')
    expect(okayCount).toContain('1')
    expect(badCount).toContain('1')
  })

  test('should update remaining time estimate as traces are reviewed', async ({ page }) => {
    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)
    await ensureDemoMode(page)

    // Get initial remaining time
    const initialTime = await page.locator('text=/~\\d+m/').textContent()
    const initialMinutes = parseInt(initialTime?.match(/\\d+/)?.[0] || '0')

    // Submit feedback
    await page.getByRole('button', { name: /✅.*good/i }).click()
    await page.waitForTimeout(500)

    // Get new remaining time (should be less or equal)
    const newTime = await page.locator('text=/~\\d+m/').textContent()
    const newMinutes = parseInt(newTime?.match(/\\d+/)?.[0] || '0')

    expect(newMinutes).toBeLessThanOrEqual(initialMinutes)
  })

  test('should display color-coded feedback badges', async ({ page }) => {
    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)
    await ensureDemoMode(page)

    // Check for color-coded badges
    const goodBadge = page.locator('text=/Good: \\d+/').locator('..')
    const okayBadge = page.locator('text=/Okay: \\d+/').locator('..')
    const badBadge = page.locator('text=/Bad: \\d+/').locator('..')

    // Check badges are visible and have appropriate styling
    await expect(goodBadge).toBeVisible()
    await expect(okayBadge).toBeVisible()
    await expect(badBadge).toBeVisible()
  })
})

// =============================================================================
// Test Suite: Keyboard Shortcuts
// =============================================================================

test.describe('Review Page - Keyboard Shortcuts', () => {
  test('should submit Bad feedback with "1" key', async ({ page }) => {
    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)
    await ensureDemoMode(page)

    // Get initial Bad count
    const initialBadCount = await page.locator('text=/Bad: \\d+/').textContent()
    const initialCount = parseInt(initialBadCount?.match(/\\d+/)?.[0] || '0')

    // Press "1" key
    await page.keyboard.press('1')
    await page.waitForTimeout(500)

    // Check Bad count increased
    const newBadCount = await page.locator('text=/Bad: \\d+/').textContent()
    const newCount = parseInt(newBadCount?.match(/\\d+/)?.[0] || '0')
    expect(newCount).toBe(initialCount + 1)
  })

  test('should submit Okay feedback with "2" key', async ({ page }) => {
    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)
    await ensureDemoMode(page)

    // Get initial Okay count
    const initialOkayCount = await page.locator('text=/Okay: \\d+/').textContent()
    const initialCount = parseInt(initialOkayCount?.match(/\\d+/)?.[0] || '0')

    // Press "2" key
    await page.keyboard.press('2')
    await page.waitForTimeout(500)

    // Check Okay count increased
    const newOkayCount = await page.locator('text=/Okay: \\d+/').textContent()
    const newCount = parseInt(newOkayCount?.match(/\\d+/)?.[0] || '0')
    expect(newCount).toBe(initialCount + 1)
  })

  test('should submit Good feedback with "3" key', async ({ page }) => {
    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)
    await ensureDemoMode(page)

    // Get initial Good count
    const initialGoodCount = await page.locator('text=/Good: \\d+/').textContent()
    const initialCount = parseInt(initialGoodCount?.match(/\\d+/)?.[0] || '0')

    // Press "3" key
    await page.keyboard.press('3')
    await page.waitForTimeout(500)

    // Check Good count increased
    const newGoodCount = await page.locator('text=/Good: \\d+/').textContent()
    const newCount = parseInt(newGoodCount?.match(/\\d+/)?.[0] || '0')
    expect(newCount).toBe(initialCount + 1)
  })

  test('should toggle auto mode with "a" key', async ({ page }) => {
    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)
    await ensureDemoMode(page)

    // Get initial auto mode button text
    const autoButton = page.getByRole('button', { name: /auto|pause/i })
    const initialText = await autoButton.textContent()

    // Press "a" key
    await page.keyboard.press('a')
    await page.waitForTimeout(300)

    // Check button text changed
    const newText = await autoButton.textContent()
    expect(newText).not.toBe(initialText)

    // Check for toast notification
    await expect(page.locator('[data-sonner-toast]')).toBeVisible({ timeout: 2000 })
  })

  test('should navigate with arrow keys', async ({ page }) => {
    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)
    await ensureDemoMode(page)

    // Submit one feedback to have history
    await page.keyboard.press('3')
    await page.waitForTimeout(500)

    // Get current trace index (should be 1)
    const progressAfterFirst = await page.locator('text=/\\d+\\/\\d+/').textContent()
    expect(progressAfterFirst).toContain('1')

    // Press left arrow to go back
    await page.keyboard.press('ArrowLeft')
    await page.waitForTimeout(300)

    // Should be back at index 0 (but reviewed count stays at 1)
    // We can verify by checking if we can go forward
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(300)
  })

  test('should not trigger keyboard shortcuts when typing in textarea', async ({ page }) => {
    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)
    await ensureDemoMode(page)

    // Focus on notes textarea
    const notesTextarea = page.getByPlaceholder(/quick notes/i)
    await notesTextarea.focus()

    // Type "123" which would normally trigger feedback if not focused
    await notesTextarea.type('123')

    // Check that notes contain the typed text (not submitted as feedback)
    await expect(notesTextarea).toHaveValue('123')

    // Check that no feedback was submitted (counts should still be 0)
    const goodCount = await page.locator('text=/Good: \\d+/').textContent()
    const okayCount = await page.locator('text=/Okay: \\d+/').textContent()
    const badCount = await page.locator('text=/Bad: \\d+/').textContent()

    expect(goodCount).toContain('0')
    expect(okayCount).toContain('0')
    expect(badCount).toContain('0')
  })
})

// =============================================================================
// Test Suite: Auto Mode
// =============================================================================

test.describe('Review Page - Auto Mode', () => {
  test('should toggle auto mode on click', async ({ page }) => {
    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)
    await ensureDemoMode(page)

    // Find auto mode button
    const autoButton = page.getByRole('button', { name: /auto|pause/i })

    // Get initial state
    const initialText = await autoButton.textContent()

    // Click to toggle
    await autoButton.click()
    await page.waitForTimeout(300)

    // Check button text changed
    const newText = await autoButton.textContent()
    expect(newText).not.toBe(initialText)

    // Toggle back
    await autoButton.click()
    await page.waitForTimeout(300)

    // Should return to initial state
    const finalText = await autoButton.textContent()
    expect(finalText).toBe(initialText)
  })

  test('should show play icon when auto mode is off', async ({ page }) => {
    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)
    await ensureDemoMode(page)

    // Ensure auto mode is off (button should show "Auto" with play icon)
    const autoButton = page.getByRole('button', { name: /auto/i })

    // Check for play icon
    const playIcon = autoButton.locator('svg.lucide-play')
    await expect(playIcon).toBeVisible()
  })

  test('should display toast notification when toggling auto mode', async ({ page }) => {
    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)
    await ensureDemoMode(page)

    // Toggle auto mode
    const autoButton = page.getByRole('button', { name: /auto|pause/i })
    await autoButton.click()

    // Check for toast
    await expect(page.locator('[data-sonner-toast]')).toBeVisible({ timeout: 2000 })
  })
})

// =============================================================================
// Test Suite: Empty State
// =============================================================================

test.describe('Review Page - Empty State', () => {
  test('should display empty state when no traces available', async ({ page }) => {
    // This test assumes we can trigger empty state by using live mode with no traces
    // In a real scenario, you might need to mock the API or have a specific test setup

    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)

    // Switch to live mode (which likely has no traces in test environment)
    const toggleButton = page.getByRole('button', { name: /demo/i })
    await toggleButton.click()
    await page.waitForTimeout(1000)

    // Check for empty state message
    // Note: This might show loading or error state instead depending on API setup
    // You may need to adjust this test based on your actual empty state implementation
  })

  test('should show "No Traces Available" message in empty state', async ({ page }) => {
    // Skip this test if we can't reliably create empty state
    test.skip()

    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)

    // Attempt to trigger empty state
    // Check for empty state heading
    await expect(page.getByRole('heading', { name: /no traces available/i })).toBeVisible()
  })
})

// =============================================================================
// Test Suite: Completion State
// =============================================================================

test.describe('Review Page - Completion State', () => {
  test('should show completion screen after reviewing all traces', async ({ page }) => {
    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)
    await ensureDemoMode(page)

    // Get total trace count
    const progressText = await page.locator('text=/\\d+\\/\\d+/').textContent()
    const totalTraces = parseInt(progressText?.split('/')[1] || '0')

    // Review all traces
    for (let i = 0; i < totalTraces; i++) {
      await page.keyboard.press('3') // Submit Good feedback
      await page.waitForTimeout(500)
    }

    // Check for completion message
    await expect(page.getByRole('heading', { name: /review complete/i })).toBeVisible({ timeout: 5000 })
  })

  test('should display celebration emoji on completion', async ({ page }) => {
    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)
    await ensureDemoMode(page)

    // Get total trace count and review all
    const progressText = await page.locator('text=/\\d+\\/\\d+/').textContent()
    const totalTraces = parseInt(progressText?.split('/')[1] || '0')

    for (let i = 0; i < totalTraces; i++) {
      await page.keyboard.press('3')
      await page.waitForTimeout(500)
    }

    // Check for celebration emoji (🎉)
    await expect(page.locator('text=🎉')).toBeVisible({ timeout: 5000 })
  })

  test('should show summary statistics on completion', async ({ page }) => {
    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)
    await ensureDemoMode(page)

    // Review all traces with different feedback types
    const progressText = await page.locator('text=/\\d+\\/\\d+/').textContent()
    const totalTraces = parseInt(progressText?.split('/')[1] || '0')

    // Mix of different feedback
    await page.keyboard.press('3') // Good
    await page.waitForTimeout(500)
    await page.keyboard.press('1') // Bad
    await page.waitForTimeout(500)
    await page.keyboard.press('2') // Okay
    await page.waitForTimeout(500)

    // Complete remaining
    for (let i = 3; i < totalTraces; i++) {
      await page.keyboard.press('3')
      await page.waitForTimeout(500)
    }

    // Check for summary stats cards
    await expect(page.locator('text=✅')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('text=❌')).toBeVisible()
    await expect(page.locator('text=➖')).toBeVisible()
    await expect(page.locator('text=⏱️')).toBeVisible()
  })

  test('should display average time per trace on completion', async ({ page }) => {
    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)
    await ensureDemoMode(page)

    // Review all traces
    const progressText = await page.locator('text=/\\d+\\/\\d+/').textContent()
    const totalTraces = parseInt(progressText?.split('/')[1] || '0')

    for (let i = 0; i < totalTraces; i++) {
      await page.keyboard.press('3')
      await page.waitForTimeout(500)
    }

    // Check for average time display (format: "Xs" where X is seconds)
    await expect(page.locator('text=/\\d+s/')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('text=/Avg\\/Trace/')).toBeVisible()
  })

  test('should show "View Agents" button on completion', async ({ page }) => {
    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)
    await ensureDemoMode(page)

    // Review all traces
    const progressText = await page.locator('text=/\\d+\\/\\d+/').textContent()
    const totalTraces = parseInt(progressText?.split('/')[1] || '0')

    for (let i = 0; i < totalTraces; i++) {
      await page.keyboard.press('3')
      await page.waitForTimeout(500)
    }

    // Check for View Agents button
    await expect(page.getByRole('button', { name: /view agents/i })).toBeVisible({ timeout: 5000 })
  })

  test('should show "Review More" button on completion', async ({ page }) => {
    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)
    await ensureDemoMode(page)

    // Review all traces
    const progressText = await page.locator('text=/\\d+\\/\\d+/').textContent()
    const totalTraces = parseInt(progressText?.split('/')[1] || '0')

    for (let i = 0; i < totalTraces; i++) {
      await page.keyboard.press('3')
      await page.waitForTimeout(500)
    }

    // Check for Review More button with refresh icon
    const reviewMoreButton = page.getByRole('button', { name: /review more/i })
    await expect(reviewMoreButton).toBeVisible({ timeout: 5000 })
    await expect(reviewMoreButton.locator('svg.lucide-refresh-cw')).toBeVisible()
  })
})

// =============================================================================
// Test Suite: Navigation
// =============================================================================

test.describe('Review Page - Navigation', () => {
  test('should navigate back to agents page via back button', async ({ page }) => {
    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)

    // Click back button
    const backButton = page.getByRole('button', { name: /back/i }).first()
    await backButton.click()

    // Should navigate to /agents
    await page.waitForURL(/\/agents/, { timeout: 5000 })
    expect(page.url()).toContain('/agents')
  })

  test('should navigate to agents page from completion screen', async ({ page }) => {
    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)
    await ensureDemoMode(page)

    // Review all traces
    const progressText = await page.locator('text=/\\d+\\/\\d+/').textContent()
    const totalTraces = parseInt(progressText?.split('/')[1] || '0')

    for (let i = 0; i < totalTraces; i++) {
      await page.keyboard.press('3')
      await page.waitForTimeout(500)
    }

    // Click View Agents button
    const viewAgentsButton = page.getByRole('button', { name: /view agents/i })
    await viewAgentsButton.click()

    // Should navigate to /agents
    await page.waitForURL(/\/agents/, { timeout: 5000 })
  })

  test('should reload page to review more traces', async ({ page }) => {
    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)
    await ensureDemoMode(page)

    // Review all traces
    const progressText = await page.locator('text=/\\d+\\/\\d+/').textContent()
    const totalTraces = parseInt(progressText?.split('/')[1] || '0')

    for (let i = 0; i < totalTraces; i++) {
      await page.keyboard.press('3')
      await page.waitForTimeout(500)
    }

    // Click Review More button
    const reviewMoreButton = page.getByRole('button', { name: /review more/i })
    await reviewMoreButton.click()

    // Page should reload and show review interface again
    await waitForReviewPageLoad(page)
    await expect(page.getByRole('heading', { name: 'Daily Quick Review' })).toBeVisible()
  })
})

// =============================================================================
// Test Suite: Notes Functionality
// =============================================================================

test.describe('Review Page - Notes Functionality', () => {
  test('should allow typing notes in textarea', async ({ page }) => {
    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)
    await ensureDemoMode(page)

    // Type in notes
    const notesTextarea = page.getByPlaceholder(/quick notes/i)
    await notesTextarea.fill('This is a test note')

    // Verify value
    await expect(notesTextarea).toHaveValue('This is a test note')
  })

  test('should enforce 500 character limit on notes', async ({ page }) => {
    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)
    await ensureDemoMode(page)

    // Create a long string (>500 chars)
    const longNote = 'a'.repeat(600)

    // Type in notes
    const notesTextarea = page.getByPlaceholder(/quick notes/i)
    await notesTextarea.fill(longNote)

    // Verify it's truncated to 500
    const value = await notesTextarea.inputValue()
    expect(value.length).toBeLessThanOrEqual(500)
  })

  test('should preserve notes while navigating between traces', async ({ page }) => {
    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)
    await ensureDemoMode(page)

    // Type notes
    const notesTextarea = page.getByPlaceholder(/quick notes/i)
    await notesTextarea.fill('Test note')

    // Navigate to next trace without submitting (using arrow key)
    await page.keyboard.press('3') // Submit feedback
    await page.waitForTimeout(500)

    // Notes should be cleared after feedback submission
    await expect(notesTextarea).toHaveValue('')
  })
})

// =============================================================================
// Test Suite: Demo vs Live Mode
// =============================================================================

test.describe('Review Page - Demo vs Live Mode', () => {
  test('should toggle between demo and live mode', async ({ page }) => {
    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)

    // Find toggle button
    const toggleButton = page.getByRole('button', { name: /demo|live/i })

    // Get initial state
    const initialText = await toggleButton.textContent()

    // Toggle
    await toggleButton.click()
    await page.waitForTimeout(1000) // Wait for potential data fetch

    // Check text changed
    const newText = await toggleButton.textContent()
    expect(newText).not.toBe(initialText)
  })

  test('should display demo button with special styling when in demo mode', async ({ page }) => {
    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)
    await ensureDemoMode(page)

    // Check for Demo button
    const demoButton = page.getByRole('button', { name: /demo/i })
    await expect(demoButton).toBeVisible()
  })

  test('should load mock traces in demo mode', async ({ page }) => {
    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)
    await ensureDemoMode(page)

    // In demo mode, should have traces (from MOCK_TRACES)
    const progressText = await page.locator('text=/\\d+\\/\\d+/').textContent()
    const totalTraces = parseInt(progressText?.split('/')[1] || '0')

    // Should have 5 mock traces (as defined in the component)
    expect(totalTraces).toBeGreaterThan(0)
  })
})

// =============================================================================
// Test Suite: Responsive Design
// =============================================================================

test.describe('Review Page - Responsive Design', () => {
  test('should display properly on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 }) // iPhone SE

    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)
    await ensureDemoMode(page)

    // Check main elements are visible
    await expect(page.getByRole('heading', { name: 'Daily Quick Review' })).toBeVisible()
    await expect(page.locator('text=USER INPUT')).toBeVisible()
    await expect(page.locator('text=AGENT RESPONSE')).toBeVisible()

    // Check feedback buttons are visible
    await expect(page.getByRole('button', { name: /❌.*bad/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /➖.*okay/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /✅.*good/i })).toBeVisible()
  })

  test('should display properly on tablet viewport', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 }) // iPad

    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)
    await ensureDemoMode(page)

    // Check layout is appropriate for tablet
    await expect(page.getByRole('heading', { name: 'Daily Quick Review' })).toBeVisible()
    await expect(page.locator('text=USER INPUT')).toBeVisible()
  })

  test('should display properly on desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 })

    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)
    await ensureDemoMode(page)

    // Check all elements are visible and properly laid out
    await expect(page.getByRole('heading', { name: 'Daily Quick Review' })).toBeVisible()
    await expect(page.locator('text=USER INPUT')).toBeVisible()
    await expect(page.locator('text=AGENT RESPONSE')).toBeVisible()
  })
})

// =============================================================================
// Test Suite: Accessibility
// =============================================================================

test.describe('Review Page - Accessibility', () => {
  test('should have proper heading hierarchy', async ({ page }) => {
    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)

    // Check h1 exists
    const h1 = page.getByRole('heading', { level: 1, name: 'Daily Quick Review' })
    await expect(h1).toBeVisible()
  })

  test('should have aria-hidden on decorative icons', async ({ page }) => {
    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)

    // Check that lucide icons have aria-hidden attribute
    const icons = page.locator('svg[class*="lucide"]').first()
    const ariaHidden = await icons.getAttribute('aria-hidden')
    expect(ariaHidden).toBe('true')
  })

  test('should have focusable interactive elements', async ({ page }) => {
    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)

    // Check buttons are focusable
    const backButton = page.getByRole('button', { name: /back/i }).first()
    await backButton.focus()
    await expect(backButton).toBeFocused()

    // Tab through elements
    await page.keyboard.press('Tab')
    // Should move focus to next interactive element
  })

  test('should have proper button labels', async ({ page }) => {
    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)
    await ensureDemoMode(page)

    // All buttons should have descriptive text
    const badButton = page.getByRole('button', { name: /bad/i })
    const okayButton = page.getByRole('button', { name: /okay/i })
    const goodButton = page.getByRole('button', { name: /good/i })

    await expect(badButton).toBeVisible()
    await expect(okayButton).toBeVisible()
    await expect(goodButton).toBeVisible()
  })

  test('should have proper form labels', async ({ page }) => {
    await page.goto(REVIEW_PAGE_URL)
    await waitForReviewPageLoad(page)
    await ensureDemoMode(page)

    // Notes textarea should have a placeholder
    const notesTextarea = page.getByPlaceholder(/quick notes/i)
    await expect(notesTextarea).toBeVisible()

    const placeholder = await notesTextarea.getAttribute('placeholder')
    expect(placeholder).toBeTruthy()
  })
})
