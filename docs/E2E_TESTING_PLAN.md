# E2E Testing Plan - iofold Platform

**Version**: 1.0
**Date**: 2025-11-14
**Purpose**: Comprehensive end-to-end testing strategy with Playwright implementation guide

---

## Table of Contents

1. [Testing Strategy](#testing-strategy)
2. [Test Organization](#test-organization)
3. [Use Cases & Test Scenarios](#use-cases--test-scenarios)
4. [Edge Cases & Error Scenarios](#edge-cases--error-scenarios)
5. [Parallel Execution Strategy](#parallel-execution-strategy)
6. [Test Data Management](#test-data-management)
7. [Playwright Implementation Guide](#playwright-implementation-guide)

---

## Testing Strategy

### Objectives

- **Coverage**: Test all critical user workflows end-to-end
- **Speed**: Parallel execution, tests complete in < 5 minutes
- **Reliability**: No flaky tests, deterministic results
- **Maintainability**: Clear test structure, reusable helpers
- **Edge Cases**: Comprehensive error and boundary condition testing

### Test Levels

| Level | Description | Count | Time Budget |
|-------|-------------|-------|-------------|
| **Smoke Tests** | Critical happy paths | 5 | 1 min |
| **Feature Tests** | Complete feature workflows | 20 | 3 min |
| **Edge Case Tests** | Error handling, boundaries | 15 | 2 min |
| **Integration Tests** | Cross-feature workflows | 8 | 2 min |
| **Total** | | **48 tests** | **< 5 min** |

### Execution Strategy

- **Parallel Workers**: 4 workers (optimal for CI/local)
- **Test Isolation**: Each test gets fresh state
- **Database Strategy**: Seed data before tests, cleanup after
- **API Mocking**: None - test against real local API
- **Browser**: Chromium (headless for CI, headed for debugging)

---

## Test Organization

### File Structure

```
tests/
├── e2e/
│   ├── 01-smoke/
│   │   ├── home.spec.ts
│   │   └── api-health.spec.ts
│   ├── 02-integrations/
│   │   ├── add-integration.spec.ts
│   │   ├── test-connection.spec.ts
│   │   ├── delete-integration.spec.ts
│   │   └── integration-errors.spec.ts
│   ├── 03-traces/
│   │   ├── import-traces.spec.ts
│   │   ├── trace-list.spec.ts
│   │   ├── trace-detail.spec.ts
│   │   ├── feedback-submission.spec.ts
│   │   ├── keyboard-shortcuts.spec.ts
│   │   └── trace-errors.spec.ts
│   ├── 04-eval-sets/
│   │   ├── create-eval-set.spec.ts
│   │   ├── eval-set-detail.spec.ts
│   │   ├── feedback-summary.spec.ts
│   │   └── eval-set-errors.spec.ts
│   ├── 05-evals/
│   │   ├── generate-eval.spec.ts
│   │   ├── eval-generation-progress.spec.ts
│   │   ├── eval-execution.spec.ts
│   │   ├── eval-results.spec.ts
│   │   └── eval-errors.spec.ts
│   ├── 06-jobs/
│   │   ├── job-status-polling.spec.ts
│   │   ├── sse-streaming.spec.ts
│   │   ├── job-cancellation.spec.ts
│   │   └── job-errors.spec.ts
│   ├── 07-integration/
│   │   ├── complete-workflow.spec.ts
│   │   ├── multi-eval-comparison.spec.ts
│   │   └── data-consistency.spec.ts
│   └── 08-error-handling/
│       ├── network-errors.spec.ts
│       ├── api-errors.spec.ts
│       ├── component-errors.spec.ts
│       └── loading-states.spec.ts
├── fixtures/
│   ├── integrations.ts
│   ├── traces.ts
│   ├── eval-sets.ts
│   └── jobs.ts
├── helpers/
│   ├── api-client.ts
│   ├── database.ts
│   ├── wait-for.ts
│   └── assertions.ts
└── playwright.config.ts
```

### Test Naming Convention

```typescript
// Format: [Feature] should [expected behavior] when [condition]
test('Integrations should create Langfuse integration when valid credentials provided', async ({ page }) => {
  // Test implementation
});

test('Traces should show error toast when import fails due to invalid API key', async ({ page }) => {
  // Test implementation
});
```

---

## Use Cases & Test Scenarios

### 1. Smoke Tests (Critical Paths)

#### TEST-S01: Application Loads
**Priority**: P0
**Parallel Group**: smoke
**Estimated Time**: 10s

**Steps**:
1. Navigate to `http://localhost:3000`
2. Verify page loads without errors
3. Check console for errors
4. Verify navigation menu visible

**Expected Results**:
- Page loads in < 2s
- No console errors
- Navigation menu shows: Home, Integrations, Traces, Eval Sets, Evals

---

#### TEST-S02: API Health Check
**Priority**: P0
**Parallel Group**: smoke
**Estimated Time**: 5s

**Steps**:
1. Call `GET /v1/api/health` (or equivalent)
2. Verify 200 OK response
3. Check response time

**Expected Results**:
- Response: `200 OK`
- Response time: < 100ms
- Body contains status: "healthy"

---

#### TEST-S03: Database Connectivity
**Priority**: P0
**Parallel Group**: smoke
**Estimated Time**: 5s

**Steps**:
1. Call `GET /v1/api/integrations`
2. Verify database query executes
3. Check response format

**Expected Results**:
- Response: `200 OK`
- Returns array of integrations (may be empty)
- Response time: < 50ms

---

#### TEST-S04: Frontend-Backend Communication
**Priority**: P0
**Parallel Group**: smoke
**Estimated Time**: 10s

**Steps**:
1. Navigate to integrations page
2. Verify React Query executes
3. Check API request in Network tab

**Expected Results**:
- API request fires automatically
- No CORS errors
- Data displays or "No integrations" message

---

#### TEST-S05: Basic Navigation
**Priority**: P0
**Parallel Group**: smoke
**Estimated Time**: 15s

**Steps**:
1. Click "Integrations" link
2. Verify URL changes to `/integrations`
3. Click "Traces" link
4. Verify URL changes to `/traces`
5. Click "Eval Sets" link
6. Verify URL changes to `/eval-sets`

**Expected Results**:
- All navigation links work
- URLs update correctly
- Pages load without errors

---

### 2. Integration Management Tests

#### TEST-I01: Add Langfuse Integration (Happy Path)
**Priority**: P0
**Parallel Group**: integrations-1
**Estimated Time**: 20s

**Steps**:
1. Navigate to `/integrations`
2. Click "Add Integration" button
3. Fill form:
   - Platform: Langfuse
   - Name: "Test Integration"
   - Public Key: `pk_test_123`
   - Secret Key: `sk_test_456`
   - Base URL: `https://cloud.langfuse.com`
4. Click "Add Integration"
5. Wait for modal to close
6. Verify integration appears in list

**Expected Results**:
- Modal opens on button click
- Form validates inputs
- API call succeeds: `POST /v1/api/integrations`
- Toast notification: "Integration added successfully"
- Modal closes
- Integration card appears with "active" status

**Assertions**:
```typescript
await expect(page.getByRole('heading', { name: 'Test Integration' })).toBeVisible();
await expect(page.getByText('active')).toBeVisible();
```

---

#### TEST-I02: Add Integration with Invalid Credentials
**Priority**: P1
**Parallel Group**: integrations-1
**Estimated Time**: 15s

**Steps**:
1. Navigate to `/integrations`
2. Click "Add Integration"
3. Fill form with invalid API keys:
   - Public Key: `invalid_key`
   - Secret Key: `invalid_secret`
4. Click "Add Integration"
5. Wait for response

**Expected Results**:
- API returns error
- Toast notification shows error message
- Modal stays open
- Form shows error state
- Integration NOT added to list

**Edge Case**: Test with empty fields, malformed URLs, special characters

---

#### TEST-I03: Test Integration Connection
**Priority**: P1
**Parallel Group**: integrations-2
**Estimated Time**: 15s

**Steps**:
1. Navigate to `/integrations`
2. Find existing integration card
3. Click "Test Connection" button
4. Wait for API response

**Expected Results**:
- Button shows loading spinner
- API call: `POST /v1/api/integrations/{id}/test`
- Toast notification: "Connection successful" or error message
- Integration status updates if failed

**Edge Cases**:
- Test with unreachable base URL
- Test with expired credentials
- Test with rate-limited API

---

#### TEST-I04: Delete Integration
**Priority**: P1
**Parallel Group**: integrations-2
**Estimated Time**: 15s

**Steps**:
1. Navigate to `/integrations`
2. Click delete button on integration
3. Confirm deletion in modal (if present)
4. Wait for deletion

**Expected Results**:
- API call: `DELETE /v1/api/integrations/{id}`
- Toast notification: "Integration deleted"
- Integration card removed from list
- List updates immediately

**Edge Cases**:
- Delete integration with associated traces
- Delete last integration
- Cancel deletion

---

#### TEST-I05: Integration List Pagination (Future)
**Priority**: P2
**Parallel Group**: integrations-3
**Estimated Time**: 20s

**Steps**:
1. Seed database with 25 integrations
2. Navigate to `/integrations`
3. Verify only first page shown
4. Click "Next" button
5. Verify second page loads

**Expected Results**:
- Shows 10 integrations per page
- Pagination controls visible
- Correct page number highlighted
- API called with `?cursor=` parameter

**Note**: Deferred if pagination UI not implemented

---

### 3. Trace Management Tests

#### TEST-T01: Import Traces (Happy Path)
**Priority**: P0
**Parallel Group**: traces-1
**Estimated Time**: 30s

**Steps**:
1. Ensure integration exists (create if needed)
2. Navigate to `/traces`
3. Click "Import Traces" button
4. Fill form:
   - Integration: Select existing integration
   - Limit: 10
   - Date range: Leave empty
5. Click "Import"
6. Monitor job progress
7. Wait for completion

**Expected Results**:
- Modal opens
- Integration dropdown populated
- API call: `POST /v1/api/traces/import` returns `202 Accepted` with `job_id`
- Progress bar appears (0% → 100%)
- SSE or polling updates progress
- Modal closes on completion
- Traces list refreshes
- 10 traces visible

**Assertions**:
```typescript
// Wait for job completion
await page.waitForSelector('text="Import complete"', { timeout: 60000 });

// Verify traces imported
const traceCount = await page.locator('[data-testid="trace-row"]').count();
expect(traceCount).toBeGreaterThanOrEqual(10);
```

---

#### TEST-T02: Import Traces with Limit
**Priority**: P1
**Parallel Group**: traces-1
**Estimated Time**: 30s

**Steps**:
1. Import traces with limit: 5
2. Wait for completion
3. Verify exact count

**Expected Results**:
- Exactly 5 traces imported (no more, no less)

---

#### TEST-T03: Import Traces with Date Range
**Priority**: P1
**Parallel Group**: traces-2
**Estimated Time**: 30s

**Steps**:
1. Import traces with date filter:
   - From: 2025-11-01
   - To: 2025-11-13
2. Wait for completion
3. Verify all traces within date range

**Expected Results**:
- Only traces from specified date range imported
- Traces outside range excluded

---

#### TEST-T04: Import Traces with Invalid Integration
**Priority**: P1
**Parallel Group**: traces-2
**Estimated Time**: 15s

**Steps**:
1. Delete integration
2. Try to import traces (dropdown should be empty)

**Expected Results**:
- Import button disabled if no integrations
- Or error toast: "No integrations available"

---

#### TEST-T05: Trace List Display
**Priority**: P0
**Parallel Group**: traces-3
**Estimated Time**: 15s

**Steps**:
1. Navigate to `/traces` (assuming traces exist)
2. Verify table displays
3. Check columns: ID, Source, Timestamp, Eval Set, Feedback

**Expected Results**:
- Table shows all traces
- Columns properly labeled
- Data formatted correctly (dates, IDs truncated if long)
- Hovering shows full IDs in tooltip

---

#### TEST-T06: Trace Detail View
**Priority**: P0
**Parallel Group**: traces-3
**Estimated Time**: 20s

**Steps**:
1. Navigate to `/traces`
2. Click on a trace row
3. Navigate to `/traces/{id}`
4. Verify trace details display

**Expected Results**:
- URL updates to `/traces/{trace_id}`
- Trace metadata visible (source, timestamp, eval set)
- Execution steps visible
- Expandable steps (if multiple)
- Feedback buttons visible

---

#### TEST-T07: Submit Positive Feedback
**Priority**: P0
**Parallel Group**: feedback-1
**Estimated Time**: 15s

**Steps**:
1. Navigate to trace detail page
2. Click thumbs up button
3. Verify feedback saved

**Expected Results**:
- API call: `POST /v1/api/feedback` with `rating: "positive"`
- Toast notification: "Feedback updated"
- Button shows active state (green highlight)
- Page refetches trace data

**Assertions**:
```typescript
await page.click('[data-testid="feedback-positive"]');
await expect(page.getByText('Feedback updated')).toBeVisible();
await expect(page.locator('[data-testid="feedback-positive"]')).toHaveClass(/bg-green-100/);
```

---

#### TEST-T08: Submit Negative Feedback
**Priority**: P0
**Parallel Group**: feedback-1
**Estimated Time**: 15s

**Steps**:
1. Navigate to trace detail page
2. Click thumbs down button
3. Verify feedback saved

**Expected Results**:
- API call: `POST /v1/api/feedback` with `rating: "negative"`
- Button shows active state (red highlight)

---

#### TEST-T09: Submit Neutral Feedback
**Priority**: P0
**Parallel Group**: feedback-1
**Estimated Time**: 15s

**Steps**:
1. Navigate to trace detail page
2. Click neutral button
3. Verify feedback saved

**Expected Results**:
- API call: `POST /v1/api/feedback` with `rating: "neutral"`
- Button shows active state (gray highlight)

---

#### TEST-T10: Change Feedback Rating
**Priority**: P1
**Parallel Group**: feedback-2
**Estimated Time**: 20s

**Steps**:
1. Navigate to trace detail page
2. Click thumbs up (positive)
3. Wait for save
4. Click thumbs down (negative)
5. Verify feedback updated

**Expected Results**:
- First click: Creates feedback
- Second click: Updates existing feedback (PATCH request)
- Only one feedback record per trace
- Button states update correctly

---

#### TEST-T11: Keyboard Shortcuts (1/2/3 Keys)
**Priority**: P1
**Parallel Group**: feedback-2
**Estimated Time**: 20s

**Steps**:
1. Navigate to trace detail page
2. Press "1" key (positive)
3. Verify feedback saved
4. Press "2" key (neutral)
5. Verify feedback updated
6. Press "3" key (negative)
7. Verify feedback updated

**Expected Results**:
- Each keypress triggers feedback submission
- Same API behavior as clicking buttons
- Shortcuts ignored when typing in text inputs

**Edge Case**: Test with input focus to ensure shortcuts don't trigger

---

#### TEST-T12: Delete Trace
**Priority**: P1
**Parallel Group**: traces-4
**Estimated Time**: 15s

**Steps**:
1. Navigate to `/traces`
2. Click delete button on trace
3. Confirm deletion
4. Verify trace removed

**Expected Results**:
- API call: `DELETE /v1/api/traces/{id}`
- Toast notification: "Trace deleted"
- Trace removed from list

---

#### TEST-T13: Bulk Delete Traces
**Priority**: P2
**Parallel Group**: traces-4
**Estimated Time**: 20s

**Steps**:
1. Navigate to `/traces`
2. Select multiple traces (checkboxes)
3. Click "Delete Selected"
4. Confirm deletion

**Expected Results**:
- API call: `DELETE /v1/api/traces` with `trace_ids` array
- Toast notification: "5 traces deleted"
- All selected traces removed

**Note**: Deferred if bulk delete UI not implemented

---

### 4. Eval Set Management Tests

#### TEST-ES01: Create Eval Set (Happy Path)
**Priority**: P0
**Parallel Group**: eval-sets-1
**Estimated Time**: 15s

**Steps**:
1. Navigate to `/eval-sets`
2. Click "Create Eval Set" button
3. Fill form:
   - Name: "Quality Evaluation Set"
   - Description: "Testing accuracy of responses"
4. Click "Create"
5. Wait for creation

**Expected Results**:
- Modal opens
- API call: `POST /v1/api/eval-sets`
- Toast notification: "Eval set created"
- Redirects to `/eval-sets/{id}` OR modal closes
- New eval set appears in list

---

#### TEST-ES02: Create Eval Set with Long Name
**Priority**: P2
**Parallel Group**: eval-sets-1
**Estimated Time**: 15s

**Steps**:
1. Create eval set with 200-character name
2. Verify truncation or error handling

**Expected Results**:
- Either accepts full name or shows validation error
- UI handles long names gracefully (ellipsis, tooltip)

---

#### TEST-ES03: View Eval Set Detail
**Priority**: P0
**Parallel Group**: eval-sets-2
**Estimated Time**: 20s

**Steps**:
1. Navigate to `/eval-sets/{id}`
2. Verify eval set details display

**Expected Results**:
- Eval set name and description visible
- Trace count displayed
- Feedback summary shown (X positive, Y negative, Z neutral)
- List of traces in eval set
- "Generate Eval" button visible

---

#### TEST-ES04: Feedback Summary Calculation
**Priority**: P1
**Parallel Group**: eval-sets-2
**Estimated Time**: 20s

**Steps**:
1. Create eval set
2. Add 3 traces with positive feedback
3. Add 2 traces with negative feedback
4. Add 1 trace with neutral feedback
5. Navigate to eval set detail
6. Verify summary counts

**Expected Results**:
- Summary shows: "3 positive, 2 negative, 1 neutral"
- Percentages calculated correctly
- Visual indicators (progress bar, pie chart)

---

#### TEST-ES05: Generate Eval Button Enable/Disable
**Priority**: P1
**Parallel Group**: eval-sets-3
**Estimated Time**: 15s

**Steps**:
1. Create eval set with 0 traces
2. Verify "Generate Eval" button disabled
3. Add 1 positive trace
4. Verify button still disabled (need both positive AND negative)
5. Add 1 negative trace
6. Verify button enabled

**Expected Results**:
- Button disabled if < 5 total examples (configurable threshold)
- Button disabled if no positive OR no negative examples
- Tooltip explains requirement: "Need at least 5 examples with both positive and negative feedback"

---

#### TEST-ES06: Delete Eval Set
**Priority**: P1
**Parallel Group**: eval-sets-3
**Estimated Time**: 15s

**Steps**:
1. Navigate to `/eval-sets`
2. Click delete on eval set
3. Confirm deletion

**Expected Results**:
- API call: `DELETE /v1/api/eval-sets/{id}`
- Toast notification: "Eval set deleted"
- Eval set removed from list

---

### 5. Eval Generation & Execution Tests

#### TEST-E01: Generate Eval (Happy Path)
**Priority**: P0
**Parallel Group**: evals-1
**Estimated Time**: 60s

**Steps**:
1. Navigate to eval set with sufficient feedback
2. Click "Generate Eval" button
3. Fill form:
   - Name: "Accuracy Eval v1"
   - Description: "Checks response accuracy"
   - Model: claude-3-haiku-20240307
   - Instructions: "Focus on factual correctness"
4. Click "Generate"
5. Monitor job progress
6. Wait for completion (up to 60s)
7. Verify eval created

**Expected Results**:
- API call: `POST /v1/api/eval-sets/{id}/generate` returns `202 Accepted` with `job_id`
- Job status: queued → running → completed
- Progress updates via SSE or polling
- On completion:
  - Toast notification: "Eval generated successfully"
  - Redirects to `/evals/{id}` or refreshes eval set page
  - Eval appears in evals list

**Assertions**:
```typescript
// Wait for job completion
await waitForJobCompletion(page, jobId, { timeout: 90000 });

// Verify eval created
await page.goto(`/evals`);
await expect(page.getByRole('heading', { name: 'Accuracy Eval v1' })).toBeVisible();
```

---

#### TEST-E02: Generate Eval with Insufficient Feedback
**Priority**: P1
**Parallel Group**: evals-1
**Estimated Time**: 10s

**Steps**:
1. Create eval set with only 2 positive examples (no negative)
2. Try to generate eval

**Expected Results**:
- "Generate Eval" button disabled
- Tooltip: "Need at least 5 examples with both positive and negative feedback"
- API call never made

---

#### TEST-E03: View Generated Eval Code
**Priority**: P0
**Parallel Group**: evals-2
**Estimated Time**: 15s

**Steps**:
1. Navigate to `/evals/{id}`
2. Verify eval code displays

**Expected Results**:
- Eval name, description, version visible
- Python code displayed in syntax-highlighted viewer
- Code is readable (proper formatting)
- Training accuracy shown (e.g., "95% accuracy on 5 examples")

---

#### TEST-E04: Execute Eval (Happy Path)
**Priority**: P0
**Parallel Group**: evals-2
**Estimated Time**: 45s

**Steps**:
1. Navigate to `/evals/{id}`
2. Click "Execute Eval" button
3. Select traces to execute on (or use default: all traces in eval set)
4. Click "Execute"
5. Monitor job progress
6. Wait for completion

**Expected Results**:
- API call: `POST /v1/api/evals/{id}/execute` returns `202 Accepted` with `job_id`
- Job status: queued → running → completed
- Progress updates via SSE or polling
- On completion:
  - Toast notification: "Eval executed successfully"
  - Results displayed: X passed, Y failed, Z errors
  - Accuracy percentage shown

---

#### TEST-E05: View Eval Execution Results
**Priority**: P0
**Parallel Group**: evals-3
**Estimated Time**: 20s

**Steps**:
1. After eval execution completes
2. Navigate to eval detail page
3. View execution results

**Expected Results**:
- Table of execution results:
  - Trace ID
  - Human Feedback (positive/negative)
  - Eval Result (pass/fail)
  - Match Status (✓ match, ✗ contradiction)
  - Error (if any)
- Summary statistics:
  - Accuracy: 80% (8/10)
  - Contradictions: 2
  - Errors: 0
- Contradictions highlighted in red

---

#### TEST-E06: Eval Contradiction Detection
**Priority**: P1
**Parallel Group**: evals-3
**Estimated Time**: 30s

**Steps**:
1. Create eval with known contradictions (human positive, eval fails)
2. Execute eval
3. Verify contradictions flagged

**Expected Results**:
- Contradictions detected:
  - Human feedback: positive, Eval result: fail → Contradiction
  - Human feedback: negative, Eval result: pass → Contradiction
- Contradictions shown in results table with warning icon
- User can click to view trace detail

---

#### TEST-E07: Generate Eval with Invalid Model
**Priority**: P2
**Parallel Group**: evals-4
**Estimated Time**: 20s

**Steps**:
1. Generate eval with non-existent model name
2. Monitor job status

**Expected Results**:
- Job fails with error: "Invalid model name"
- Error displayed in UI
- No eval created

---

#### TEST-E08: Execute Eval on Empty Trace Set
**Priority**: P2
**Parallel Group**: evals-4
**Estimated Time**: 15s

**Steps**:
1. Create eval
2. Delete all traces from eval set
3. Try to execute eval

**Expected Results**:
- Either button disabled or job completes with "0 traces processed"
- No errors thrown

---

### 6. Job Management Tests

#### TEST-J01: Job Status Polling
**Priority**: P1
**Parallel Group**: jobs-1
**Estimated Time**: 30s

**Steps**:
1. Disable SSE (simulate SSE failure)
2. Start trace import job
3. Verify polling fallback activates
4. Monitor job status updates

**Expected Results**:
- Console warning: "SSE connection failed, falling back to polling"
- Polling starts (every 2 seconds)
- Job status updates: queued → running → completed
- Progress bar updates
- Job completes successfully

---

#### TEST-J02: SSE Real-time Updates
**Priority**: P1
**Parallel Group**: jobs-1
**Estimated Time**: 30s

**Steps**:
1. Enable SSE (default)
2. Start trace import job
3. Monitor Network tab for EventSource connection
4. Verify real-time updates

**Expected Results**:
- EventSource connection established: `/api/jobs/{id}/stream`
- Console log: "SSE connection established for job: {id}"
- Progress events received in real-time (< 1s latency)
- No polling fallback triggered

---

#### TEST-J03: Job Cancellation
**Priority**: P2
**Parallel Group**: jobs-2
**Estimated Time**: 20s

**Steps**:
1. Start long-running job (large trace import)
2. Click "Cancel" button
3. Verify job cancelled

**Expected Results**:
- API call: `POST /v1/api/jobs/{id}/cancel`
- Job status changes to "cancelled"
- Progress stops updating
- Toast notification: "Job cancelled"

**Note**: Deferred if cancellation UI not implemented

---

#### TEST-J04: Job Failure Handling
**Priority**: P1
**Parallel Group**: jobs-2
**Estimated Time**: 30s

**Steps**:
1. Start job that will fail (e.g., invalid API key)
2. Monitor job status
3. Verify failure handled gracefully

**Expected Results**:
- Job status: queued → running → failed
- Error message displayed
- Toast notification: "Job failed: {error message}"
- No app crash

---

#### TEST-J05: Multiple Concurrent Jobs
**Priority**: P2
**Parallel Group**: jobs-3
**Estimated Time**: 45s

**Steps**:
1. Start 3 jobs simultaneously:
   - Trace import
   - Eval generation
   - Eval execution
2. Monitor all jobs
3. Verify all complete

**Expected Results**:
- All jobs tracked separately
- No interference between jobs
- All jobs complete successfully
- Job list shows all 3 jobs

---

### 7. Integration Tests (Cross-Feature)

#### TEST-INT01: Complete Workflow (End-to-End)
**Priority**: P0
**Parallel Group**: integration-1
**Estimated Time**: 120s

**Steps**:
1. Create integration
2. Import 10 traces
3. Create eval set
4. Submit feedback on 5 traces (3 positive, 2 negative)
5. Generate eval
6. Execute eval
7. View results

**Expected Results**:
- All steps complete without errors
- Data flows correctly through entire system
- Results show expected accuracy
- No data inconsistencies

**Assertions**:
```typescript
// Full workflow test
const integration = await createIntegration(page, { name: 'E2E Test Integration' });
const jobId = await importTraces(page, integration.id, { limit: 10 });
await waitForJobCompletion(page, jobId);

const evalSet = await createEvalSet(page, { name: 'E2E Eval Set' });
await submitFeedback(page, traceIds[0], 'positive');
await submitFeedback(page, traceIds[1], 'positive');
await submitFeedback(page, traceIds[2], 'positive');
await submitFeedback(page, traceIds[3], 'negative');
await submitFeedback(page, traceIds[4], 'negative');

const genJobId = await generateEval(page, evalSet.id, { name: 'E2E Eval' });
await waitForJobCompletion(page, genJobId, { timeout: 90000 });

const evalId = await getEvalId(page);
const execJobId = await executeEval(page, evalId);
await waitForJobCompletion(page, execJobId);

const results = await getEvalResults(page, evalId);
expect(results.accuracy).toBeGreaterThan(0);
```

---

#### TEST-INT02: Multi-Eval Comparison
**Priority**: P2
**Parallel Group**: integration-2
**Estimated Time**: 90s

**Steps**:
1. Create eval set
2. Generate 2 different evals (different models/instructions)
3. Execute both evals
4. Compare results

**Expected Results**:
- Both evals created with different versions (v1, v2)
- Both evals execute successfully
- Results comparable side-by-side (if UI exists)

---

#### TEST-INT03: Data Consistency Across Pages
**Priority**: P1
**Parallel Group**: integration-2
**Estimated Time**: 30s

**Steps**:
1. Submit feedback on trace detail page
2. Navigate to eval set detail page
3. Verify feedback summary updated
4. Navigate back to traces list
5. Verify feedback indicator updated

**Expected Results**:
- Feedback persists across page navigations
- All views show consistent data
- No stale data displayed

---

### 8. Error Handling Tests

#### TEST-ERR01: Network Error Handling
**Priority**: P1
**Parallel Group**: errors-1
**Estimated Time**: 15s

**Steps**:
1. Navigate to traces page
2. Disconnect network (or stop backend)
3. Try to load traces
4. Verify error handling

**Expected Results**:
- Error state displayed: "Network error. Please check your connection."
- Retry button visible
- No app crash
- Console errors logged but handled

---

#### TEST-ERR02: API 404 Error
**Priority**: P1
**Parallel Group**: errors-1
**Estimated Time**: 15s

**Steps**:
1. Navigate to `/traces/nonexistent_id`
2. Verify 404 handling

**Expected Results**:
- Error state: "Trace not found"
- Toast notification: "Resource not found"
- Option to go back home

---

#### TEST-ERR03: API 500 Error
**Priority**: P1
**Parallel Group**: errors-2
**Estimated Time**: 15s

**Steps**:
1. Trigger internal server error (e.g., corrupt database state)
2. Verify error handling

**Expected Results**:
- Error state: "Server error. Please try again later."
- Toast notification with error message
- Retry button available

---

#### TEST-ERR04: Component Error Boundary
**Priority**: P1
**Parallel Group**: errors-2
**Estimated Time**: 15s

**Steps**:
1. Navigate to `/test-errors` (if exists)
2. Click "Trigger Component Error"
3. Verify error boundary catches error

**Expected Results**:
- Error boundary displays fallback UI
- Error message shown (in dev mode)
- App doesn't crash completely
- Other routes still accessible

---

#### TEST-ERR05: Loading States
**Priority**: P1
**Parallel Group**: errors-3
**Estimated Time**: 20s

**Steps**:
1. Navigate to traces page (with slow API response)
2. Verify skeleton loaders display
3. Wait for data load
4. Verify skeleton replaced with data

**Expected Results**:
- Skeleton loaders visible during load
- No "flash" of content
- Smooth transition to actual data

---

#### TEST-ERR06: Empty States
**Priority**: P2
**Parallel Group**: errors-3
**Estimated Time**: 15s

**Steps**:
1. Navigate to traces page with no traces
2. Verify empty state message

**Expected Results**:
- Message: "No traces yet. Import traces to get started."
- "Import Traces" button visible
- No table shown (or empty table with message)

---

## Edge Cases & Error Scenarios

### Edge Case Categories

#### 1. Boundary Conditions
- Import 0 traces (minimum)
- Import 1000 traces (maximum)
- Create eval set with 1 trace
- Create eval set with 10,000 traces
- Eval name: 1 character, 255 characters
- Feedback with empty notes field
- Trace with 0 execution steps
- Trace with 100 execution steps

#### 2. Invalid Input
- Integration: Empty API keys
- Integration: Malformed base URL (no protocol)
- Traces: Import with invalid date range (from > to)
- Traces: Import with negative limit
- Eval: Generate with empty name
- Eval: Generate with SQL injection attempt in instructions

#### 3. Concurrent Actions
- Submit feedback twice rapidly (double-click)
- Start two imports simultaneously from same integration
- Delete trace while viewing it
- Delete eval set while generating eval
- Cancel job immediately after starting

#### 4. State Transitions
- Import traces, delete integration, verify traces remain
- Generate eval, delete eval set, verify eval remains
- Execute eval, delete traces, verify results remain

#### 5. Performance
- Load page with 1000+ traces
- Generate eval with 500+ training examples
- Execute eval on 1000+ traces
- SSE with very frequent updates (every 100ms)

#### 6. Browser Compatibility
- Test on Chromium, Firefox, WebKit
- Test with cookies disabled
- Test with JavaScript disabled (graceful degradation)
- Test with slow network (3G simulation)

---

## Parallel Execution Strategy

### Worker Groups (4 Workers)

#### Worker 1: Smoke + Integrations
- Group: smoke (5 tests)
- Group: integrations-1 (2 tests)
- Group: integrations-2 (2 tests)
- Group: integrations-3 (1 test)
- **Total**: 10 tests, ~2 minutes

#### Worker 2: Traces + Feedback
- Group: traces-1 (2 tests)
- Group: traces-2 (2 tests)
- Group: traces-3 (2 tests)
- Group: feedback-1 (3 tests)
- Group: feedback-2 (2 tests)
- **Total**: 11 tests, ~3 minutes

#### Worker 3: Eval Sets + Evals
- Group: eval-sets-1 (2 tests)
- Group: eval-sets-2 (2 tests)
- Group: evals-1 (2 tests)
- Group: evals-2 (2 tests)
- Group: evals-3 (2 tests)
- **Total**: 10 tests, ~4 minutes

#### Worker 4: Jobs + Integration + Errors
- Group: jobs-1 (2 tests)
- Group: jobs-2 (2 tests)
- Group: integration-1 (1 test)
- Group: errors-1 (2 tests)
- Group: errors-2 (2 tests)
- Group: errors-3 (2 tests)
- **Total**: 11 tests, ~4 minutes

### Dependency Management

**Tests with dependencies:**
1. Trace tests require integration to exist
2. Feedback tests require traces to exist
3. Eval generation requires eval set with feedback
4. Eval execution requires generated eval

**Strategy**: Use test fixtures to seed required data before each test

---

## Test Data Management

### Database Seeding

**Approach**: Seed data via API calls at test start

```typescript
// fixtures/integrations.ts
export async function seedIntegration(apiClient: APIClient): Promise<Integration> {
  return await apiClient.createIntegration({
    platform: 'langfuse',
    name: `Test Integration ${Date.now()}`,
    api_key: process.env.TEST_LANGFUSE_KEY!,
    base_url: 'https://cloud.langfuse.com',
  });
}

// fixtures/traces.ts
export async function seedTraces(apiClient: APIClient, integrationId: string, count: number = 10): Promise<string[]> {
  const jobId = await apiClient.importTraces({
    integration_id: integrationId,
    limit: count,
  });

  await waitForJobCompletion(apiClient, jobId);

  const traces = await apiClient.listTraces({ limit: count });
  return traces.traces.map(t => t.id);
}
```

### Data Isolation

**Strategy**: Each test creates its own data with unique names/IDs

- Integration name: `Test Integration ${Date.now()}`
- Eval set name: `Test Eval Set ${Date.now()}`
- Use timestamps to ensure uniqueness

### Cleanup

**Approach**: Automatic cleanup after each test

```typescript
test.afterEach(async ({ page }, testInfo) => {
  // Clean up any data created during test
  if (testInfo.testData?.integrationId) {
    await apiClient.deleteIntegration(testInfo.testData.integrationId);
  }
  // More cleanup...
});
```

**Alternative**: Use separate test database that resets between runs

---

## Playwright Implementation Guide

### Project Structure

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120 * 1000, // 2 minutes per test
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 4 : 4,
  reporter: [
    ['html'],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
  ],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Add more browsers as needed
  ],
  webServer: [
    {
      command: 'npm run dev',
      port: 8787,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'cd frontend && npm run dev',
      port: 3000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
```

### Helper Functions

```typescript
// helpers/api-client.ts
import { APIClient } from '@/lib/api-client';

export function getAPIClient(): APIClient {
  const client = new APIClient(process.env.API_URL || 'http://localhost:8787/v1');
  client.setAuth('', 'workspace_default');
  return client;
}

// helpers/wait-for.ts
export async function waitForJobCompletion(
  page: Page,
  jobId: string,
  options: { timeout?: number } = {}
): Promise<void> {
  const timeout = options.timeout || 60000;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const response = await page.request.get(`/v1/api/jobs/${jobId}`, {
      headers: { 'X-Workspace-Id': 'workspace_default' },
    });
    const job = await response.json();

    if (job.status === 'completed') return;
    if (job.status === 'failed') throw new Error(`Job failed: ${job.error_message}`);

    await page.waitForTimeout(2000);
  }

  throw new Error(`Job ${jobId} did not complete within ${timeout}ms`);
}

// helpers/assertions.ts
export async function expectJobToComplete(
  apiClient: APIClient,
  jobId: string,
  timeout: number = 60000
): Promise<void> {
  const job = await waitForJob(apiClient, jobId, timeout);
  expect(job.status).toBe('completed');
}

export async function expectToastMessage(
  page: Page,
  message: string,
  timeout: number = 5000
): Promise<void> {
  await expect(page.getByText(message)).toBeVisible({ timeout });
}
```

### Test Template

```typescript
// tests/e2e/03-traces/import-traces.spec.ts
import { test, expect } from '@playwright/test';
import { getAPIClient } from '../../helpers/api-client';
import { seedIntegration } from '../../fixtures/integrations';
import { waitForJobCompletion } from '../../helpers/wait-for';

test.describe('Trace Import', () => {
  let apiClient: APIClient;
  let integrationId: string;

  test.beforeEach(async () => {
    apiClient = getAPIClient();
    const integration = await seedIntegration(apiClient);
    integrationId = integration.id;
  });

  test.afterEach(async () => {
    if (integrationId) {
      await apiClient.deleteIntegration(integrationId);
    }
  });

  test('should import 10 traces successfully', async ({ page }) => {
    await page.goto('/traces');

    // Open import modal
    await page.click('button:has-text("Import Traces")');
    await expect(page.getByRole('dialog')).toBeVisible();

    // Fill form
    await page.selectOption('[name="integration_id"]', integrationId);
    await page.fill('[name="limit"]', '10');

    // Submit
    await page.click('button:has-text("Import")');

    // Wait for job completion
    const jobIdMatch = await page.textContent('[data-testid="job-id"]');
    const jobId = jobIdMatch?.match(/job_[a-f0-9-]+/)?.[0];
    expect(jobId).toBeTruthy();

    await waitForJobCompletion(page, jobId!, { timeout: 90000 });

    // Verify traces imported
    await expect(page.getByText('Import complete')).toBeVisible();
    const traceCount = await page.locator('[data-testid="trace-row"]').count();
    expect(traceCount).toBeGreaterThanOrEqual(10);
  });
});
```

### Running Tests

```bash
# Run all tests (parallel)
npx playwright test

# Run specific test file
npx playwright test tests/e2e/03-traces/import-traces.spec.ts

# Run tests by group
npx playwright test --grep "Trace Import"

# Run in headed mode (see browser)
npx playwright test --headed

# Run in debug mode
npx playwright test --debug

# Run specific worker count
npx playwright test --workers=2

# Generate HTML report
npx playwright show-report
```

---

## Success Metrics

### Coverage Goals

| Category | Goal | Current |
|----------|------|---------|
| Critical Paths (P0) | 100% | TBD |
| Major Features (P1) | 90% | TBD |
| Edge Cases (P2) | 70% | TBD |
| Overall | 85% | TBD |

### Performance Goals

- All tests complete in < 5 minutes (parallel)
- Individual test timeout: 2 minutes
- Flaky test rate: < 1%
- Test reliability: > 99%

### Maintenance Goals

- Test code: production quality
- Clear test names (self-documenting)
- Reusable helpers and fixtures
- Easy to add new tests
- Fast feedback on failures

---

## Next Steps

1. **Implement Playwright project structure**
2. **Create helper functions and fixtures**
3. **Write smoke tests first** (5 tests)
4. **Implement feature tests in priority order** (P0 → P1 → P2)
5. **Add edge case tests**
6. **Setup CI/CD integration**
7. **Monitor and reduce flaky tests**
8. **Expand coverage based on production issues**

---

**Document Version**: 1.0
**Last Updated**: 2025-11-14
**Owner**: Development Team
**Review Frequency**: After each major feature addition

---

_End of E2E Testing Plan_
