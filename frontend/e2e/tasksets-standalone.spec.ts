import { test, chromium } from '@playwright/test';

const STAGING_URL = 'https://platform.staging.iofold.com';
const TEST_EMAIL = 'e2e+clerk_test@iofold.com';
const TEST_PASSWORD = 'E2eTestPassword123!';
const TEST_OTP = '424242';

test.describe.configure({ mode: 'serial' });

test.describe('Tasksets Flow - Manual Staging Test', () => {
  test.setTimeout(180000); // 3 minutes timeout

  test('Complete Tasksets Flow Test', async () => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

    // Launch browser
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1920, height: 1080 },
      ignoreHTTPSErrors: true
    });
    const page = await context.newPage();

    try {
      // Step 1: Navigate to staging site
      console.log('📍 Step 1: Navigating to staging site...');
      await page.goto(STAGING_URL, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);

      await page.screenshot({
        path: `/home/ygupta/workspace/iofold/frontend/e2e-screenshots/tasksets-01-landing-${timestamp}.png`,
        fullPage: true
      });
      console.log(`✅ Screenshot saved: tasksets-01-landing-${timestamp}.png`);
      console.log(`📍 Current URL: ${page.url()}`);

      // Step 2: Authenticate if redirected to sign-in
      console.log('\n🔐 Step 2: Checking if authentication is needed...');
      const currentUrl = page.url();

      if (currentUrl.includes('sign-in') || currentUrl.includes('login')) {
        console.log('🔐 Sign-in page detected, authenticating...');

        await page.screenshot({
          path: `/home/ygupta/workspace/iofold/frontend/e2e-screenshots/tasksets-02a-signin-page-${timestamp}.png`,
          fullPage: true
        });

        // Fill in email
        const emailInput = page.locator('input[type="email"], input[name="identifier"], input[name="email"]').first();
        await emailInput.waitFor({ state: 'visible', timeout: 10000 });
        await emailInput.fill(TEST_EMAIL);
        console.log('✅ Email filled');

        // Click continue
        const continueButton = page.locator('button:has-text("Continue"), button[type="submit"]').first();
        await continueButton.click();
        await page.waitForTimeout(2000);

        await page.screenshot({
          path: `/home/ygupta/workspace/iofold/frontend/e2e-screenshots/tasksets-02b-after-email-${timestamp}.png`,
          fullPage: true
        });

        // Fill in password
        const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
        await passwordInput.waitFor({ state: 'visible', timeout: 10000 });
        await passwordInput.fill(TEST_PASSWORD);
        console.log('✅ Password filled');

        // Submit
        const submitButton = page.locator('button:has-text("Continue"), button:has-text("Sign in"), button[type="submit"]').first();
        await submitButton.click();
        await page.waitForTimeout(3000);

        await page.screenshot({
          path: `/home/ygupta/workspace/iofold/frontend/e2e-screenshots/tasksets-02c-after-password-${timestamp}.png`,
          fullPage: true
        });

        // Check for OTP
        const otpInput = page.locator('input[name="code"], input[type="text"][inputmode="numeric"]').first();
        const otpVisible = await otpInput.isVisible({ timeout: 5000 }).catch(() => false);
        if (otpVisible) {
          console.log('🔐 OTP prompt detected, entering code...');
          await otpInput.fill(TEST_OTP);

          const otpSubmit = page.locator('button:has-text("Continue"), button[type="submit"]').first();
          await otpSubmit.click();
          await page.waitForTimeout(3000);

          await page.screenshot({
            path: `/home/ygupta/workspace/iofold/frontend/e2e-screenshots/tasksets-02d-after-otp-${timestamp}.png`,
            fullPage: true
          });
          console.log('✅ OTP submitted');
        }

        // Wait for redirect
        await page.waitForTimeout(5000);
        console.log(`✅ Authenticated, current URL: ${page.url()}`);
      } else {
        console.log('✅ Already authenticated or no sign-in required');
      }

      await page.screenshot({
        path: `/home/ygupta/workspace/iofold/frontend/e2e-screenshots/tasksets-02e-authenticated-${timestamp}.png`,
        fullPage: true
      });

      // Step 3: Navigate to agents page
      console.log('\n🤖 Step 3: Navigating to agents page...');
      await page.goto(`${STAGING_URL}/agents`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(2000);

      await page.screenshot({
        path: `/home/ygupta/workspace/iofold/frontend/e2e-screenshots/tasksets-03a-agents-page-${timestamp}.png`,
        fullPage: true
      });
      console.log('✅ Agents page loaded');

      // Look for Art-E agent
      const agentLink = page.locator('a:has-text("Art-E"), a:has-text("Email Search")').first();
      const agentVisible = await agentLink.isVisible({ timeout: 5000 }).catch(() => false);

      if (agentVisible) {
        console.log('✅ Found Art-E agent link');
        await agentLink.click();
        await page.waitForTimeout(2000);
        console.log(`📍 Navigated to agent page: ${page.url()}`);
      } else {
        console.log('⚠️ Art-E agent not found, trying first agent...');
        const anyAgent = page.locator('a[href*="/agents/"]').first();
        const anyVisible = await anyAgent.isVisible({ timeout: 5000 }).catch(() => false);
        if (anyVisible) {
          await anyAgent.click();
          await page.waitForTimeout(2000);
          console.log(`📍 Navigated to first agent: ${page.url()}`);
        } else {
          console.log('❌ No agents found');
        }
      }

      await page.screenshot({
        path: `/home/ygupta/workspace/iofold/frontend/e2e-screenshots/tasksets-03b-agent-detail-${timestamp}.png`,
        fullPage: true
      });

      // Step 4: Navigate to Tasksets tab
      console.log('\n📋 Step 4: Looking for Tasksets tab...');
      const tasksetsTab = page.locator('a:has-text("Tasksets"), button:has-text("Tasksets"), [role="tab"]:has-text("Tasksets")').first();
      const tabVisible = await tasksetsTab.isVisible({ timeout: 5000 }).catch(() => false);

      if (tabVisible) {
        console.log('✅ Found Tasksets tab');
        await tasksetsTab.click();
        await page.waitForTimeout(2000);
        console.log(`📍 Tasksets tab clicked: ${page.url()}`);
      } else {
        console.log('⚠️ Tasksets tab not found, trying direct navigation...');
        const currentUrl = page.url();
        const agentId = currentUrl.match(/\/agents\/([^\/]+)/)?.[1];
        if (agentId) {
          await page.goto(`${STAGING_URL}/agents/${agentId}/tasksets`, { waitUntil: 'networkidle', timeout: 30000 });
          await page.waitForTimeout(2000);
          console.log(`📍 Navigated directly to tasksets: ${page.url()}`);
        }
      }

      await page.screenshot({
        path: `/home/ygupta/workspace/iofold/frontend/e2e-screenshots/tasksets-04-tasksets-tab-${timestamp}.png`,
        fullPage: true
      });

      // Step 5: Verify tasksets are listed
      console.log('\n📋 Step 5: Verifying tasksets list...');
      const tasksetItems = page.locator('[data-testid*="taskset"], .taskset-item, [class*="taskset"]');
      const count = await tasksetItems.count();
      console.log(`📊 Found ${count} taskset elements`);

      const artETaskset = page.locator(':has-text("ART-E"), :has-text("Art-E")');
      const artECount = await artETaskset.count();
      console.log(`📊 Found ${artECount} ART-E related elements`);

      const emptyState = page.locator(':has-text("No tasksets"), :has-text("no tasksets")');
      const isEmpty = await emptyState.isVisible({ timeout: 2000 }).catch(() => false);
      if (isEmpty) {
        console.log('⚠️ Empty state detected - no tasksets found');
      }

      await page.screenshot({
        path: `/home/ygupta/workspace/iofold/frontend/e2e-screenshots/tasksets-05-tasksets-list-${timestamp}.png`,
        fullPage: true
      });

      const bodyText = await page.locator('body').textContent();
      console.log('📄 Page content preview:', bodyText?.slice(0, 300));

      // Step 6: Click on a taskset
      console.log('\n🔍 Step 6: Attempting to click on a taskset...');
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
        const visible = await element.isVisible({ timeout: 2000 }).catch(() => false);
        if (visible) {
          console.log(`✅ Found taskset with selector: ${selector}`);
          await element.click();
          await page.waitForTimeout(2000);
          clicked = true;
          console.log(`📍 Clicked taskset: ${page.url()}`);
          break;
        }
      }

      if (!clicked) {
        console.log('⚠️ No clickable taskset found');
      }

      await page.screenshot({
        path: `/home/ygupta/workspace/iofold/frontend/e2e-screenshots/tasksets-06-taskset-detail-${timestamp}.png`,
        fullPage: true
      });

      // Step 7: Verify taskset detail content
      console.log('\n🔍 Step 7: Verifying taskset detail page...');
      const tasksSection = page.locator(':has-text("Tasks"), :has-text("tasks")').first();
      const hasTasksSection = await tasksSection.isVisible({ timeout: 5000 }).catch(() => false);
      console.log(`📋 Tasks section visible: ${hasTasksSection}`);

      const runHistorySection = page.locator(':has-text("Run History"), :has-text("Runs"), :has-text("history")').first();
      const hasRunHistory = await runHistorySection.isVisible({ timeout: 5000 }).catch(() => false);
      console.log(`📊 Run history section visible: ${hasRunHistory}`);

      const taskItems = page.locator('[data-testid*="task"], .task-item, li:has-text("task")');
      const taskCount = await taskItems.count();
      console.log(`📊 Found ${taskCount} task items`);

      const pageContent = await page.locator('body').textContent();
      const hasTaskKeyword = pageContent?.toLowerCase().includes('task');
      const hasRunKeyword = pageContent?.toLowerCase().includes('run');
      console.log(`📄 Page contains "task": ${hasTaskKeyword}, "run": ${hasRunKeyword}`);

      await page.screenshot({
        path: `/home/ygupta/workspace/iofold/frontend/e2e-screenshots/tasksets-07-detail-content-${timestamp}.png`,
        fullPage: true
      });

      // Step 8: Check for Run button
      console.log('\n🔍 Step 8: Looking for "Run Taskset" button...');
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
        const visible = await button.isVisible({ timeout: 2000 }).catch(() => false);
        if (visible) {
          console.log(`✅ Found button with selector: ${selector}`);
          const buttonText = await button.textContent();
          console.log(`📝 Button text: ${buttonText}`);
          const isEnabled = await button.isEnabled();
          console.log(`✅ Button enabled: ${isEnabled}`);
          buttonFound = true;
          break;
        }
      }

      if (!buttonFound) {
        console.log('⚠️ "Run Taskset" button not found');
        const allButtons = page.locator('button');
        const buttonCount = await allButtons.count();
        console.log(`📊 Total buttons on page: ${buttonCount}`);

        for (let i = 0; i < Math.min(buttonCount, 10); i++) {
          const btnText = await allButtons.nth(i).textContent();
          console.log(`  Button ${i + 1}: ${btnText?.trim()}`);
        }
      }

      await page.screenshot({
        path: `/home/ygupta/workspace/iofold/frontend/e2e-screenshots/tasksets-08-run-button-${timestamp}.png`,
        fullPage: true
      });

      // Step 9: Final screenshot
      console.log('\n📸 Step 9: Taking final screenshot...');
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(1000);

      await page.screenshot({
        path: `/home/ygupta/workspace/iofold/frontend/e2e-screenshots/tasksets-09-final-summary-${timestamp}.png`,
        fullPage: true
      });

      console.log('\n✅ Test suite completed successfully');
      console.log(`📍 Final URL: ${page.url()}`);

    } catch (error) {
      console.error('❌ Test failed with error:', error);
      await page.screenshot({
        path: `/home/ygupta/workspace/iofold/frontend/e2e-screenshots/tasksets-error-${timestamp}.png`,
        fullPage: true
      });
      throw error;
    } finally {
      await browser.close();
    }
  });
});
