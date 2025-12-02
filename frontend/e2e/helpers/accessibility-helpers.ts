/**
 * Accessibility Test Helper Functions
 *
 * Reusable utilities for testing accessibility compliance
 */

import { Locator } from '@playwright/test'

/**
 * Check if an element has a visible focus indicator
 * Verifies outline or focus ring styles are applied
 */
export async function hasFocusIndicator(element: Locator): Promise<boolean> {
  return await element.evaluate((el: HTMLElement) => {
    const styles = window.getComputedStyle(el)
    const outline = {
      outline: styles.outline,
      outlineWidth: styles.outlineWidth,
      outlineStyle: styles.outlineStyle,
      outlineColor: styles.outlineColor,
      boxShadow: styles.boxShadow,
    }

    // Check if element has visible outline
    const hasOutline =
      outline.outlineStyle !== 'none' &&
      outline.outlineWidth !== '0px' &&
      parseInt(outline.outlineWidth) > 0

    // Check for focus ring via box-shadow
    const hasFocusRing = Boolean(
      outline.boxShadow &&
      outline.boxShadow !== 'none' &&
      (outline.boxShadow.includes('ring') || outline.boxShadow.includes('0px 0px'))
    )

    return hasOutline || hasFocusRing
  })
}

/**
 * Calculate color contrast ratio between foreground and background
 * Returns ratio according to WCAG formula
 */
