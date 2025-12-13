import { test, expect } from '@playwright/test';
import { clerk } from '@clerk/testing/playwright';
import { format } from 'date-fns';

const SCREENSHOT_DIR = '/home/ygupta/workspace/iofold/.tmp/e2e-screenshots';

// Test credentials
const TEST_EMAIL = 'e2e+clerk_test@iofold.com';
const TEST_PASSWORD = 'E2eTestPassword123!';

function getTimestamp(): string {
  return format(new Date(), 'yyyyMMdd-HHmmss');
}

test.describe('Tasksets Flow - Staging Environment', () => {
  test.setTimeout(180000); // 3 minutes timeout

  test('Complete Tasksets workflow with manual auth', async ({ page }) => {
    console.log('Starting Tasksets flow test on staging...');

    // Step 1: Sign in manually using Clerk's testing API
    console.log('Step 1: Signing in...');

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/tasksets-flow-01-landing-${getTimestamp()}.png`,
      fullPage: true
    });

    try {
      // Use Clerk's signIn helper
      await clerk.signIn({
        page,
        signInParams: {
          strategy: 'password',
          identifier: TEST_EMAIL,
          password: TEST_PASSWORD,
        },
      });

      console.log('✓ Signed in using Clerk helper');

      // Wait for redirect after sign-in
      await page.waitForTimeout(3000);

      await page.screenshot({
        path: `${SCREENSHOT_DIR}/tasksets-flow-02-after-signin-${getTimestamp()}.png`,
        fullPage: true
      });
    } catch (error) {
      console.log('Clerk helper failed, trying manual sign-in...', error);

      // Fallback to manual sign-in
      // Check if already on landing page with sign-in modal
      const emailInput = page.locator('input[name="identifier"], input[type="email"]').first();
      if (await emailInput.isVisible({ timeout: 5000 })) {
        await emailInput.fill(TEST_EMAIL);
        await page.click('button:has-text("Continue"), button[type="submit"]');
        await page.waitForTimeout(2000);

        const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
        if (await passwordInput.isVisible({ timeout: 5000 })) {
          await passwordInput.fill(TEST_PASSWORD);
          await page.click('button:has-text("Continue"), button[type="submit"]');
          await page.waitForTimeout(3000);
        }
      } else {
        // Navigate to sign-in page
        await page.goto('/sign-in');
        await page.waitForLoadState('networkidle');

        await emailInput.fill(TEST_EMAIL);
        await page.click('button:has-text("Continue"), button[type="submit"]');
        await page.waitForTimeout(2000);

        const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
        await passwordInput.fill(TEST_PASSWORD);
        await page.click('button:has-text("Continue"), button[type="submit"]');
        await page.waitForTimeout(3000);
      }

      await page.screenshot({
        path: `${SCREENSHOT_DIR}/tasksets-flow-03-manual-signin-complete-${getTimestamp()}.png`,
        fullPage: true
      });
    }

    // Step 2: Navigate to Agents page
    console.log('Step 2: Navigating to Agents page...');

    await page.goto('/agents');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/tasksets-flow-04-agents-page-${getTimestamp()}.png`,
      fullPage: true
    });

    // Verify we're authenticated
    const isSignedIn = await page.locator('[data-testid="agent-card"], .agent-card, a[href*="/agents/"]').first().isVisible({ timeout: 5000 }).catch(() => false);

    if (!isSignedIn) {
      console.error('Not authenticated after sign-in attempt');
      await page.screenshot({
        path: `${SCREENSHOT_DIR}/tasksets-flow-05-auth-failed-${getTimestamp()}.png`,
        fullPage: true
      });
      throw new Error('Authentication failed');
    }

    console.log('✓ Successfully authenticated');

    // Step 3: Select first available agent
    console.log('Step 3: Selecting an agent...');

    const agentSelector = '[data-testid="agent-card"], .agent-card, a[href*="/agents/"][href!="/agents"]';
    await page.waitForSelector(agentSelector, { timeout: 10000 });

    const agents = page.locator(agentSelector);
    const agentCount = await agents.count();
    console.log(`Found ${agentCount} agent(s)`);

    if (agentCount === 0) {
      console.error('No agents found');
      await page.screenshot({
        path: `${SCREENSHOT_DIR}/tasksets-flow-06-no-agents-${getTimestamp()}.png`,
        fullPage: true
      });
      throw new Error('No agents found to test');
    }

    // Click first agent
    const firstAgent = agents.first();
    await firstAgent.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/tasksets-flow-07-agent-selected-${getTimestamp()}.png`,
      fullPage: true
    });

    // Step 4: Navigate to Tasksets tab
    console.log('Step 4: Looking for Tasksets tab...');

    // Log current URL
    const currentUrl = page.url();
    console.log(`Current URL: ${currentUrl}`);

    // Look for all navigation tabs to see what's available
    const navLinks = await page.locator('nav a, [role="tab"], .tab').allTextContents();
    console.log('Available navigation items:', navLinks);

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/tasksets-flow-08-looking-for-tabs-${getTimestamp()}.png`,
      fullPage: true
    });

    // Look for tasksets tab/link with multiple strategies
    const tasksetsSelectors = [
      'a[href*="/tasksets"]',
      'button:has-text("Tasksets")',
      'a:has-text("Tasksets")',
      '[data-testid="tasksets-tab"]',
      '[role="tab"]:has-text("Tasksets")'
    ];

    let tabFound = false;
    for (const selector of tasksetsSelectors) {
      const element = page.locator(selector).first();
      if (await element.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log(`✓ Found Tasksets tab with selector: ${selector}`);
        tabFound = true;

        await page.screenshot({
          path: `${SCREENSHOT_DIR}/tasksets-flow-09-before-tab-click-${getTimestamp()}.png`,
          fullPage: true
        });

        await element.click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);

        await page.screenshot({
          path: `${SCREENSHOT_DIR}/tasksets-flow-10-tasksets-page-${getTimestamp()}.png`,
          fullPage: true
        });
        break;
      }
    }

    if (!tabFound) {
      console.error('Tasksets tab not found with any selector');
      await page.screenshot({
        path: `${SCREENSHOT_DIR}/tasksets-flow-10-no-tasksets-tab-${getTimestamp()}.png`,
        fullPage: true
      });

      // Try direct navigation as fallback
      console.log('Attempting direct navigation to tasksets...');
      const agentId = currentUrl.split('/agents/')[1]?.split('/')[0];
      if (agentId) {
        await page.goto(`/agents/${agentId}/tasksets`);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);

        await page.screenshot({
          path: `${SCREENSHOT_DIR}/tasksets-flow-11-direct-nav-to-tasksets-${getTimestamp()}.png`,
          fullPage: true
        });
      } else {
        throw new Error('Could not find Tasksets tab or navigate directly');
      }
    }

    // Step 5: View taskset list
    console.log('Step 5: Viewing taskset list...');

    const pageContent = await page.content();
    const hasTasksetsText = pageContent.toLowerCase().includes('taskset');
    console.log(`Page contains 'taskset' text: ${hasTasksetsText}`);

    // Look for taskset items
    const tasksetSelectors = [
      '[data-testid="taskset-item"]',
      '.taskset-item',
      '[data-testid="taskset-row"]',
      'table tbody tr',
      '[role="row"]'
    ];

    let tasksetCount = 0;
    let tasksetItems;

    for (const selector of tasksetSelectors) {
      tasksetItems = page.locator(selector);
      tasksetCount = await tasksetItems.count();
      if (tasksetCount > 0) {
        console.log(`Found ${tasksetCount} taskset(s) with selector: ${selector}`);
        break;
      }
    }

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/tasksets-flow-12-tasksets-list-${getTimestamp()}.png`,
      fullPage: true
    });

    if (tasksetCount === 0) {
      console.log('⚠ No tasksets found - checking for empty state');
      const emptyState = await page.locator('text=/no taskset/i, text=/empty/i, .empty-state').isVisible({ timeout: 3000 });
      console.log(`Empty state visible: ${emptyState}`);

      await page.screenshot({
        path: `${SCREENSHOT_DIR}/tasksets-flow-13-no-tasksets-${getTimestamp()}.png`,
        fullPage: true
      });

      console.log('Test completed - no tasksets available to test further');
      return;
    }

    // Step 6: Click on first taskset to view details
    console.log('Step 6: Clicking on first taskset...');

    const firstTaskset = tasksetItems.first();
    await firstTaskset.click();
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/tasksets-flow-14-taskset-details-${getTimestamp()}.png`,
      fullPage: true
    });

    // Step 7: Verify "Run Taskset" button
    console.log('Step 7: Verifying Run Taskset button...');

    const runButtonSelectors = [
      '[data-testid="run-taskset-button"]',
      'button:has-text("Run Taskset")',
      'button:has-text("Run")'
    ];

    let runButtonVisible = false;
    let runButtonEnabled = false;

    for (const selector of runButtonSelectors) {
      const button = page.locator(selector).first();
      if (await button.isVisible({ timeout: 2000 }).catch(() => false)) {
        runButtonVisible = true;
        runButtonEnabled = await button.isEnabled();
        console.log(`✓ Run button found - Visible: ${runButtonVisible}, Enabled: ${runButtonEnabled}`);
        break;
      }
    }

    if (!runButtonVisible) {
      console.warn('⚠ Run Taskset button not found');
    }

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/tasksets-flow-15-run-button-check-${getTimestamp()}.png`,
      fullPage: true
    });

    // Step 8: Check tasks list
    console.log('Step 8: Checking tasks list...');

    const tasksFound = await page.locator('text=/task/i').first().isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`Tasks section visible: ${tasksFound}`);

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/tasksets-flow-16-tasks-section-${getTimestamp()}.png`,
      fullPage: true
    });

    // Step 9: Scroll and check runs history
    console.log('Step 9: Checking runs history...');

    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/tasksets-flow-17-scrolled-down-${getTimestamp()}.png`,
      fullPage: true
    });

    const runsFound = await page.locator('text=/run/i').first().isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`Runs section visible: ${runsFound}`);

    // Check for run items
    const runItems = page.locator('[data-testid="run-item"], .run-item, [data-testid="run-row"]');
    const runsCount = await runItems.count();
    console.log(`Found ${runsCount} run(s) in history`);

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/tasksets-flow-18-runs-section-${getTimestamp()}.png`,
      fullPage: true
    });

    if (runsCount > 0) {
      // Step 10: Try to view run details
      console.log('Step 10: Checking for View Details button...');

      const viewDetailsButton = page.locator('[data-testid="view-run-details"], button:has-text("View Details"), a:has-text("View Details"), button:has-text("Details")');

      if (await viewDetailsButton.first().isVisible({ timeout: 3000 })) {
        console.log('✓ Clicking View Details...');

        await page.screenshot({
          path: `${SCREENSHOT_DIR}/tasksets-flow-19-before-view-details-${getTimestamp()}.png`,
          fullPage: true
        });

        await viewDetailsButton.first().click();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);

        await page.screenshot({
          path: `${SCREENSHOT_DIR}/tasksets-flow-20-run-details-page-${getTimestamp()}.png`,
          fullPage: true
        });

        // Scroll to see full results
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(1000);

        await page.screenshot({
          path: `${SCREENSHOT_DIR}/tasksets-flow-21-run-details-full-${getTimestamp()}.png`,
          fullPage: true
        });

        console.log('✓ Successfully viewed run details page');
      } else {
        console.log('⚠ No View Details button found');
        await page.screenshot({
          path: `${SCREENSHOT_DIR}/tasksets-flow-19-no-view-details-${getTimestamp()}.png`,
          fullPage: true
        });
      }
    } else {
      console.log('No runs in history');
    }

    console.log('✓ Tasksets flow test completed successfully!');
  });
});
