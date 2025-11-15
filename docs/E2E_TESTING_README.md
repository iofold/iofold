# E2E Testing Documentation - iofold Platform

**Complete testing strategy for automated end-to-end testing with Playwright**

---

## Overview

This documentation provides everything needed to implement comprehensive E2E testing for the iofold platform. The testing suite is designed for:

- **Fast execution**: < 5 minutes for full suite (48 tests)
- **Parallel execution**: 4 workers running concurrently
- **High coverage**: 85%+ of critical paths
- **Low maintenance**: Clear structure, reusable helpers
- **CI/CD ready**: GitHub Actions integration included

---

## Documentation Structure

### 1. **E2E_TESTING_PLAN.md** - Master Strategy Document
**Purpose**: Comprehensive testing plan with all use cases and edge cases

**Contents**:
- Testing strategy and objectives
- 48 detailed test scenarios organized by feature
- Test organization and file structure
- Edge cases and error scenarios
- Parallel execution strategy
- Success metrics and coverage goals

**Use this when**: Planning test coverage, understanding test requirements

**Key Sections**:
- Smoke tests (5 tests, 1 min)
- Integration management (5 tests)
- Trace management (8 tests)
- Feedback submission (3 tests)
- Eval sets (6 tests)
- Eval generation & execution (5 tests)
- Jobs (4 tests)
- Integration tests (3 tests)
- Error handling (6 tests)

---

### 2. **PLAYWRIGHT_IMPLEMENTATION_GUIDE.md** - Practical Code Guide
**Purpose**: Step-by-step implementation with working code examples

**Contents**:
- Quick setup instructions (30 minutes)
- Playwright configuration
- Helper functions (API client, wait functions)
- Fixture implementations
- Complete example tests for each feature
- Running tests commands
- Debugging tips
- CI/CD integration (GitHub Actions)

**Use this when**: Actually writing test code, setting up project

**Key Sections**:
- Configuration: `playwright.config.ts`
- Helpers: API client, wait functions, assertions
- Example tests: Smoke, integrations, traces, feedback, complete workflow
- Running commands: debug mode, headed mode, reports

---

### 3. **E2E_TESTING_QUICK_REFERENCE.md** - Cheat Sheet
**Purpose**: Copy-paste snippets for common testing patterns

**Contents**:
- Test structure template
- Common assertions (page, element, state, count, text)
- Common actions (click, fill, keyboard, upload, hover)
- Waiting patterns (selectors, navigation, API, jobs, toasts)
- Test data patterns (create integration, import traces, submit feedback)
- Debugging snippets
- Running commands

**Use this when**: Writing tests, need quick code examples

**Key Snippets**:
- Modal interaction
- Form submission
- Table interaction
- Error handling
- Job progress monitoring

---

## Quick Start (30 Minutes)

### Step 1: Install Playwright (5 min)

```bash
cd /home/ygupta/workspace/iofold
npm install -D @playwright/test
npx playwright install
```

### Step 2: Create Project Structure (2 min)

```bash
mkdir -p tests/e2e/{01-smoke,02-integrations,03-traces,04-eval-sets,05-evals,06-jobs,07-integration,08-error-handling}
mkdir -p tests/{fixtures,helpers}
```

### Step 3: Copy Configuration (3 min)

Copy `playwright.config.ts` from `PLAYWRIGHT_IMPLEMENTATION_GUIDE.md`

### Step 4: Create Helpers (10 min)

Create these files from `PLAYWRIGHT_IMPLEMENTATION_GUIDE.md`:
- `tests/helpers/api-client.ts`
- `tests/helpers/wait-for.ts`
- `tests/fixtures/integrations.ts`
- `tests/fixtures/traces.ts`

### Step 5: Write First Test (10 min)

Copy smoke test from `PLAYWRIGHT_IMPLEMENTATION_GUIDE.md`:
- `tests/e2e/01-smoke/home.spec.ts`

### Step 6: Run Test

```bash
npx playwright test tests/e2e/01-smoke/home.spec.ts
```

