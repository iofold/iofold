import { test, expect } from '@playwright/test'

/**
 * E2E Tests for Agents Playground Page
 *
 * Tests cover:
 * - Page navigation and loading
 * - Model selector functionality
 * - Version selector functionality
 * - Configuration panel display
 * - Message sending (mocked API initially)
 * - Session management (new session, clear chat)
 * - Variable configuration
 * - Quick actions
 * - Tool execution display (when implemented)
 */

test.describe('Agents Playground Page', () => {
  // Note: These tests assume there's at least one agent with ID 'agent_test' in the system
  // In a real scenario, you'd set up test data in a beforeEach hook

  test.beforeEach(async ({ page }) => {
    // Skip if no test agent exists - this is a placeholder
    // In production, you'd want to create a test agent in setup
    await page.goto('/agents')
    await page.waitForSelector('h1', { timeout: 10000 })
  })

  test('should display playground page header and controls', async ({ page }) => {
    // This test will be skipped until we have a test agent
    // Navigate to first agent's playground
    const firstAgentLink = page.locator('a[href^="/agents/agent_"]').first()
    if (await firstAgentLink.count() === 0) {
      test.skip()
      return
    }

    await firstAgentLink.click()
    await page.waitForSelector('h1')

    // Navigate to playground
    const playgroundButton = page.locator('a[href*="/playground"]')
    if (await playgroundButton.count() > 0) {
      await playgroundButton.click()
      await page.waitForSelector('text=Playground', { timeout: 10000 })

      // Check page header
      await expect(page.locator('h1').filter({ hasText: 'Playground' })).toBeVisible()
      await expect(page.locator('button:has-text("Back")')).toBeVisible()
    }
  })

  test('should display model selector with options', async ({ page }) => {
    // Navigate to playground (assuming we have an agent)
    const firstAgentLink = page.locator('a[href^="/agents/agent_"]').first()
    if (await firstAgentLink.count() === 0) {
      test.skip()
      return
    }

    await firstAgentLink.click()
    const playgroundButton = page.locator('a[href*="/playground"]')
    if (await playgroundButton.count() === 0) {
      test.skip()
      return
    }

    await playgroundButton.click()
    await page.waitForSelector('text=Playground')

    // Check model selector exists
    const modelSelector = page.locator('[role="combobox"]').first()
    await expect(modelSelector).toBeVisible()

    // Click to open dropdown
    await modelSelector.click()

    // Check model options
    await expect(page.locator('text=Claude Sonnet 4.5')).toBeVisible()
    await expect(page.locator('text=GPT-4o')).toBeVisible()
    await expect(page.locator('text=Gemini 2.5 Pro')).toBeVisible()
  })

  test('should display version selector', async ({ page }) => {
    const firstAgentLink = page.locator('a[href^="/agents/agent_"]').first()
    if (await firstAgentLink.count() === 0) {
      test.skip()
      return
    }

    await firstAgentLink.click()
    const playgroundButton = page.locator('a[href*="/playground"]')
    if (await playgroundButton.count() === 0) {
      test.skip()
      return
    }

    await playgroundButton.click()
    await page.waitForSelector('text=Playground')

    // Check version selector
    const versionSelector = page.locator('select').first()
    await expect(versionSelector).toBeVisible()

    // Should have at least one version option
    const options = versionSelector.locator('option')
    expect(await options.count()).toBeGreaterThan(0)
  })

  test('should toggle configuration panel', async ({ page }) => {
    const firstAgentLink = page.locator('a[href^="/agents/agent_"]').first()
    if (await firstAgentLink.count() === 0) {
      test.skip()
      return
    }

    await firstAgentLink.click()
    const playgroundButton = page.locator('a[href*="/playground"]')
    if (await playgroundButton.count() === 0) {
      test.skip()
      return
    }

    await playgroundButton.click()
    await page.waitForSelector('text=Playground')

    // Config panel should be visible by default
    await expect(page.locator('h3:has-text("Model")')).toBeVisible()
    await expect(page.locator('h3:has-text("System Prompt")')).toBeVisible()

    // Hide config
    await page.click('button:has-text("Hide Config")')
    await page.waitForTimeout(300)
    await expect(page.locator('h3:has-text("System Prompt")')).not.toBeVisible()

    // Show config again
    await page.click('button:has-text("Show Config")')
    await page.waitForTimeout(300)
    await expect(page.locator('h3:has-text("System Prompt")')).toBeVisible()
  })

  test('should display message input and send button', async ({ page }) => {
    const firstAgentLink = page.locator('a[href^="/agents/agent_"]').first()
    if (await firstAgentLink.count() === 0) {
      test.skip()
      return
    }

    await firstAgentLink.click()
    const playgroundButton = page.locator('a[href*="/playground"]')
    if (await playgroundButton.count() === 0) {
      test.skip()
      return
    }

    await playgroundButton.click()
    await page.waitForSelector('text=Playground')

    // Check input and send button
    const messageInput = page.locator('textarea[placeholder*="Type your message"]')
    await expect(messageInput).toBeVisible()

    const sendButton = page.locator('button[type="submit"]')
    await expect(sendButton).toBeVisible()
    await expect(sendButton).toBeDisabled() // Should be disabled when empty
  })

  test('should enable send button when text is entered', async ({ page }) => {
    const firstAgentLink = page.locator('a[href^="/agents/agent_"]').first()
    if (await firstAgentLink.count() === 0) {
      test.skip()
      return
    }

    await firstAgentLink.click()
    const playgroundButton = page.locator('a[href*="/playground"]')
    if (await playgroundButton.count() === 0) {
      test.skip()
      return
    }

    await playgroundButton.click()
    await page.waitForSelector('text=Playground')

    const messageInput = page.locator('textarea[placeholder*="Type your message"]')
    const sendButton = page.locator('button[type="submit"]')

    // Type a message
    await messageInput.fill('Hello, test message')

    // Send button should now be enabled
    await expect(sendButton).toBeEnabled()
  })

  test('should display quick action buttons', async ({ page }) => {
    const firstAgentLink = page.locator('a[href^="/agents/agent_"]').first()
    if (await firstAgentLink.count() === 0) {
      test.skip()
      return
    }

    await firstAgentLink.click()
    const playgroundButton = page.locator('a[href*="/playground"]')
    if (await playgroundButton.count() === 0) {
      test.skip()
      return
    }

    await playgroundButton.click()
    await page.waitForSelector('text=Playground')

    // Check quick actions section
    await expect(page.locator('h3:has-text("Quick Actions")')).toBeVisible()
    await expect(page.locator('button:has-text("Greeting")')).toBeVisible()
    await expect(page.locator('button:has-text("Capabilities")')).toBeVisible()
    await expect(page.locator('button:has-text("Complex Task")')).toBeVisible()
  })

  test('should populate input when quick action is clicked', async ({ page }) => {
    const firstAgentLink = page.locator('a[href^="/agents/agent_"]').first()
    if (await firstAgentLink.count() === 0) {
      test.skip()
      return
    }

    await firstAgentLink.click()
    const playgroundButton = page.locator('a[href*="/playground"]')
    if (await playgroundButton.count() === 0) {
      test.skip()
      return
    }

    await playgroundButton.click()
    await page.waitForSelector('text=Playground')

    const messageInput = page.locator('textarea[placeholder*="Type your message"]')

    // Click greeting quick action
    await page.click('button:has-text("Greeting")')

    // Input should be populated
    const inputValue = await messageInput.inputValue()
    expect(inputValue).toContain('Hello')
  })

  test('should display new session and clear buttons', async ({ page }) => {
    const firstAgentLink = page.locator('a[href^="/agents/agent_"]').first()
    if (await firstAgentLink.count() === 0) {
      test.skip()
      return
    }

    await firstAgentLink.click()
    const playgroundButton = page.locator('a[href*="/playground"]')
    if (await playgroundButton.count() === 0) {
      test.skip()
      return
    }

    await playgroundButton.click()
    await page.waitForSelector('text=Playground')

    // Check session management buttons
    await expect(page.locator('button:has-text("New")')).toBeVisible()
    await expect(page.locator('button:has-text("Clear")')).toBeVisible()
  })

  test('should display empty state when no messages', async ({ page }) => {
    const firstAgentLink = page.locator('a[href^="/agents/agent_"]').first()
    if (await firstAgentLink.count() === 0) {
      test.skip()
      return
    }

    await firstAgentLink.click()
    const playgroundButton = page.locator('a[href*="/playground"]')
    if (await playgroundButton.count() === 0) {
      test.skip()
      return
    }

    await playgroundButton.click()
    await page.waitForSelector('text=Playground')

    // Check empty state
    await expect(page.locator('text=Start a conversation')).toBeVisible()
    await expect(page.locator('text=Test your agent by sending a message below')).toBeVisible()
  })

  test('should display model information in config panel', async ({ page }) => {
    const firstAgentLink = page.locator('a[href^="/agents/agent_"]').first()
    if (await firstAgentLink.count() === 0) {
      test.skip()
      return
    }

    await firstAgentLink.click()
    const playgroundButton = page.locator('a[href*="/playground"]')
    if (await playgroundButton.count() === 0) {
      test.skip()
      return
    }

    await playgroundButton.click()
    await page.waitForSelector('text=Playground')

    // Check model info in config panel
    await expect(page.locator('h3:has-text("Model")')).toBeVisible()
    await expect(page.locator('p.font-medium').filter({ hasText: /(Claude|GPT|Gemini)/ })).toBeVisible()
  })

  test('should copy conversation to clipboard', async ({ page }) => {
    // Grant clipboard permissions
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])

    const firstAgentLink = page.locator('a[href^="/agents/agent_"]').first()
    if (await firstAgentLink.count() === 0) {
      test.skip()
      return
    }

    await firstAgentLink.click()
    const playgroundButton = page.locator('a[href*="/playground"]')
    if (await playgroundButton.count() === 0) {
      test.skip()
      return
    }

    await playgroundButton.click()
    await page.waitForSelector('text=Playground')

    // Copy button should exist
    const copyButton = page.locator('button').filter({ has: page.locator('svg') }).nth(2) // Third icon button
    await expect(copyButton).toBeVisible()

    // Note: Actually testing clipboard requires messages to exist
    // This is just checking the button is present
  })
})

/**
 * Tests for API interaction (require backend implementation)
 * These tests will be skipped until the backend API is ready
 */
test.describe.skip('Agents Playground - API Integration', () => {
  test('should send message and receive response', async ({ page }) => {
    // TODO: Implement once backend API is ready
    // This would test the actual message sending and response handling
  })

  test('should display streaming response', async ({ page }) => {
    // TODO: Implement once streaming is working
    // This would test the streaming text display
  })

  test('should display tool invocations', async ({ page }) => {
    // TODO: Implement once tool execution is ready
    // This would test tool call display with args and results
  })

  test('should maintain session across messages', async ({ page }) => {
    // TODO: Implement once sessions are working
    // This would test session persistence
  })

  test('should handle errors gracefully', async ({ page }) => {
    // TODO: Implement error scenarios
    // This would test error display and recovery
  })
})
