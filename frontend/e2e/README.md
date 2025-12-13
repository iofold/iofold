# IOFold Frontend E2E Tests

This directory contains end-to-end tests for the IOFold frontend application using Playwright.

## Directory Structure

```
e2e/
├── 03-traces/              # Traces explorer page tests
│   ├── trace-list.spec.ts      # Trace list, filtering, sorting, detail panel
│   └── import-traces.spec.ts   # Import traces modal and integration
├── 04-accessibility/       # Accessibility compliance tests (WCAG 2.1 AA)
│   └── accessibility.spec.ts
├── 04-review/              # Review page tests
│   └── review-page.spec.ts
├── 05-playground/          # Agent playground tests
│   └── playground.spec.ts
├── 06-evals/               # Evals list page tests
│   └── evals-list.spec.ts
├── 07-staging/             # Staging-specific integration tests
│   ├── agents-flow-test.spec.ts
│   ├── staging-traces-flow.spec.ts
│   ├── staging-evals-*.spec.ts
│   └── test-tasksets-staging.spec.ts
├── fixtures/               # Test fixtures and helpers
│   └── clerk-auth.ts           # Authentication helpers
├── global.setup.ts         # Clerk authentication setup (runs first)
├── CLERK_TESTING_SETUP.md  # Comprehensive auth documentation
└── README.md
```

## Traces Tests

The traces test suite (`03-traces/`) includes comprehensive tests for the traces explorer page:

### trace-list.spec.ts

Tests for the main traces list page functionality:

1. **Page Layout** - Header, title, description rendering
2. **KPI Cards** - Total traces, reviewed, error rate, step count display
3. **Traces Table** - All columns render correctly (Timestamp, Trace ID, Input Preview, Status, Steps, Source, Feedback, Actions)
4. **Status Badges** - Correct rendering based on error state and feedback (success/error/pending)
5. **Timestamps** - Display with `suppressHydrationWarning` in both table (relative) and detail panel (formatted)
6. **Filtering** - By status, source, model, search query, date range
7. **Sorting** - By timestamp and step count (ascending/descending)
8. **Row Selection** - Single and bulk selection with checkboxes
9. **Trace Detail Panel** - Side sheet with full trace information
10. **Keyboard Shortcuts** - 'f' to toggle filters
11. **Copy to Clipboard** - Trace ID copying functionality
12. **Empty States** - No traces or filtered results
13. **Live Data Indicator** - Real-time updates display
14. **Source and Feedback Badges** - Correct styling and capitalization

### import-traces.spec.ts

Tests for the import traces modal and integration:

1. **Modal Opening/Closing** - Via button, cancel, escape key
2. **Form Fields** - Source selection, API key, date range inputs
3. **Form Validation** - Required fields, date range validation
4. **API Key Input** - Password field with proper masking
5. **Date Range Selection** - Start and end date validation
6. **Import Process** - Submit, loading states, progress indicators
7. **Success Handling** - Success messages and trace list updates
8. **Error Handling** - Error messages and retry capability
9. **Form State** - Preservation when reopening modal
10. **Disabled States** - Submit button disabled when form invalid
11. **Help Text** - Tooltips and field descriptions

## Accessibility Tests

The accessibility test suite (`04-accessibility/accessibility.spec.ts`) includes 8 comprehensive tests:

### Core Tests

1. **Focus Indicators** - Verifies all interactive elements have visible focus indicators
2. **Tab Navigation** - Ensures tab order follows logical sequence
3. **Escape Key** - Tests that Escape key closes modals and dialogs
4. **ARIA Labels** - Checks icon buttons have proper ARIA labels
5. **Form Labels** - Validates form inputs have associated labels
6. **Error Messages** - Verifies error messages are linked via aria-describedby
7. **Skip Link** - Tests skip to main content functionality
8. **Color Contrast** - Validates WCAG AA color contrast ratios (4.5:1 normal, 3:1 large text)

### Bonus Tests

- Keyboard shortcuts documentation
- Review page keyboard navigation (1/2/3 shortcuts)
- Focus trap in modals

## Authentication Setup

This test suite uses Clerk's official testing utilities for authentication. See [CLERK_TESTING_SETUP.md](./CLERK_TESTING_SETUP.md) for detailed documentation.

### Quick Setup

1. Add test user credentials to `.env.local`:
   ```bash
   E2E_CLERK_USER_USERNAME=your-test-user@example.com
   E2E_CLERK_USER_PASSWORD=YourTestPassword123!
   PLAYWRIGHT_TEST_BASE_URL=https://platform.staging.iofold.com
   ```

2. The global setup will authenticate once and save the session state
3. All tests will reuse the authenticated state for faster execution

### Features

- **Testing Token** - Bypasses Turnstile CAPTCHA during tests
- **Auth State Persistence** - Sign in once, reuse for all tests
- **Flexible Authentication** - Tests can override auth state when needed

## Setup

