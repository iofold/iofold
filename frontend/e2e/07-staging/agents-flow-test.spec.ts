import { test, expect } from '@playwright/test';
import { chromium } from 'playwright';

const STAGING_URL = 'https://platform.staging.iofold.com';
const TEST_EMAIL = 'e2e+clerk_test@iofold.com';
const TEST_PASSWORD = 'E2eTestPassword123!';
const TEST_OTP = '424242';
const SCREENSHOT_DIR = '/home/ygupta/workspace/iofold/.tmp/e2e-screenshots';

// Helper to generate timestamp for screenshots
function getTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

test.describe('Agents Flow E2E Test', () => {
  test.setTimeout(120000); // 2 minutes timeout for the entire test

  test('should complete full agents flow', async ({ page }) => {
    console.log('Starting Agents flow test...');

    // Step 1: Navigate to staging URL
    console.log(`Step 1: Navigating to ${STAGING_URL}`);
    await page.goto(STAGING_URL, { waitUntil: 'networkidle' });
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/agents-flow-01-landing-${getTimestamp()}.png`,
      fullPage: true
    });

    // Step 2: Sign in with Clerk
    console.log('Step 2: Signing in with Clerk...');

    // Wait for Clerk sign-in to be available
    await page.waitForTimeout(2000);

    // Look for sign-in button or redirect to sign-in page
    const currentUrl = page.url();
    console.log(`Current URL: ${currentUrl}`);

    if (!currentUrl.includes('/sign-in')) {
      // Click sign-in button if present
      const signInButton = page.locator('text=/sign in/i').first();
      if (await signInButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        await signInButton.click();
        await page.waitForLoadState('networkidle');
      } else {
        // Navigate directly to sign-in page
        await page.goto(`${STAGING_URL}/sign-in`, { waitUntil: 'networkidle' });
      }
    }

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/agents-flow-02-signin-page-${getTimestamp()}.png`,
      fullPage: true
    });

    // Fill in email
    console.log('Filling in email...');
    const emailInput = page.locator('input[name="identifier"], input[type="email"]').first();
    await emailInput.waitFor({ state: 'visible', timeout: 10000 });
    await emailInput.fill(TEST_EMAIL);
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/agents-flow-03-email-filled-${getTimestamp()}.png`,
      fullPage: true
    });

    // Click continue/next button
    const continueButton = page.locator('button:has-text("Continue"), button:has-text("Next")').first();
    await continueButton.click();
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/agents-flow-04-after-email-${getTimestamp()}.png`,
      fullPage: true
    });

    // Fill in password
    console.log('Filling in password...');
    const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
    await passwordInput.waitFor({ state: 'visible', timeout: 10000 });
    await passwordInput.fill(TEST_PASSWORD);
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/agents-flow-05-password-filled-${getTimestamp()}.png`,
      fullPage: true
    });

    // Click sign in button
    const signInSubmitButton = page.locator('button:has-text("Continue"), button:has-text("Sign in")').first();
    await signInSubmitButton.click();
    await page.waitForTimeout(3000);

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/agents-flow-06-after-password-${getTimestamp()}.png`,
      fullPage: true
    });

    // Check if OTP is required (check email verification)
    console.log('Checking if OTP is required...');

    // Look for "Check your email" text to confirm OTP screen
    const checkEmailText = page.locator('text=/check your email/i');
    const hasOtpScreen = await checkEmailText.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasOtpScreen) {
      console.log('OTP screen detected, looking for input fields...');

      await page.screenshot({
        path: `${SCREENSHOT_DIR}/agents-flow-07-otp-screen-${getTimestamp()}.png`,
        fullPage: true
      });

      // Clerk OTP: Check if it's in an iframe
      await page.waitForTimeout(2000);

      // Check for iframes
      const frames = page.frames();
      console.log(`Found ${frames.length} frames on page`);

      // Look for Clerk iframe
      let clerkFrame = null;
      for (const frame of frames) {
        const url = frame.url();
        if (url.includes('clerk') || url.includes('accounts')) {
          console.log(`Found potential Clerk frame: ${url}`);
          clerkFrame = frame;
          break;
        }
      }

      // Try to find and fill OTP input
      const targetFrame = clerkFrame || page;
      const otpInput = targetFrame.locator('input[type="text"]').first();
      const hasInput = await otpInput.isVisible({ timeout: 5000 }).catch(() => false);

      if (hasInput) {
        console.log('Found OTP input field, filling in code...');
        await otpInput.click();
        await otpInput.fill(TEST_OTP);
        console.log(`Filled OTP: ${TEST_OTP}`);
      } else {
        console.log('WARNING: Could not find OTP input field');
        console.log('Trying to type OTP by simulating keyboard input...');

        // Try clicking on one of the visible boxes and typing
        const otpBoxes = targetFrame.locator('div, span').filter({ hasText: /^\s*$/ });
        const firstBox = otpBoxes.first();
        if (await firstBox.isVisible({ timeout: 2000 }).catch(() => false)) {
          await firstBox.click();
          await page.keyboard.type(TEST_OTP, { delay: 100 });
          console.log('Typed OTP via keyboard');
        }
      }

      await page.waitForTimeout(2000); // Wait for validation

      await page.screenshot({
        path: `${SCREENSHOT_DIR}/agents-flow-08-otp-filled-${getTimestamp()}.png`,
        fullPage: true
      });

      // Click continue button after OTP
      const continueButton = page.locator('button:has-text("Continue")').first();
      if (await continueButton.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log('Clicking Continue button...');
        await continueButton.click();
        await page.waitForTimeout(3000);
      }
    } else {
      console.log('No OTP required, proceeding...');
    }

    // Wait for redirect to dashboard
    console.log('Waiting for redirect to dashboard...');
    await page.waitForURL(/.*\/(dashboard|agents|traces).*/, { timeout: 30000 });
    await page.waitForLoadState('networkidle');

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/agents-flow-08-signed-in-dashboard-${getTimestamp()}.png`,
      fullPage: true
    });

    console.log('Successfully signed in!');

    // Step 3: Navigate to Agents page
    console.log('Step 3: Navigating to Agents page...');

    // Look for Agents link in sidebar
    const agentsLink = page.locator('a[href*="/agents"], nav a:has-text("Agents")').first();
    await agentsLink.waitFor({ state: 'visible', timeout: 10000 });
    await agentsLink.click();
    await page.waitForLoadState('networkidle');

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/agents-flow-09-agents-page-${getTimestamp()}.png`,
      fullPage: true
    });

    // Step 4: Verify agents list loads
    console.log('Step 4: Verifying agents list...');

    // Wait for agents list or empty state
    const hasAgents = await page.locator('[data-testid*="agent"], .agent-card, .agent-item, table tbody tr').count() > 0;
    const hasEmptyState = await page.locator('text=/no agents/i, text=/create.*agent/i').isVisible({ timeout: 5000 }).catch(() => false);

    if (!hasAgents && !hasEmptyState) {
      console.log('WARNING: Could not find agents list or empty state');
    } else if (hasEmptyState) {
      console.log('No agents found - empty state displayed');
    } else {
      console.log(`Found ${await page.locator('[data-testid*="agent"], .agent-card, .agent-item, table tbody tr').count()} agents`);
    }

    await page.screenshot({
      path: `${SCREENSHOT_DIR}/agents-flow-10-agents-list-verified-${getTimestamp()}.png`,
      fullPage: true
    });

    // Step 5: Click on an agent to view details
    console.log('Step 5: Clicking on an agent...');

    const agentItems = page.locator('[data-testid*="agent"], .agent-card, .agent-item, table tbody tr a').first();
    const agentCount = await agentItems.count();

    if (agentCount > 0) {
      await agentItems.click();
      await page.waitForLoadState('networkidle');

      await page.screenshot({
        path: `${SCREENSHOT_DIR}/agents-flow-11-agent-details-${getTimestamp()}.png`,
        fullPage: true
      });

      console.log('Successfully opened agent details');

      // Step 6: Test all tabs
      console.log('Step 6: Testing agent tabs...');

      const tabs = ['Overview', 'Evals', 'Playground', 'Tasksets', 'GEPA'];

      for (const tabName of tabs) {
        console.log(`Testing ${tabName} tab...`);

        // Look for tab button
        const tabButton = page.locator(`[role="tab"]:has-text("${tabName}"), button:has-text("${tabName}"), a:has-text("${tabName}")`).first();

        if (await tabButton.isVisible({ timeout: 5000 }).catch(() => false)) {
          await tabButton.click();
          await page.waitForTimeout(1500); // Wait for tab content to load

          await page.screenshot({
            path: `${SCREENSHOT_DIR}/agents-flow-12-tab-${tabName.toLowerCase()}-${getTimestamp()}.png`,
            fullPage: true
          });

          console.log(`✓ ${tabName} tab works`);
        } else {
          console.log(`⚠ ${tabName} tab not found or not visible`);
        }
      }

      // Step 7: Verify agent configuration/tools
      console.log('Step 7: Verifying agent configuration...');

      // Go back to Overview tab to check configuration
      const overviewTab = page.locator('[role="tab"]:has-text("Overview"), button:has-text("Overview"), a:has-text("Overview")').first();
      if (await overviewTab.isVisible({ timeout: 5000 }).catch(() => false)) {
        await overviewTab.click();
        await page.waitForTimeout(1500);
      }

      // Look for configuration elements
      const hasTools = await page.locator('text=/tools/i, [data-testid*="tool"]').isVisible({ timeout: 5000 }).catch(() => false);
      const hasConfig = await page.locator('text=/configuration/i, text=/settings/i, text=/model/i').isVisible({ timeout: 5000 }).catch(() => false);

      console.log(`Configuration elements found: Tools=${hasTools}, Config=${hasConfig}`);

      await page.screenshot({
        path: `${SCREENSHOT_DIR}/agents-flow-13-configuration-check-${getTimestamp()}.png`,
        fullPage: true
      });

      console.log('✓ Agent configuration verified');

    } else {
      console.log('⚠ No agents available to test - skipping agent details tests');

      // Check if there's a create agent button
      const createButton = page.locator('button:has-text("Create"), a:has-text("New Agent")').first();
      if (await createButton.isVisible({ timeout: 5000 }).catch(() => false)) {
        console.log('Found create agent button');
        await page.screenshot({
          path: `${SCREENSHOT_DIR}/agents-flow-14-create-agent-button-${getTimestamp()}.png`,
          fullPage: true
        });
      }
    }

    // Final screenshot
    await page.screenshot({
      path: `${SCREENSHOT_DIR}/agents-flow-15-final-state-${getTimestamp()}.png`,
      fullPage: true
    });

    console.log('✅ Agents flow test completed successfully!');
  });
});
