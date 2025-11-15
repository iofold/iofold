# Test Execution Bug Report
**Date**: 2025-11-14  
**Tests Run**: 11 tests (5 integration, 6 trace)  
**Tests Passed**: 0  
**Tests Failed**: 6  
**Tests Skipped**: 5  

---

## Test Results Summary

### Integration Tests (5 tests)
- ❌ TEST-I01: Add Langfuse integration (happy path) - **FAILED**
- ❌ TEST-I02: Add integration with invalid credentials - **FAILED**
- ❌ TEST-I03: Test integration connection - **FAILED**
- ❌ TEST-I04: Delete integration - **FAILED**
- ❌ TEST-I05: List integrations - **FAILED**

### Trace Tests (6 tests)
- ❌ TEST-T01: Import traces (happy path) - **FAILED**
- ❌ TEST-T02: Import traces with limit - **FAILED**
- ⏭️ TEST-T05: Trace list display - **SKIPPED** (setup failed)
- ⏭️ TEST-T06: Trace detail view - **SKIPPED** (setup failed)
- ⏭️ TEST-T07: Submit positive feedback - **SKIPPED** (setup failed)
- ⏭️ TEST-T11: Keyboard shortcuts - **SKIPPED** (setup failed)

---

## Critical Issues Identified

### Issue 1: Form Field Selectors Don't Match UI Implementation
**Severity**: HIGH  
**Root Cause**: TEST BUG (not application bug)  
**Affected Tests**: TEST-I01, TEST-I02

**Problem**:
Tests are looking for form fields with `name` attributes:
- `input[name="name"]`
- `input[name="config.public_key"]`
- `input[name="config.secret_key"]`
- `input[name="config.base_url"]`

**Actual UI Implementation** (`AddIntegrationModal.tsx`):
- Fields use `id` attributes, not `name`:
  - `id="name"` (not `name="name"`)
  - `id="public-key"` (not `name="config.public_key"`)
  - `id="secret-key"` (not `name="config.secret_key"`)
  - `id="base-url"` (not `name="base_url"`)

**Solution**: Update test selectors to use `id` instead of `name`:
```typescript
await page.fill('#name', integrationName)
await page.fill('#public-key', publicKey)
await page.fill('#secret-key', secretKey)
await page.fill('#base-url', baseUrl)
```

**Files to Fix**:
- `/home/ygupta/workspace/iofold/tests/e2e/02-integrations/add-integration.spec.ts:33`
- `/home/ygupta/workspace/iofold/tests/e2e/02-integrations/integration-errors.spec.ts:19`

---

### Issue 2: Environment Variables Not Accessible in Tests
**Severity**: HIGH  
**Root Cause**: TEST BUG (environment configuration)  
**Affected Tests**: TEST-I03, TEST-I04, TEST-I05, and all trace tests

**Problem**:
Tests trying to access `process.env.LANGFUSE_PUBLIC_KEY` and `process.env.LANGFUSE_SECRET_KEY` but getting `undefined`.

**Actual Environment**:
`.env` file has:
```
LANGFUSE_PUBLIC_KEY=pk-lf-78e60694-d9e2-493d-bbad-17cbc2374c28
LANGFUSE_SECRET_KEY=REDACTED_LANGFUSE_KEY
```

**Solution**: Playwright doesn't automatically load `.env` files. Either:
1. Add `dotenv` loading to `playwright.config.ts`
2. Load environment vars in test setup
3. Use a test env file that Playwright loads

**Files to Fix**:
- `/home/ygupta/workspace/iofold/playwright.config.ts` - Add env loading

---

### Issue 3: Incorrect API Request Structure in Tests
**Severity**: HIGH  
**Root Cause**: TEST BUG  
**Affected Tests**: TEST-I04, TEST-I05, all trace tests

**Problem**:
Tests are sending API requests with this structure:
```typescript
{
  platform: 'langfuse',
  name: 'Test Integration',
  config: {                      // ❌ WRONG
    public_key: 'pk-...',
    secret_key: 'sk-...',
    base_url: '...'
  }
}
```

**Actual API Expectation** (`src/api/integrations.ts:49-54`):
```typescript
{
  platform: 'langfuse',
  name: 'Test Integration', 
  api_key: 'pk-...:sk-...',      // ✅ CORRECT - colon-separated
  base_url: '...'                // ✅ CORRECT - top level
}
```

**UI Implementation** (`AddIntegrationModal.tsx:82-89`):
The modal stores keys as `public_key:secret_key` in a single `api_key` field.

**Solution**: Update test API requests to match API schema:
```typescript
const integration = await apiRequest<any>(page, '/api/integrations', {
  method: 'POST',
  data: {
    platform: 'langfuse',
    name: integrationName,
    api_key: `${publicKey}:${secretKey}`,  // Colon-separated
    base_url: baseUrl,
  },
})
```

**Files to Fix**:
- `/home/ygupta/workspace/iofold/tests/e2e/02-integrations/add-integration.spec.ts:88-99, 117-129, 160-172`
- `/home/ygupta/workspace/iofold/tests/fixtures/integrations.ts:13-28`

---