**Expected result**: Test passes, home page loads successfully

---

## Test Coverage Summary

### Priority Breakdown

| Priority | Description | Count | Time |
|----------|-------------|-------|------|
| **P0** | Critical paths (must pass) | 10 | 2 min |
| **P1** | Major features (should pass) | 23 | 6 min |
| **P2** | Edge cases (nice to have) | 15 | 4 min |
| **Total** | | **48** | **< 5 min** (parallel) |

### Feature Coverage

| Feature | Tests | Coverage |
|---------|-------|----------|
| Smoke Tests | 5 | 100% critical paths |
| Integrations | 5 | CRUD + errors |
| Traces | 8 | Import, list, detail, delete |
| Feedback | 3 | Submit, update, keyboard shortcuts |
| Eval Sets | 6 | CRUD, feedback summary |
| Evals | 5 | Generate, execute, results |
| Jobs | 4 | Status, SSE, polling, cancellation |
| Integration | 3 | Complete workflows |
| Error Handling | 6 | Network, API, component errors |

---

## Test Execution Strategy

### Parallel Workers (4)

**Worker 1**: Smoke + Integrations (~2 min)
- 5 smoke tests
- 5 integration tests

**Worker 2**: Traces + Feedback (~3 min)
- 8 trace tests
- 3 feedback tests

**Worker 3**: Eval Sets + Evals (~4 min)
- 6 eval set tests
- 5 eval tests

**Worker 4**: Jobs + Integration + Errors (~4 min)
- 4 job tests
- 3 integration tests
- 6 error tests

**Total Wall Time**: ~4 minutes (parallelized)

---

## Key Files to Create

### Configuration
- `playwright.config.ts` - Main configuration

### Helpers
- `tests/helpers/api-client.ts` - API test client
- `tests/helpers/wait-for.ts` - Wait utilities
- `tests/helpers/assertions.ts` - Custom assertions (optional)

### Fixtures
- `tests/fixtures/integrations.ts` - Integration test data
- `tests/fixtures/traces.ts` - Trace test data
- `tests/fixtures/eval-sets.ts` - Eval set test data

### Tests (48 files organized by feature)
- `tests/e2e/01-smoke/*.spec.ts` (5 tests)
- `tests/e2e/02-integrations/*.spec.ts` (5 tests)
- `tests/e2e/03-traces/*.spec.ts` (8 tests)
- `tests/e2e/04-eval-sets/*.spec.ts` (6 tests)
- `tests/e2e/05-evals/*.spec.ts` (5 tests)
- `tests/e2e/06-jobs/*.spec.ts` (4 tests)
- `tests/e2e/07-integration/*.spec.ts` (3 tests)
- `tests/e2e/08-error-handling/*.spec.ts` (6 tests)

---

## Common Commands

```bash
# Run all tests (parallel)
npx playwright test

# Run specific test file
npx playwright test tests/e2e/03-traces/import-traces.spec.ts

# Run tests by pattern
npx playwright test --grep "should import traces"

# Run in headed mode (see browser)
npx playwright test --headed

# Run in debug mode (step through)
npx playwright test --debug

# Run with specific workers
npx playwright test --workers=2

# Generate HTML report
npx playwright test && npx playwright show-report

# Run only failed tests
npx playwright test --last-failed
```

---

## Implementation Phases

### Phase 1: Setup (30 min)
- Install Playwright
- Create project structure
- Configure playwright.config.ts
- Create helper functions

### Phase 2: Smoke Tests (1 hour)
- Write 5 smoke tests
- Verify basic functionality
- Ensure tests pass

### Phase 3: Feature Tests (4 hours)
- Write P0 tests (10 tests) - 1 hour
- Write P1 tests (23 tests) - 2 hours
- Write P2 tests (15 tests) - 1 hour

### Phase 4: Integration & Refinement (2 hours)
- Write cross-feature tests (3 tests) - 30 min
- Fix flaky tests - 30 min
- Optimize execution time - 30 min
- Document edge cases - 30 min

