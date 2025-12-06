# E2E Test Suite - iofold Platform

Comprehensive end-to-end tests for the eval set and eval generation/execution workflow.

## Quick Start

### Prerequisites

1. **Install Dependencies**:
```bash
pnpm install
npx playwright install chromium
```

2. **Set Environment Variables**:
```bash
# Required for eval generation
export ANTHROPIC_API_KEY="your-key-here"

# Required for trace import
export LANGFUSE_PUBLIC_KEY="your-key-here"
export LANGFUSE_SECRET_KEY="your-key-here"
export LANGFUSE_BASE_URL="https://cloud.langfuse.com"
```

3. **Start Backend and Frontend**:
```bash
# Terminal 1: Backend
pnpm run dev

# Terminal 2: Frontend
cd frontend && pnpm run dev
```

### Run Tests

```bash
# Run all eval set and eval tests
npx playwright test tests/e2e/04-eval-sets tests/e2e/05-evals --timeout=180000

# Run only API tests (fast, no UI dependencies)
npx playwright test tests/e2e/04-eval-sets/eval-set-api.spec.ts

# Run with visible browser (for debugging)
npx playwright test --headed

# Run specific test file
npx playwright test tests/e2e/05-evals/generate-eval.spec.ts

# View test report
npx playwright show-report
```

## Test Structure

```
tests/
├── e2e/
│   ├── 04-eval-sets/           # Eval set management tests
│   │   ├── create-eval-set.spec.ts     # TEST-ES01, TEST-ES06 (UI - blocked)
│   │   ├── eval-set-detail.spec.ts     # TEST-ES03, TEST-ES04 (UI - blocked)
│   │   └── eval-set-api.spec.ts        # API tests (working)
│   ├── 05-evals/               # Eval generation & execution tests
│   │   ├── generate-eval.spec.ts       # TEST-E01, TEST-E02 (blocked)
│   │   ├── execute-eval.spec.ts        # TEST-E03, TEST-E04 (blocked)
│   │   └── eval-results.spec.ts        # TEST-E05, TEST-E06 (blocked)
│   └── utils/
│       └── helpers.ts          # Reusable test utilities
├── fixtures/                   # Test data fixtures
│   ├── integrations.ts
│   ├── traces.ts
│   └── eval-sets.ts
└── README.md                   # This file
```

## Test Coverage

### Eval Set Tests (4 tests)

| Test ID | Description | Status | File |
|---------|-------------|--------|------|
| TEST-ES01 | Create eval set (UI) | ❌ Blocked | create-eval-set.spec.ts |
| TEST-ES01-API | Create eval set (API) | ✅ Pass | eval-set-api.spec.ts |
| TEST-ES03 | View eval set detail | ❌ Blocked | eval-set-detail.spec.ts |
| TEST-ES04 | Feedback summary | ❌ Blocked | eval-set-detail.spec.ts |
| TEST-ES06 | Delete eval set (UI) | ❌ Blocked | create-eval-set.spec.ts |
| TEST-ES06-API | Delete eval set (API) | ✅ Pass | eval-set-api.spec.ts |

### Eval Generation & Execution Tests (4 tests)

| Test ID | Description | Runtime | Status | File |
|---------|-------------|---------|--------|------|
| TEST-E01 | Generate eval | 60-90s | ❌ Blocked | generate-eval.spec.ts |
| TEST-E02 | Insufficient feedback error | 10s | ❌ Blocked | generate-eval.spec.ts |
| TEST-E03 | View eval code | 15s | ❌ Blocked | execute-eval.spec.ts |
| TEST-E04 | Execute eval | 30-45s | ❌ Blocked | execute-eval.spec.ts |
| TEST-E05 | View execution results | 20s | ❌ Blocked | eval-results.spec.ts |
| TEST-E06 | Contradiction detection | 30s | ❌ Blocked | eval-results.spec.ts |

**Status**: 2/11 tests passing (API tests only)
**Blocking Issue**: BUG-CRITICAL-001 (Eval Sets page crashes)

## Known Issues

### CRITICAL BUGS (Blocking All Tests)

**BUG-CRITICAL-001**: Eval Sets page crashes with "Page error"
- **Impact**: Cannot view eval sets list
- **Status**: Must fix immediately
- **Location**: `/frontend/app/eval-sets/page.tsx`

**BUG-CRITICAL-002**: Create Eval Set modal not implemented
- **Impact**: Cannot create eval sets via UI
- **Workaround**: Use API directly
- **Location**: `/frontend/app/eval-sets/page.tsx` line 29-32

**BUG-CRITICAL-003**: Delete Eval Set functionality not implemented
- **Impact**: Cannot delete eval sets via UI
- **Workaround**: Use API directly
- **Location**: `/frontend/app/eval-sets/page.tsx`

See `EVAL_WORKFLOW_BUGS.md` for detailed bug reports and fix instructions.

## Test Helpers

### API Request Helper
```typescript
import { apiRequest } from '../utils/helpers';

const evalSet = await apiRequest<any>(page, '/api/eval-sets', {
  method: 'POST',
  data: { name: 'My Eval Set' },
});
```

### Job Completion Helper
```typescript
import { waitForJobCompletion } from '../utils/helpers';

// Wait for long-running job (eval generation, trace import, etc.)
await waitForJobCompletion(page, jobId, { timeout: 120000 });
```

