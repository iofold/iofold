# Testing Guide

Comprehensive testing guide for the iofold platform covering E2E testing with Playwright, unit testing with Vitest, and API testing patterns.

## Table of Contents

1. [E2E Testing with Playwright + Clerk](#e2e-testing-with-playwright--clerk)
2. [Unit Testing with Vitest](#unit-testing-with-vitest)
3. [API Testing](#api-testing)

---

## E2E Testing with Playwright + Clerk

### Quick Start

```bash
# From frontend directory
cd frontend

# Run all E2E tests
pnpm test:e2e

# Run with UI mode (recommended for development)
pnpm test:e2e:ui

# Run with browser visible (headed mode)
pnpm test:e2e:headed

# Run with debugger
pnpm test:e2e:debug

# Run only accessibility tests
pnpm test:e2e:accessibility

# View last test report
pnpm test:e2e:report
```

### Environment Configuration

Create `frontend/.env.local` with the following variables:

```bash
# Clerk E2E Testing Credentials
E2E_CLERK_USER_USERNAME=e2e+clerk_test@iofold.com
E2E_CLERK_USER_PASSWORD=YourSecurePassword123!

# Optional: Test against local instead of staging
USE_STAGING=false  # defaults to true
BASE_URL=http://localhost:3000  # only needed if USE_STAGING=false

# Optional: Control parallel test execution
WORKERS=4  # default: 4 locally, 1 in CI
```

**IMPORTANT**: The test user email MUST use the `+clerk_test` suffix to enable automatic OTP verification with code `424242` in Clerk development mode.

### Authentication Setup

#### Clerk Testing Token (Bypasses Turnstile CAPTCHA)

The project uses Clerk's official testing utilities to bypass bot detection:

1. **Global Setup** (`frontend/e2e/global.setup.ts`): Obtains a Testing Token once at suite startup
2. **Auto-fixture** (`frontend/e2e/fixtures/clerk-auth.ts`): Automatically applies the token to all tests

```typescript
// The fixture is already configured - no additional setup needed in tests!
import { test, expect } from './fixtures/clerk-auth'

test('my test', async ({ page }) => {
  // Testing token is automatically applied
  await page.goto('/dashboard')
})
```

#### Manual Sign-In for Tests

Use the `signInTestUser` helper for tests that require authenticated state:

```typescript
import { test, expect, signInTestUser } from './fixtures/clerk-auth'

test('authenticated flow', async ({ page }) => {
  await signInTestUser(page)

  // Now you're authenticated!
  await page.goto('/traces')
  await expect(page.locator('h1')).toContainText('Traces')
})
```

#### OTP Verification (Device Verification)

When Clerk requires device verification, tests automatically handle the OTP flow using code `424242`:

```typescript
// This happens automatically in signInTestUser helper
// The test user must use +clerk_test suffix for 424242 to work
const TEST_EMAIL = 'e2e+clerk_test@iofold.com'
const DEV_OTP_CODE = '424242' // Clerk dev mode magic code
```

### Writing Tests

#### Basic Test Structure

```typescript
import { test, expect } from '@playwright/test'

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/your-page')
    await page.waitForLoadState('networkidle')
  })

  test('should do something', async ({ page }) => {
    // Arrange
    const button = page.locator('button:has-text("Submit")')

    // Act
    await button.click()

    // Assert
    await expect(page.locator('.success-message')).toBeVisible()
  })
})
```

#### Authenticated Test Example

```typescript
import { test, expect, signInTestUser } from './fixtures/clerk-auth'

test.describe('Protected Routes', () => {
  test.beforeEach(async ({ page }) => {
    // Sign in once per test
    await signInTestUser(page)
  })

  test('should access traces page', async ({ page }) => {
    await page.goto('/traces')
    await expect(page.locator('h1:has-text("Traces")')).toBeVisible()
  })
})
```

#### Testing with Shadcn/ui Components

Many UI components use Radix UI primitives. Use role-based selectors:

```typescript
// Select dropdowns
await page.click('#status-filter')
await page.waitForSelector('[role="listbox"]', { state: 'visible' })
await page.getByRole('option', { name: 'Error' }).click()

// Dialogs/modals
await expect(page.locator('[role="dialog"]')).toBeVisible()
await expect(page.locator('text=Trace Details')).toBeVisible()

// Close with Escape key
await page.keyboard.press('Escape')
```

#### Handling Checkboxes

Use keyboard interaction to avoid triggering row click events:

```typescript
// Focus and activate checkbox with Space
const checkboxInput = page.locator('tbody tr').first().locator('input[type="checkbox"]')
await checkboxInput.focus()
await page.keyboard.press('Space')

// Verify selection
await expect(page.locator('text=/\\d+ rows? selected/')).toBeVisible()
```

### Test Organization

```
frontend/e2e/
├── fixtures/
│   └── clerk-auth.ts          # Clerk auth helpers and fixtures
├── global.setup.ts             # Clerk testing token setup
├── 01-auth/                    # Authentication tests
├── 02-dashboard/               # Dashboard tests
├── 03-traces/                  # Trace management tests
│   ├── trace-list.spec.ts
│   └── import-traces.spec.ts
├── 04-review/                  # Review workflow tests
├── 05-playground/              # Playground tests
├── 06-evals/                   # Eval generation tests
└── 07-accessibility/           # Accessibility tests
```

### Troubleshooting

| Issue | Solution |
|-------|----------|
| **Turnstile CAPTCHA blocking tests** | Ensure `global.setup.ts` runs first and `clerk-setup` project dependency is configured |
| **OTP verification failing** | Verify test email uses `+clerk_test` suffix and code is `424242` |
| **"Missing E2E_CLERK_USER_USERNAME"** | Add credentials to `frontend/.env.local` |
| **Tests timing out on CI** | Increase `retries: 2` in `playwright.config.ts` (already configured) |
| **Hydration warnings** | Use `suppressHydrationWarning` on timestamp/date elements (see `trace-list.spec.ts`) |
| **Element not clickable** | Wait for animations: `await page.waitForTimeout(500)` or use `{ force: true }` |
| **Select dropdown not opening** | Use `waitForSelector('[role="listbox"]')` after clicking trigger |
| **Clerk redirects during sign-in** | Check `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` in `.env.local` |

### Configuration Reference

Key settings in `frontend/playwright.config.ts`:

```typescript
{
  testDir: './e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 1,
  workers: process.env.WORKERS ? parseInt(process.env.WORKERS) : 4,
  use: {
    baseURL: process.env.BASE_URL || 'https://platform.staging.iofold.com',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'clerk-setup', testMatch: /global\.setup\.ts/ },
    { name: 'chromium', dependencies: ['clerk-setup'] },
    { name: 'firefox', dependencies: ['clerk-setup'] },
    { name: 'webkit', dependencies: ['clerk-setup'] },
  ],
}
```

---

## Unit Testing with Vitest

### Quick Start

```bash
# From project root
pnpm test            # Run all unit tests
pnpm test:watch      # Run in watch mode (if configured)
vitest run           # Direct vitest command
vitest run --coverage # Generate coverage report
```

### Configuration

Tests are configured in `vitest.config.ts`:

```typescript
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    exclude: [
      'tests/e2e/**',
      'node_modules/**',
      'frontend/**',
      '.tmp/**',
    ],
    globals: true,
    environment: 'node',
  },
})
```

### Writing Unit Tests

#### Basic Test Structure

```typescript
import { describe, it, expect } from 'vitest'
import { CostTracker } from './cost-tracker'

describe('CostTracker', () => {
  describe('calculateCost', () => {
    it('should calculate cost for Claude Sonnet 4.5 correctly', () => {
      const result = CostTracker.calculateCost({
        model: 'anthropic/claude-sonnet-4-5',
        promptTokens: 1000,
        completionTokens: 500
      })

      expect(result.totalTokens).toBe(1500)
      expect(result.estimatedCostUSD).toBeCloseTo(0.0105, 4)
    })

    it('should throw error for unknown model', () => {
      expect(() => {
        CostTracker.calculateCost({
          model: 'unknown-model',
          promptTokens: 1000,
          completionTokens: 500
        })
      }).toThrow('Unknown model: unknown-model')
    })
  })
})
```

### Mock Patterns

#### Mocking Cloudflare Sandbox

```typescript
import { vi, describe, it, expect } from 'vitest'

vi.mock('@cloudflare/sandbox', async () => {
  const { getMockSandbox, mockSandboxBinding } = await import(
    '../sandbox/__mocks__/sandbox-mock'
  )
  return {
    getSandbox: getMockSandbox,
    Sandbox: {},
    SandboxBinding: mockSandboxBinding,
  }
})

describe('PythonRunner', () => {
  it('should execute Python code', async () => {
    const runner = new PythonRunner(env.SANDBOX as any)
    const result = await runner.execute('print("hello")')

    expect(result.success).toBe(true)
    expect(result.stdout).toContain('hello')
  })
})
```

The mock sandbox (`src/sandbox/__mocks__/sandbox-mock.ts`) uses Node.js `child_process` to execute Python locally during tests.

#### Mocking D1 Database

```typescript
import { vi } from 'vitest'

// Mock D1Database interface
const mockD1 = {
  prepare: vi.fn().mockReturnValue({
    bind: vi.fn().mockReturnThis(),
    all: vi.fn().mockResolvedValue({ results: [], success: true }),
    run: vi.fn().mockResolvedValue({ success: true }),
    first: vi.fn().mockResolvedValue(null),
  }),
  batch: vi.fn().mockResolvedValue([]),
  exec: vi.fn().mockResolvedValue({ success: true }),
}

describe('DatabaseService', () => {
  it('should query database', async () => {
    const service = new DatabaseService(mockD1 as any)
    const results = await service.findTraces()

    expect(mockD1.prepare).toHaveBeenCalledWith('SELECT * FROM traces')
  })
})
```

#### Mocking External APIs (Langfuse, OpenAI, Anthropic)

```typescript
import { vi } from 'vitest'

// Mock Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          id: 'msg_123',
          content: [{ type: 'text', text: 'Mocked response' }],
          model: 'claude-sonnet-4-5',
          usage: { input_tokens: 100, output_tokens: 50 },
        }),
      },
    })),
  }
})

// Mock OpenAI SDK
vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: vi.fn().mockResolvedValue({
            choices: [{ message: { content: 'Mocked response' } }],
            usage: { prompt_tokens: 100, completion_tokens: 50 },
          }),
        },
      },
    })),
  }
})

// Mock LangChain models
vi.mock('@langchain/anthropic', () => ({
  ChatAnthropic: vi.fn().mockImplementation(() => ({
    invoke: vi.fn().mockResolvedValue({
      content: 'Mocked response',
      response_metadata: {
        usage: { input_tokens: 100, output_tokens: 50 },
      },
    }),
  })),
}))
```

#### Conditional Tests (Skip if API Keys Missing)

```typescript
import { describe, it, expect } from 'vitest'

const hasApiKeys = process.env.LANGFUSE_PUBLIC_KEY && process.env.LANGFUSE_SECRET_KEY

describe('LangfuseAdapter', () => {
  it('should instantiate with config', () => {
    const adapter = new LangfuseAdapter({
      publicKey: 'test-public-key',
      secretKey: 'test-secret-key',
      baseUrl: 'https://test.langfuse.com'
    })

    expect(adapter).toBeDefined()
  })

  // Skip integration test if API keys not available
  it.skipIf(!hasApiKeys)('should fetch traces from Langfuse', async () => {
    const adapter = new LangfuseAdapter({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
      secretKey: process.env.LANGFUSE_SECRET_KEY!,
    })

    const traces = await adapter.fetchTraces({ limit: 5 })
    expect(traces).toBeInstanceOf(Array)
    expect(traces.length).toBeGreaterThan(0)
  })
})
```

### Test Organization

```
src/
├── analytics/
│   └── cost-tracker.test.ts       # Cost calculation tests
├── adapters/
│   └── langfuse.test.ts           # Langfuse adapter tests
├── eval-generator/
│   ├── generator.test.ts          # Eval generation logic
│   └── tester.test.ts             # Eval testing with sandbox
├── jobs/
│   ├── agent-discovery-job.test.ts
│   ├── eval-generation-job.test.ts
│   └── prompt-evaluation-job.test.ts
├── playground/
│   ├── models/index.test.ts       # LLM model tests
│   └── tools/cloudflare-execute.test.ts
├── services/
│   ├── clustering-service.test.ts
│   └── eval/
│       ├── eval-context.test.ts
│       └── eval-runner.test.ts
└── sandbox/
    ├── python-runner.test.ts
    └── __mocks__/
        └── sandbox-mock.ts        # Mock implementation
```

### Coverage Gaps

Current areas with limited test coverage:

- **Frontend components**: No React component unit tests (only E2E)
- **API endpoints**: Limited direct endpoint testing (covered indirectly via E2E)
- **Database migrations**: Schema changes not automatically tested
- **Error boundary behavior**: Edge cases in error handling
- **Worker queue processing**: Limited integration testing for background jobs

To add coverage:

```bash
# Generate coverage report
vitest run --coverage

# View coverage in browser (requires @vitest/ui)
vitest --ui --coverage
```

---

## API Testing

### X-Workspace-Id Header Requirement

**All API requests MUST include the `X-Workspace-Id` header** for workspace isolation.

```bash
curl -X GET "http://localhost:8787/v1/traces" \
  -H "X-Workspace-Id: wks_abc123" \
  -H "Content-Type: application/json"
```

Missing this header will result in:

```json
{
  "error": {
    "code": "missing_workspace",
    "message": "Missing X-Workspace-Id header",
    "request_id": "req_1234567890_abc"
  }
}
```

### Common curl Examples

#### Health Check

```bash
curl -X GET "http://localhost:8787/health" \
  -H "X-Workspace-Id: wks_abc123"
```

Expected response:

```json
{
  "status": "healthy",
  "timestamp": "2025-12-10T10:30:00.000Z",
  "version": "0.1.0"
}
```

#### List Traces (Paginated)

```bash
curl -X GET "http://localhost:8787/v1/traces?limit=10" \
  -H "X-Workspace-Id: wks_abc123" \
  -H "Content-Type: application/json"
```

With cursor-based pagination:

```bash
curl -X GET "http://localhost:8787/v1/traces?limit=10&cursor=eyJ0aW1lc3RhbXAiOiIyMDI1..." \
  -H "X-Workspace-Id: wks_abc123"
```

#### Get Single Trace

```bash
curl -X GET "http://localhost:8787/v1/traces/trc_abc123" \
  -H "X-Workspace-Id: wks_abc123"
```

#### Submit Feedback

```bash
curl -X POST "http://localhost:8787/v1/feedback" \
  -H "X-Workspace-Id: wks_abc123" \
  -H "Content-Type: application/json" \
  -d '{
    "trace_id": "trc_abc123",
    "rating": 1,
    "comment": "Great response!"
  }'
```

#### Create Integration

```bash
curl -X POST "http://localhost:8787/v1/integrations" \
  -H "X-Workspace-Id: wks_abc123" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "langfuse",
    "name": "Production Langfuse",
    "config": {
      "publicKey": "pk-lf-...",
      "secretKey": "sk-lf-...",
      "baseUrl": "https://cloud.langfuse.com"
    }
  }'
```

#### Import Traces from Integration

```bash
curl -X POST "http://localhost:8787/v1/traces/import" \
  -H "X-Workspace-Id: wks_abc123" \
  -H "Content-Type: application/json" \
  -d '{
    "integration_id": "int_abc123",
    "limit": 100
  }'
```

#### Trigger Eval Generation Job

```bash
curl -X POST "http://localhost:8787/v1/jobs/eval-generation" \
  -H "X-Workspace-Id: wks_abc123" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "agt_abc123"
  }'
```

#### Playground Chat

```bash
curl -X POST "http://localhost:8787/v1/playground/chat" \
  -H "X-Workspace-Id: wks_abc123" \
  -H "Content-Type: application/json" \
  -d '{
    "agent_id": "agt_abc123",
    "message": "Hello, how are you?",
    "session_id": "ses_xyz789"
  }'
```

### Error Codes Reference

All errors follow this standard format:

```json
{
  "error": {
    "code": "error_code",
    "message": "Human-readable error message",
    "details": { /* optional additional context */ },
    "request_id": "req_1234567890_abc"
  }
}
```

#### Common Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `missing_workspace` | 400 | Missing `X-Workspace-Id` header |
| `invalid_request` | 400 | Malformed request body or parameters |
| `not_found` | 404 | Resource not found (trace, agent, etc.) |
| `integration_error` | 500 | External integration failed (Langfuse, OpenAI) |
| `database_error` | 500 | D1 database operation failed |
| `sandbox_error` | 500 | Python sandbox execution failed |
| `invalid_cursor` | 400 | Invalid pagination cursor |
| `rate_limit_exceeded` | 429 | Too many requests |
| `unauthorized` | 401 | Invalid or missing authentication |

#### Example Error Responses

**Missing Workspace ID:**

```json
{
  "error": {
    "code": "missing_workspace",
    "message": "Missing X-Workspace-Id header",
    "request_id": "req_1702394829_x7k"
  }
}
```

**Resource Not Found:**

```json
{
  "error": {
    "code": "not_found",
    "message": "Trace not found: trc_invalid",
    "request_id": "req_1702394830_y8m"
  }
}
```

**Invalid Request Body:**

```json
{
  "error": {
    "code": "invalid_request",
    "message": "Invalid JSON in request body",
    "request_id": "req_1702394831_z9n"
  }
}
```

**Integration Error (Langfuse):**

```json
{
  "error": {
    "code": "integration_error",
    "message": "Failed to fetch traces from Langfuse",
    "details": {
      "integration_id": "int_abc123",
      "provider": "langfuse",
      "underlying_error": "Invalid API key"
    },
    "request_id": "req_1702394832_a1p"
  }
}
```

**Sandbox Execution Error:**

```json
{
  "error": {
    "code": "sandbox_error",
    "message": "Python execution failed",
    "details": {
      "eval_id": "evl_abc123",
      "stderr": "ImportError: No module named 'pandas'",
      "exit_code": 1
    },
    "request_id": "req_1702394833_b2q"
  }
}
```

### Testing API with Scripts

Create test scripts in `.tmp/` directory:

```bash
# .tmp/test-api.sh
#!/bin/bash

API_URL="http://localhost:8787/v1"
WORKSPACE_ID="wks_test123"

# Test health endpoint
echo "Testing health endpoint..."
curl -s -X GET "$API_URL/../health" \
  -H "X-Workspace-Id: $WORKSPACE_ID" | jq

# Test traces list
echo -e "\nTesting traces list..."
curl -s -X GET "$API_URL/traces?limit=5" \
  -H "X-Workspace-Id: $WORKSPACE_ID" | jq

# Test trace creation
echo -e "\nCreating test trace..."
curl -s -X POST "$API_URL/traces" \
  -H "X-Workspace-Id: $WORKSPACE_ID" \
  -H "Content-Type: application/json" \
  -d '{
    "trace_id": "trc_test_'$(date +%s)'",
    "input": "Test input",
    "output": "Test output",
    "status": "success",
    "metadata": {}
  }' | jq
```

Make it executable and run:

```bash
chmod +x .tmp/test-api.sh
./.tmp/test-api.sh
```

---

## Best Practices

### General Testing Principles

1. **Test pyramid**: Many unit tests, fewer integration tests, minimal E2E tests
2. **Isolation**: Each test should be independent and not rely on others
3. **Descriptive names**: Use clear, behavior-focused test names
4. **Arrange-Act-Assert**: Structure tests consistently
5. **Mock external dependencies**: Don't hit real APIs in unit tests
6. **Use fixtures**: Share common setup via fixtures and beforeEach hooks

### E2E Testing Best Practices

- Wait for network idle before assertions: `await page.waitForLoadState('networkidle')`
- Use role-based selectors for accessibility: `getByRole('button', { name: 'Submit' })`
- Avoid hardcoded waits unless necessary: prefer `waitForSelector` over `waitForTimeout`
- Test user flows, not implementation details
- Keep tests focused on one feature/behavior per test
- Use Page Object Model for complex pages

### Unit Testing Best Practices

- Test public interfaces, not private methods
- Use descriptive test names that explain behavior
- Group related tests with `describe` blocks
- Mock at the boundary (external APIs, database, filesystem)
- Test edge cases and error conditions
- Keep tests fast (< 100ms per test ideally)

### API Testing Best Practices

- Always include `X-Workspace-Id` header
- Test both success and error cases
- Validate response structure and status codes
- Use meaningful test data (avoid "test", "foo", "bar")
- Clean up created resources after tests
- Use environment variables for API URLs and credentials

---

## Resources

### Documentation References

- [Playwright Documentation](https://playwright.dev/docs/intro)
- [Clerk Playwright Testing](https://clerk.com/docs/testing/playwright)
- [Vitest Documentation](https://vitest.dev/guide/)
- [Cloudflare Workers Testing](https://developers.cloudflare.com/workers/testing/)

### Project-Specific Files

- `frontend/e2e/fixtures/clerk-auth.ts` - Clerk authentication helpers
- `frontend/playwright.config.ts` - Playwright configuration
- `vitest.config.ts` - Vitest configuration
- `src/sandbox/__mocks__/sandbox-mock.ts` - Sandbox mock implementation
- `src/api/utils.ts` - API error handling utilities

### Useful Commands

```bash
# Run all tests (unit + E2E)
pnpm test && cd frontend && pnpm test:e2e

# Generate coverage
vitest run --coverage

# Debug failing E2E test
cd frontend && pnpm test:e2e:debug -- e2e/03-traces/trace-list.spec.ts

# Run specific test file
vitest run src/analytics/cost-tracker.test.ts

# Update Playwright browsers
cd frontend && pnpm exec playwright install
```

---

## Contributing

When adding new tests:

1. Follow existing test organization structure
2. Use the appropriate test type (unit vs E2E)
3. Add mock patterns to this guide if creating new ones
4. Update troubleshooting section with common issues
5. Document any new environment variables needed

---

Last updated: 2025-12-10
