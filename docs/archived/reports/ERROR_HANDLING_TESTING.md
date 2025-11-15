# Error Handling Testing Guide

## Quick Start

All error handling components are in place. No additional setup needed. TypeScript compilation verified.

## Manual Testing Scenarios

### Scenario 1: Component Render Error

**Objective:** Verify ErrorBoundary catches component rendering errors

**Steps:**
1. Open any page in the app
2. Temporarily add an error in a component:
   ```tsx
   export function SomeComponent() {
     throw new Error('Test render error')
     return <div>Never shown</div>
   }
   ```
3. Navigate to page with this component

**Expected Result:**
- Full-page error UI displays
- Red AlertCircle icon visible
- Title: "Something went wrong"
- Error message visible
- "Try again" button present
- "Go home" button present
- Error details visible in development mode

**Recovery:**
- Click "Try again" - error clears and component re-renders
- Click "Go home" - navigates to homepage

---

### Scenario 2: Route-Level Error

**Objective:** Verify error.tsx catches route errors

**Steps:**
1. Temporarily add an error in a page component:
   ```tsx
   // /app/traces/page.tsx
   export default function TracesPage() {
     throw new Error('Test route error')
     return <div>Never shown</div>
   }
   ```
2. Navigate to /traces

**Expected Result:**
- Route error page displays
- Red AlertCircle icon visible
- Title: "Page error"
- Error message visible
- "Try again" button present
- "Go home" button present
- Error details visible in development mode

**Recovery:**
- Click "Try again" - route is retried and re-rendered
- Click "Go home" - navigates to homepage

---

### Scenario 3: API Error - 404 Not Found

**Objective:** Verify API errors show toast notifications

**Steps:**
1. Open browser DevTools Console
2. In console, trigger an API call to non-existent endpoint:
   ```ts
   import { apiClient } from '@/lib/api-client'
   await apiClient.getTrace('nonexistent-id')
   ```

**Expected Result:**
- Toast notification appears (top-right)
- Message: "Resource not found"
- Toast auto-dismisses after 3 seconds
- Error logged to console

**Recovery:**
- User can retry the action

---

### Scenario 4: API Error - 401 Unauthorized

**Objective:** Verify auth errors show appropriate message

**Steps:**
1. Temporarily modify apiClient to use invalid token:
   ```ts
   apiClient.setAuth('invalid_token', 'workspace_default')
   ```
2. Trigger an API call:
   ```ts
   await apiClient.listIntegrations()
   ```

**Expected Result:**
- Toast notification: "Authentication failed"
- Error logged to console
- No toast on success (normal operation continues)

---

### Scenario 5: API Error - 500 Server Error

**Objective:** Verify server errors show generic message

**Steps:**
1. Mock API to return 500:
   ```ts
   // In browser console or via mock
   await fetch('http://localhost:8787/v1/api/traces', {
     method: 'GET'
   })
   // Response: { status: 500, json: { error: { message: 'Server error' } } }
   ```

**Expected Result:**
- Toast notification: "Server error. Please try again later"
- User can retry
- No sensitive server details exposed

---

### Scenario 6: Network Error (Offline)

**Objective:** Verify network errors are handled

**Steps:**
1. Disable network in DevTools (or go offline)
2. Try to make an API call:
   ```ts
   await apiClient.listIntegrations()
   ```

**Expected Result:**
- Toast notification: "Network error occurred"
- Error logged to console
- App remains responsive

**Recovery:**
- Re-enable network
- Retry action

---

## Testing Checklist

### React Error Boundary
- [ ] Component error caught by ErrorBoundary
- [ ] Error UI displays with correct styling
- [ ] "Try again" button resets error state
- [ ] "Go home" button navigates to homepage
- [ ] Error details show in development mode
- [ ] Error details hidden in production mode
- [ ] Error logged to console

### Next.js Error Page
- [ ] Route error caught by error.tsx
- [ ] Error UI displays (similar to ErrorBoundary)
- [ ] "Try again" button retries route
- [ ] "Go home" button navigates to homepage
- [ ] Error details show in development mode
- [ ] Error logged to console

### API Error Handling
- [ ] 404 shows "Resource not found"
- [ ] 401 shows "Authentication failed"
- [ ] 403 shows "Permission denied"
- [ ] 5xx shows "Server error. Please try again later"
- [ ] Other errors show default message
- [ ] Network errors show "Network error occurred"
- [ ] Toast notifications appear top-right
- [ ] Toast auto-dismisses
- [ ] Errors logged to console

### Visual Testing
- [ ] Error UI is centered and readable
- [ ] Icons display correctly
- [ ] Buttons are clickable and styled
- [ ] Text is clear and user-friendly
- [ ] Responsive on mobile/tablet
- [ ] Color scheme matches app design (red for error)

---

## Automated Testing Suggestions

### Unit Tests (Jest + React Testing Library)

