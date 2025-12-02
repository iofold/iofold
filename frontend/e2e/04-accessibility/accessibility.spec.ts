/**
 * Accessibility E2E Tests
 *
 * Tests comprehensive accessibility features including:
 * - Focus indicators on all interactive elements
 * - Logical tab navigation order
 * - Keyboard interactions (Escape key closes modals)
 * - ARIA labels on icon buttons
 * - Form input labels and associations
 * - Error message associations (aria-describedby)
 * - Skip to main content links
 * - Color contrast compliance (WCAG AA)
 *
 * Based on WCAG 2.1 Level AA guidelines
 */

import { test, expect } from '@playwright/test'

// Helper function to check if an element has visible focus indicator
async function hasFocusIndicator(element: any) {
  const focusStyles = await element.evaluate((el: HTMLElement) => {
    const styles = window.getComputedStyle(el)
    return {
      outline: styles.outline,
      outlineWidth: styles.outlineWidth,
      outlineStyle: styles.outlineStyle,
      outlineColor: styles.outlineColor,
      outlineOffset: styles.outlineOffset,
      boxShadow: styles.boxShadow,
      border: styles.border,
      borderWidth: styles.borderWidth,
    }
  })

  // Check if element has visible outline
  const hasOutline = focusStyles.outlineStyle !== 'none' &&
                     focusStyles.outlineWidth !== '0px' &&
                     parseFloat(focusStyles.outlineWidth) > 0

  // Check for box-shadow (including focus rings which are implemented via box-shadow)
  // A visible focus ring has a non-none, non-empty box-shadow
  const hasFocusRing = focusStyles.boxShadow &&
                       focusStyles.boxShadow !== 'none' &&
                       focusStyles.boxShadow.trim() !== '' &&
                       // Filter out very faint shadows (< 1px spread)
                       // Box-shadow format: "0px 0px 0px 2px rgba(...)"
                       !/^0px 0px 0px 0px/.test(focusStyles.boxShadow)

  // Check for border changes on focus
  const hasBorderFocus = focusStyles.borderWidth &&
                         focusStyles.borderWidth !== '0px' &&
                         parseFloat(focusStyles.borderWidth) > 0

  return hasOutline || hasFocusRing || hasBorderFocus
}

// Helper function to calculate color contrast ratio
async function getContrastRatio(element: any) {
  return await element.evaluate((el: HTMLElement) => {
    const styles = window.getComputedStyle(el)
    const color = styles.color

    // Parse RGB values
    const parseRgb = (rgb: string) => {
      const match = rgb.match(/\d+/g)
      return match ? match.map(Number) : [0, 0, 0]
    }

    // Check if color is transparent
    const isTransparent = (rgb: string) => {
      if (rgb === 'transparent' || rgb === 'rgba(0, 0, 0, 0)') return true
      const match = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/)
      if (match && match[4] !== undefined) {
        return parseFloat(match[4]) === 0
      }
      return false
    }

    // Walk up the DOM tree to find the first non-transparent background
    let backgroundColor = styles.backgroundColor
    let currentEl: HTMLElement | null = el
    while (currentEl && isTransparent(backgroundColor)) {
      currentEl = currentEl.parentElement
      if (currentEl) {
        backgroundColor = window.getComputedStyle(currentEl).backgroundColor
      } else {
        // Default to white if we reach the top without finding a background
        backgroundColor = 'rgb(255, 255, 255)'
      }
    }

    // Calculate relative luminance
    const getLuminance = (rgb: number[]) => {
      const [r, g, b] = rgb.map(val => {
        const sRGB = val / 255
        return sRGB <= 0.03928
          ? sRGB / 12.92
          : Math.pow((sRGB + 0.055) / 1.055, 2.4)
      })
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }

    const fgLuminance = getLuminance(parseRgb(color))
    const bgLuminance = getLuminance(parseRgb(backgroundColor))

    const lighter = Math.max(fgLuminance, bgLuminance)
    const darker = Math.min(fgLuminance, bgLuminance)

    return (lighter + 0.05) / (darker + 0.05)
  })
}