### Installation

```bash
# Install Playwright and browsers
pnpm add -D @playwright/test
pnpm exec playwright install
```

### Update package.json

Add these scripts to `package.json`:

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:accessibility": "playwright test e2e/04-accessibility",
    "test:e2e:headed": "playwright test --headed",
    "test:e2e:debug": "playwright test --debug",
    "test:e2e:report": "playwright show-report"
  }
}
```

## Running Tests

### Run all tests

```bash
pnpm run test:e2e
```

### Run specific test suites

```bash
# Accessibility tests only
pnpm run test:e2e:accessibility

# Traces tests only
pnpm exec playwright test e2e/03-traces

# Specific test file
pnpm exec playwright test e2e/03-traces/trace-list.spec.ts
```

### Run in UI mode (interactive)

```bash
pnpm run test:e2e:ui
```

### Run in headed mode (see browser)

```bash
pnpm run test:e2e:headed
```

### Debug mode

```bash
pnpm run test:e2e:debug
```

### View test report

```bash
pnpm run test:e2e:report
```

## Running Specific Tests

```bash
# Run single test file
pnpm exec playwright test e2e/04-accessibility/accessibility.spec.ts

# Run specific test by name
pnpm exec playwright test -g "focus indicators"

# Run on specific browser
pnpm exec playwright test --project=chromium

# Run on mobile viewport
pnpm exec playwright test --project="Mobile Chrome"
```

## Configuration

Tests are configured via `playwright.config.ts` in the frontend root directory.

Key settings:
- **Base URL**: `http://localhost:3000` (configurable via `PLAYWRIGHT_BASE_URL` env var)
- **Browsers**: Chromium, Firefox, WebKit, Mobile Chrome, Mobile Safari
- **Retries**: 2 retries on CI, 0 locally
- **Reporters**: HTML, List, JSON
- **Screenshots**: On failure
- **Videos**: Retained on failure
- **Traces**: On first retry

## CI Integration

Tests automatically run in CI environments with:
- 2 retry attempts
- Sequential execution (no parallel)
- HTML and JSON reports
- Test artifacts (screenshots, videos, traces)

## Accessibility Standards

Tests are based on **WCAG 2.1 Level AA** guidelines:

- **Perceivable**: Color contrast, text alternatives
- **Operable**: Keyboard access, focus indicators, skip links
- **Understandable**: Labels, error identification
- **Robust**: ARIA attributes, semantic HTML

### Contrast Requirements

- **Normal text** (< 18pt): 4.5:1 minimum
- **Large text** (≥ 18pt or ≥ 14pt bold): 3:1 minimum
- **UI components**: 3:1 minimum

## Test Development

### Helper Functions

The accessibility spec includes helper functions:

- `hasFocusIndicator(element)` - Check for visible focus styles
- `getContrastRatio(element)` - Calculate color contrast ratio

### Adding New Tests

1. Create test file in appropriate directory
2. Follow existing test patterns
3. Use `page.getByRole()` for accessible element selection
4. Add descriptive test names and comments
5. Include console logging for debugging

### Best Practices

- Use semantic locators (`getByRole`, `getByLabel`, `getByText`)
- Test keyboard navigation thoroughly
- Verify ARIA attributes
- Check focus management in modals
- Test on multiple viewports
- Add appropriate wait times for animations

## Debugging

### Visual Debugging

```bash
# Open Playwright Inspector
pnpm exec playwright test --debug

# Generate trace file
pnpm exec playwright test --trace on

# View trace
pnpm exec playwright show-trace trace.zip
```

### Console Logs

Tests include console.log statements for debugging:
- Tab navigation order
- Keyboard shortcuts found
- Contrast ratios
- Missing ARIA labels

## Common Issues

### Tests failing locally

1. Ensure dev server is running: `pnpm run dev`
2. Clear browser cache
3. Check base URL in config
4. Verify element selectors are up to date

### Color contrast failures

1. Check CSS custom properties in `globals.css`
2. Verify Tailwind color definitions
3. Test in light and dark modes
4. Consider text size and weight

### Focus indicator issues

1. Verify `:focus-visible` styles in CSS
2. Check for `outline: none` overrides
3. Test with keyboard navigation only
4. Ensure sufficient contrast for focus rings

## Resources

- [Playwright Documentation](https://playwright.dev)
- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [WAI-ARIA Practices](https://www.w3.org/WAI/ARIA/apg/)
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [Accessible Color Palette Builder](https://toolness.github.io/accessible-color-matrix/)

## Contributing

When adding new features:

1. Write accessibility tests alongside feature tests
2. Ensure keyboard navigation works
3. Add ARIA labels to icon buttons
4. Verify color contrast
5. Test with screen reader if possible
6. Document keyboard shortcuts

## Support

For issues or questions:
- Check existing test output and traces
- Review console logs in test results
- Run tests in debug mode
- Consult WCAG guidelines for requirements