```typescript
// components/error-boundary.test.tsx
import { ErrorBoundary } from '@/components/error-boundary'
import { render, screen } from '@testing-library/react'

describe('ErrorBoundary', () => {
  it('catches errors and displays error UI', () => {
    const ThrowError = () => {
      throw new Error('Test error')
    }

    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    )

    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
    expect(screen.getByText('Try again')).toBeInTheDocument()
  })

  it('resets error on try again click', () => {
    const ComponentThatMayError = () => {
      const [error, setError] = useState(false)
      if (error) throw new Error('Test')
      return <button onClick={() => setError(true)}>Trigger</button>
    }

    render(
      <ErrorBoundary>
        <ComponentThatMayError />
      </ErrorBoundary>
    )

    screen.getByText('Trigger').click()
    // Error UI should show
    screen.getByText('Try again').click()
    // Component should render normally
  })
})
```

### Integration Tests

```typescript
// lib/api-client.test.ts
import { apiClient } from '@/lib/api-client'
import { toast } from 'sonner'

jest.mock('sonner')

describe('APIClient Error Handling', () => {
  it('shows toast on API error', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: { message: 'Not found' } })
    })

    try {
      await apiClient.getTrace('invalid')
    } catch (e) {
      // Expected
    }

    expect(toast.error).toHaveBeenCalledWith('Resource not found')
  })
})
```

---

## Performance Testing

### Error Boundary Performance
- Measure: Time to render error UI after error
- Expected: < 100ms
- Test: Add timing in `componentDidCatch`

### API Error Toast Performance
- Measure: Time to show toast after failed API call
- Expected: < 50ms
- Test: Use performance.mark/measure

### Memory Impact
- Error boundary should not leak memory on reset
- Toast notifications should be garbage collected after dismiss
- Test with Chrome DevTools Memory profiler

---

## Browser DevTools Testing

### Console Testing
```ts
// Test ErrorBoundary logging
// Look for: "Error caught by boundary: [Error message]"

// Test API error logging
import { apiClient } from '@/lib/api-client'
apiClient.setAuth('test', 'test')
apiClient.listIntegrations()
// Look for: Failed request logged

// Test network error logging
// Go offline in DevTools, trigger request
// Look for: Network error logged
```

### Network Tab Testing
```
1. Open DevTools Network tab
2. Make API requests
3. Failed requests (red status) should trigger toast
4. Monitor headers and response status
```

### Elements/Inspector Testing
```
1. Trigger error in page
2. Inspect error UI in DevTools
3. Verify:
   - Correct CSS classes applied
   - Proper DOM structure
   - Tailwind classes working
   - Responsive design in different viewport sizes
```

---

## Accessibility Testing

### Keyboard Navigation
- [ ] Error button focusable with Tab key
- [ ] Can click "Try again" with Enter/Space
- [ ] Can click "Go home" with Enter/Space
- [ ] Tab order is logical

### Screen Reader Testing
- [ ] Error icon has proper aria-label
- [ ] Headings properly marked up
- [ ] Buttons have accessible names
- [ ] Toast is announced to screen readers

### Color Contrast
- [ ] Red error icon has sufficient contrast
- [ ] Text color meets WCAG AA standards
- [ ] White button text on red background is readable

---

## Production Testing

### Before Deploying
1. [ ] All TypeScript types check (`npm run type-check`)
2. [ ] Build succeeds (`npm run build`)
3. [ ] No console errors in dev
4. [ ] Error details hidden (NODE_ENV check)
5. [ ] Toast library initialized in providers
6. [ ] ErrorBoundary imported in layout
7. [ ] error.tsx file exists in app directory

### Monitoring After Deploy
1. Monitor error logs/tracking service
2. Check user feedback for error-related issues
3. Monitor network errors in production
4. Track error page visit frequency
5. Monitor performance impact

---

## Debugging Tips

### If errors aren't caught:
1. Check ErrorBoundary is at top level in layout
2. Verify error.tsx file name is correct
3. Check error is thrown before render (not in event handler)
4. Inspect React DevTools for error boundary

### If toasts don't appear:
1. Check Toaster is in Providers component
2. Verify toast.error is imported in api-client
3. Check sonner package is installed
4. Inspect network tab for API responses

### If recovery buttons don't work:
1. Check Button component imports correctly
2. Verify onClick handlers are bound
3. Check window.location.href is set correctly
4. Test in different browsers

---

## Known Limitations

1. ErrorBoundary doesn't catch:
   - Event handlers (use try-catch)
   - Asynchronous code (use try-catch)
   - SSR rendering on server (caught by server error handler)

2. Toast notifications may be missed if:
   - App is backgrounded/minimized
   - User quickly navigates away
   - Multiple errors happen quickly (shows last one)

3. Development-only error details:
   - Hidden in production (by design)
   - May not show full stack traces in production

---

## Next Steps

1. Implement error tracking service (Sentry, LogRocket)
2. Add specific error page for 404/403
3. Add retry logic with exponential backoff
4. Add error reporting feature for users
5. Add error analytics dashboard
