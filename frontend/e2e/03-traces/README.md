# Traces Page E2E Tests

Comprehensive end-to-end tests for the traces explorer page (`/traces`).

## Test Files

### trace-list.spec.ts
Tests the main traces list page with 36 test cases covering:

#### Layout & Display
- Page header and description
- KPI cards (Total Traces, Reviewed, Error Rate, Step Count)
- Traces table with 8 columns
- Live data indicator
- Keyboard shortcuts footer

#### Status & Badges
- Status badges (success/error/pending) based on `has_errors` and `feedback`
- Source badges with proper capitalization
- Feedback badges with color coding

#### Timestamp Display
- Relative timestamps in table ("5 minutes ago")
- Formatted timestamps in detail panel
- `suppressHydrationWarning` attribute verification
- No hydration errors

#### Filtering
- Filter panel toggle (button and 'f' keyboard shortcut)
- Filter by status (all/success/error/pending)
- Filter by source (langfuse/langsmith/openai)
- Filter by model
- Search by trace ID or input preview
- Date range filtering
- Active filter count badge
- Clear all filters

#### Sorting
- Sort by timestamp (ascending/descending)
- Sort by step count (ascending/descending)
- Sort direction indicators

#### Row Selection
- Single row checkbox selection
- Bulk selection (select all)
- Selection count display

#### Trace Detail Panel
- Open via row click or view button
- Display all trace fields:
  - Trace ID with copy button
  - Source
  - Timestamp (with suppressHydrationWarning)
  - Status badge
  - Step count
  - Input preview
  - Output preview
  - Feedback (if present)
- Close via Escape key
- Copy trace ID functionality

#### Empty States
- No traces imported
- No results after filtering
- Appropriate messaging and actions

### import-traces.spec.ts
Tests the import traces modal with 18 test cases covering:

#### Modal Behavior
- Open via Import Traces button
- Close via Cancel, close button, or Escape key

#### Form Fields
- Source selection dropdown
- API key input (password field)
- Date range inputs (start/end dates)
- Help text and tooltips

#### Form Validation
- Required field validation (API key)
- Date range validation (end > start)
- Submit button disabled when invalid

#### Import Process
- Form submission
- Loading state indicators
- Progress display
- Success message
- Error message
- Retry after failure

#### Data Integration
- Trace list updates after import
- Form state preservation

## Running Tests

### All traces tests
```bash
npx playwright test e2e/03-traces
```

### Specific test file
```bash
npx playwright test e2e/03-traces/trace-list.spec.ts
npx playwright test e2e/03-traces/import-traces.spec.ts
```

### With UI mode
```bash
npx playwright test e2e/03-traces --ui
```

### In debug mode
```bash
npx playwright test e2e/03-traces --debug
```

### Run specific test by name
```bash
npx playwright test -g "should display status badges"
npx playwright test -g "should filter traces by status"
```

## Key Implementation Details

### suppressHydrationWarning
The traces page uses `suppressHydrationWarning` on timestamp elements to prevent hydration mismatches between server and client rendering:

```tsx
<p suppressHydrationWarning>
  {new Date(timestamp).toLocaleString()}
</p>
```

Tests verify:
- Timestamps display correctly
- No hydration warnings in console
- Different formats in table vs detail panel

### Status Badge Logic
Status determined by combination of `has_errors` and `feedback.rating`:

```typescript
if (has_errors) → 'error'
else if (feedback?.rating === 'positive') → 'success'
else if (feedback?.rating === 'negative') → 'error'
else → 'neutral' (pending review)
```

Tests verify correct badge rendering for all combinations.

### Filtering Implementation
Two-tier filtering:

1. **Server-side** (via API params):
   - Source filter
   - Date range

2. **Client-side** (JavaScript):
   - Search query
   - Status filter
   - Model filter

Tests verify both layers work correctly.

## Test Patterns

### Waiting for Elements
```typescript
await page.waitForSelector('h1:has-text("Traces Explorer")', { timeout: 10000 })
```

### Checking Visibility
```typescript
await expect(page.locator('text=Total Traces')).toBeVisible()
```

### Keyboard Shortcuts
```typescript
await page.keyboard.press('f')
```

### Conditional Assertions
```typescript
if (await element.count() > 0) {
  await expect(element).toBeVisible()
}
```

### Copy to Clipboard
```typescript
await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
await copyButton.click()
```

## Test Data Requirements

Tests work with:
- Empty database (tests empty states)
- Seeded database (tests full functionality)

For best coverage, run tests against a database with:
- Traces with errors
- Traces with positive/negative/neutral feedback
- Traces from different sources
- Traces with varying step counts
- Recent and older traces

## Common Issues

### Test Timeout
If tests timeout waiting for elements:
1. Ensure dev server is running
2. Check API is responding
3. Verify database has data
4. Increase timeout if needed

### Hydration Warnings
If hydration warnings appear:
1. Verify `suppressHydrationWarning` is on timestamp elements
2. Check server/client time consistency
3. Ensure date formatting is consistent

### Filter Tests Failing
If filter tests fail:
1. Clear browser cache
2. Check API response format
3. Verify client-side filtering logic
4. Check for race conditions in state updates

### Modal Tests Failing
If modal tests fail:
1. Check modal open/close timing
2. Verify z-index and backdrop behavior
3. Ensure Escape key listener is attached
4. Check for focus trap issues

## Future Enhancements

### Add data-testid Attributes
For more stable selectors, add data-testid attributes:

```tsx
<button data-testid="import-traces-btn">Import Traces</button>
<div data-testid="trace-row-{id}">...</div>
<div data-testid="status-badge">...</div>
```

Then update tests to use:
```typescript
await page.getByTestId('import-traces-btn').click()
```

### Add Accessibility Tests
- Keyboard navigation through table
- Screen reader announcements
- Focus management
- ARIA labels

### Add Performance Tests
- Large dataset rendering
- Filter performance
- Infinite scroll/pagination
- Memory leaks

### Add Visual Regression Tests
- Screenshot comparison
- CSS styling verification
- Responsive design checks

## Debugging

### View Test in Browser
```bash
npx playwright test --headed --debug
```

### Generate Trace
```bash
npx playwright test --trace on
npx playwright show-trace trace.zip
```

### Console Logs
Tests include console.log statements for debugging. View with:
```bash
npx playwright test --headed
```

### Playwright Inspector
```bash
PWDEBUG=1 npx playwright test
```

## Related Documentation

- [Main E2E README](/frontend/e2e/README.md)
- [Playwright Configuration](/frontend/playwright.config.ts)
- [Traces Page Implementation](/frontend/app/traces/page.tsx)
- [API Client](/frontend/lib/api-client.ts)