export async function getContrastRatio(element: Locator): Promise<number> {
  return await element.evaluate((el: HTMLElement) => {
    const styles = window.getComputedStyle(el)
    const color = styles.color
    const backgroundColor = styles.backgroundColor

    // Parse RGB values from string
    const parseRgb = (rgb: string): number[] => {
      const match = rgb.match(/\d+/g)
      return match ? match.map(Number) : [0, 0, 0]
    }

    // Calculate relative luminance per WCAG formula
    const getLuminance = (rgb: number[]): number => {
      const [r, g, b] = rgb.map((val) => {
        const sRGB = val / 255
        return sRGB <= 0.03928 ? sRGB / 12.92 : Math.pow((sRGB + 0.055) / 1.055, 2.4)
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

/**
 * Check if text meets WCAG AA contrast requirements
 */
export async function meetsContrastRequirements(
  element: Locator,
  level: 'AA' | 'AAA' = 'AA'
): Promise<{ passes: boolean; ratio: number; required: number }> {
  const ratio = await getContrastRatio(element)

  // Get font size and weight to determine if large text
  const textInfo = await element.evaluate((el: HTMLElement) => {
    const styles = window.getComputedStyle(el)
    return {
      fontSize: parseFloat(styles.fontSize),
      fontWeight: parseInt(styles.fontWeight),
    }
  })

  // Large text: >= 24px or >= 19px and bold (700+)
  const isLargeText = textInfo.fontSize >= 24 || (textInfo.fontSize >= 19 && textInfo.fontWeight >= 700)

  // WCAG requirements
  let requiredRatio: number
  if (level === 'AAA') {
    requiredRatio = isLargeText ? 4.5 : 7.0
  } else {
    requiredRatio = isLargeText ? 3.0 : 4.5
  }

  return {
    passes: ratio >= requiredRatio,
    ratio: Math.round(ratio * 100) / 100,
    required: requiredRatio,
  }
}

/**
 * Check if element has accessible label
 * Checks aria-label, aria-labelledby, or associated label element
 */
export async function hasAccessibleLabel(element: Locator): Promise<boolean> {
  return await element.evaluate((el: HTMLElement) => {
    // Check for ARIA label
    const ariaLabel = el.getAttribute('aria-label')
    const ariaLabelledBy = el.getAttribute('aria-labelledby')

    if (ariaLabel || ariaLabelledBy) return true

    // Check for associated label element
    const id = el.getAttribute('id')
    if (id) {
      const label = document.querySelector(`label[for="${id}"]`)
      if (label) return true
    }

    // Check if element is wrapped in a label
    if (el.closest('label')) return true

    // Check for title attribute (less preferred but acceptable)
    if (el.getAttribute('title')) return true

    return false
  })
}

/**
 * Check if element is keyboard accessible
 * Verifies element is focusable and has proper tabindex
 */
export async function isKeyboardAccessible(element: Locator): Promise<boolean> {
  return await element.evaluate((el: HTMLElement) => {
    // Check if element is focusable
    const tabindex = el.getAttribute('tabindex')

    // Interactive elements should be keyboard accessible
    const interactiveTags = ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA']
    const isInteractive = interactiveTags.includes(el.tagName)

    // Has role that implies interactivity
    const role = el.getAttribute('role')
    const interactiveRoles = ['button', 'link', 'checkbox', 'radio', 'textbox', 'combobox', 'tab']
    const hasInteractiveRole = Boolean(role && interactiveRoles.includes(role))

    // Should not have negative tabindex (unless explicitly made unfocusable)
    const hasNegativeTabindex = tabindex === '-1'

    return Boolean((isInteractive || hasInteractiveRole) && !hasNegativeTabindex)
  })
}

/**
 * Get all focusable elements in order
 * Returns array of focusable elements in tab order
 */
export async function getFocusableElements(container: Locator): Promise<Locator[]> {
  const selector = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable="true"]',
  ].join(',')

  return await container.locator(selector).all()
}

/**
 * Test keyboard navigation through elements
 * Returns array of focused element descriptions
 */
export async function testTabOrder(
  page: any,
  count: number = 10
): Promise<Array<{ tag: string; role: string | null; text: string }>> {
  const focusedElements: Array<{ tag: string; role: string | null; text: string }> = []

  for (let i = 0; i < count; i++) {
    await page.keyboard.press('Tab')

    const focused = await page.locator(':focus').first()
    const tag = await focused.evaluate((el: HTMLElement) => el.tagName).catch(() => 'UNKNOWN')
    const role = await focused.getAttribute('role').catch(() => null)
    const text = (await focused.textContent().catch(() => '')) || ''

    focusedElements.push({
      tag,
      role,
      text: text.slice(0, 30),
    })
  }

  return focusedElements
}

/**
 * Check if element is within a modal/dialog
 */
export async function isInModal(element: Locator): Promise<boolean> {
  return await element.evaluate((el: HTMLElement) => {
    return (
      el.closest('[role="dialog"]') !== null ||
      el.closest('[role="alertdialog"]') !== null ||
      el.closest('[aria-modal="true"]') !== null
    )
  })
}

/**
 * Verify modal has proper focus trap
 * Tests that tab cycling stays within modal
 */
export async function testFocusTrap(page: any, modal: Locator, cycles: number = 2): Promise<boolean> {
  const modalHandle = await modal.elementHandle()

  for (let i = 0; i < cycles * 10; i++) {
    await page.keyboard.press('Tab')

    const focused = await page.locator(':focus')
    const isInModal = await focused.evaluate(
      (el: HTMLElement, container: Element | null) => {
        return Boolean(container && container.contains(el))
      },
      modalHandle
    )

    if (!isInModal) {
      return false // Focus escaped the modal
    }
  }

  return true
}

/**
 * Check for ARIA errors and warnings
 * Returns list of common ARIA issues
 */
export async function checkAriaIssues(page: any): Promise<string[]> {
  return await page.evaluate(() => {
    const issues: string[] = []

    // Check for duplicate IDs (breaks aria-labelledby and aria-describedby)
    const ids = new Map<string, number>()
    document.querySelectorAll('[id]').forEach((el) => {
      const id = el.getAttribute('id')
      if (id) {
        ids.set(id, (ids.get(id) || 0) + 1)
      }
    })

    ids.forEach((count, id) => {
      if (count > 1) {
        issues.push(`Duplicate ID: "${id}" (${count} occurrences)`)
      }
    })

    // Check for aria-labelledby/describedby pointing to non-existent IDs
    document.querySelectorAll('[aria-labelledby], [aria-describedby]').forEach((el) => {
      const labelledBy = el.getAttribute('aria-labelledby')
      const describedBy = el.getAttribute('aria-describedby')

      ;[labelledBy, describedBy].forEach((attr) => {
        if (attr) {
          const targetIds = attr.split(' ')
          targetIds.forEach((id) => {
            if (!document.getElementById(id)) {
              issues.push(`Missing target for ARIA reference: "${id}"`)
            }
          })
        }
      })
    })

    // Check for buttons without accessible names
    document.querySelectorAll('button').forEach((btn) => {
      const hasText = btn.textContent?.trim().length > 0
      const hasAriaLabel = btn.hasAttribute('aria-label')
      const hasAriaLabelledBy = btn.hasAttribute('aria-labelledby')
      const hasTitle = btn.hasAttribute('title')

      if (!hasText && !hasAriaLabel && !hasAriaLabelledBy && !hasTitle) {
        issues.push(`Button without accessible name: ${btn.outerHTML.slice(0, 50)}`)
      }
    })

    return issues
  })
}

/**
 * Common ARIA roles and their expected HTML elements
 */
export const ARIA_ROLE_MAPPINGS = {
  button: ['button', 'input[type="button"]', 'input[type="submit"]'],
  link: ['a[href]'],
  checkbox: ['input[type="checkbox"]'],
  radio: ['input[type="radio"]'],
  textbox: ['input[type="text"]', 'textarea'],
  combobox: ['select', 'input[list]'],
  tab: [],
  tabpanel: [],
  dialog: [],
  alertdialog: [],
  navigation: ['nav'],
  main: ['main'],
  region: ['section'],
}

/**
 * WCAG 2.1 Level AA contrast requirements
 */
export const CONTRAST_REQUIREMENTS = {
  AA: {
    normalText: 4.5,
    largeText: 3.0,
    uiComponents: 3.0,
  },
  AAA: {
    normalText: 7.0,
    largeText: 4.5,
    uiComponents: 3.0,
  },
}
