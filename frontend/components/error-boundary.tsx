'use client'

import React, { ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error)
    console.error('Error info:', errorInfo)
  }

  resetError = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
          <div className="max-w-md w-full bg-white rounded-lg shadow-md p-6">
            <div className="flex items-start gap-4">
              <AlertCircle className="w-8 h-8 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h1 className="text-lg font-semibold text-slate-900 mb-2">
                  Something went wrong
                </h1>
                <p className="text-sm text-slate-600 mb-4">
                  An unexpected error occurred. Try refreshing the page or go back to the home page.
                </p>
                {process.env.NODE_ENV === 'development' && this.state.error && (
                  <details className="mb-4 bg-slate-100 rounded p-2 text-xs">
                    <summary className="cursor-pointer font-mono text-slate-700 mb-2">
                      Error details
                    </summary>
                    <pre className="whitespace-pre-wrap break-words text-slate-600">
                      {this.state.error.message}
                    </pre>
                  </details>
                )}
                <div className="flex gap-2">
                  <Button
                    onClick={this.resetError}
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

    return this.props.children
  }
}
