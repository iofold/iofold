# Clerk Authentication Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Clerk authentication to the Next.js frontend, protecting routes and connecting user identity to API calls.

**Architecture:** ClerkProvider wraps the app in layout.tsx. Middleware protects all routes except /sign-in and /sign-up. The API client uses Clerk session tokens for authenticated requests. For MVP, all authenticated users share `workspace_default`.

**Tech Stack:** @clerk/nextjs v6.35.5 (already installed), Next.js App Router

---

## Prerequisites

Before starting, you need Clerk API keys:
1. Go to https://dashboard.clerk.com
2. Create app named "iofold" (or use existing)
3. Copy `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY`
4. Add to `frontend/.env.local`

---

### Task 1: Configure Environment Variables

**Files:**
- Modify: `frontend/.env.local`
- Modify: `frontend/.env.example`

**Step 1: Update .env.example with Clerk variables**

```bash
# .env.example
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:8787/v1

# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/
```

**Step 2: Verify .env.local has real keys**

Run: `grep CLERK frontend/.env.local`
Expected: Both keys present (not commented out)

**Step 3: Commit**

```bash
git add frontend/.env.example
git commit -m "chore: add Clerk environment variable templates"
```

---

### Task 2: Create Clerk Middleware

**Files:**
- Create: `frontend/middleware.ts`

**Step 1: Create middleware with public routes**

```typescript
// frontend/middleware.ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/public(.*)',
])

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
}
```

**Step 2: Verify middleware is picked up**

Run: `cd frontend && pnpm dev`
Expected: No startup errors, console may show Clerk initialization

**Step 3: Commit**

```bash
git add frontend/middleware.ts
git commit -m "feat(auth): add Clerk middleware for route protection"
```

---

### Task 3: Wrap App with ClerkProvider

**Files:**
- Modify: `frontend/app/layout.tsx`

**Step 1: Import and wrap with ClerkProvider**

The layout.tsx needs ClerkProvider at the outermost level. Update to:

```tsx
// frontend/app/layout.tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { ClerkProvider } from '@clerk/nextjs'
import './globals.css'
import { Providers } from '@/components/providers'
import { MainLayout } from '@/components/layout'
import { ErrorBoundary } from '@/components/error-boundary'
import { NProgressProvider } from '@/components/providers/nprogress-provider'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'iofold - Automated Eval Generation',
  description: 'Generate high-quality eval functions from trace examples',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning>
        <body className={inter.className}>
          <Providers>
            <ErrorBoundary>
              <NProgressProvider>
                <MainLayout>
                  {children}
                </MainLayout>
              </NProgressProvider>
            </ErrorBoundary>
          </Providers>
        </body>
      </html>
    </ClerkProvider>
  )
}
```

**Step 2: Verify app still loads (will redirect to sign-in)**