### Unique Name Generator
```typescript
import { uniqueName } from '../utils/helpers';

const name = uniqueName('Test Eval Set');
// Returns: "Test Eval Set 1731574800123"
```

## Test Fixtures

### Create Test Integration
```typescript
import { createTestIntegration, deleteTestIntegration } from '../../fixtures/integrations';

const integration = await createTestIntegration(page);
// ... test code ...
await deleteTestIntegration(page, integration.id);
```

### Import Test Traces
```typescript
import { importTestTraces, deleteTestTraces } from '../../fixtures/traces';

const traceIds = await importTestTraces(page, integrationId, { limit: 10 });
// ... test code ...
await deleteTestTraces(page, traceIds);
```

### Create Test Eval Set
```typescript
import { createTestEvalSet, deleteTestEvalSet, addTracesToEvalSet } from '../../fixtures/eval-sets';

const evalSet = await createTestEvalSet(page, { name: 'My Eval Set' });
await addTracesToEvalSet(page, evalSet.id, traceIds, ['positive', 'negative']);
// ... test code ...
await deleteTestEvalSet(page, evalSet.id);
```

## Configuration

### Playwright Config (`/playwright.config.ts`)

- **Timeout**: 180 seconds (3 minutes) per test
- **Workers**: 4 parallel workers
- **Browser**: Chromium (headless by default)
- **Retries**: 2 on CI, 0 locally
- **Base URL**: `http://localhost:3000`
- **API URL**: `http://localhost:8787/v1`

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | For eval generation (AI calls) |
| `LANGFUSE_PUBLIC_KEY` | Yes | For trace import |
| `LANGFUSE_SECRET_KEY` | Yes | For trace import |
| `LANGFUSE_BASE_URL` | No | Defaults to `https://cloud.langfuse.com` |
| `BASE_URL` | No | Frontend URL (default: `http://localhost:3000`) |
| `API_URL` | No | Backend URL (default: `http://localhost:8787/v1`) |

## Debugging Tests

### View Test Trace
```bash
# Run test with trace
npx playwright test --trace on

# View trace
npx playwright show-trace trace.zip
```

### View Screenshots
After test failure, screenshots are saved to:
```
test-results/<test-name>/test-failed-1.png
```

### View Videos
After test failure, videos are saved to:
```
test-results/<test-name>/video.webm
```

### Run in Debug Mode
```bash
npx playwright test --debug
```

## Best Practices

### 1. Test Isolation
Each test creates its own data with unique names:
```typescript
const name = uniqueName('Test Eval Set'); // Ensures no conflicts
```

### 2. Cleanup
Always cleanup in `afterEach` hook:
```typescript
test.afterEach(async ({ page }) => {
  if (createdId) await deleteResource(page, createdId);
});
```

### 3. Flexible Selectors
Use multiple selector strategies:
```typescript
await page.click('button:has-text("Create"), button[type="submit"]');
```

### 4. Timeouts
Use appropriate timeouts for long operations:
```typescript
// Eval generation takes 60-90 seconds
await waitForJobCompletion(page, jobId, { timeout: 120000 });
```

### 5. API vs UI
When UI is broken, test via API:
```typescript
// Instead of clicking "Create" button
const evalSet = await apiRequest(page, '/api/eval-sets', {
  method: 'POST',
  data: { name: 'Test' },
});
```

## CI/CD Integration

### GitHub Actions Example
```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 18
      - run: pnpm install --frozen-lockfile
      - run: npx playwright install --with-deps chromium
      - run: pnpm run dev &
      - run: cd frontend && pnpm run dev &
      - run: npx playwright test
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          LANGFUSE_PUBLIC_KEY: ${{ secrets.LANGFUSE_PUBLIC_KEY }}
          LANGFUSE_SECRET_KEY: ${{ secrets.LANGFUSE_SECRET_KEY }}
```

## Troubleshooting

### Tests Timeout
- Increase timeout in `playwright.config.ts`
- Check if backend/frontend are running
- Check network connectivity

### API Key Errors
```bash
Error: ANTHROPIC_API_KEY environment variable is required
```
Solution: Set API key in `.env` file or environment

### Page Crashes
```
Page error: The page encountered an unexpected error
```
Solution: Check browser console logs, fix frontend bugs

### Job Completion Timeouts
```
Job did not complete within 120000ms
```
Solution: Increase timeout or check job worker is processing jobs

## Next Steps

1. **Fix BUG-CRITICAL-001** (Eval Sets page crash) - URGENT
2. **Implement BUG-CRITICAL-002** (Create Eval Set modal) - HIGH
3. **Add BUG-CRITICAL-003** (Delete functionality) - MEDIUM
4. Run all tests and verify they pass
5. Add smoke tests for basic navigation
6. Set up CI/CD pipeline

## Resources

- [Playwright Documentation](https://playwright.dev/)
- [Testing Best Practices](https://playwright.dev/docs/best-practices)
- [iofold Design Doc](../docs/2025-11-05-iofold-auto-evals-design.md)
- [E2E Testing Plan](../docs/E2E_TESTING_PLAN.md)
- [Bug Report](../EVAL_WORKFLOW_BUGS.md)
- [Test Execution Report](../TEST_EXECUTION_REPORT.md)

---

**Last Updated**: 2025-11-14
**Test Suite Version**: 1.0
**Status**: Blocked by UI bugs (2/11 tests passing)
