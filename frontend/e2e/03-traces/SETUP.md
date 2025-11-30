# Quick Setup Guide for Traces E2E Tests

## Prerequisites

- Node.js installed
- Frontend dependencies installed (`npm install`)
- Development server running (`npm run dev`)

## Installation Steps

### 1. Install Playwright

```bash
cd frontend
npm install
```

This will install `@playwright/test` as a dev dependency (already added to package.json).

### 2. Install Browser Binaries

```bash
npx playwright install
```

This downloads Chromium, Firefox, and WebKit browsers for testing.

### 3. Verify Installation

```bash
npx playwright --version
```

Should output: `Version 1.48.2` (or similar)

## Running the Tests

### Quick Start

```bash
# Start dev server (in one terminal)
npm run dev

# Run all traces tests (in another terminal)
npx playwright test e2e/03-traces
```

### Recommended: UI Mode

Best for development and debugging:

```bash
npm run test:e2e:ui
```

Then select `03-traces` folder from the UI.

### Watch Mode

Run tests and re-run on file changes:

```bash
npx playwright test e2e/03-traces --watch
```

## Test Database Setup

### Option 1: Empty Database (Test Empty States)

```bash
# Clear database
npm run db:reset
```

Then run tests to verify empty state handling.

### Option 2: Seeded Database (Full Coverage)

```bash
# Seed with test data
npm run db:seed
```

This should create:
- Multiple traces with different statuses
- Traces with and without feedback
- Traces from different sources
- Traces with varying step counts

## Verifying Tests Work

### Run Single Test to Verify

```bash
npx playwright test -g "should display page header"
```

Should pass quickly if setup is correct.

### Check Test Report

After running tests:

```bash
npx playwright show-report
```

Opens HTML report with detailed results.

## Configuration

### Change Base URL

If running on different port:

```bash
BASE_URL=http://localhost:3001 npx playwright test
```

Or update `playwright.config.ts`:

```typescript
use: {
  baseURL: process.env.BASE_URL || 'http://localhost:3001',
}
```

### Change Timeout

For slower machines, increase timeout in `playwright.config.ts`:

```typescript
timeout: 60000, // 60 seconds per test
```

## Troubleshooting

### "Cannot find module @playwright/test"

```bash
npm install
npx playwright install
```

### "Target closed" or "Navigation timeout"

Dev server not running:
```bash
npm run dev
```

### "No tests found"

Wrong directory:
```bash
cd frontend
npx playwright test e2e/03-traces
```

### Tests fail with "Element not found"

API not responding or database empty:
1. Check API is running
2. Check database connection
3. Seed database with test data

### Hydration warnings in console

Expected - tests verify `suppressHydrationWarning` is working.
Should not cause test failures.

## Next Steps

1. Run full test suite: `npm run test:e2e`
2. Add more test data to database
3. Add data-testid attributes to components
4. Write additional tests for edge cases

## CI/CD Integration

Tests are CI-ready. In your CI config:

```yaml
- name: Install Playwright
  run: npx playwright install --with-deps

- name: Run E2E tests
  run: npm run test:e2e

- name: Upload test results
  uses: actions/upload-artifact@v3
  if: always()
  with:
    name: playwright-report
    path: playwright-report/
```

## Getting Help

- Check [Playwright docs](https://playwright.dev)
- View test output for specific errors
- Run with `--debug` flag for step-by-step execution
- Check main E2E README: `/frontend/e2e/README.md`
- Check traces tests README: `/frontend/e2e/03-traces/README.md`