**Total Implementation Time**: 8 hours

---

## Success Criteria

### Coverage Goals
- ✅ Critical paths (P0): 100%
- ✅ Major features (P1): 90%
- ✅ Edge cases (P2): 70%
- ✅ Overall: 85%+

### Performance Goals
- ✅ Full suite: < 5 minutes
- ✅ Individual test: < 2 minutes timeout
- ✅ Flaky test rate: < 1%
- ✅ Reliability: > 99%

### Quality Goals
- ✅ Clear test names (self-documenting)
- ✅ Reusable helpers and fixtures
- ✅ Production-quality test code
- ✅ Easy to add new tests
- ✅ Fast feedback on failures

---

## Next Steps

1. **Read the master plan**: `E2E_TESTING_PLAN.md`
2. **Follow implementation guide**: `PLAYWRIGHT_IMPLEMENTATION_GUIDE.md`
3. **Use quick reference**: `E2E_TESTING_QUICK_REFERENCE.md`
4. **Start with smoke tests**: Write and verify 5 critical tests
5. **Expand coverage**: Add P0 → P1 → P2 tests
6. **Setup CI/CD**: Add GitHub Actions workflow
7. **Monitor and improve**: Track flaky tests, optimize timing

---

## Resources

### Documentation Files
1. `E2E_TESTING_PLAN.md` - Master strategy (48 test scenarios)
2. `PLAYWRIGHT_IMPLEMENTATION_GUIDE.md` - Implementation guide with code examples
3. `E2E_TESTING_QUICK_REFERENCE.md` - Copy-paste cheat sheet

### External Resources
- [Playwright Documentation](https://playwright.dev/)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Playwright API Reference](https://playwright.dev/docs/api/class-playwright)

---

## FAQ

### Q: How long does it take to set up?
**A**: 30 minutes for initial setup, 8 hours to write all 48 tests

### Q: Can tests run in CI/CD?
**A**: Yes, GitHub Actions workflow included in implementation guide

### Q: How do I debug failing tests?
**A**: Use `npx playwright test --debug` or see debugging section in quick reference

### Q: What if tests are flaky?
**A**: Use wait helpers (`waitForJobCompletion`, `waitForToast`) and proper assertions. See implementation guide for patterns.

### Q: Do I need to write all 48 tests?
**A**: Start with P0 tests (10 tests), then expand. P2 tests are optional but recommended.

### Q: How do I add a new test?
**A**: Copy template from quick reference, modify for your scenario, run and verify

---

## Test Data Requirements

### Environment Variables

```bash
# .env.test
TEST_LANGFUSE_PUBLIC_KEY=pk_test_xxx
TEST_LANGFUSE_SECRET_KEY=sk_test_xxx
API_URL=http://localhost:8787/v1
BASE_URL=http://localhost:3000
```

### Prerequisites
- Dev servers running (backend on 8787, frontend on 3000)
- Test Langfuse account with API credentials
- Database in clean state (or seeded with test data)

---

## Maintenance

### Regular Tasks
- **Weekly**: Review flaky tests, update helpers
- **Monthly**: Update coverage metrics, refactor tests
- **Per Release**: Run full suite, verify all pass

### Updating Tests
- Add new test scenarios to master plan first
- Implement test following patterns from guide
- Update quick reference if new pattern introduced
- Document edge cases discovered

---

## Contact & Support

**Documentation Owner**: Development Team
**Review Frequency**: After each major feature addition
**Last Updated**: 2025-11-14

---

## Summary

This testing documentation provides:
- ✅ Comprehensive plan (48 test scenarios)
- ✅ Practical implementation guide (working code)
- ✅ Quick reference (copy-paste snippets)
- ✅ Fast execution (< 5 minutes parallel)
- ✅ High coverage (85%+ critical paths)
- ✅ CI/CD ready (GitHub Actions)

**Start here**: Follow Quick Start → Read Plan → Implement Tests → Run Suite

---

_End of E2E Testing Documentation_
