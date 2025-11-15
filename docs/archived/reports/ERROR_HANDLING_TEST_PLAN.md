# Error Handling Test Plan

## Overview
This document outlines how to test the comprehensive error handling implementation across the iofold application.

## Components Implemented

### 1. Skeleton Loaders (`/frontend/components/ui/skeleton.tsx`)
- **Skeleton**: Base loading placeholder component
- **TableSkeleton**: Loading state for table/list views
- **CardSkeleton**: Loading state for card components
- **GridSkeleton**: Loading state for grid layouts

### 2. Error State Component (`/frontend/components/ui/error-state.tsx`)
- User-friendly error display with icon
- Retry button (when onRetry provided)
- Optional "Go Home" button
- Developer mode error details (only in development)

### 3. Enhanced API Client (`/frontend/lib/api-client.ts`)
- Improved error handling with NetworkError class
- Better JSON parsing error handling
- Network-specific error detection
- Toast notifications for all errors
- Automatic retry logic (2 retries) in queries

### 4. Enhanced Button Component (`/frontend/components/ui/button.tsx`)
- Loading prop for automatic spinner display
- Disabled state during loading
- Spinner automatically positioned

### 5. Updated Pages with Error Handling
All major pages now include:
- Loading states with skeleton loaders
- Error states with retry functionality
- Proper error boundaries
- Retry logic (2 attempts)

Pages updated:
- `/frontend/app/traces/page.tsx`
- `/frontend/app/evals/page.tsx`
- `/frontend/app/integrations/page.tsx`
- `/frontend/app/eval-sets/page.tsx`
- `/frontend/app/eval-sets/[id]/page.tsx`

### 6. Test Page (`/frontend/app/test-errors/page.tsx`)
Special page for testing error scenarios

## Testing Instructions

### Test 1: Error Boundaries

**Steps:**
1. Navigate to `http://localhost:3000/test-errors`
2. Click "Trigger Component Error"

**Expected Result:**
- Error boundary catches the error
- User sees a friendly error message with:
  - "Something went wrong" heading
  - Explanation text
  - "Try again" button
  - "Go home" button
  - Error details (in development mode only)

**Verification:**
- [ ] Error boundary displays
- [ ] No app crash
- [ ] Console shows error log
- [ ] "Try again" button resets the error
- [ ] "Go home" button navigates to home

---

### Test 2: API Error (404)

**Steps:**
1. Navigate to `http://localhost:3000/test-errors`
2. Click "Trigger API Error"

**Expected Result:**
- Button shows loading spinner
- Toast notification appears with "Resource not found" message
- Error is logged to console

**Verification:**
- [ ] Loading spinner appears in button
- [ ] Toast notification displays
- [ ] Error message is user-friendly
- [ ] Console shows detailed error

---

### Test 3: Network Error

**Steps:**
1. Navigate to `http://localhost:3000/test-errors`
2. Click "Trigger Network Error"

**Expected Result:**
- Button shows loading spinner
- Toast notification appears with "Network error. Please check your connection."
- Error is logged to console

**Verification:**
- [ ] Loading spinner appears in button
- [ ] Toast notification displays
- [ ] Error message mentions network/connection
- [ ] Console shows detailed error

---

### Test 4: Skeleton Loading States

**Steps:**
1. Navigate to any list page (Traces, Evals, Integrations, Eval Sets)
2. Observe the initial loading state

**Expected Result:**
- Skeleton loaders appear immediately
- Skeletons match the layout of actual content
- Smooth transition from skeleton to content

**Verification:**
- [ ] Skeletons appear on initial load
- [ ] Skeletons are animated (pulse effect)
- [ ] Transition to real content is smooth
- [ ] No layout shift when content loads

---

### Test 5: Page-Level Error States

**Steps:**
1. Stop the backend API server
2. Navigate to any list page (Traces, Evals, etc.)
3. Wait for the error to appear

**Expected Result:**
- After loading, error state component appears
- Shows user-friendly error message
- "Try again" button is visible
- Clicking "Try again" attempts to refetch data

**Verification:**
- [ ] Error state component displays
- [ ] Error message is clear and helpful
- [ ] "Try again" button works
- [ ] Retry attempts are made (check Network tab)

---

### Test 6: Form Submission Loading States

**Steps:**
1. Navigate to Integrations page
2. Click "Add Integration"
3. Fill in the form
4. Click "Create Integration"

**Expected Result:**
- Submit button shows loading spinner
- Button is disabled during submission
- Form fields are disabled during submission
- Success or error feedback appears

**Verification:**
- [ ] Loading spinner appears in button
- [ ] Button becomes disabled
- [ ] Form is disabled during submission
- [ ] Toast appears on success/error

---

### Test 7: Modal Error Handling

**Steps:**
1. Navigate to an Eval Set detail page
2. Click "Generate Eval"
3. Submit the form with valid data
4. Observe the job status modal

**Expected Result:**
- Modal shows loading state while job runs
- Progress bar updates (if supported)
- Success or failure state appears
- Appropriate buttons appear based on status

**Verification:**
- [ ] Loading indicators appear
- [ ] Progress updates are visible
- [ ] Success state shows properly
- [ ] Error state shows properly
- [ ] Modal can be closed after completion

---

### Test 8: Offline Mode

**Steps:**
1. Open DevTools Network tab
2. Set network to "Offline"
3. Try to navigate to any data page
4. Try to submit any form

**Expected Result:**
- Network error toast appears
- Error states show appropriate messages
- Retry functionality works when back online

**Verification:**
- [ ] Network errors are caught
- [ ] User-friendly messages appear
- [ ] No unhandled promise rejections
- [ ] App doesn't crash

---

### Test 9: Server Error (500)

**Steps:**
1. Modify API to return 500 error for a specific endpoint
2. Trigger that endpoint from the frontend

**Expected Result:**
- Toast shows "Server error. Please try again later"
- Error is logged to console
- App continues to function

**Verification:**
- [ ] Server error is caught
- [ ] User-friendly message appears
- [ ] No app crash
- [ ] Retry mechanism works

---

### Test 10: Development Mode Error Details

**Steps:**
1. Ensure `NODE_ENV=development`
2. Trigger any error (component, API, network)

**Expected Result:**
- Error details are visible in error states
- Stack traces appear in console
- Error boundaries show error message

**Verification:**
- [ ] Error details visible in UI
- [ ] Console shows full stack traces
- [ ] Helpful debugging information available

---

## Error Types Covered

1. **Component Errors**: Caught by ErrorBoundary
2. **API Errors (4xx)**: User-friendly messages with retry
3. **Server Errors (5xx)**: Generic error messages with retry
4. **Network Errors**: Connection-specific messages
5. **Validation Errors**: Inline form validation
6. **Timeout Errors**: Handled by query retry logic
7. **JSON Parse Errors**: Handled in API client

## Success Criteria

All tests should pass with:
- [ ] No unhandled errors in console
- [ ] User always sees helpful feedback
- [ ] Loading states provide clear feedback
- [ ] Retry mechanisms work reliably
- [ ] Error boundaries prevent app crashes
- [ ] Toast notifications appear for all API errors
- [ ] Development mode shows detailed errors
- [ ] Production mode hides technical details

## Additional Notes

- **Retry Logic**: All queries retry 2 times by default
- **Toast Duration**: Errors remain visible for user acknowledgment
- **Error Logging**: All errors logged to console in development
- **Graceful Degradation**: App remains functional even with errors
- **User Feedback**: Clear, non-technical error messages for end users
