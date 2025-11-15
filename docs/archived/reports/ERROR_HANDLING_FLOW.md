# Error Handling Flow Diagram

## Error Handling Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      User Action / Event                         │
└────────────────────────────┬────────────────────────────────────┘
                             │
                ┌────────────┴────────────┐
                │                         │
         ┌──────▼──────┐          ┌──────▼──────┐
         │  Component  │          │  API Call   │
         │   Render    │          │  Request    │
         └──────┬──────┘          └──────┬──────┘
                │                        │
        ┌───────▼──────────┐     ┌──────▼──────────┐
        │  Error Thrown?   │     │  Response OK?   │
        └───────┬──────────┘     └──────┬──────────┘
                │                        │
         ┌──────▼──────┐          ┌──────▼──────┐
         │   YES       │          │    NO       │
         └──────┬──────┘          └──────┬──────┘
                │                        │
       ┌────────▼────────┐      ┌────────▼────────┐
       │  ErrorBoundary  │      │  Create APIError│
       │  Catches Error  │      │  getErrorMsg()  │
       └────────┬────────┘      └────────┬────────┘
                │                        │
       ┌────────▼──────────────┐  ┌──────▼──────┐
       │ Update hasError state │  │ Show Toast  │
       │ Log to console        │  │ Notification│
       └────────┬──────────────┘  └──────┬──────┘
                │                        │
       ┌────────▼──────────────┐  ┌──────▼──────┐
       │ Render Error UI       │  │ Throw Error │
       │ - Red icon            │  │ to caller   │
       │ - Error message       │  └──────┬──────┘
       │ - Try again button    │         │
       │ - Go home button      │    ┌────▼──────────┐
       │ - Error details (dev) │    │ Handled by    │
       └─────────────────────  │    │ React Query   │
                               │    │ or component  │
                               │    └───────────────┘
                               │
                         ┌─────▼──────┐
                         │   User     │
                         │  Recovery  │
                         │   Action   │
                         └────────────┘
```

## Error Handling Layers (Depth)

```
┌─────────────────────────────────────────────────────────────────┐
│                        Application                              │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Layer 1: ErrorBoundary                     │   │
│  │     Catches React rendering errors in component tree   │   │
│  │                                                          │   │
│  │  ┌───────────────────────────────────────────────────┐ │   │
│  │  │            Layer 2: Route Error Handler           │ │   │
│  │  │     Next.js error.tsx for route-level errors      │ │   │
│  │  │                                                    │ │   │
│  │  │  ┌─────────────────────────────────────────────┐ │ │   │
│  │  │  │      Layer 3: API Client Error Handler      │ │ │   │
│  │  │  │  Toast notifications + error conversion    │ │ │   │
│  │  │  │                                             │ │ │   │
│  │  │  │  ┌───────────────────────────────────────┐ │ │ │   │
│  │  │  │  │   Layer 4: React Component Logic      │ │ │ │   │
│  │  │  │  │  Component-specific error handling    │ │ │ │   │
│  │  │  │  └───────────────────────────────────────┘ │ │ │   │
│  │  │  └─────────────────────────────────────────────┘ │ │   │
│  │  └───────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Error Message Flow

```
API Error Response
        │
        ▼
APIError Constructor
  error: any
  status: number
        │
        ▼
getErrorMessage(error: APIError) -> string
        │
    ┌───┴───┬────────┬────────┬────────┐
    │       │        │        │        │
    ▼       ▼        ▼        ▼        ▼
  404     401      403      5xx      Other
    │       │        │        │        │
    ▼       ▼        ▼        ▼        ▼
  "Res"  "Auth"  "Perm"  "Server"  "Default"
  "not   "fail"  "denied" "error"   "message"
  "found"
    │       │        │        │        │
    └───┬───┴────────┴────────┴────────┘
        │
        ▼
   toast.error(msg)
        │
        ▼
   User sees toast
   notification
```

## Recovery Flow

### Component Error Recovery
```
Error in render
    │
    ▼
ErrorBoundary catches
    │
    ▼
Show error UI
    │
    ├─ "Try again" → resetError() → Re-render
    │
    └─ "Go home" → Navigate to /
```

### Route Error Recovery
```
Error in route
    │
    ▼
error.tsx catches
    │
    ▼
Show error UI
    │
    ├─ "Try again" → reset() → Retry route
    │
    └─ "Go home" → Navigate to /
```

### API Error Recovery
```
API request fails
    │
    ▼
Toast notification
    │
    ├─ (Auto-dismiss)
    │
    └─ User can retry action
       (reload page, click button again)
```

## File Import Structure

```
/app/layout.tsx
    │
    ├─ imports ErrorBoundary
    │  │
    │  └─ /components/error-boundary.tsx
    │     ├─ React
    │     ├─ lucide-react (AlertCircle)
    │     └─ /components/ui/button
    │
    ├─ wraps with <ErrorBoundary>
    │
    ├─ includes <Providers>
    │  │
    │  └─ /components/providers.tsx
    │     ├─ QueryClientProvider
    │     └─ Toaster (sonner)
    │
    └─ includes children (routes)
       └─ /app/error.tsx
          ├─ useEffect (logging)
          ├─ lucide-react (AlertCircle)
          └─ /components/ui/button

/lib/api-client.ts
    │
    ├─ imports sonner (toast)
    │
    ├─ private request() method
    │  │
    │  ├─ Try block
    │  │  ├─ fetch()
    │  │  ├─ Check response.ok
    │  │  ├─ Show toast.error() on failure
    │  │  └─ Return response.json()
    │  │
    │  └─ Catch block
    │     ├─ Check error type
    │     ├─ Show toast.error()
    │     └─ Throw error
    │
    └─ All API methods use request()
       → getErrorMessage() → toast.error()
```

## State Transitions

### ErrorBoundary State
```
┌──────────────┐
│  Initial     │
│ hasError: F  │
│ error: null  │
└──────┬───────┘
       │
       ├─ getDerivedStateFromError()
       │  │
       │  ▼
       │ ┌──────────────┐
       │ │  Error       │
       │ │ hasError: T  │
       │ │ error: Error │
       │ └──────┬───────┘
       │        │
       │        └─ resetError()
       │           │
       │           ▼ (back to Initial)
       │
       └─ (no error)
          │
          ▼ (render children)
```

## Debug Information Visibility

```
Production (NODE_ENV !== 'development')
    │
    ├─ Hide error details
    ├─ Show generic message
    └─ Log to console only

Development (NODE_ENV === 'development')
    │
    ├─ Show expandable error details
    ├─ Show full error messages
    ├─ Log to console
    └─ Development-only sections visible
```
