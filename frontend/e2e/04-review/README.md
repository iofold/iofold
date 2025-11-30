# Review Page E2E Tests

Comprehensive end-to-end tests for the Daily Quick Review page.

## File
- `review-page.spec.ts` - 56 test cases covering all review page functionality

## Test Coverage

### 1. Page Load and Initial State (6 tests)
- ✅ Review page loads successfully
- ✅ Header with back button displays
- ✅ Progress indicators visible
- ✅ Auto mode toggle button
- ✅ Estimated remaining time
- ✅ Demo/Live toggle button

### 2. Trace Card Display (7 tests)
- ✅ User input section displays
- ✅ Agent response section displays
- ✅ Trace metadata (timestamp, duration, score)
- ✅ Model and token information
- ✅ Quick notes textarea
- ✅ Keyboard shortcut hints

### 3. Feedback Actions (7 tests)
- ✅ Good feedback submission and advance
- ✅ Bad feedback submission and advance
- ✅ Okay feedback submission and advance
- ✅ Toast notifications on feedback
- ✅ Notes clearing after submission
- ✅ Trace card transition animation
- ✅ Progress updates

### 4. Progress Tracking (4 tests)
- ✅ Progress counter updates correctly
- ✅ Good/Okay/Bad counts tracked independently
- ✅ Remaining time estimate updates
- ✅ Color-coded feedback badges

### 5. Keyboard Shortcuts (6 tests)
- ✅ Key "1" submits Bad feedback
- ✅ Key "2" submits Okay feedback
- ✅ Key "3" submits Good feedback
- ✅ Key "a" toggles Auto mode
- ✅ Arrow keys navigate between traces
- ✅ Shortcuts disabled in textarea

### 6. Auto Mode (3 tests)
- ✅ Toggle auto mode on click
- ✅ Play icon when auto mode is off
- ✅ Toast notification on toggle

### 7. Empty State (2 tests)
- ✅ Empty state displays when no traces
- ✅ "No Traces Available" message

### 8. Completion State (6 tests)
- ✅ Completion screen after all traces reviewed
- ✅ Celebration emoji display
- ✅ Summary statistics
- ✅ Average time per trace
- ✅ "View Agents" button
- ✅ "Review More" button

### 9. Navigation (3 tests)
- ✅ Back button navigates to agents page
- ✅ Navigation from completion screen
- ✅ Page reload to review more

### 10. Notes Functionality (3 tests)
- ✅ Typing in notes textarea
- ✅ 500 character limit enforcement
- ✅ Notes clearing after feedback

### 11. Demo vs Live Mode (3 tests)
- ✅ Toggle between demo and live mode
- ✅ Demo button styling
- ✅ Mock traces load in demo mode

### 12. Responsive Design (3 tests)
- ✅ Mobile viewport (375x667)
- ✅ Tablet viewport (768x1024)
- ✅ Desktop viewport (1920x1080)

### 13. Accessibility (5 tests)
- ✅ Proper heading hierarchy
- ✅ ARIA attributes on icons
- ✅ Focusable interactive elements
- ✅ Proper button labels
- ✅ Proper form labels

## Running Tests

### Run all review page tests
```bash
npx playwright test e2e/04-review
```

### Run specific test
```bash
npx playwright test e2e/04-review/review-page.spec.ts
```

### Run in headed mode (see browser)
```bash
npx playwright test e2e/04-review --headed
```

### Run in UI mode (interactive)
```bash
npx playwright test e2e/04-review --ui
```

### Run specific test by name
```bash
npx playwright test e2e/04-review -g "should submit Good feedback"
```

### Debug mode
```bash
npx playwright test e2e/04-review --debug
```

### Run on specific browser
```bash
npx playwright test e2e/04-review --project=chromium
npx playwright test e2e/04-review --project=firefox
npx playwright test e2e/04-review --project=webkit
```

## Test Helpers

### `waitForReviewPageLoad(page: Page)`
Waits for the review page to fully load:
- Network idle state
- Main heading visibility

Usage:
```typescript
await waitForReviewPageLoad(page)
```

### `ensureDemoMode(page: Page)`
Ensures the page is in demo mode for consistent test data:
- Checks current mode (Demo/Live button text)
- Switches to demo mode if needed
- Waits for state update

Usage:
```typescript
await ensureDemoMode(page)
```

## Key Features Tested

### Feedback Workflow
1. User views trace with input/output
2. User can add optional notes
3. User submits feedback (Good/Okay/Bad)
4. Toast notification appears
5. Card animates out
6. Next trace loads
7. Progress counters update
8. Notes are cleared

### Keyboard Shortcuts
- `1` - Submit Bad feedback
- `2` - Submit Okay feedback  
- `3` - Submit Good feedback
- `a` - Toggle Auto mode
- `←` - Previous trace (if available)
- `→` - Next trace (if available)

### States
- **Initial**: Shows first trace, 0/N progress
- **In Progress**: Shows current trace, X/N progress, counters update
- **Complete**: Shows summary screen with stats and actions

## Notes for Developers

1. **Demo Mode**: Tests use demo mode by default for consistent mock data
2. **Animations**: Tests include `waitForTimeout(500)` to handle card transitions
3. **Toast Notifications**: Tested using `[data-sonner-toast]` selector
4. **Progress Updates**: Verified by parsing counter text (e.g., "1/5")
5. **Keyboard Events**: Tested using `page.keyboard.press()`

## Common Test Patterns

### Testing feedback submission:
```typescript
// Get initial count
const initialCount = await page.locator('text=/Good: \\d+/').textContent()

// Submit feedback
await page.getByRole('button', { name: /✅.*good/i }).click()

// Wait for animation
await page.waitForTimeout(500)

// Verify count increased
const newCount = await page.locator('text=/Good: \\d+/').textContent()
expect(newCount).toBe(initialCount + 1)
```

### Testing keyboard shortcuts:
```typescript
// Press key
await page.keyboard.press('3')

// Wait for action
await page.waitForTimeout(500)

// Verify result
await expect(page.locator('text=/Good: \\d+/')).toContainText('1')
```

### Testing navigation:
```typescript
// Click button
await page.getByRole('button', { name: /back/i }).click()

// Verify navigation
await page.waitForURL(/\/agents/)
```

## Maintenance

When updating the review page:

1. **New features**: Add corresponding test cases
2. **UI changes**: Update selectors if needed
3. **New states**: Add tests for new states
4. **Breaking changes**: Update helper functions if needed

## Troubleshooting

### Test times out waiting for page
- Verify dev server is running on port 3000
- Check `webServer` config in playwright.config.ts
- Increase timeout in test or config

### Element not found
- Use Playwright Inspector: `npx playwright test --debug`
- Verify selector with: `await page.locator(...).count()`
- Check if element is in demo mode

### Flaky tests
- Add explicit waits for animations
- Use `waitForLoadState('networkidle')`
- Ensure proper demo mode setup

### Screenshots/videos not saved
- Check `use.screenshot` and `use.video` in playwright.config.ts
- Verify `test-results/` directory exists
- Run with `--trace on` for detailed traces