Run: `cd frontend && pnpm dev`
Visit: http://dev4:3000
Expected: Redirects to /sign-in (which 404s for now - that's expected)

**Step 3: Commit**

```bash
git add frontend/app/layout.tsx
git commit -m "feat(auth): wrap app with ClerkProvider"
```

---

### Task 4: Create Sign-In Page

**Files:**
- Create: `frontend/app/sign-in/[[...sign-in]]/page.tsx`

**Step 1: Create sign-in page with Clerk component**

```tsx
// frontend/app/sign-in/[[...sign-in]]/page.tsx
import { SignIn } from '@clerk/nextjs'

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <SignIn
        appearance={{
          elements: {
            formButtonPrimary: 'bg-primary hover:bg-primary/90 text-primary-foreground',
            card: 'bg-card border border-border shadow-lg',
            headerTitle: 'text-foreground',
            headerSubtitle: 'text-muted-foreground',
            socialButtonsBlockButton: 'bg-muted hover:bg-muted/80 border-border',
            formFieldInput: 'bg-background border-border text-foreground',
            footerActionLink: 'text-primary hover:text-primary/80',
          },
        }}
        routing="path"
        path="/sign-in"
        signUpUrl="/sign-up"
      />
    </div>
  )
}
```

**Step 2: Verify sign-in page renders**

Visit: http://dev4:3000/sign-in
Expected: Clerk sign-in form appears

**Step 3: Commit**

```bash
git add frontend/app/sign-in
git commit -m "feat(auth): add sign-in page with Clerk component"
```

---

### Task 5: Create Sign-Up Page

**Files:**
- Create: `frontend/app/sign-up/[[...sign-up]]/page.tsx`

**Step 1: Create sign-up page with Clerk component**

```tsx
// frontend/app/sign-up/[[...sign-up]]/page.tsx
import { SignUp } from '@clerk/nextjs'

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <SignUp
        appearance={{
          elements: {
            formButtonPrimary: 'bg-primary hover:bg-primary/90 text-primary-foreground',
            card: 'bg-card border border-border shadow-lg',
            headerTitle: 'text-foreground',
            headerSubtitle: 'text-muted-foreground',
            socialButtonsBlockButton: 'bg-muted hover:bg-muted/80 border-border',
            formFieldInput: 'bg-background border-border text-foreground',
            footerActionLink: 'text-primary hover:text-primary/80',
          },
        }}
        routing="path"
        path="/sign-up"
        signInUrl="/sign-in"
      />
    </div>
  )
}
```

**Step 2: Verify sign-up page renders**

Visit: http://dev4:3000/sign-up
Expected: Clerk sign-up form appears

**Step 3: Commit**

```bash
git add frontend/app/sign-up
git commit -m "feat(auth): add sign-up page with Clerk component"
```

---

### Task 6: Update Providers to Use Clerk Token

**Files:**
- Modify: `frontend/components/providers.tsx`

**Step 1: Update providers to get Clerk token**

Replace the current useEffect with Clerk's useAuth hook:

```tsx
// frontend/components/providers.tsx
'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { Toaster } from 'sonner'
import { ThemeProvider } from 'next-themes'
import { useAuth } from '@clerk/nextjs'
import { apiClient } from '@/lib/api-client'

export function Providers({ children }: { children: React.ReactNode }) {
  const { getToken, isLoaded, isSignedIn } = useAuth()
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000, // 1 minute
            refetchOnWindowFocus: false,
          },
        },
      })
  )

  // Initialize API client with Clerk token
  useEffect(() => {
    async function initAuth() {
      if (isLoaded && isSignedIn) {
        const token = await getToken()
        // For MVP, all users share workspace_default
        apiClient.setAuth(token || '', 'workspace_default')
      } else if (isLoaded && !isSignedIn) {
        // Clear auth when signed out
        apiClient.setAuth('', 'workspace_default')
      }
    }
    initAuth()
  }, [isLoaded, isSignedIn, getToken])

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster
          position="bottom-right"
          theme="system"
          richColors
          closeButton
          toastOptions={{
            classNames: {
              toast: 'bg-card border-border text-foreground',
              title: 'text-foreground',
              description: 'text-muted-foreground',
              success: 'bg-success/10 border-success text-success',
              error: 'bg-destructive/10 border-destructive text-destructive',
              warning: 'bg-warning/10 border-warning text-warning-foreground',
              info: 'bg-info/10 border-info text-info',
              closeButton: 'bg-card border-border hover:bg-muted',
            }
          }}
        />
      </QueryClientProvider>
    </ThemeProvider>
  )
}
```

**Step 2: Verify API calls still work when signed in**

1. Sign in at http://dev4:3000/sign-in
2. Navigate to dashboard
3. Check Network tab - API calls should have `Authorization: Bearer <token>` header

**Step 3: Commit**

```bash
git add frontend/components/providers.tsx
git commit -m "feat(auth): use Clerk token for API authentication"
```

---

### Task 7: Add UserButton to Sidebar

**Files:**
- Modify: `frontend/components/layout/sidebar.tsx` (or wherever user profile is shown)

**Step 1: Find current user display in sidebar**

Search for the mock user display and replace with Clerk's UserButton.

Look for code like:
```tsx
<img src="/avatar.png" />
<p>User Account</p>
<p>user@example.com</p>
```

**Step 2: Replace with Clerk UserButton**

```tsx
import { UserButton, useUser } from '@clerk/nextjs'

// In the component:
const { user, isLoaded } = useUser()

// Replace mock user display with:
<div className="flex items-center gap-3 p-2">
  <UserButton
    afterSignOutUrl="/sign-in"
    appearance={{
      elements: {
        avatarBox: 'w-10 h-10',
      },
    }}
  />
  {isLoaded && user && (
    <div className="flex flex-col">
      <p className="text-sm font-medium">{user.fullName || 'User'}</p>
      <p className="text-xs text-muted-foreground">
        {user.primaryEmailAddress?.emailAddress}
      </p>
    </div>
  )}
</div>
```

**Step 3: Verify UserButton appears in sidebar**

Visit: http://dev4:3000 (while signed in)
Expected: User avatar and name in sidebar, click opens Clerk user menu

**Step 4: Commit**

```bash
git add frontend/components/layout/sidebar.tsx
git commit -m "feat(auth): add Clerk UserButton to sidebar"
```

---

### Task 8: Update MainLayout to Handle Auth State

**Files:**
- Modify: `frontend/components/layout/index.tsx`

**Step 1: Add loading state while auth initializes**

```tsx
import { useAuth } from '@clerk/nextjs'

export function MainLayout({ children }: { children: React.ReactNode }) {
  const { isLoaded } = useAuth()

  // Show loading while Clerk initializes
  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  // Rest of the layout...
}
```

**Step 2: Verify no flash of unauthenticated content**

Refresh page while signed in
Expected: Brief loading spinner, then authenticated content

**Step 3: Commit**

```bash
git add frontend/components/layout/index.tsx
git commit -m "feat(auth): add loading state to MainLayout during auth init"
```

---

### Task 9: Test Full Authentication Flow

**Files:** None (manual testing)

**Step 1: Test sign-up flow**

1. Clear cookies/localStorage
2. Visit http://dev4:3000
3. Should redirect to /sign-in
4. Click "Sign up"
5. Create account
6. Should redirect to dashboard

**Step 2: Test sign-in flow**

1. Sign out (via UserButton)
2. Should redirect to /sign-in
3. Sign in with existing account
4. Should redirect to dashboard

**Step 3: Test protected routes**

1. While signed out, try to visit http://dev4:3000/traces
2. Should redirect to /sign-in

**Step 4: Test API authentication**

1. While signed in, open Network tab
2. Trigger an API call (e.g., refresh traces page)
3. Verify `Authorization: Bearer <token>` header present

**Step 5: Commit integration test notes**

```bash
git commit --allow-empty -m "test(auth): verify full authentication flow works"
```

---

### Task 10: Deploy to Staging and Verify

**Files:** None (deployment)

**Step 1: Add Clerk keys to staging secrets**

```bash
cd frontend
npx wrangler pages secret put NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY --env staging
npx wrangler pages secret put CLERK_SECRET_KEY --env staging
```

**Step 2: Deploy frontend to staging**

```bash
cd frontend && pnpm run deploy:staging
```

**Step 3: Test on staging**

1. Visit https://platform.staging.iofold.com
2. Should redirect to sign-in
3. Create account or sign in
4. Verify dashboard loads with real data

**Step 4: Commit deployment confirmation**

```bash
git commit --allow-empty -m "deploy(auth): Clerk authentication live on staging"
```

---

## Summary

After completing all tasks:
- Users must sign in to access the platform
- Clerk handles all auth UI (sign-in, sign-up, user menu)
- API calls include Bearer token from Clerk session
- All users currently share `workspace_default` (multi-tenant workspaces can be added later)

## Future Enhancements (Not in Scope)

1. **Backend token verification** - Verify Clerk JWT in Cloudflare Worker
2. **User-workspace mapping** - Create workspace per user or invite system
3. **Role-based access** - Admin vs regular user permissions
4. **SSO/OAuth providers** - Google, GitHub sign-in
