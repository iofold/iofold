'use client'

import { AlertCircle, RefreshCw, Home } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'

interface ErrorStateProps {
  title?: string
  message?: string
  error?: Error | string
  onRetry?: () => void
  showHomeButton?: boolean
}

export function ErrorState({
  title = 'Something went wrong',
  message = 'An error occurred while loading this data. Please try again.',
  error,
  onRetry,
  showHomeButton = false,
}: ErrorStateProps) {
  const router = useRouter()

  const errorMessage =
    typeof error === 'string' ? error : error?.message

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <div className="max-w-md w-full text-center">
        <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" aria-hidden="true" />
        <h3 className="text-lg font-semibold mb-2">{title}</h3>
        <p className="text-sm text-muted-foreground mb-4">{message}</p>

        {errorMessage && process.env.NODE_ENV === 'development' && (
          <details className="mb-4 bg-muted rounded p-3 text-xs text-left">
            <summary className="cursor-pointer font-mono text-muted-foreground mb-2">
              Error details
            </summary>
            <pre className="whitespace-pre-wrap break-words text-muted-foreground">
              {errorMessage}
            </pre>
          </details>
        )}

        <div className="flex gap-2 justify-center">
          {onRetry && (
            <Button
              onClick={onRetry}
              variant="default"
              size="sm"
              className="flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
              Try again
            </Button>
          )}
          {showHomeButton && (
            <Button
              onClick={() => router.push('/')}
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
            >
              <Home className="w-4 h-4" aria-hidden="true" />
              Go home
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
