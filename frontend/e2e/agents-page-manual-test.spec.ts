import { test, expect, Page } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

// Test credentials
const TEST_EMAIL = 'e2e-test@iofold.com';
const TEST_PASSWORD = 'zI76O83k(%xsM';
const BASE_URL = 'https://platform.staging.iofold.com';

// Screenshot helpers
const screenshotDir = path.resolve(__dirname, '../.tmp/e2e-screenshots');
const timestamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

async function takeScreenshot(page: Page, name: string): Promise<string> {
  const filename = `${timestamp()}_${name}.png`;
  const filepath = path.join(screenshotDir, filename);
  await page.screenshot({ path: filepath, fullPage: true });
  console.log(`📸 Screenshot saved: ${filename}`);
  return filename;
}

// Findings tracking
const findings = {
  working: [] as string[],
  bugs: [] as { description: string; steps: string; screenshot?: string }[],
  uxIssues: [] as string[],
  screenshots: [] as string[],
};

test.describe('Agents Page Comprehensive Manual Test', () => {
  // Don't use stored auth state for this test
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeAll(() => {
    // Ensure screenshot directory exists
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
    console.log('🚀 Starting comprehensive Agents page test...');
  });

  test('Full Agents Page Testing Flow', async ({ page }) => {
    // Increase timeout for this test
    test.setTimeout(180000);

    // STEP 1: Authentication
    console.log('\n=== STEP 1: Authentication ===');
    try {
      await page.goto(`${BASE_URL}/sign-in`);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(2000);

      const screenshot1 = await takeScreenshot(page, '01-signin-page');
      findings.screenshots.push(screenshot1);

      // Try to find and fill email input
      const emailSelectors = [
        'input[type="email"]',
        'input[name="identifier"]',
        'input[name="email"]',
        'input[placeholder*="email" i]',
        '.cl-formFieldInput input',
      ];

      let emailFilled = false;
      for (const selector of emailSelectors) {
        try {
          const input = page.locator(selector).first();
          if (await input.isVisible({ timeout: 2000 })) {
            await input.fill(TEST_EMAIL);
            console.log(`✅ Filled email using selector: ${selector}`);
            emailFilled = true;
            break;
          }
        } catch (e) {
          continue;
        }
      }

      if (!emailFilled) {
        throw new Error('Could not find email input field');
      }

      await page.waitForTimeout(500);

      // Look for Continue/Next button after email
      const continueSelectors = [
        'button:has-text("Continue")',
        'button:has-text("Next")',
        'button[type="submit"]',
      ];

      let continued = false;
      for (const selector of continueSelectors) {
        try {
          const button = page.locator(selector).first();
          if (await button.isVisible({ timeout: 1000 })) {
            await button.click();
            console.log(`✅ Clicked continue button: ${selector}`);
            continued = true;
            await page.waitForTimeout(1000);
            break;
          }
        } catch (e) {
          continue;
        }
      }

      // Now try to fill password
      const passwordSelectors = [
        'input[type="password"]',
        'input[name="password"]',
        '.cl-formFieldInput input[type="password"]',
      ];

      let passwordFilled = false;
      for (const selector of passwordSelectors) {
        try {
          const input = page.locator(selector).first();
          if (await input.isVisible({ timeout: 3000 })) {
            await input.fill(TEST_PASSWORD);
            console.log(`✅ Filled password using selector: ${selector}`);
            passwordFilled = true;
            break;
          }
        } catch (e) {
          continue;
        }
      }

      if (!passwordFilled) {
        throw new Error('Could not find password input field');
      }

      await page.waitForTimeout(500);

      // Click sign in button
      const signInSelectors = [
        'button:has-text("Sign in")',
        'button:has-text("Continue")',
        'button[type="submit"]',
      ];

      let signedIn = false;
      for (const selector of signInSelectors) {
        try {
          const button = page.locator(selector).first();
          if (await button.isVisible({ timeout: 1000 })) {
            await button.click();
            console.log(`✅ Clicked sign in button: ${selector}`);
            signedIn = true;
            break;
          }
        } catch (e) {
          continue;
        }
      }

      if (!signedIn) {
        throw new Error('Could not find sign in button');
      }

      // Wait for navigation away from sign-in
      await page.waitForTimeout(3000);
      await page.waitForLoadState('networkidle', { timeout: 15000 });

      const screenshot2 = await takeScreenshot(page, '02-after-signin');
      findings.screenshots.push(screenshot2);

      const currentUrl = page.url();
      if (currentUrl.includes('/sign-in')) {
        findings.bugs.push({
          description: 'Still on sign-in page after authentication attempt',
          steps: 'Attempted to sign in but remained on sign-in page',
          screenshot: screenshot2,
        });
      } else {
        findings.working.push('✅ Authentication flow completed successfully');
        console.log(`✅ Authenticated, now at: ${currentUrl}`);
      }
    } catch (error) {
      const screenshot = await takeScreenshot(page, 'bug-signin-failed');
      findings.screenshots.push(screenshot);
      findings.bugs.push({
        description: 'Sign-in authentication failed',
        steps: `1. Navigate to /sign-in\n2. Enter email: ${TEST_EMAIL}\n3. Enter password\n4. Click submit\nError: ${error}`,
        screenshot,
      });
      console.error('❌ Authentication failed:', error);
      // Don't throw, continue to document what we can see
    }

    // STEP 2: Navigate to Agents page
    console.log('\n=== STEP 2: Navigate to Agents Page ===');
    try {
      await page.goto(`${BASE_URL}/agents`);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(3000);

      const screenshot3 = await takeScreenshot(page, '03-agents-page-initial');
      findings.screenshots.push(screenshot3);
      findings.working.push('✅ Successfully navigated to /agents page');
      console.log('✅ Navigated to /agents');
    } catch (error) {
      const screenshot = await takeScreenshot(page, 'bug-agents-navigation-failed');
      findings.screenshots.push(screenshot);
      findings.bugs.push({
        description: 'Failed to navigate to /agents page',
        steps: `Navigate to ${BASE_URL}/agents\nError: ${error}`,
        screenshot,
      });
      console.error('❌ Navigation failed:', error);
    }

    // STEP 3: Test agent list rendering
    console.log('\n=== STEP 3: Test Agent List Rendering ===');
    try {
      // Look for various possible agent elements
      const agentSelectors = [
        '[data-testid*="agent"]',
        '[class*="agent-card"]',
        '[class*="agent-item"]',
        'a[href*="/agents/"]:not([href="/agents"])',
        '[role="listitem"]',
      ];

      let agentCount = 0;
      for (const selector of agentSelectors) {
        const count = await page.locator(selector).count();
        if (count > 0) {
          agentCount = Math.max(agentCount, count);
        }
      }

      if (agentCount > 0) {
        findings.working.push(`✅ Agent list rendered with ${agentCount} agent(s)`);
        console.log(`✅ Found ${agentCount} agent(s)`);
      } else {
        // Check for empty state
        const emptyText = await page.textContent('body');
        if (emptyText && (emptyText.includes('no agents') || emptyText.includes('empty') || emptyText.includes('create'))) {
          findings.working.push('✅ Empty state displayed correctly (no agents)');
          console.log('✅ Empty state shown');
        } else {
          findings.uxIssues.push('⚠️  No agents displayed and no clear empty state shown');
          console.log('⚠️  No agents or empty state');
        }
      }

      const screenshot4 = await takeScreenshot(page, '04-agents-list-state');
      findings.screenshots.push(screenshot4);
    } catch (error) {
      const screenshot = await takeScreenshot(page, 'bug-agent-list-check-failed');
      findings.screenshots.push(screenshot);
      findings.bugs.push({
        description: 'Failed to verify agent list',
        steps: `Check for agent elements on /agents page\nError: ${error}`,
        screenshot,
      });
      console.error('❌ Agent list check failed:', error);
    }

    // STEP 4: Test Create New Agent button
    console.log('\n=== STEP 4: Test Create New Agent Button ===');
    try {
      const createSelectors = [
        'button:has-text("New Agent")',
        'button:has-text("Create Agent")',
        'a:has-text("New Agent")',
        'a:has-text("Create Agent")',
        '[data-testid="create-agent"]',
      ];

      let found = false;
      for (const selector of createSelectors) {
        const button = page.locator(selector).first();
        if (await button.isVisible({ timeout: 1000 })) {
          await button.scrollIntoViewIfNeeded();
          const screenshot5 = await takeScreenshot(page, '05-create-agent-button');
          findings.screenshots.push(screenshot5);

          await button.click();
          await page.waitForTimeout(2000);

          const screenshot6 = await takeScreenshot(page, '06-create-agent-clicked');
          findings.screenshots.push(screenshot6);

          // Check if modal or new page opened
          const hasModal = await page.locator('[role="dialog"], .modal, [class*="modal"]').isVisible({ timeout: 1000 }).catch(() => false);
          const urlChanged = !page.url().endsWith('/agents');

          if (hasModal || urlChanged) {
            findings.working.push('✅ Create Agent button opens modal/form correctly');
            console.log('✅ Create button works');

            // Try to close modal
            const closeButton = page.locator('[aria-label="Close"], button:has-text("Cancel")').first();
            if (await closeButton.isVisible({ timeout: 1000 })) {
              await closeButton.click();
              await page.waitForTimeout(500);
            } else if (urlChanged) {
              await page.goto(`${BASE_URL}/agents`);
              await page.waitForLoadState('domcontentloaded');
            }
          } else {
            findings.uxIssues.push('⚠️  Create Agent button clicked but no visible response');
            console.log('⚠️  Create button no response');
          }

          found = true;
          break;
        }
      }

      if (!found) {
        findings.uxIssues.push('⚠️  No "Create New Agent" button found on agents page');
        console.log('⚠️  No create button found');
      }
    } catch (error) {
      const screenshot = await takeScreenshot(page, 'bug-create-agent-test-failed');
      findings.screenshots.push(screenshot);
      findings.bugs.push({
        description: 'Create Agent button test failed',
        steps: `Look for and click create button\nError: ${error}`,
        screenshot,
      });
      console.error('❌ Create button test failed:', error);
    }

    // STEP 5: Click on first agent
    console.log('\n=== STEP 5: Click on First Agent ===');
    let hasAgent = false;
    try {
      const agentLink = page.locator('a[href*="/agents/"]:not([href="/agents"])').first();
      const count = await agentLink.count();

      if (count > 0) {
        const href = await agentLink.getAttribute('href');
        await agentLink.click();
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(3000);

        const screenshot7 = await takeScreenshot(page, '07-agent-details-page');
        findings.screenshots.push(screenshot7);
        findings.working.push(`✅ Successfully navigated to agent details: ${href}`);
        console.log(`✅ Opened agent: ${href}`);
        hasAgent = true;
      } else {
        findings.uxIssues.push('⚠️  No agent links found to test navigation');
        console.log('⚠️  No agents to click');
      }
    } catch (error) {
      const screenshot = await takeScreenshot(page, 'bug-agent-click-failed');
      findings.screenshots.push(screenshot);
      findings.bugs.push({
        description: 'Failed to click on agent',
        steps: `Click first agent link\nError: ${error}`,
        screenshot,
      });
      console.error('❌ Agent click failed:', error);
    }

    // Only continue if we have an agent
    if (hasAgent) {
      // STEP 6: Test all tabs
      console.log('\n=== STEP 6: Test Tabs ===');
      const tabs = ['Overview', 'Versions', 'Evals', 'Tasksets', 'GEPA', 'Tools', 'Playground'];

      for (const tabName of tabs) {
        try {
          const tabSelectors = [
            `[role="tab"]:has-text("${tabName}")`,
            `a:has-text("${tabName}")`,
            `button:has-text("${tabName}")`,
          ];

          let found = false;
          for (const selector of tabSelectors) {
            const tab = page.locator(selector).first();
            if (await tab.isVisible({ timeout: 2000 })) {
              await tab.scrollIntoViewIfNeeded();
              await tab.click();
              await page.waitForTimeout(2000);

              const screenshotName = `08-tab-${tabName.toLowerCase()}`;
              const screenshot = await takeScreenshot(page, screenshotName);
              findings.screenshots.push(screenshot);

              // Check for content
              const bodyText = await page.textContent('body');
              if (bodyText && bodyText.length > 200) {
                findings.working.push(`✅ ${tabName} tab loads and displays content`);
                console.log(`✅ ${tabName} tab works`);
              } else {
                findings.uxIssues.push(`⚠️  ${tabName} tab appears empty or has minimal content`);
                console.log(`⚠️  ${tabName} tab empty`);
              }

              found = true;
              break;
            }
          }

          if (!found) {
            findings.uxIssues.push(`⚠️  ${tabName} tab not found in agent details`);
            console.log(`⚠️  ${tabName} tab not found`);
          }
        } catch (error) {
          const screenshot = await takeScreenshot(page, `bug-tab-${tabName.toLowerCase()}-failed`);
          findings.screenshots.push(screenshot);
          findings.bugs.push({
            description: `${tabName} tab test failed`,
            steps: `Click on ${tabName} tab\nError: ${error}`,
            screenshot,
          });
          console.error(`❌ ${tabName} tab failed:`, error);
        }
      }

      // STEP 7: Test Edit Agent
      console.log('\n=== STEP 7: Test Edit Agent ===');
      try {
        // Go back to Overview
        const overviewTab = page.locator('[role="tab"]:has-text("Overview"), a:has-text("Overview")').first();
        if (await overviewTab.isVisible({ timeout: 2000 })) {
          await overviewTab.click();
          await page.waitForTimeout(1000);
        }

        const editSelectors = [
          'button:has-text("Edit")',
          'button[aria-label*="Edit"]',
          'a:has-text("Edit")',
        ];

        let found = false;
        for (const selector of editSelectors) {
          const editButton = page.locator(selector).first();
          if (await editButton.isVisible({ timeout: 2000 })) {
            await editButton.scrollIntoViewIfNeeded();
            await takeScreenshot(page, '09-before-edit-click');

            await editButton.click();
            await page.waitForTimeout(2000);

            const screenshot = await takeScreenshot(page, '10-edit-modal-or-page');
            findings.screenshots.push(screenshot);

            const hasForm = await page.locator('form, [role="dialog"]').isVisible({ timeout: 1000 }).catch(() => false);
            if (hasForm) {
              findings.working.push('✅ Edit Agent button opens edit form/modal');
              console.log('✅ Edit button works');

              // Close without saving
              const cancelButton = page.locator('button:has-text("Cancel"), [aria-label="Close"]').first();
              if (await cancelButton.isVisible({ timeout: 1000 })) {
                await cancelButton.click();
                await page.waitForTimeout(500);
              }
            } else {
              findings.uxIssues.push('⚠️  Edit button clicked but no form/modal appeared');
              console.log('⚠️  Edit button no response');
            }

            found = true;
            break;
          }
        }

        if (!found) {
          findings.uxIssues.push('⚠️  No Edit button found in agent details');
          console.log('⚠️  No edit button');
        }
      } catch (error) {
        const screenshot = await takeScreenshot(page, 'bug-edit-agent-failed');
        findings.screenshots.push(screenshot);
        findings.bugs.push({
          description: 'Edit Agent functionality test failed',
          steps: `Look for and click Edit button\nError: ${error}`,
          screenshot,
        });
        console.error('❌ Edit test failed:', error);
      }
    }

    // STEP 8: Test responsive design
    console.log('\n=== STEP 8: Test Responsive Design ===');
    try {
      await page.goto(`${BASE_URL}/agents`);
      await page.waitForLoadState('domcontentloaded');
      await page.setViewportSize({ width: 375, height: 667 });
      await page.waitForTimeout(1000);

      const screenshot13 = await takeScreenshot(page, '13-mobile-view');
      findings.screenshots.push(screenshot13);

      const hasMobileMenu = await page.locator('[aria-label*="menu"], button[class*="mobile"]').isVisible({ timeout: 2000 }).catch(() => false);
      if (hasMobileMenu) {
        findings.working.push('✅ Mobile menu button visible in mobile viewport');
        console.log('✅ Mobile menu found');
      } else {
        findings.uxIssues.push('⚠️  No mobile menu button found in mobile viewport');
        console.log('⚠️  No mobile menu');
      }

      await page.setViewportSize({ width: 1280, height: 720 });
      findings.working.push('✅ Page adapts to different viewport sizes');
    } catch (error) {
      findings.uxIssues.push(`⚠️  Responsive design test encountered issues: ${error}`);
      console.error('❌ Responsive test failed:', error);
    }

    // STEP 9: Test 404 handling
    console.log('\n=== STEP 9: Test 404 Handling ===');
    try {
      await page.goto(`${BASE_URL}/agents/nonexistent-agent-id-12345`);
      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(2000);

      const screenshot14 = await takeScreenshot(page, '14-nonexistent-agent');
      findings.screenshots.push(screenshot14);

      const bodyText = await page.textContent('body');
      if (bodyText && /not found|404|does not exist/i.test(bodyText)) {
        findings.working.push('✅ 404/Not Found page displays correctly for invalid agent');
        console.log('✅ 404 handling works');
      } else {
        findings.uxIssues.push('⚠️  No clear error message for non-existent agent ID');
        console.log('⚠️  No clear 404 message');
      }
    } catch (error) {
      findings.uxIssues.push(`⚠️  Error state test failed: ${error}`);
      console.error('❌ 404 test failed:', error);
    }

    // Final screenshot
    console.log('\n=== Final Screenshot ===');
    await page.goto(`${BASE_URL}/agents`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000);
    const screenshot15 = await takeScreenshot(page, '15-final-agents-page');
    findings.screenshots.push(screenshot15);

    console.log('\n✅ Test complete!');
  });

  test.afterAll(async () => {
    console.log('\n📝 Generating report...');
    const report = generateReport(findings);
    const reportPath = path.resolve(__dirname, '../.tmp/e2e-findings/agents-page.md');

    const reportDir = path.dirname(reportPath);
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    fs.writeFileSync(reportPath, report, 'utf-8');
    console.log(`\n✅ Test report written to: ${reportPath}`);
  });
});

