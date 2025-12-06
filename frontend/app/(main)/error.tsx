'use client'

import { useEffect } from 'react'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Route error:', error)
  }, [error])

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6">
        <div className="flex items-start gap-4">
          <AlertCircle className="w-8 h-8 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-slate-900 mb-2">
              Page error
            </h1>
            <p className="text-sm text-slate-600 mb-4">
              The page encountered an unexpected error. Please try again or return to the home page.
            </p>
            {process.env.NODE_ENV === 'development' && (
              <details className="mb-4 bg-slate-100 rounded p-2 text-xs">
                <summary className="cursor-pointer font-mono text-slate-700 mb-2">
                  Error details
                </summary>
                <pre className="whitespace-pre-wrap break-words text-slate-600">
                  {error.message}
                </pre>
              </details>
            )}
            <div className="flex gap-2">
              <Button
                onClick={() => reset()}
                variant="default"
                size="sm"
                className="w-full"
              >
                Try again
              </Button>
              <Button
                onClick={() => (window.location.href = '/')}
                variant="outline"
                size="sm"
                className="w-full"
              >
                Go home
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
