'use client'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useState, useEffect } from 'react'
import { Toaster } from 'sonner'
import { ThemeProvider } from 'next-themes'
import { apiClient } from '@/lib/api-client'

export function Providers({ children }: { children: React.ReactNode }) {
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

  // Initialize API client with default workspace for MVP
  useEffect(() => {
    apiClient.setAuth('', 'workspace_default')
  }, [])

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
          position="top-right"
          theme="system"
          richColors
          toastOptions={{
            classNames: {
              toast: 'bg-card border-border text-foreground',
              title: 'text-foreground',
              description: 'text-muted-foreground',
              success: 'bg-success/10 border-success text-success',
              error: 'bg-destructive/10 border-destructive text-destructive',
              warning: 'bg-warning/10 border-warning text-warning-foreground',
              info: 'bg-info/10 border-info text-info',
            }
          }}
        />
      </QueryClientProvider>
    </ThemeProvider>
  )
}
