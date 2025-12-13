import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

test.describe('Skip Link Accessibility', () => {
  test('skip link should work correctly', async ({ page }) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const screenshotDir = join(process.cwd(), '.tmp', 'skip-link-screenshots');

    // Ensure directory exists
    try {
      mkdirSync(screenshotDir, { recursive: true });
    } catch (e) {
      // Directory already exists
    }

    console.log('\n=== SKIP LINK ACCESSIBILITY TEST ===\n');

    // Navigate to the page
    console.log('Step 1: Navigating to http://localhost:3000...');
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Take initial screenshot
    const screenshot1Path = join(screenshotDir, `01-initial-page-${timestamp}.png`);
    await page.screenshot({
      path: screenshot1Path,
      fullPage: true
    });
    console.log(`✓ Screenshot 1 saved: ${screenshot1Path}`);

    // Press Tab to focus the skip link
    console.log('\nStep 2: Pressing Tab to focus skip link...');
    await page.keyboard.press('Tab');
    await page.waitForTimeout(500); // Wait for focus styles to apply

    // Take screenshot of focused skip link
    const screenshot2Path = join(screenshotDir, `02-skip-link-focused-${timestamp}.png`);
    await page.screenshot({
      path: screenshot2Path,
      fullPage: true
    });
    console.log(`✓ Screenshot 2 saved: ${screenshot2Path}`);

    // Check if skip link is visible and has correct text
    const skipLink = page.locator('a[href="#main-content"]').first();
    const isVisible = await skipLink.isVisible();
    const text = await skipLink.textContent();

    console.log(`\n✓ Skip link visible: ${isVisible}`);
    console.log(`✓ Skip link text: "${text}"`);

    // Get the bounding box to verify it's actually visible on screen
    const boundingBox = await skipLink.boundingBox();
    console.log(`✓ Skip link position:`, boundingBox);

    // Check computed styles
    const styles = await skipLink.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return {
        position: computed.position,
        top: computed.top,
        left: computed.left,
        zIndex: computed.zIndex,
        opacity: computed.opacity,
        visibility: computed.visibility,
        display: computed.display,
      };
    });
    console.log(`✓ Skip link styles:`, styles);

    // Press Enter to activate the skip link
    console.log('\nStep 3: Pressing Enter to activate skip link...');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(500); // Wait for focus to move

    // Take screenshot after activation
    const screenshot3Path = join(screenshotDir, `03-after-skip-activation-${timestamp}.png`);
    await page.screenshot({
      path: screenshot3Path,
      fullPage: true
    });
    console.log(`✓ Screenshot 3 saved: ${screenshot3Path}`);

    // Check which element has focus now
    const focusedElement = await page.evaluate(() => {
      const el = document.activeElement;
      return {
        tagName: el?.tagName,
        id: el?.id,
        className: el?.className,
        tabIndex: el?.tabIndex,
      };
    });
    console.log(`\n✓ Focused element after skip:`, focusedElement);

    // Check if main content element exists and has focus
    const mainContent = page.locator('#main-content').first();
    const mainExists = await mainContent.count() > 0;
    const mainTabIndex = await mainContent.getAttribute('tabindex');

    console.log(`✓ Main content exists: ${mainExists}`);
    console.log(`✓ Main content tabindex: ${mainTabIndex}`);

    // Generate report
    const report = {
      timestamp: new Date().toISOString(),
      test: 'Skip Link Accessibility',
      steps: {
        initial: {
          url: 'http://localhost:3000',
          screenshot: screenshot1Path
        },
        tabPressed: {
          skipLinkVisible: isVisible,
          skipLinkText: text,
          skipLinkPosition: boundingBox,
          skipLinkStyles: styles,
          screenshot: screenshot2Path
        },
        enterPressed: {
          focusedElement: focusedElement,
          mainContentExists: mainExists,
          mainContentTabIndex: mainTabIndex,
          screenshot: screenshot3Path
        }
      },
      result: {
        skipLinkVisibleOnTab: isVisible,
        skipLinkHasCorrectText: text?.includes('Skip') || false,
        focusMovedToMainContent: focusedElement.id === 'main-content',
        overallSuccess: isVisible && (text?.includes('Skip') || false) && focusedElement.id === 'main-content'
      }
    };

    const reportPath = join(screenshotDir, `skip-link-test-report-${timestamp}.json`);
    writeFileSync(reportPath, JSON.stringify(report, null, 2));

    console.log('\n=== TEST REPORT ===');
    console.log(JSON.stringify(report.result, null, 2));
    console.log(`\n✓ Full report saved: ${reportPath}\n`);

    // Assertions
    expect(isVisible, 'Skip link should be visible when focused').toBe(true);
    expect(text).toContain('Skip');
    expect(mainExists, 'Main content element should exist').toBe(true);
    expect(focusedElement.id, 'Focus should move to main content').toBe('main-content');
  });
});
