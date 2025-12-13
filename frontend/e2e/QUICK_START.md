# Clerk E2E Testing - Quick Start Guide

## 🚀 30-Second Setup

### 1. Add credentials to `.env.local`

```bash
# Copy from .env.example
E2E_CLERK_USER_USERNAME=your-test-user@example.com
E2E_CLERK_USER_PASSWORD=YourTestPassword123!
PLAYWRIGHT_TEST_BASE_URL=https://platform.staging.iofold.com
```

### 2. Run tests

```bash
pnpm run test:e2e
```

### 3. See the magic ✨

First run:
```
🔐 Authenticating test user and saving auth state...
✅ Auth state saved successfully
```

Subsequent runs: **10x faster** (no re-authentication needed!)

---

## 📝 Writing Tests

### Default (Recommended)

```typescript
import { test, expect } from '@playwright/test'

test('my test', async ({ page }) => {
  // User is already authenticated!
  await page.goto('/dashboard')
  // Test your feature...
})
```

### With Auth Fixture

```typescript
import { test, signInTestUser } from './fixtures/clerk-auth'

test('auth flow', async ({ page }) => {
  await signInTestUser(page)
  // Test continues...
})
```

---

## 🔧 Common Commands

```bash
# Run all tests
pnpm run test:e2e

# Run with UI
pnpm run test:e2e:ui

# Run specific test
pnpm exec playwright test e2e/03-traces/trace-list.spec.ts

# Debug mode
pnpm run test:e2e:debug

# View report
pnpm run test:e2e:report
```

---

## 🐛 Troubleshooting

### Tests not using auth state?

```bash
# Delete and regenerate
rm -rf playwright/.auth
pnpm run test:e2e
```

### TypeScript errors?

```bash
# Check compilation
pnpm exec tsc --noEmit
```

### Need test user?

```bash
# Create one
pnpm exec tsx scripts/create-e2e-test-user.ts
```

---

## 📚 More Info

- **Full docs:** [CLERK_TESTING_SETUP.md](./CLERK_TESTING_SETUP.md)
- **Implementation details:** [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md)
- **General E2E info:** [README.md](./README.md)

---

## 🎯 Key Benefits

| Before | After |
|--------|-------|
| 🐌 5-10s per test (auth each time) | ⚡ 0.1s per test (reuse session) |
| 🤖 CAPTCHA blocked tests | ✅ Testing Token bypasses CAPTCHA |
| 💔 Flaky auth failures | 💪 Reliable authentication |

---

**That's it!** You're ready to write fast, reliable E2E tests. 🎉
