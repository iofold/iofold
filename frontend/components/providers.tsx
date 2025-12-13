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
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        {children}
        <Toaster
          position="bottom-right"
          theme="light"
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
