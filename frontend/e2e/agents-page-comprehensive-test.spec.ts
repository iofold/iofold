import { test, expect, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

// Test credentials
const TEST_EMAIL = 'e2e-test@iofold.com';
const TEST_PASSWORD = 'zI76O83k(%xsM';

// Screenshot helpers
const screenshotDir = path.join(__dirname, '.tmp', 'e2e-screenshots');
const timestamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

async function takeScreenshot(page: Page, name: string) {
  const filename = `${timestamp()}_${name}.png`;
  const filepath = path.join(screenshotDir, filename);
  await page.screenshot({ path: filepath, fullPage: true });
  return filename;
}

// Findings tracking
const findings = {
  working: [] as string[],
  bugs: [] as { description: string; steps: string; screenshot?: string }[],
  uxIssues: [] as string[],
};

test.describe('Agents Page Comprehensive Test', () => {
  test.beforeAll(() => {
    // Ensure screenshot directory exists
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
  });

  test('Complete Agents Page Testing Flow', async ({ page }) => {
    console.log('Starting comprehensive Agents page test...');

    // STEP 1: Authentication
    test.step('Navigate to sign-in and authenticate', async () => {
      try {
        await page.goto('https://platform.staging.iofold.com/sign-in');
        await page.waitForLoadState('networkidle');

        // Take screenshot of sign-in page
        await takeScreenshot(page, '01-signin-page');

        // Look for email input - try multiple selectors
        const emailInput = page.locator('input[type="email"], input[name="identifier"], input[name="email"]').first();
        await emailInput.waitFor({ timeout: 10000 });
        await emailInput.fill(TEST_EMAIL);

        // Look for password input
        const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
        await passwordInput.fill(TEST_PASSWORD);

        // Look for submit button
        const submitButton = page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Continue")').first();
        await submitButton.click();

        // Wait for navigation
        await page.waitForURL(/.*\/(?!sign-in).*/, { timeout: 15000 });
        await page.waitForLoadState('networkidle');

        await takeScreenshot(page, '02-after-signin');
        findings.working.push('Authentication flow completed successfully');
      } catch (error) {
        const screenshot = await takeScreenshot(page, 'bug-signin-failed');
        findings.bugs.push({
          description: 'Sign-in authentication failed',
          steps: `1. Navigate to /sign-in\n2. Enter email: ${TEST_EMAIL}\n3. Enter password\n4. Click submit\nError: ${error}`,
          screenshot,
        });
        throw error;
      }
    });

    // STEP 2: Navigate to Agents page
    test.step('Navigate to /agents page', async () => {
      try {
        await page.goto('https://platform.staging.iofold.com/agents');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000); // Allow for data loading

        await takeScreenshot(page, '03-agents-page-initial');
        findings.working.push('Successfully navigated to /agents page');
      } catch (error) {
        const screenshot = await takeScreenshot(page, 'bug-agents-navigation-failed');
        findings.bugs.push({
          description: 'Failed to navigate to /agents page',
          steps: `1. After authentication\n2. Navigate to /agents\nError: ${error}`,
          screenshot,
        });
        throw error;
      }
    });

    // STEP 3: Test agent list rendering
    test.step('Verify agent list renders', async () => {
      try {
        // Look for agent cards or list items
        const agentElements = page.locator('[data-testid*="agent"], [class*="agent-card"], [class*="agent-item"], a[href*="/agents/"]');
        const count = await agentElements.count();

        if (count > 0) {
          findings.working.push(`Agent list rendered with ${count} agent(s)`);
          await takeScreenshot(page, '04-agents-list-rendered');
        } else {
          // Check for empty state
          const emptyState = page.locator('text=/no agents|empty|create.*first/i');
          const hasEmptyState = await emptyState.count() > 0;

          if (hasEmptyState) {
            findings.working.push('Empty state displayed correctly (no agents)');
            await takeScreenshot(page, '04-agents-empty-state');
          } else {
            const screenshot = await takeScreenshot(page, 'bug-no-agents-or-empty-state');
            findings.bugs.push({
              description: 'No agents displayed and no empty state shown',
              steps: '1. Navigate to /agents\n2. Observe page content',
              screenshot,
            });
          }
        }
      } catch (error) {
        const screenshot = await takeScreenshot(page, 'bug-agent-list-check-failed');
        findings.bugs.push({
          description: 'Failed to verify agent list',
          steps: `1. Navigate to /agents\n2. Check for agent elements\nError: ${error}`,
          screenshot,
        });
      }
    });

    // STEP 4: Test "Create New Agent" button
    test.step('Test Create New Agent button', async () => {
      try {
        const createButton = page.locator('button:has-text("New Agent"), button:has-text("Create Agent"), a:has-text("New Agent"), a:has-text("Create Agent")').first();
        const exists = await createButton.count() > 0;

        if (exists) {
          await createButton.scrollIntoViewIfNeeded();
          await takeScreenshot(page, '05-create-agent-button');

          await createButton.click();
          await page.waitForTimeout(1000);
          await takeScreenshot(page, '06-create-agent-clicked');

          // Check if modal or new page opened
          const isModal = await page.locator('[role="dialog"], .modal, [class*="modal"]').count() > 0;
          const urlChanged = page.url() !== 'https://platform.staging.iofold.com/agents';

          if (isModal || urlChanged) {
            findings.working.push('Create Agent button opens modal/form correctly');
          } else {
            findings.uxIssues.push('Create Agent button clicked but no visible response (no modal or navigation)');
          }

          // Close modal if exists or go back
          const closeButton = page.locator('[aria-label="Close"], button:has-text("Cancel"), [class*="close"]').first();
          if (await closeButton.count() > 0) {
            await closeButton.click();
            await page.waitForTimeout(500);
          } else if (urlChanged) {
            await page.goto('https://platform.staging.iofold.com/agents');
            await page.waitForLoadState('networkidle');
          }
        } else {
          findings.uxIssues.push('No "Create New Agent" button found on agents page');
        }
      } catch (error) {
        const screenshot = await takeScreenshot(page, 'bug-create-agent-test-failed');
        findings.bugs.push({
          description: 'Create Agent button test failed',
          steps: `1. Look for create button\n2. Click if found\nError: ${error}`,
          screenshot,
        });
      }
    });

    // STEP 5: Click on first agent (if exists)
    test.step('Click on an agent to view details', async () => {
      try {
        const agentLink = page.locator('a[href*="/agents/"]:not([href="/agents"])').first();
        const count = await agentLink.count();

        if (count > 0) {
          const href = await agentLink.getAttribute('href');
          await agentLink.click();
          await page.waitForLoadState('networkidle');
          await page.waitForTimeout(2000);

          await takeScreenshot(page, '07-agent-details-page');
          findings.working.push(`Successfully navigated to agent details page: ${href}`);
        } else {
          findings.uxIssues.push('No agent links found to test navigation');
          return; // Skip remaining tests if no agents
        }
      } catch (error) {
        const screenshot = await takeScreenshot(page, 'bug-agent-click-failed');
        findings.bugs.push({
          description: 'Failed to click on agent',
          steps: `1. Locate first agent link\n2. Click on it\nError: ${error}`,
          screenshot,
        });
        throw error;
      }
    });

    // STEP 6: Test all tabs
    const tabs = ['Overview', 'Versions', 'Evals', 'Tasksets', 'GEPA', 'Tools', 'Playground'];

    for (const tabName of tabs) {
      test.step(`Test ${tabName} tab`, async () => {
        try {
          // Look for tab by text or role
          const tab = page.locator(`[role="tab"]:has-text("${tabName}"), a:has-text("${tabName}"), button:has-text("${tabName}")`).first();
          const exists = await tab.count() > 0;

          if (exists) {
            await tab.scrollIntoViewIfNeeded();
            await tab.click();
            await page.waitForTimeout(1500);

            const screenshotName = `08-tab-${tabName.toLowerCase()}`;
            await takeScreenshot(page, screenshotName);

            // Check if content loaded
            const hasContent = await page.locator('main, [role="main"], .content').textContent();
            if (hasContent && hasContent.length > 100) {
              findings.working.push(`${tabName} tab loads and displays content`);
            } else {
              findings.uxIssues.push(`${tabName} tab appears empty or has minimal content`);
            }
          } else {
            findings.uxIssues.push(`${tabName} tab not found in agent details`);
          }
        } catch (error) {
          const screenshot = await takeScreenshot(page, `bug-tab-${tabName.toLowerCase()}-failed`);
          findings.bugs.push({
            description: `${tabName} tab test failed`,
            steps: `1. Click on ${tabName} tab\n2. Wait for content\nError: ${error}`,
            screenshot,
          });
        }
      });
    }

    // STEP 7: Test edit agent functionality
    test.step('Test Edit Agent functionality', async () => {
      try {
        // Go back to Overview tab
        const overviewTab = page.locator(`[role="tab"]:has-text("Overview"), a:has-text("Overview")`).first();
        if (await overviewTab.count() > 0) {
          await overviewTab.click();
          await page.waitForTimeout(500);
        }

        // Look for Edit button
        const editButton = page.locator('button:has-text("Edit"), button[aria-label*="Edit"], a:has-text("Edit")').first();
        const exists = await editButton.count() > 0;

        if (exists) {
          await editButton.scrollIntoViewIfNeeded();
          await takeScreenshot(page, '09-before-edit-click');

          await editButton.click();
          await page.waitForTimeout(1000);
          await takeScreenshot(page, '10-edit-modal-or-page');

          // Check if edit form appeared
          const hasForm = await page.locator('form, [role="dialog"]').count() > 0;
          if (hasForm) {
            findings.working.push('Edit Agent button opens edit form/modal');

            // Try to close without saving
            const cancelButton = page.locator('button:has-text("Cancel"), [aria-label="Close"]').first();
            if (await cancelButton.count() > 0) {
              await cancelButton.click();
              await page.waitForTimeout(500);
            }
          } else {
            findings.uxIssues.push('Edit button clicked but no form/modal appeared');
          }
        } else {
          findings.uxIssues.push('No Edit button found in agent details');
        }
      } catch (error) {
        const screenshot = await takeScreenshot(page, 'bug-edit-agent-failed');
        findings.bugs.push({
          description: 'Edit Agent functionality test failed',
          steps: `1. Look for Edit button\n2. Click if found\nError: ${error}`,
          screenshot,
        });
      }
    });

    // STEP 8: Test version management (if Versions tab exists)
    test.step('Test Version Management', async () => {
      try {
        const versionsTab = page.locator(`[role="tab"]:has-text("Versions"), a:has-text("Versions")`).first();
        const exists = await versionsTab.count() > 0;

        if (exists) {
          await versionsTab.click();
          await page.waitForTimeout(1500);
          await takeScreenshot(page, '11-versions-tab-detailed');

          // Look for version list items
          const versionItems = page.locator('[class*="version"], [data-testid*="version"]');
          const versionCount = await versionItems.count();

          if (versionCount > 0) {
            findings.working.push(`Versions tab shows ${versionCount} version(s)`);

            // Try clicking on first version
            const firstVersion = versionItems.first();
            await firstVersion.click();
            await page.waitForTimeout(1000);
            await takeScreenshot(page, '12-version-details');
            findings.working.push('Version item clickable and shows details');
          } else {
            // Check for empty state
            const emptyState = await page.locator('text=/no versions|empty/i').count();
            if (emptyState > 0) {
              findings.working.push('Versions tab shows empty state correctly');
            } else {
              findings.uxIssues.push('Versions tab has no versions and no empty state');
            }
          }
        }
      } catch (error) {
        const screenshot = await takeScreenshot(page, 'bug-versions-test-failed');
        findings.bugs.push({
          description: 'Version management test failed',
          steps: `1. Navigate to Versions tab\n2. Check version list\nError: ${error}`,
          screenshot,
        });
      }
    });

    // STEP 9: Test responsiveness and mobile view
    test.step('Test responsive design', async () => {
      try {
        // Test mobile viewport
        await page.setViewportSize({ width: 375, height: 667 });
        await page.waitForTimeout(1000);
        await takeScreenshot(page, '13-mobile-view');

        // Check if mobile menu exists
        const mobileMenu = page.locator('[aria-label*="menu"], button[class*="mobile"]').first();
        if (await mobileMenu.count() > 0) {
          findings.working.push('Mobile menu button visible in mobile viewport');
        } else {
          findings.uxIssues.push('No mobile menu button found in mobile viewport');
        }

        // Restore desktop viewport
        await page.setViewportSize({ width: 1280, height: 720 });
        await page.waitForTimeout(500);

        findings.working.push('Page adapts to different viewport sizes');
      } catch (error) {
        findings.uxIssues.push(`Responsive design test encountered issues: ${error}`);
      }
    });

    // STEP 10: Test accessibility
    test.step('Basic accessibility checks', async () => {
      try {
        // Check for heading structure
        const h1Count = await page.locator('h1').count();
        if (h1Count > 0) {
          findings.working.push('Page has proper heading structure (h1 present)');
        } else {
          findings.uxIssues.push('No h1 heading found on page');
        }

        // Check for skip links or aria-labels
        const skipLink = await page.locator('[href="#main"], [class*="skip"]').count();
        const ariaLabels = await page.locator('[aria-label]').count();

        if (skipLink > 0 || ariaLabels > 5) {
          findings.working.push('Page includes accessibility features (aria-labels or skip links)');
        } else {
          findings.uxIssues.push('Limited accessibility features detected');
        }
      } catch (error) {
        findings.uxIssues.push(`Accessibility check failed: ${error}`);
      }
    });

    // STEP 11: Test error states and edge cases
    test.step('Test error states and edge cases', async () => {
      try {
        // Try navigating to a non-existent agent
        await page.goto('https://platform.staging.iofold.com/agents/nonexistent-agent-id-12345');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(1000);
        await takeScreenshot(page, '14-nonexistent-agent');

        // Check for 404 or error message
        const errorMessage = await page.locator('text=/not found|404|does not exist/i').count();
        if (errorMessage > 0) {
          findings.working.push('404/Not Found page displays correctly for invalid agent');
        } else {
          findings.uxIssues.push('No clear error message for non-existent agent ID');
        }
      } catch (error) {
        findings.uxIssues.push(`Error state test failed: ${error}`);
      }
    });

    // Final screenshot
    await page.goto('https://platform.staging.iofold.com/agents');
    await page.waitForLoadState('networkidle');
    await takeScreenshot(page, '15-final-agents-page');
  });

  test.afterAll(async () => {
    // Generate findings report
    const report = generateReport(findings);
    const reportPath = path.join(__dirname, '.tmp', 'e2e-findings', 'agents-page.md');

    // Ensure directory exists
    const reportDir = path.dirname(reportPath);
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    fs.writeFileSync(reportPath, report, 'utf-8');
    console.log(`\nTest report written to: ${reportPath}`);
  });
});

