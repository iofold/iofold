# Clerk Testing Setup for E2E Tests

This document explains how Clerk authentication works in our E2E test suite and how to write tests that use it.

## Table of Contents

1. [Overview](#overview)
2. [Required Environment Variables](#required-environment-variables)
3. [How It Works](#how-it-works)
4. [Writing New Tests](#writing-new-tests)
5. [Running Tests](#running-tests)
6. [Troubleshooting](#troubleshooting)
7. [Best Practices](#best-practices)
8. [Advanced Usage](#advanced-usage)

---

## Overview

### How Clerk Authentication Works in E2E Tests

The E2E test suite uses Clerk's official testing utilities (`@clerk/testing/playwright`) to handle authentication. This setup provides three key benefits:

1. **Clerk Testing Tokens** - Bypasses bot detection (Turnstile/CAPTCHA) during tests using `clerkSetup()`
2. **Authentication State Persistence** - Saves authenticated user state to `playwright/.auth/user.json` so tests don't need to sign in repeatedly
3. **Automatic Auth Loading** - All tests automatically load the saved auth state via `playwright.config.ts`

### Key Components

| Component | Purpose |
|-----------|---------|
| `e2e/global.setup.ts` | Runs before all tests to initialize Clerk testing token and authenticate test user |
| `playwright.config.ts` | Configures the `clerk-setup` project as a dependency and loads stored auth state |
| `playwright/.auth/user.json` | Stores authenticated session (cookies, local storage, etc.) |
| `e2e/fixtures/clerk-auth.ts` | Provides reusable authentication helpers for advanced test scenarios |

### How Tests Depend on clerk-setup Project

In `playwright.config.ts`, all test projects (chromium, firefox, webkit) have `dependencies: ['clerk-setup']`. This ensures:

1. The `clerk-setup` project runs first
2. It executes `global.setup.ts` which calls `clerkSetup()` and authenticates the test user
3. Auth state is saved to `playwright/.auth/user.json`
4. All subsequent tests automatically load this auth state

```typescript
// From playwright.config.ts
projects: [
  {
    name: 'clerk-setup',
    testMatch: /global\.setup\.ts/,
  },
  {
    name: 'chromium',
    use: { ...devices['Desktop Chrome'] },
    dependencies: ['clerk-setup'], // ← Runs AFTER clerk-setup
  },
  // ... other browsers also depend on clerk-setup
]
```

---

## Required Environment Variables

Add these to `.env.local` in the `frontend/` directory:

```bash
# E2E Testing - Test User Credentials
E2E_CLERK_USER_USERNAME=your-test-user@example.com
E2E_CLERK_USER_PASSWORD=YourTestPassword123!

# Optional: Base URL (defaults to staging)
# PLAYWRIGHT_TEST_BASE_URL=https://platform.staging.iofold.com
# BASE_URL=http://localhost:3000  # For local testing
```

### Important Notes

- These credentials must be for a **dedicated test user** in your Clerk instance
- Do **NOT** commit `.env.local` to version control (it's in `.gitignore`)
- The test user should exist in Clerk before running tests
- For CI/CD, set these as environment secrets

### Creating a Test User

If you don't have a test user, you can:

1. **Manual creation**: Sign up through your app's sign-up flow
2. **Clerk Dashboard**: Create user directly in [Clerk Dashboard](https://dashboard.clerk.com)
3. **Script** (if available): Run `pnpm exec tsx scripts/create-e2e-test-user.ts`

---

## How It Works

### Step-by-Step Authentication Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: Test Suite Starts                                      │
│ - Playwright loads playwright.config.ts                        │
│ - Detects clerk-setup project must run first                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 2: clerk-setup Project Runs                               │
│ - Executes e2e/global.setup.ts                                 │
│ - Calls clerkSetup() to obtain Clerk Testing Token             │
│ - Testing Token bypasses Turnstile/CAPTCHA for all tests       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 3: Test User Authentication                               │
│ - Reads E2E_CLERK_USER_USERNAME and E2E_CLERK_USER_PASSWORD    │
│ - Calls clerk.signIn() with password strategy                  │
│ - Waits for successful authentication and navigation           │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 4: Auth State Persistence                                 │
│ - Saves session to playwright/.auth/user.json                  │
│ - Includes cookies, localStorage, sessionStorage, etc.         │
│ - This file is reused by all tests                             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ STEP 5: All Other Tests Run                                    │
│ - Each test automatically loads playwright/.auth/user.json     │
│ - Tests start with user already authenticated                  │
│ - No need to sign in repeatedly = faster execution             │
└─────────────────────────────────────────────────────────────────┘
```

### What Happens in global.setup.ts

```typescript
// 1. Initialize Clerk Testing Token
setup('Initialize Clerk Testing Token', async ({}) => {
  await clerkSetup() // ← Bypasses CAPTCHA/Turnstile
})

// 2. Authenticate and save state
setup('Authenticate test user and save state', async ({ page, baseURL }) => {
  // Sign in using Clerk's testing utilities
  await clerk.signIn({
    page,
    signInParams: {
      strategy: 'password',
      identifier: process.env.E2E_CLERK_USER_USERNAME,
      password: process.env.E2E_CLERK_USER_PASSWORD,
    },
  })

  // Wait for successful auth
  await page.waitForURL(/\/(agents|$)/, { timeout: 15000 })

  // Save auth state for reuse
  await page.context().storageState({ path: authFile })
})
```

### What Happens in Your Tests

```typescript
// In playwright.config.ts, auth state is automatically loaded:
use: {
  baseURL: 'https://platform.staging.iofold.com',
  storageState: 'playwright/.auth/user.json', // ← Auto-loaded if exists
}
```

This means **every test starts with the user already authenticated** - you don't need to sign in manually!

---

## Writing New Tests

### DO's and DON'Ts

#### ✅ DO: Import from @playwright/test

```typescript
import { test, expect } from '@playwright/test'

test('my feature test', async ({ page }) => {
  // User is already authenticated!
  await page.goto('/protected-page')

  // Test your feature
  await expect(page.locator('h1')).toContainText('Protected Content')
})
```

#### ✅ DO: Navigate directly to protected pages

```typescript
test('should display traces', async ({ page }) => {
  // Just navigate - auth is pre-loaded
  await page.goto('/traces')

  // Wait for page content, NOT authentication UI
  await page.waitForSelector('h1:has-text("Traces Explorer")', { timeout: 10000 })

  // Continue with your test
})
```

#### ✅ DO: Wait for page content, not authentication UI

```typescript
test.beforeEach(async ({ page }) => {
  await page.goto('/agents')

  // Wait for actual page content
  await page.waitForSelector('h1', { timeout: 10000 })

  // NOT this: await page.waitForURL(/sign-in/)
  // NOT this: await clerk.signIn(...)
})
```

#### ❌ DON'T: Implement your own sign-in flow

```typescript
// ❌ WRONG - Don't do this in regular tests
test('should work', async ({ page }) => {
  await page.goto('/sign-in')
  await page.fill('[name="identifier"]', 'test@example.com')
  await page.fill('[name="password"]', 'password')
  await page.click('button[type="submit"]')
  // This is unnecessary - you're already authenticated!
})
```

#### ❌ DON'T: Try to handle OTP or email verification

```typescript
// ❌ WRONG - Don't do this
test('should work', async ({ page }) => {
  await page.fill('[name="code"]', '424242')
  // The Testing Token bypasses all verification steps
})
```

#### ❌ DON'T: Use clerk.signIn() in individual tests

```typescript
// ❌ WRONG - Only use in global.setup.ts or when explicitly testing auth flows
import { clerk } from '@clerk/testing/playwright'

test('regular feature test', async ({ page }) => {
  await clerk.signIn({ /* ... */ }) // ← Don't do this!
})
```

**Exception**: Only use `clerk.signIn()` when explicitly testing authentication flows or when using the clerk-auth fixture for advanced scenarios.

---

### Example Test Structure

Here's the recommended pattern for most tests:

```typescript
import { test, expect } from '@playwright/test'

test.describe('My Feature', () => {
  test.beforeEach(async ({ page }) => {
    // Just navigate - auth is already handled
    await page.goto('/my-feature-page')

    // Wait for page to load
    await page.waitForSelector('h1', { timeout: 10000 })
  })

  test('should display feature correctly', async ({ page }) => {
    // Test your feature
    await expect(page.locator('h1')).toContainText('My Feature')
    await expect(page.locator('[data-testid="feature-content"]')).toBeVisible()
  })

  test('should handle user interaction', async ({ page }) => {
    // Click buttons, fill forms, etc.
    await page.click('[data-testid="action-button"]')

    // Assert expected behavior
    await expect(page.locator('[data-testid="result"]')).toContainText('Success')
  })
})
```

### Real-World Example from the Codebase

From `e2e/03-traces/trace-list.spec.ts`:

```typescript
import { test, expect } from '@playwright/test'

test.describe('Traces List Page', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to traces page
    await page.goto('/traces')

    // Wait for the page to load
    await page.waitForSelector('h1:has-text("Traces Explorer")', { timeout: 10000 })
  })

  test('should display page header and title', async ({ page }) => {
    // Check page title
    await expect(page.locator('h1')).toContainText('Traces Explorer')

    // Check description
    await expect(page.locator('h1:has-text("Traces Explorer") + p')).toContainText(
      'Browse, filter, and analyze your AI agent traces'
    )
  })

  test('should display KPI cards', async ({ page }) => {
    // Wait for KPI cards to load
    await page.waitForSelector('text=Total Traces', { timeout: 5000 })

    // Check all KPI cards are present
    await expect(page.locator('text=Total Traces')).toBeVisible()
    await expect(page.locator('text=Reviewed')).toBeVisible()
    await expect(page.locator('text=Error Rate')).toBeVisible()
  })
})
```

Notice:
- No authentication code
- Direct navigation to protected route
- Waiting for page content, not auth UI
- Focus on testing the feature, not authentication

---

## Running Tests

### Run All Tests (Against Staging)

```bash
cd frontend
pnpm test:e2e
```

By default, tests run against staging: `https://platform.staging.iofold.com`

### Run Against Local Development Server

```bash
cd frontend
USE_STAGING=false pnpm test:e2e
```

This will test against `http://dev4:3000` (or localhost if configured)

### Run Specific Test File

```bash
cd frontend
pnpm exec playwright test e2e/03-traces/trace-list.spec.ts
```

### Run Only in Chrome

```bash
cd frontend
pnpm test:e2e --project=chromium
```

### Run in UI Mode (Interactive)

```bash
cd frontend
pnpm test:e2e:ui
```

This opens Playwright's UI mode where you can:
- See all tests
- Run tests individually
- Watch tests in real-time
- Debug with time-travel

### Run in Headed Mode (See Browser)

```bash
cd frontend
pnpm test:e2e:headed
```

### Debug Specific Test

```bash
cd frontend
pnpm test:e2e:debug
```

Or debug a specific test:

```bash
cd frontend
pnpm exec playwright test e2e/03-traces/trace-list.spec.ts --debug
```

### Run Tests by Name Pattern

```bash
cd frontend
pnpm exec playwright test -g "should display traces"
```

### Run Only Accessibility Tests

```bash
cd frontend
pnpm test:e2e:accessibility
```

### View Test Report

After running tests:

```bash
cd frontend
pnpm test:e2e:report
```

### All Available Test Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `test:e2e` | `playwright test` | Run all tests |
| `test:e2e:ui` | `playwright test --ui` | Run in UI mode |
| `test:e2e:accessibility` | `playwright test e2e/04-accessibility` | Run only accessibility tests |
| `test:e2e:headed` | `playwright test --headed` | Run with visible browser |
| `test:e2e:debug` | `playwright test --debug` | Run in debug mode |
| `test:e2e:report` | `playwright show-report` | View HTML report |

---

## Troubleshooting

### "Sign in required" Errors

**Symptoms:**
- Tests redirect to `/sign-in`
- Protected pages show "Access Denied"
- Auth state not persisting

**Solutions:**

1. **Check environment variables** - Ensure `.env.local` contains:
   ```bash
   E2E_CLERK_USER_USERNAME=your-test-user@example.com
   E2E_CLERK_USER_PASSWORD=YourTestPassword123!
   ```

2. **Verify test user exists** - Check [Clerk Dashboard](https://dashboard.clerk.com) to ensure the test user account exists and is active

3. **Delete stale auth state**:
   ```bash
   cd frontend
   rm -f playwright/.auth/user.json
   pnpm test:e2e
   ```

4. **Check global setup output** - Look for errors during the `clerk-setup` project:
   ```bash
   cd frontend
   pnpm exec playwright test --project=clerk-setup
   ```

5. **Run global setup manually**:
   ```bash
   cd frontend
   pnpm exec playwright test e2e/global.setup.ts
   ```

### Auth State Expired

**Symptoms:**
- Tests were working, now failing
- Session appears to be logged out
- Auth state file exists but doesn't work

**Solutions:**

1. **Regenerate auth state**:
   ```bash
   cd frontend
   rm -f playwright/.auth/user.json
   pnpm test:e2e
   ```

2. **Check session duration** - Clerk sessions may expire. If tests run infrequently, you may need to re-authenticate

3. **Force re-authentication** - Delete the auth file and let global setup recreate it

### Clerk CAPTCHA/Turnstile Errors

**Symptoms:**
- "Turnstile verification required"
- "Bot detection failed"
- CAPTCHA challenges during tests

**Solutions:**

1. **Ensure @clerk/testing is installed**:
   ```bash
   cd frontend
   pnpm install
   ```

2. **Verify clerkSetup() is called** - Check `e2e/global.setup.ts` contains:
   ```typescript
   import { clerkSetup } from '@clerk/testing/playwright'

   setup('Initialize Clerk Testing Token', async ({}) => {
     await clerkSetup()
   })
   ```

3. **Check clerk-setup dependency** - In `playwright.config.ts`, ensure test projects depend on `clerk-setup`:
   ```typescript
   projects: [
     { name: 'clerk-setup', testMatch: /global\.setup\.ts/ },
     { name: 'chromium', dependencies: ['clerk-setup'] },
   ]
   ```

4. **Clear Playwright cache**:
   ```bash
   cd frontend
   rm -rf playwright/.cache
   pnpm exec playwright install
   ```

### Tests Fail in CI but Pass Locally

**Symptoms:**
- Tests pass on your machine
- Tests fail in GitHub Actions or other CI

**Solutions:**

1. **Check CI environment variables** - Ensure secrets are set in your CI provider:
   - `E2E_CLERK_USER_USERNAME`
   - `E2E_CLERK_USER_PASSWORD`

2. **Check base URL** - CI may need explicit `BASE_URL`:
   ```yaml
   env:
     BASE_URL: https://platform.staging.iofold.com
   ```

3. **Increase timeouts** - CI may be slower:
   ```typescript
   test.beforeEach(async ({ page }) => {
     await page.goto('/traces')
     await page.waitForSelector('h1', { timeout: 30000 }) // Increased from 10000
   })
   ```

4. **Check retries** - `playwright.config.ts` should have:
   ```typescript
   retries: process.env.CI ? 2 : 1
   ```

### "Testing Token Not Found" Error

**Symptoms:**
- Error: "Clerk: Testing token not found"
- Tests fail immediately

**Solutions:**

1. **Verify @clerk/testing version**:
   ```bash
   cd frontend
   pnpm list @clerk/testing
   ```

2. **Reinstall dependencies**:
   ```bash
   cd frontend
   rm -rf node_modules pnpm-lock.yaml
   pnpm install
   ```

3. **Check import statement** - Ensure you're importing from `@clerk/testing/playwright`:
   ```typescript
   import { clerkSetup } from '@clerk/testing/playwright'
   ```

### Debugging Checklist

When tests fail, check in this order:

- [ ] `.env.local` contains correct credentials
- [ ] Test user exists in Clerk Dashboard
- [ ] `playwright/.auth/user.json` exists and is recent
- [ ] `clerk-setup` project runs successfully
- [ ] Base URL is correct for your environment
- [ ] Network connectivity to Clerk and your app
- [ ] Playwright browsers are installed
- [ ] No conflicting authentication in your app

---

## Best Practices

### 1. Use Persisted State for Speed

Most tests should rely on the persisted auth state:

```typescript
// ✅ GOOD - Fast, uses persisted state
import { test, expect } from '@playwright/test'

test('feature test', async ({ page }) => {
  await page.goto('/dashboard')
  await page.waitForSelector('h1', { timeout: 10000 })
  // Test continues...
})
```

Avoid re-authenticating unless necessary:

```typescript
// ❌ BAD - Unnecessary re-authentication slows down tests
import { clerk } from '@clerk/testing/playwright'

test('feature test', async ({ page }) => {
  await clerk.signIn({ /* ... */ }) // ← Don't do this!
  await page.goto('/dashboard')
})
```

### 2. Sign Out Only When Testing Auth Flows

Only sign out when explicitly testing authentication:

```typescript
// ✅ GOOD - Testing sign-in UI
import { signOutUser } from './fixtures/clerk-auth'

test('should show sign-in page to unauthenticated users', async ({ page }) => {
  await signOutUser(page)
  await page.goto('/sign-in')

  // Test sign-in form, validation, etc.
  await expect(page.locator('h1')).toContainText('Sign In')
})
```

```typescript
// ❌ BAD - Unnecessary sign out in regular test
test('should display dashboard', async ({ page }) => {
  await signOutUser(page) // ← Why?
  await signInTestUser(page) // ← Unnecessary!
  await page.goto('/dashboard')
})
```

### 3. Verify Auth State When It Matters

Always verify authentication when it's important for the test:

```typescript
test('should display user-specific content', async ({ page }) => {
  await page.goto('/dashboard')

  // Verify we're authenticated
  await expect(page.locator('[data-clerk-user-button]')).toBeVisible()

  // Now test user-specific features
  await expect(page.locator('[data-testid="user-name"]')).toContainText('Test User')
})
```

### 4. Use Descriptive Test Names

Make it clear what authentication state is expected:

```typescript
// ✅ GOOD - Clear intent
test('should redirect unauthenticated users to sign-in', async ({ page }) => {
  await signOutUser(page)
  await page.goto('/protected-page')
  await expect(page).toHaveURL(/sign-in/)
})

test('should show dashboard when authenticated', async ({ page }) => {
  // Uses persisted state - no explicit sign-in needed
  await page.goto('/dashboard')
  await expect(page.locator('h1')).toContainText('Dashboard')
})
```

### 5. Wait for Proper Page Load

Always wait for meaningful content, not just navigation:

```typescript
test('should display traces', async ({ page }) => {
  await page.goto('/traces')

  // ✅ GOOD - Wait for actual content
  await page.waitForSelector('h1:has-text("Traces Explorer")', { timeout: 10000 })

  // ❌ BAD - Too generic
  // await page.waitForLoadState('networkidle')

  // ❌ BAD - Assumes auth redirect
  // await page.waitForURL(/sign-in/)
})
```

### 6. Handle Loading States

Many pages have loading spinners or skeleton screens:

```typescript
test('should display agents list', async ({ page }) => {
  await page.goto('/agents')

  // Wait for page title
  await page.waitForSelector('h1', { timeout: 10000 })

  // Wait for loading to finish (if applicable)
  await page.waitForSelector('[data-testid="loading-spinner"]', {
    state: 'hidden',
    timeout: 5000
  }).catch(() => {
    // Spinner might not appear if data loads quickly
  })

  // Now test the content
  await expect(page.locator('[data-testid="agents-list"]')).toBeVisible()
})
```

### 7. Keep Tests Independent

Each test should work independently:

```typescript
// ✅ GOOD - Self-contained test
test('should filter traces by status', async ({ page }) => {
  await page.goto('/traces')
  await page.waitForSelector('h1', { timeout: 10000 })

  await page.click('[data-testid="status-filter"]')
  await page.click('text=Error')

  // Assert filtered results
  await expect(page.locator('[data-testid="trace-row"]')).toHaveCount(5)
})

// ❌ BAD - Depends on previous test state
test('should show error details', async ({ page }) => {
  // Assumes filter is still applied from previous test
  await page.click('[data-testid="trace-row"]:first-child')
})
```

---

## Advanced Usage

### Using Clerk Auth Fixture

For tests that need explicit authentication control:

```typescript
import { test, signInTestUser, signOutUser } from './fixtures/clerk-auth'

test('should handle sign-in flow', async ({ page }) => {
  // Start unauthenticated
  await signOutUser(page)

  // Navigate to sign-in page
  await page.goto('/sign-in')

  // Manually sign in (bypassing the global auth state)
  await signInTestUser(page)

  // Verify redirect to protected page
  await expect(page).toHaveURL(/\/(agents|dashboard)/)
})
```

### Testing Multiple User Roles

To test with different user roles, you can create multiple auth states:

```typescript
// In a custom setup file
import { test as setup, chromium } from '@playwright/test'
import { clerk } from '@clerk/testing/playwright'

setup('authenticate admin user', async ({}) => {
  const browser = await chromium.launch()
  const page = await browser.newPage()

  await clerk.signIn({
    page,
    signInParams: {
      strategy: 'password',
      identifier: process.env.E2E_ADMIN_USER_USERNAME!,
      password: process.env.E2E_ADMIN_USER_PASSWORD!,
    },
  })

  await page.context().storageState({ path: 'playwright/.auth/admin.json' })
  await browser.close()
})
```

Then use in tests:

```typescript
import { test, expect } from '@playwright/test'

// Override storage state for this test file
test.use({ storageState: 'playwright/.auth/admin.json' })

test('should show admin panel', async ({ page }) => {
  await page.goto('/admin')
  await expect(page.locator('h1')).toContainText('Admin Panel')
})
```

### Testing Concurrent Sessions

Test multiple users simultaneously:

```typescript
import { test, expect } from '@playwright/test'

test('should handle multiple users', async ({ browser }) => {
  // User 1 context
  const context1 = await browser.newContext({
    storageState: 'playwright/.auth/user1.json'
  })
  const page1 = await context1.newPage()

  // User 2 context
  const context2 = await browser.newContext({
    storageState: 'playwright/.auth/user2.json'
  })
  const page2 = await context2.newPage()

  // Test collaboration features
  await page1.goto('/workspace')
  await page2.goto('/workspace')

  // User 1 makes a change
  await page1.click('[data-testid="create-agent"]')

  // User 2 should see the change
  await page2.waitForSelector('[data-testid="agent-list-item"]')

  await context1.close()
  await context2.close()
})
```

### Custom Authentication Strategies

For testing other authentication methods:

```typescript
import { test, clerk } from './fixtures/clerk-auth'

test('should authenticate with email code', async ({ page }) => {
  await clerk.signIn({
    page,
    signInParams: {
      strategy: 'email_code',
      identifier: 'test@example.com',
    },
  })

  // In a real scenario, you'd need to handle the verification code
  // For testing, Clerk's Testing Token may bypass this
})
```

---

## Resources

- [Clerk Testing Documentation](https://clerk.com/docs/testing/playwright)
- [Playwright Authentication Guide](https://playwright.dev/docs/auth)
- [Playwright Storage State](https://playwright.dev/docs/auth#reuse-signed-in-state)
- [`@clerk/testing` Package](https://www.npmjs.com/package/@clerk/testing)
- [Clerk + Playwright Blog Post](https://clerk.com/blog/testing-clerk-nextjs)

---

## Quick Reference

### File Locations

```
frontend/
├── e2e/
│   ├── global.setup.ts           # Auth setup (runs first)
│   ├── fixtures/
│   │   └── clerk-auth.ts         # Auth helpers
│   └── [your-tests]/
│       └── *.spec.ts             # Your test files
├── playwright/
│   └── .auth/
│       └── user.json             # Saved auth state
├── playwright.config.ts          # Playwright config
└── .env.local                    # Environment variables (not committed)
```

### Environment Variables

```bash
# Required in .env.local
E2E_CLERK_USER_USERNAME=test@example.com
E2E_CLERK_USER_PASSWORD=TestPassword123!

# Optional
BASE_URL=https://platform.staging.iofold.com
USE_STAGING=true
```

### Common Commands

```bash
# Run all tests
pnpm test:e2e

# Run against local
USE_STAGING=false pnpm test:e2e

# Debug specific test
pnpm exec playwright test e2e/traces/trace-list.spec.ts --debug

# Regenerate auth state
rm -f playwright/.auth/user.json && pnpm test:e2e
```

### Test Template

```typescript
import { test, expect } from '@playwright/test'

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/your-page')
    await page.waitForSelector('h1', { timeout: 10000 })
  })

  test('should work correctly', async ({ page }) => {
    // Your test here
  })
})
```

---

## Support

For issues or questions:

1. Check the [Troubleshooting](#troubleshooting) section
2. Review [Clerk's testing documentation](https://clerk.com/docs/testing/playwright)
3. Check Playwright traces: `pnpm test:e2e:report`
4. Ask the team or open an issue

---

**Last Updated**: 2025-12-12