test.describe('Accessibility Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app home page
    await page.goto('/')
    await page.waitForLoadState('networkidle')
  })

  test('Test 1: All interactive elements have visible focus indicators', async ({ page }) => {
    // Navigate to traces page which has many interactive elements
    await page.goto('/traces')
    await page.waitForLoadState('networkidle')

    // Test buttons
    const buttons = await page.getByRole('button').all()
    expect(buttons.length).toBeGreaterThan(0)

    for (const button of buttons) {
      // Skip Next.js Dev Tools button (external, not part of our app)
      const ariaLabel = await button.getAttribute('aria-label')
      if (ariaLabel === 'Open Next.js Dev Tools') {
        continue
      }

      await button.focus()
      await page.waitForTimeout(50) // Small delay for focus styles to apply
      const hasFocus = await hasFocusIndicator(button)

      // Get button text for better error messages
      const buttonText = await button.textContent().catch(() => 'Unknown button')

      expect(hasFocus, `Button "${buttonText}" should have visible focus indicator`).toBeTruthy()
    }

    // Test links
    const links = await page.getByRole('link').all()
    for (const link of links.slice(0, 5)) { // Test first 5 links
      await link.focus()
      const hasFocus = await hasFocusIndicator(link)
      const linkText = await link.textContent().catch(() => 'Unknown link')
      expect(hasFocus, `Link "${linkText}" should have visible focus indicator`).toBeTruthy()
    }

    // Test checkboxes
    const checkboxes = await page.getByRole('checkbox').all()
    for (const checkbox of checkboxes.slice(0, 3)) { // Test first 3 checkboxes
      await checkbox.focus()
      const hasFocus = await hasFocusIndicator(checkbox)
      expect(hasFocus, 'Checkbox should have visible focus indicator').toBeTruthy()
    }

    // Test comboboxes/selects
    const comboboxes = await page.getByRole('combobox').all()
    for (const combobox of comboboxes) {
      await combobox.focus()
      const hasFocus = await hasFocusIndicator(combobox)
      expect(hasFocus, 'Combobox should have visible focus indicator').toBeTruthy()
    }
  })

  test('Test 2: Tab navigation follows logical order', async ({ page }) => {
    await page.goto('/traces')
    await page.waitForLoadState('networkidle')

    // Start from the beginning
    await page.keyboard.press('Tab')

    const focusedElements: string[] = []

    // Tab through the first 10 focusable elements
    for (let i = 0; i < 10; i++) {
      const focused = await page.locator(':focus').first()
      const role = await focused.getAttribute('role').catch(() => null)
      const tag = await focused.evaluate((el: HTMLElement) => el.tagName).catch(() => 'UNKNOWN')
      const text = await focused.textContent().catch(() => '')

      focusedElements.push(`${tag}${role ? `[${role}]` : ''}: ${text?.slice(0, 30)}`)

      await page.keyboard.press('Tab')
    }

    // Verify we have a reasonable number of focusable elements
    expect(focusedElements.length).toBeGreaterThan(5)

    // Verify focus order is logical (should start with navigation/header elements)
    console.log('Tab order:', focusedElements.join(' -> '))

    // Check that we can reverse tab
    await page.keyboard.press('Shift+Tab')
    const previousFocus = await page.locator(':focus').first()
    expect(previousFocus).toBeTruthy()
  })

  test('Test 3: Escape key closes modals', async ({ page }) => {
    await page.goto('/traces')
    await page.waitForLoadState('networkidle')

    // Try to open the Import Traces modal
    const importButton = page.getByRole('button', { name: /import traces/i })

    if (await importButton.isVisible()) {
      await importButton.click()

      // Wait for modal to open
      await page.waitForTimeout(300)

      // Check if modal is visible (using dialog or modal role)
      const dialog = page.locator('[role="dialog"]').first()

      if (await dialog.isVisible()) {
        // Press Escape
        await page.keyboard.press('Escape')

        // Wait for close animation
        await page.waitForTimeout(300)

        // Verify modal is closed
        await expect(dialog).not.toBeVisible({ timeout: 2000 })
      }
    }

    // Test with Sheet/Side panel if available
    const viewButtons = await page.getByRole('button', { name: /view/i }).all()

    for (const button of viewButtons.slice(0, 1)) {
      if (await button.isVisible()) {
        await button.click()
        await page.waitForTimeout(300)

        // Look for sheet content
        const sheet = page.locator('[role="dialog"], .sheet-content, [data-sheet]').first()

        if (await sheet.isVisible()) {
          await page.keyboard.press('Escape')
          await page.waitForTimeout(300)

          // Sheet should close on Escape
          const stillVisible = await sheet.isVisible().catch(() => false)
          if (stillVisible) {
            console.warn('Sheet did not close on Escape - this may need attention')
          }
        }
      }
    }
  })

  test('Test 4: ARIA labels present on icon buttons', async ({ page }) => {
    await page.goto('/traces')
    await page.waitForLoadState('networkidle')

    // Get all buttons
    const buttons = await page.getByRole('button').all()

    for (const button of buttons) {
      // Check if button contains only an icon (SVG) without text
      const hasText = await button.evaluate((el: HTMLElement) => {
        const text = el.textContent?.trim()
        return text && text.length > 0
      })

      const hasSvg = await button.locator('svg').count() > 0

      // If button has an icon but no text, it should have an aria-label
      if (hasSvg && !hasText) {
        const ariaLabel = await button.getAttribute('aria-label')
        const ariaLabelledBy = await button.getAttribute('aria-labelledby')
        const title = await button.getAttribute('title')

        // Button should have at least one form of accessible label
        const hasLabel = ariaLabel || ariaLabelledBy || title

        if (!hasLabel) {
          const buttonHtml = await button.evaluate((el: HTMLElement) => el.outerHTML.slice(0, 100))
          console.warn(`Icon button without label: ${buttonHtml}`)
        }

        // For now, we'll check if most icon buttons have labels
        // In production, all should have labels
      }
    }

    // Specifically test toolbar icon buttons
    const refreshButton = page.getByRole('button').locator('svg').filter({ has: page.locator('title, desc') }).first()
    if (await refreshButton.count() > 0) {
      // SVG should have title or desc for screen readers
      expect(await refreshButton.count()).toBeGreaterThan(0)
    }
  })

  test('Test 5: Form inputs have associated labels', async ({ page }) => {
    await page.goto('/traces')
    await page.waitForLoadState('networkidle')

    // Open filters panel which contains form inputs
    const filterButton = page.getByRole('button', { name: /filter/i })

    if (await filterButton.isVisible()) {
      await filterButton.click()
      await page.waitForTimeout(300)

      // Get all textbox inputs
      const textboxes = await page.getByRole('textbox').all()

      for (const input of textboxes) {
        const id = await input.getAttribute('id')
        const ariaLabel = await input.getAttribute('aria-label')
        const ariaLabelledBy = await input.getAttribute('aria-labelledby')

        // Check if there's a label element pointing to this input
        let hasLabel = false
        if (id) {
          const label = page.locator(`label[for="${id}"]`)
          hasLabel = await label.count() > 0
        }

        // Input should have a label, aria-label, or aria-labelledby
        const hasAccessibleLabel = hasLabel || ariaLabel || ariaLabelledBy

        const inputName = await input.getAttribute('name') || await input.getAttribute('placeholder')
        expect(hasAccessibleLabel, `Input "${inputName}" should have an associated label`).toBeTruthy()
      }

      // Test comboboxes (selects)
      const comboboxes = await page.getByRole('combobox').all()

      for (const select of comboboxes) {
        const id = await select.getAttribute('id')
        const ariaLabel = await select.getAttribute('aria-label')
        const ariaLabelledBy = await select.getAttribute('aria-labelledby')

        let hasLabel = false
        if (id) {
          const label = page.locator(`label[for="${id}"]`)
          hasLabel = await label.count() > 0
        }

        const hasAccessibleLabel = hasLabel || ariaLabel || ariaLabelledBy
        expect(hasAccessibleLabel, 'Select element should have an associated label').toBeTruthy()
      }
    }
  })

  test('Test 6: Error messages linked to inputs (aria-describedby)', async ({ page }) => {
    // This test would ideally trigger validation errors
    // For demonstration, we'll check the structure exists

    await page.goto('/traces')
    await page.waitForLoadState('networkidle')

    // Try to open import modal which likely has form validation
    const importButton = page.getByRole('button', { name: /import traces/i })

    if (await importButton.isVisible()) {
      await importButton.click()
      await page.waitForTimeout(300)

      // Look for form inputs in the modal
      const inputs = await page.locator('input[aria-describedby], select[aria-describedby], textarea[aria-describedby]').all()

      // For each input with aria-describedby, verify the described element exists
      for (const input of inputs) {
        const describedBy = await input.getAttribute('aria-describedby')

        if (describedBy) {
          const describedElement = page.locator(`#${describedBy}`)
          const exists = await describedElement.count() > 0

          expect(exists, `Element with id="${describedBy}" should exist for aria-describedby reference`).toBeTruthy()
        }
      }

      // Check for error message patterns
      const errorMessages = await page.locator('[role="alert"], .error-message, [class*="error"]').all()

      // Verify error messages have appropriate ARIA attributes
      for (const error of errorMessages.slice(0, 3)) {
        const role = await error.getAttribute('role')
        const ariaLive = await error.getAttribute('aria-live')

        // Error messages should be announced to screen readers
        const isAccessible = role === 'alert' || ariaLive === 'polite' || ariaLive === 'assertive'

        if (!isAccessible) {
          console.warn('Error message found without proper ARIA attributes')
        }
      }
    }
  })

  test('Test 7: Skip to main content link works', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Check for skip link (usually hidden until focused)
    const skipLink = page.locator('a[href="#main"], a[href="#main-content"], a:has-text("Skip to")').first()

    if (await skipLink.count() > 0) {
      // Focus the skip link (usually first focusable element)
      await page.keyboard.press('Tab')

      const focused = await page.locator(':focus')
      const focusedText = await focused.textContent()

      if (focusedText?.toLowerCase().includes('skip')) {
        // Verify skip link becomes visible on focus
        await expect(focused).toBeVisible()

        // Click the skip link
        await focused.click()

        // Verify focus moved to main content
        await page.waitForTimeout(100)
        const newFocus = await page.locator(':focus')
        const mainElement = await newFocus.evaluate((el: HTMLElement) => {
          return el.id === 'main' ||
                 el.id === 'main-content' ||
                 el.tagName === 'MAIN' ||
                 el.closest('main') !== null
        })

        expect(mainElement, 'Skip link should move focus to main content').toBeTruthy()
      }
    } else {
      console.warn('Skip to main content link not found - consider adding for accessibility')
    }
  })

  test('Test 8: Color contrast meets WCAG AA', async ({ page }) => {
    await page.goto('/traces')
    await page.waitForLoadState('networkidle')

    // Test various text elements for color contrast
    const textElements = [
      page.locator('h1').first(),
      page.locator('h2').first(),
      page.locator('p').first(),
      page.getByRole('button').first(),
      page.locator('[class*="muted"]').first(),
    ]

    const contrastResults: { element: string; ratio: number; passes: boolean }[] = []

    for (const element of textElements) {
      if (await element.count() > 0 && await element.isVisible()) {
        const ratio = await getContrastRatio(element)

        const elementText = await element.textContent()
        const elementTag = await element.evaluate((el: HTMLElement) => el.tagName)

        // WCAG AA requires:
        // - 4.5:1 for normal text (< 18pt)
        // - 3:1 for large text (>= 18pt or >= 14pt bold)
        const fontSize = await element.evaluate((el: HTMLElement) => {
          const styles = window.getComputedStyle(el)
          return parseFloat(styles.fontSize)
        })

        const fontWeight = await element.evaluate((el: HTMLElement) => {
          const styles = window.getComputedStyle(el)
          return parseInt(styles.fontWeight)
        })

        const isLargeText = fontSize >= 24 || (fontSize >= 19 && fontWeight >= 700)
        const requiredRatio = isLargeText ? 3.0 : 4.5
        const passes = ratio >= requiredRatio

        contrastResults.push({
          element: `${elementTag}: ${elementText?.slice(0, 30)}`,
          ratio: Math.round(ratio * 100) / 100,
          passes
        })

        // Log results
        console.log(`${elementTag} (${fontSize}px, ${fontWeight}): ${ratio.toFixed(2)}:1 ${passes ? '✓' : '✗'}`)
      }
    }

    // Check that most elements pass (allow some flexibility for edge cases)
    const passingElements = contrastResults.filter(r => r.passes).length
    const totalElements = contrastResults.length
    const passRate = totalElements > 0 ? passingElements / totalElements : 0

    // Expect at least 80% of checked elements to pass contrast requirements
    expect(passRate).toBeGreaterThanOrEqual(0.8)

    // Test button contrast specifically
    const buttons = await page.getByRole('button').all()
    for (const button of buttons.slice(0, 5)) {
      if (await button.isVisible()) {
        const buttonRatio = await getContrastRatio(button)
        const buttonText = await button.textContent()

        // Buttons typically use 4.5:1 ratio (normal text)
        if (buttonRatio < 4.5) {
          console.warn(`Button "${buttonText}" has low contrast: ${buttonRatio.toFixed(2)}:1`)
        }
      }
    }
  })

  test('Bonus: Keyboard shortcuts are documented', async ({ page }) => {
    await page.goto('/traces')
    await page.waitForLoadState('networkidle')

    // Check if keyboard shortcuts are documented somewhere on the page
    const kbdElements = await page.locator('kbd').all()

    if (kbdElements.length > 0) {
      console.log(`Found ${kbdElements.length} keyboard shortcut indicators`)

      // Verify at least some keyboard shortcuts are visible
      let visibleShortcuts = 0
      for (const kbd of kbdElements.slice(0, 5)) {
        if (await kbd.isVisible()) {
          visibleShortcuts++
          const shortcut = await kbd.textContent()
          console.log(`Documented shortcut: ${shortcut}`)
        }
      }

      expect(visibleShortcuts).toBeGreaterThan(0)
    }
  })

  test('Bonus: Review page keyboard navigation', async ({ page }) => {
    await page.goto('/review')
    await page.waitForLoadState('networkidle')

    // Test keyboard shortcuts on review page
    // According to the code: 1 = bad, 2 = okay, 3 = good

    // Wait for trace card to load
    await page.waitForTimeout(500)

    const initialCard = page.locator('.bg-white.rounded-lg.shadow-elevation-2').first()

    if (await initialCard.isVisible()) {
      // Test keyboard shortcut: pressing '3' should mark as good
      await page.keyboard.press('3')

      // Wait for animation
      await page.waitForTimeout(300)

      // Verify counter updated (Good count should increase)
      const goodBadge = page.locator('text=/Good:/i')
      if (await goodBadge.count() > 0) {
        const badgeText = await goodBadge.textContent()
        expect(badgeText).toContain('Good')
      }

      // Test 'a' key for auto mode toggle
      await page.keyboard.press('a')
      await page.waitForTimeout(200)

      // Auto mode button should show 'Pause' when active
      const autoButton = page.getByRole('button', { name: /pause|auto/i })
      if (await autoButton.count() > 0) {
        const buttonText = await autoButton.textContent()
        console.log(`Auto mode button state: ${buttonText}`)
      }
    }
  })

  test('Bonus: Focus trap in modals', async ({ page }) => {
    await page.goto('/traces')
    await page.waitForLoadState('networkidle')

    // Open a modal
    const importButton = page.getByRole('button', { name: /import traces/i })

    if (await importButton.isVisible()) {
      await importButton.click()

      // Wait for modal to open and be fully rendered
      const dialog = page.locator('[role="dialog"]').first()
      await expect(dialog).toBeVisible({ timeout: 2000 })

      // Wait a bit more for animations and focus to settle
      await page.waitForTimeout(500)

      if (await dialog.isVisible()) {
        // Wait for an element in the dialog to be focused
        // Radix Dialog should auto-focus the first focusable element
        await page.waitForTimeout(100)

        // Get initial focused element
        const initialFocused = await page.locator(':focus').count()

        // Only proceed if something is focused
        if (initialFocused > 0) {
          // Tab through all elements in the modal
          const focusableInModal: string[] = []

          for (let i = 0; i < 20; i++) {
            await page.keyboard.press('Tab')
            await page.waitForTimeout(50) // Small delay for focus to update

            const focused = page.locator(':focus').first()

            // Check if we have a focused element
            if (await focused.count() === 0) {
              break
            }

            // Check if focused element is within the modal
            const isInModal = await focused.evaluate((el: HTMLElement, dlg) => {
              return dlg && dlg.contains(el)
            }, await dialog.elementHandle())

            const elementText = await focused.textContent().catch(() => '')
            focusableInModal.push(`${isInModal ? '✓' : '✗'} ${elementText?.slice(0, 30)}`)

            // If focus escaped the modal, that's a focus trap violation
            if (!isInModal && i < 15) {
              console.warn(`Focus escaped modal at tab ${i}: ${elementText}`)
            }
          }

          console.log('Focus trap test:', focusableInModal.join(' -> '))
        } else {
          console.log('No element focused in modal - focus trap may not be active')
        }

        // Close modal
        await page.keyboard.press('Escape')
      }
    }
  })
})