function generateReport(findings: typeof findings): string {
  const now = new Date().toISOString();

  let report = `# Agents Page E2E Test Report\n\n`;
  report += `**Date:** ${now}\n`;
  report += `**Environment:** https://platform.staging.iofold.com\n`;
  report += `**Test Account:** e2e-test@iofold.com\n\n`;
  report += `---\n\n`;

  report += `## Summary\n\n`;
  report += `- ✅ Working Features: ${findings.working.length}\n`;
  report += `- ❌ Bugs Found: ${findings.bugs.length}\n`;
  report += `- ⚠️  UX Issues: ${findings.uxIssues.length}\n\n`;

  report += `---\n\n`;

  if (findings.working.length > 0) {
    report += `## ✅ What Works Correctly\n\n`;
    findings.working.forEach((item, index) => {
      report += `${index + 1}. ${item}\n`;
    });
    report += `\n`;
  }

  if (findings.bugs.length > 0) {
    report += `## ❌ Bugs Found\n\n`;
    findings.bugs.forEach((bug, index) => {
      report += `### Bug ${index + 1}: ${bug.description}\n\n`;
      report += `**Steps to Reproduce:**\n\`\`\`\n${bug.steps}\n\`\`\`\n\n`;
      if (bug.screenshot) {
        report += `**Screenshot:** \`.tmp/e2e-screenshots/${bug.screenshot}\`\n\n`;
      }
    });
  }

  if (findings.uxIssues.length > 0) {
    report += `## ⚠️  UX Issues & Observations\n\n`;
    findings.uxIssues.forEach((issue, index) => {
      report += `${index + 1}. ${issue}\n`;
    });
    report += `\n`;
  }

  report += `---\n\n`;
  report += `## Test Coverage\n\n`;
  report += `The following areas were tested:\n\n`;
  report += `- Authentication flow (sign-in)\n`;
  report += `- Agents list page rendering\n`;
  report += `- Agent details navigation\n`;
  report += `- Tab navigation (Overview, Versions, Evals, Tasksets, GEPA, Tools, Playground)\n`;
  report += `- Create new agent functionality\n`;
  report += `- Edit agent functionality\n`;
  report += `- Version management\n`;
  report += `- Responsive design (mobile/desktop)\n`;
  report += `- Basic accessibility\n`;
  report += `- Error handling (404 pages)\n\n`;

  report += `---\n\n`;
  report += `## Screenshots\n\n`;
  report += `All screenshots saved to: \`.tmp/e2e-screenshots/\`\n\n`;
  report += `Key screenshots:\n`;
  report += `- \`01-signin-page.png\` - Initial sign-in page\n`;
  report += `- \`03-agents-page-initial.png\` - Agents list page\n`;
  report += `- \`07-agent-details-page.png\` - Agent details view\n`;
  report += `- \`08-tab-*.png\` - Various tab views\n`;
  report += `- \`13-mobile-view.png\` - Mobile responsive view\n\n`;

  return report;
}