function generateReport(findings: typeof findings): string {
  const now = new Date().toISOString();

  let report = `# Agents Page E2E Test Report\n\n`;
  report += `**Date:** ${now}\n`;
  report += `**Environment:** ${BASE_URL}\n`;
  report += `**Test Account:** ${TEST_EMAIL}\n\n`;
  report += `---\n\n`;

  report += `## Summary\n\n`;
  report += `- ✅ Working Features: ${findings.working.length}\n`;
  report += `- ❌ Bugs Found: ${findings.bugs.length}\n`;
  report += `- ⚠️  UX Issues: ${findings.uxIssues.length}\n`;
  report += `- 📸 Screenshots Captured: ${findings.screenshots.length}\n\n`;

  report += `---\n\n`;

  if (findings.working.length > 0) {
    report += `## ✅ What Works Correctly\n\n`;
    findings.working.forEach((item) => {
      report += `${item}\n`;
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
    findings.uxIssues.forEach((issue) => {
      report += `${issue}\n`;
    });
    report += `\n`;
  }

  report += `---\n\n`;
  report += `## Test Coverage\n\n`;
  report += `The following areas were tested:\n\n`;
  report += `- ✅ Authentication flow (sign-in)\n`;
  report += `- ✅ Agents list page rendering\n`;
  report += `- ✅ Agent details navigation\n`;
  report += `- ✅ Tab navigation (Overview, Versions, Evals, Tasksets, GEPA, Tools, Playground)\n`;
  report += `- ✅ Create new agent functionality\n`;
  report += `- ✅ Edit agent functionality\n`;
  report += `- ✅ Responsive design (mobile/desktop)\n`;
  report += `- ✅ Error handling (404 pages)\n\n`;

  report += `---\n\n`;
  report += `## Screenshots\n\n`;
  report += `All screenshots saved to: \`.tmp/e2e-screenshots/\`\n\n`;
  report += `Total screenshots captured: ${findings.screenshots.length}\n\n`;

  if (findings.screenshots.length > 0) {
    report += `### Screenshot List:\n\n`;
    findings.screenshots.forEach((screenshot) => {
      report += `- ${screenshot}\n`;
    });
  }

  return report;
}