### Issue 4: Import Function Not Exported Correctly
**Severity**: HIGH  
**Root Cause**: TEST BUG  
**Affected Tests**: TEST-T01, TEST-T02, TEST-T05, TEST-T06, TEST-T07, TEST-T11

**Error**:
```
TypeError: (0 , _integrations.createTestIntegration) is not a function
```

**Problem**:
The fixture file exists and exports `createTestIntegration`, but tests are failing to import it. This is likely due to TypeScript compilation issues or incorrect import paths.

**Files to Check**:
- `/home/ygupta/workspace/iofold/tests/fixtures/integrations.ts:13`
- All test files importing from `../../fixtures/integrations`

---

## Detailed Test Failure Analysis

### TEST-I01: Add Langfuse integration (happy path)
**Status**: ❌ FAILED  
**Error**: `TimeoutError: page.fill: Timeout 15000ms exceeded`  
**Line**: `tests/e2e/02-integrations/add-integration.spec.ts:33`

**Root Cause**:
Test tries to fill `input[name="name"]` but UI uses `id="name"`.

**Expected Behavior**:
- User clicks "Add Integration" button
- Modal opens
- User fills form fields
- User clicks "Create Integration"
- Toast shows "Integration added successfully"
- Integration appears in list with "active" status

**Actual Behavior**:
- Modal opens (confirmed by screenshot)
- Test fails trying to find form field

**Fix Required**: TEST CODE  
Change selector from `input[name="name"]` to `#name`

---

### TEST-I02: Add integration with invalid credentials
**Status**: ❌ FAILED  
**Error**: `TimeoutError: page.fill: Timeout 15000ms exceeded`  
**Line**: `tests/e2e/02-integrations/integration-errors.spec.ts:19`

**Root Cause**: Same as TEST-I01 - wrong selectors

**Expected Behavior**:
- User submits form with invalid credentials
- API returns error OR integration created with inactive status
- Error message displayed to user

**Actual Behavior**:
Test can't fill form fields

**Fix Required**: TEST CODE  
Update selectors to use `id` attributes

---

### TEST-I03: Test integration connection  
**Status**: ❌ FAILED  
**Error**: `Error: LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY must be set`  
**Line**: `tests/e2e/02-integrations/add-integration.spec.ts:84`

**Root Cause**: Environment variables not loaded in test environment

**Fix Required**: TEST CONFIGURATION  
Add environment variable loading to playwright.config.ts

---

### TEST-I04: Delete integration
**Status**: ❌ FAILED  
**Error**: `API request failed: 400 {"error":{"code":"MISSING_REQUIRED_FIELD","message":"platform and api_key are required"}}`  
**Line**: `tests/e2e/02-integrations/add-integration.spec.ts:117`

**Root Cause**: Test sends wrong request structure (uses `config` object instead of flat structure)

**Expected Behavior**:
- Create integration via API
- Navigate to integrations page
- Click delete button
- Confirm deletion
- Integration removed from list

**Actual Behavior**:
API creation fails due to wrong request structure

**Fix Required**: TEST CODE  
Update API request to match schema (use `api_key` not `config`)

---

### TEST-I05: List integrations
**Status**: ❌ FAILED  
**Error**: Same as TEST-I04  
**Root Cause**: Same as TEST-I04

**Fix Required**: TEST CODE

---

### TEST-T01 & TEST-T02: Import traces
**Status**: ❌ FAILED  
**Error**: `TypeError: (0 , _integrations.createTestIntegration) is not a function`

**Root Cause**: Import issue with fixture file

**Fix Required**: TEST CODE  
Check import path and ensure function is properly exported

---

### TEST-T05, TEST-T06, TEST-T07, TEST-T11: Trace tests
**Status**: ⏭️ SKIPPED  
**Reason**: Setup failed due to import issue

**Fix Required**: Fix the import issue first

---

## Application Bugs Found

### None Identified Yet

All failures so far are due to test code issues:
1. Wrong CSS selectors
2. Environment configuration
3. API request structure mismatch

**Once test bugs are fixed, we need to re-run to find actual application bugs.**

---

## Recommendations

### Priority 1: Fix Test Selectors
Update all form field selectors to match actual UI:
- Use `#id` instead of `input[name="..."]`
- OR: Update UI to add `name` attributes to form fields

### Priority 2: Fix Environment Loading
Add to `playwright.config.ts`:
```typescript
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.resolve(__dirname, '.env') })
```

### Priority 3: Fix API Request Structure
Update all test API requests to match backend schema:
- Use `api_key: "pk:sk"` format
- Remove nested `config` object
- Put `base_url` at top level

### Priority 4: Fix Import Issues
Verify all fixture imports work correctly

---

## Next Steps

1. ✅ Document all failures (DONE)
2. ⬜ Fix test bugs (Priority 1-4 above)
3. ⬜ Re-run tests
4. ⬜ Identify actual application bugs
5. ⬜ Fix application bugs
6. ⬜ Re-run until all pass

---

## Test Environment
- **Node Version**: (run `node --version`)
- **Playwright Version**: 1.56.1
- **OS**: Linux 6.14.0-1017-gcp
- **Browser**: Chromium (Desktop Chrome)
- **Backend URL**: http://localhost:8787/v1
- **Frontend URL**: http://localhost:3000

---

_End of Bug Report_
