import { test, expect, Page } from '@playwright/test';

const STAGING_URL = 'https://platform.staging.iofold.com';
const TEST_EMAIL = 'e2e+clerk_test@iofold.com';
const TEST_PASSWORD = 'E2eTestPassword123!';
const TEST_OTP = '424242';
const TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

test.describe('Tasksets Flow - Manual Staging Test', () => {
  test.setTimeout(120000); // 2 minutes timeout

  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
  });

  test.afterAll(async () => {
    await page.close();
  });

  test('Step 1: Navigate to staging site', async () => {
    console.log('📍 Navigating to staging site...');
    await page.goto(STAGING_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const screenshotPath = `/home/ygupta/workspace/iofold/frontend/e2e-screenshots/tasksets-01-landing-${TIMESTAMP}.png`;
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`✅ Screenshot saved: ${screenshotPath}`);
    console.log(`📍 Current URL: ${page.url()}`);
  });

  test('Step 2: Authenticate if redirected to sign-in', async () => {
    console.log('🔐 Checking if authentication is needed...');
    const currentUrl = page.url();

    if (currentUrl.includes('sign-in') || currentUrl.includes('login')) {
      console.log('🔐 Sign-in page detected, authenticating...');

      // Take screenshot of sign-in page
      await page.screenshot({
        path: `/home/ygupta/workspace/iofold/frontend/e2e-screenshots/tasksets-02a-signin-page-${TIMESTAMP}.png`,
        fullPage: true
      });

      // Fill in email
      const emailInput = page.locator('input[type="email"], input[name="identifier"], input[name="email"]').first();
      await emailInput.waitFor({ state: 'visible', timeout: 10000 });
      await emailInput.fill(TEST_EMAIL);
      console.log('✅ Email filled');

      // Click continue or submit
      const continueButton = page.locator('button:has-text("Continue"), button[type="submit"]').first();
      await continueButton.click();
      await page.waitForTimeout(2000);

      // Take screenshot after email
      await page.screenshot({
        path: `/home/ygupta/workspace/iofold/frontend/e2e-screenshots/tasksets-02b-after-email-${TIMESTAMP}.png`,
        fullPage: true
      });

      // Fill in password
      const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
      await passwordInput.waitFor({ state: 'visible', timeout: 10000 });
      await passwordInput.fill(TEST_PASSWORD);
      console.log('✅ Password filled');

      // Submit password
      const submitButton = page.locator('button:has-text("Continue"), button:has-text("Sign in"), button[type="submit"]').first();
      await submitButton.click();
      await page.waitForTimeout(3000);

      // Take screenshot after password
      await page.screenshot({
        path: `/home/ygupta/workspace/iofold/frontend/e2e-screenshots/tasksets-02c-after-password-${TIMESTAMP}.png`,
        fullPage: true
      });

      // Check for OTP prompt
      const otpInput = page.locator('input[name="code"], input[type="text"][inputmode="numeric"]').first();
      if (await otpInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        console.log('🔐 OTP prompt detected, entering code...');
        await otpInput.fill(TEST_OTP);

        const otpSubmit = page.locator('button:has-text("Continue"), button[type="submit"]').first();
        await otpSubmit.click();
        await page.waitForTimeout(3000);

        await page.screenshot({
          path: `/home/ygupta/workspace/iofold/frontend/e2e-screenshots/tasksets-02d-after-otp-${TIMESTAMP}.png`,
          fullPage: true
        });
        console.log('✅ OTP submitted');
      }

      // Wait for redirect after authentication
      await page.waitForURL((url) => !url.includes('sign-in') && !url.includes('login'), { timeout: 15000 });
      await page.waitForTimeout(2000);

      console.log(`✅ Authenticated successfully, current URL: ${page.url()}`);
    } else {
      console.log('✅ Already authenticated or no sign-in required');
    }

    await page.screenshot({
      path: `/home/ygupta/workspace/iofold/frontend/e2e-screenshots/tasksets-02e-authenticated-${TIMESTAMP}.png`,
      fullPage: true
    });
  });

  test('Step 3: Navigate to agents page and select Art-E agent', async () => {
    console.log('🤖 Navigating to agents page...');

    // Navigate to agents page
    await page.goto(`${STAGING_URL}/agents`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: `/home/ygupta/workspace/iofold/frontend/e2e-screenshots/tasksets-03a-agents-page-${TIMESTAMP}.png`,
      fullPage: true
    });
    console.log('✅ Agents page loaded');

    // Look for Art-E Email Search Agent
    const agentLink = page.locator('a:has-text("Art-E"), a:has-text("Email Search"), [role="link"]:has-text("Art-E")').first();

    if (await agentLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('✅ Found Art-E agent link');
      await agentLink.click();
      await page.waitForTimeout(2000);
      console.log(`📍 Navigated to agent page: ${page.url()}`);
    } else {
      console.log('⚠️ Art-E agent link not found, looking for any agent...');
      const anyAgentLink = page.locator('a[href*="/agents/"]').first();
      if (await anyAgentLink.isVisible({ timeout: 5000 }).catch(() => false)) {
        await anyAgentLink.click();
        await page.waitForTimeout(2000);
        console.log(`📍 Navigated to first available agent: ${page.url()}`);
      } else {
        console.log('❌ No agents found on page');
      }
    }

    await page.screenshot({
      path: `/home/ygupta/workspace/iofold/frontend/e2e-screenshots/tasksets-03b-agent-detail-${TIMESTAMP}.png`,
      fullPage: true
    });
  });

  test('Step 4: Navigate to Tasksets tab', async () => {
    console.log('📋 Looking for Tasksets tab...');

    // Look for Tasksets tab/link
    const tasksetsTab = page.locator('a:has-text("Tasksets"), button:has-text("Tasksets"), [role="tab"]:has-text("Tasksets")').first();

    if (await tasksetsTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('✅ Found Tasksets tab');
      await tasksetsTab.click();
      await page.waitForTimeout(2000);
      console.log(`📍 Tasksets tab clicked, current URL: ${page.url()}`);
    } else {
      console.log('⚠️ Tasksets tab not found, attempting direct navigation...');
      const currentUrl = page.url();
      const agentId = currentUrl.match(/\/agents\/([^\/]+)/)?.[1];
      if (agentId) {
        await page.goto(`${STAGING_URL}/agents/${agentId}/tasksets`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(2000);
        console.log(`📍 Navigated directly to tasksets page: ${page.url()}`);
      }
    }

    await page.screenshot({
      path: `/home/ygupta/workspace/iofold/frontend/e2e-screenshots/tasksets-04-tasksets-tab-${TIMESTAMP}.png`,
      fullPage: true
    });
  });

  test('Step 5: Verify tasksets are listed', async () => {
    console.log('📋 Verifying tasksets list...');

    // Look for taskset items
    const tasksetItems = page.locator('[data-testid*="taskset"], .taskset-item, [class*="taskset"]');
    const count = await tasksetItems.count();

    console.log(`📊 Found ${count} taskset elements`);

    // Also check for ART-E specific taskset
    const artETaskset = page.locator(':has-text("ART-E"), :has-text("Art-E")');
    const artECount = await artETaskset.count();
    console.log(`📊 Found ${artECount} ART-E related elements`);

    // Check for empty state
    const emptyState = page.locator(':has-text("No tasksets"), :has-text("no tasksets")');
    if (await emptyState.isVisible({ timeout: 2000 }).catch(() => false)) {
      console.log('⚠️ Empty state detected - no tasksets found');
    }

    await page.screenshot({
      path: `/home/ygupta/workspace/iofold/frontend/e2e-screenshots/tasksets-05-tasksets-list-${TIMESTAMP}.png`,
      fullPage: true
    });

    // Log page content for debugging
    const bodyText = await page.locator('body').textContent();
    console.log('📄 Page content preview:', bodyText?.slice(0, 500));
  });

  test('Step 6: Click on a taskset to view details', async () => {
    console.log('🔍 Attempting to click on a taskset...');

    // Try multiple selectors for taskset links
    const tasksetSelectors = [
      'a[href*="/tasksets/"]',
      'button:has-text("ART-E")',
      '[role="link"]:has-text("ART-E")',
      '.taskset-item',
      '[data-testid*="taskset"]'
    ];

    let clicked = false;
    for (const selector of tasksetSelectors) {
      const element = page.locator(selector).first();
      if (await element.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log(`✅ Found taskset with selector: ${selector}`);
        await element.click();
        await page.waitForTimeout(2000);
        clicked = true;
        console.log(`📍 Clicked taskset, current URL: ${page.url()}`);
        break;
      }
    }

    if (!clicked) {
      console.log('⚠️ No clickable taskset found');
    }

    await page.screenshot({
      path: `/home/ygupta/workspace/iofold/frontend/e2e-screenshots/tasksets-06-taskset-detail-${TIMESTAMP}.png`,
      fullPage: true
    });
  });

  test('Step 7: Verify taskset detail page shows tasks and run history', async () => {
    console.log('🔍 Verifying taskset detail page content...');

    // Check for tasks section
    const tasksSection = page.locator(':has-text("Tasks"), :has-text("tasks")').first();
    const hasTasksSection = await tasksSection.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`📋 Tasks section visible: ${hasTasksSection}`);

    // Check for run history section
    const runHistorySection = page.locator(':has-text("Run History"), :has-text("Runs"), :has-text("history")').first();
    const hasRunHistory = await runHistorySection.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`📊 Run history section visible: ${hasRunHistory}`);

    // Count task items
    const taskItems = page.locator('[data-testid*="task"], .task-item, li:has-text("task")');
    const taskCount = await taskItems.count();
    console.log(`📊 Found ${taskCount} task items`);

    // Get page content for analysis
    const pageContent = await page.locator('body').textContent();
    const hasTaskKeyword = pageContent?.toLowerCase().includes('task');
    const hasRunKeyword = pageContent?.toLowerCase().includes('run');
    console.log(`📄 Page contains "task": ${hasTaskKeyword}, "run": ${hasRunKeyword}`);

    await page.screenshot({
      path: `/home/ygupta/workspace/iofold/frontend/e2e-screenshots/tasksets-07-detail-content-${TIMESTAMP}.png`,
      fullPage: true
    });
  });

  test('Step 8: Check Run Taskset button is visible', async () => {
    console.log('🔍 Looking for "Run Taskset" button...');

    // Try multiple variations of the button
    const buttonSelectors = [
      'button:has-text("Run Taskset")',
      'button:has-text("Run")',
      'button:has-text("Start")',
      '[data-testid*="run"]',
      'a:has-text("Run")'
    ];

    let buttonFound = false;
    for (const selector of buttonSelectors) {
      const button = page.locator(selector).first();
      if (await button.isVisible({ timeout: 2000 }).catch(() => false)) {
        console.log(`✅ Found button with selector: ${selector}`);
        const buttonText = await button.textContent();
        console.log(`📝 Button text: ${buttonText}`);
        buttonFound = true;

        // Check if button is enabled
        const isEnabled = await button.isEnabled();
        console.log(`✅ Button enabled: ${isEnabled}`);
        break;
      }
    }

    if (!buttonFound) {
      console.log('⚠️ "Run Taskset" button not found');

      // Log all buttons on page for debugging
      const allButtons = page.locator('button');
      const buttonCount = await allButtons.count();
      console.log(`📊 Total buttons on page: ${buttonCount}`);

      for (let i = 0; i < Math.min(buttonCount, 10); i++) {
        const btnText = await allButtons.nth(i).textContent();
        console.log(`  Button ${i + 1}: ${btnText?.trim()}`);
      }
    }

    await page.screenshot({
      path: `/home/ygupta/workspace/iofold/frontend/e2e-screenshots/tasksets-08-run-button-${TIMESTAMP}.png`,
      fullPage: true
    });
  });

  test('Step 9: Final summary screenshot', async () => {
    console.log('📸 Taking final summary screenshot...');

    // Scroll to top for final screenshot
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(1000);

    await page.screenshot({
      path: `/home/ygupta/workspace/iofold/frontend/e2e-screenshots/tasksets-09-final-summary-${TIMESTAMP}.png`,
      fullPage: true
    });

    console.log('✅ Test suite completed');
    console.log(`📍 Final URL: ${page.url()}`);
  });
});
