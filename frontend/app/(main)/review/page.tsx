/**
 * Daily Quick Review Page - Enhanced card-style interface for rapid trace evaluation
 *
 * Features:
 * - Lightning bolt icon header with "Daily Quick Review" title
 * - Auto mode toggle with remaining time indicator
 * - Progress bar with Good/Okay/Bad counters
 * - Styled trace review cards with USER INPUT and AGENT RESPONSE sections
 * - Quick notes textarea with character counter
 * - Three large feedback buttons (Bad/Okay/Good)
 * - Mock trace data for demonstration
 * - IOFold brand colors (Mint, Coral, Cream)
 * - Keyboard shortcuts for rapid reviewing
 */

'use client'

import { useState, useEffect, Suspense, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { TableSkeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/ui/error-state'
import {
  ArrowLeft,
  RefreshCw,
  Play,
  Pause,
  Zap,
  Clock,
  TrendingUp,
  Calendar
} from 'lucide-react'
import { toast } from 'sonner'
import type { Trace } from '@/types/api'
import { cn } from '@/lib/utils'

// ============================================================================
// Mock Data for Demonstration
// ============================================================================

const MOCK_TRACES = [
  {
    id: 'trace-demo-1',
    agent_id: 'agent-demo',
    input: 'What are the best practices for writing unit tests in TypeScript?',
    output: 'Here are the key best practices for writing unit tests in TypeScript:\n\n1. Use a testing framework like Jest or Vitest\n2. Follow the AAA pattern (Arrange, Act, Assert)\n3. Keep tests isolated and independent\n4. Use descriptive test names\n5. Mock external dependencies\n6. Test edge cases and error conditions\n7. Maintain good test coverage (70-80%)\n8. Use type-safe mocks with TypeScript',
    score: 0.85,
    timestamp: '2025-11-30T12:00:00.000Z',
    duration_ms: 2340,
    metadata: { model: 'gpt-4', tokens: 245 }
  },
  {
    id: 'trace-demo-2',
    agent_id: 'agent-demo',
    input: 'How do I center a div in CSS?',
    output: 'To center a div in CSS, you can use flexbox:\n\n```css\n.container {\n  display: flex;\n  justify-content: center;\n  align-items: center;\n  height: 100vh;\n}\n```\n\nOr use CSS Grid:\n\n```css\n.container {\n  display: grid;\n  place-items: center;\n  height: 100vh;\n}\n```',
    score: 0.92,
    timestamp: '2025-11-30T11:55:00.000Z',
    duration_ms: 1850,
    metadata: { model: 'gpt-4', tokens: 180 }
  },
  {
    id: 'trace-demo-3',
    agent_id: 'agent-demo',
    input: 'Explain the difference between var, let, and const in JavaScript',
    output: 'Here\'s the difference:\n\n- var: Function-scoped, can be redeclared, hoisted\n- let: Block-scoped, cannot be redeclared, not hoisted\n- const: Block-scoped, cannot be reassigned or redeclared\n\nBest practice: Use const by default, let when you need to reassign, avoid var.',
    score: 0.78,
    timestamp: '2025-11-30T11:50:00.000Z',
    duration_ms: 1920,
    metadata: { model: 'gpt-3.5-turbo', tokens: 156 }
  },
  {
    id: 'trace-demo-4',
    agent_id: 'agent-demo',
    input: 'What is the purpose of async/await in JavaScript?',
    output: 'async/await is syntactic sugar for working with Promises in JavaScript. It makes asynchronous code look and behave more like synchronous code, improving readability.\n\nKey points:\n- async functions always return a Promise\n- await pauses execution until the Promise resolves\n- Error handling uses try/catch blocks\n- Makes code more maintainable than .then() chains',
    score: 0.88,
    timestamp: '2025-11-30T11:45:00.000Z',
    duration_ms: 2100,
    metadata: { model: 'gpt-4', tokens: 198 }
  },
  {
    id: 'trace-demo-5',
    agent_id: 'agent-demo',
    input: 'How do I handle errors in React components?',
    output: 'In React, you can handle errors using:\n\n1. Error Boundaries (class components)\n2. Try/catch in async functions\n3. Error states in hooks\n4. Global error handlers\n\nExample with Error Boundary:\n```jsx\nclass ErrorBoundary extends React.Component {\n  componentDidCatch(error, errorInfo) {\n    // Log error\n  }\n  render() {\n    if (this.state.hasError) {\n      return <h1>Something went wrong.</h1>;\n    }\n    return this.props.children;\n  }\n}\n```',
    score: 0.81,
    timestamp: '2025-11-30T11:40:00.000Z',
    duration_ms: 2650,
    metadata: { model: 'gpt-4', tokens: 267 }
  }
]

// ============================================================================
// Types
// ============================================================================

interface TraceData {
  id: string
  agent_id: string
  input: string
  output: string
  score: number
  timestamp: string
  duration_ms: number
  metadata: Record<string, any>
}

// ============================================================================
// Component
// ============================================================================

function ReviewPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()

  // Only use agent_id from URL params - don't default to demo value
  const agentId = searchParams.get('agent_id') || null

  // Core state
  const [currentIndex, setCurrentIndex] = useState(0)
  const [feedbackCounts, setFeedbackCounts] = useState({
    good: 0,
    okay: 0,
    bad: 0,
  })
  const [notes, setNotes] = useState('')
  const [isAutoMode, setIsAutoMode] = useState(false)
  const [useMockData, setUseMockData] = useState(false)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [displayedTrace, setDisplayedTrace] = useState<TraceData | null>(null)

  const autoAdvanceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const sessionStartTimeRef = useRef<Date | null>(null)

  // Initialize session start time on client only
  useEffect(() => {
    if (!sessionStartTimeRef.current) {
      sessionStartTimeRef.current = new Date()
    }
  }, [])

  // Fetch real traces without feedback (when not using mock data)
  const {
    data: tracesData,
    isLoading: isLoadingList,
    error: listError,
    refetch,
  } = useQuery({
    queryKey: ['traces', 'review'],
    queryFn: () =>
      apiClient.listTraces({
        has_feedback: false,
        limit: 50,
      }),
    retry: 2,
    enabled: !useMockData,
  })

  // Use mock data or real data - map TraceSummary to TraceData format
  const traces: TraceData[] = useMockData
    ? MOCK_TRACES
    : (tracesData?.traces || []).map((trace: any) => ({
        id: trace.id,
        // Use trace's agent_id (from agent_version), or fallback to feedback's agent_id
        agent_id: trace.agent_id || trace.feedback?.agent_id || null,
        input: trace.summary?.input_preview || '',
        output: trace.summary?.output_preview || '',
        score: trace.feedback?.rating === 'positive' ? 1 : trace.feedback?.rating === 'negative' ? -1 : 0,
        timestamp: trace.timestamp,
        duration_ms: 0,
        metadata: { step_count: trace.step_count, has_errors: trace.summary?.has_errors, source: trace.source }
      }))

  const currentTrace = traces[currentIndex]
  const totalTraces = traces.length
  const reviewedCount = feedbackCounts.good + feedbackCounts.okay + feedbackCounts.bad
  const remainingCount = totalTraces - reviewedCount
  const progress = totalTraces > 0 ? (reviewedCount / totalTraces) * 100 : 0

  // Calculate remaining time (15 seconds per trace average)
  const estimatedSeconds = remainingCount * 15
  const estimatedMinutes = Math.ceil(estimatedSeconds / 60)

  // Submit feedback mutation (only for real data)
  const submitFeedbackMutation = useMutation({
    mutationFn: async ({
      trace_id,
      rating,
      agent_id,
      notes,
    }: {
      trace_id: string
      rating: 'positive' | 'negative' | 'neutral'
      agent_id?: string  // Now optional
      notes?: string
    }) => {
      return apiClient.submitFeedback({
        trace_id,
        rating,
        agent_id,
        notes,
      })
    },
    onSuccess: (_, variables) => {
      const emoji = variables.rating === 'positive' ? '👍' : variables.rating === 'negative' ? '👎' : '😐'
      toast.success(`${emoji} Feedback submitted`, { duration: 1500 })
      queryClient.invalidateQueries({ queryKey: ['traces', 'review'] })
    },
    onError: () => {
      toast.error('Failed to submit feedback')
    },
  })

  // ============================================================================
  // Event Handlers
  // ============================================================================

  const handleFeedback = useCallback((rating: 'good' | 'okay' | 'bad') => {
    if (!currentTrace) return

    // Update counts
    setFeedbackCounts(prev => ({
      ...prev,
      [rating]: prev[rating] + 1,
    }))

    // Submit to API if using real data
    // Use trace's agent_id (from agent_version), fallback to URL param, or omit if neither available
    const effectiveAgentId = currentTrace.agent_id || agentId || undefined
    if (!useMockData) {
      const apiRating = rating === 'good' ? 'positive' : rating === 'bad' ? 'negative' : 'neutral'
      submitFeedbackMutation.mutate({
        trace_id: currentTrace.id,
        rating: apiRating,
        agent_id: effectiveAgentId,  // Optional - will be undefined if no agent
        notes: notes.trim() || undefined,
      })
    } else {
      // Mock feedback toast
      const emoji = rating === 'good' ? '✅' : rating === 'bad' ? '❌' : '➖'
      toast.success(`${emoji} Marked as ${rating}`, { duration: 1500 })
    }

    // Clear notes
    setNotes('')

    // Trigger exit animation
    setIsTransitioning(true)

    setTimeout(() => {
      // Move to next card
      if (currentIndex < totalTraces - 1) {
        setCurrentIndex(prev => prev + 1)
      }
      // Trigger enter animation
      setTimeout(() => {
        setIsTransitioning(false)
      }, 50)
    }, 250)
  }, [currentTrace, currentIndex, totalTraces, notes, useMockData, agentId, submitFeedbackMutation])

  const toggleAutoMode = useCallback(() => {
    setIsAutoMode(prev => {
      const newValue = !prev
      toast.success(newValue ? '▶️ Auto mode enabled' : '⏸️ Auto mode paused', {
        duration: 1500,
      })
      return newValue
    })
  }, [])

  // ============================================================================
  // Effects
  // ============================================================================

  // Cleanup auto-advance timer
  useEffect(() => {
    return () => {
      if (autoAdvanceTimerRef.current) {
        clearTimeout(autoAdvanceTimerRef.current)
      }
    }
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

      if (e.key === '1') {
        e.preventDefault()
        handleFeedback('bad')
      } else if (e.key === '2') {
        e.preventDefault()
        handleFeedback('okay')
      } else if (e.key === '3') {
        e.preventDefault()
        handleFeedback('good')
      } else if (e.key === 'a' || e.key === 'A') {
        e.preventDefault()
        toggleAutoMode()
      } else if (e.key === 'ArrowRight' && currentIndex < totalTraces - 1) {
        e.preventDefault()
        setCurrentIndex(prev => prev + 1)
      } else if (e.key === 'ArrowLeft' && currentIndex > 0) {
        e.preventDefault()
        setCurrentIndex(prev => prev - 1)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentIndex, totalTraces, handleFeedback, toggleAutoMode])

  // ============================================================================
  // Render States
  // ============================================================================

  // Loading state (only for real data)
  if (isLoadingList && !useMockData) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Daily Quick Review</h1>
          <p className="text-muted-foreground">Loading traces...</p>
        </div>
        <TableSkeleton rows={3} />
      </div>
    )
  }

  // Error state
  if (listError && !useMockData) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Daily Quick Review</h1>
        </div>
        <ErrorState
          title="Failed to load traces"
          message="There was an error loading traces for review. Please try again."
          error={listError as Error}
          onRetry={() => refetch()}
        />
      </div>
    )
  }

  // Completion state
  if (reviewedCount >= totalTraces) {
    const sessionDuration = sessionStartTimeRef.current
      ? Math.round((new Date().getTime() - sessionStartTimeRef.current.getTime()) / 1000)
      : 0
    const averageTimePerTrace = reviewedCount > 0 ? Math.round(sessionDuration / reviewedCount) : 0

    return (
      <div className="min-h-screen bg-card p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-4 mb-6">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/agents')}
              className="bg-card"
            >
              <ArrowLeft className="w-4 h-4 mr-2" aria-hidden="true" />
              Back
            </Button>
          </div>

          <div className="text-center bg-card rounded-xl shadow-elevation-2 p-12">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-3xl font-bold text-foreground mb-2">Review Complete!</h2>
            <p className="text-muted-foreground mb-8">
              Great job! You have reviewed all {reviewedCount} traces
              {sessionDuration > 0 ? ` in ${Math.round(sessionDuration / 60)} minutes` : ''}
            </p>

            {/* Summary Stats */}
            <div className="grid grid-cols-4 gap-4 mb-8">
              <div className="bg-success/10 rounded-lg p-4 border-2 border-success/20">
                <div className="text-3xl mb-1">✅</div>
                <div className="text-2xl font-bold text-success">{feedbackCounts.good}</div>
                <div className="text-xs text-success">Good</div>
              </div>
              <div className="bg-warning/10 rounded-lg p-4 border-2 border-warning/20">
                <div className="text-3xl mb-1">➖</div>
                <div className="text-2xl font-bold text-warning">{feedbackCounts.okay}</div>
                <div className="text-xs text-warning">Okay</div>
              </div>
              <div className="bg-destructive/10 rounded-lg p-4 border-2 border-destructive/20">
                <div className="text-3xl mb-1">❌</div>
                <div className="text-2xl font-bold text-destructive">{feedbackCounts.bad}</div>
                <div className="text-xs text-destructive">Bad</div>
              </div>
              <div className="bg-info/10 rounded-lg p-4 border-2 border-info/20">
                <div className="text-3xl mb-1">⏱️</div>
                <div className="text-2xl font-bold text-info">{averageTimePerTrace}s</div>
                <div className="text-xs text-info">Avg/Trace</div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-4">
              <Button onClick={() => router.push('/agents')} className="bg-primary hover:bg-primary/80">
                View Agents
              </Button>
              <Button variant="outline" onClick={() => window.location.reload()} className="bg-card">
                <RefreshCw className="w-4 h-4 mr-2" aria-hidden="true" />
                Review More
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ============================================================================
  // Main Review Interface
  // ============================================================================

  if (!currentTrace) {
    return (
      <div className="min-h-screen bg-card p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center bg-card rounded-xl shadow-elevation-2 p-12">
            <div className="text-6xl mb-4">📋</div>
            <h2 className="text-2xl font-bold text-foreground mb-2">No Traces Available</h2>
            <p className="text-muted-foreground mb-6">
              There are no traces to review at the moment.
            </p>
            <Button onClick={() => router.push('/agents')} className="bg-primary hover:bg-primary/80">
              Back to Agents
            </Button>
          </div>
        </div>
      </div>
    )
  }

  const formatDate = (isoString: string) => {
    const date = new Date(isoString)
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }

  return (
    <div className="h-screen bg-card flex flex-col overflow-hidden">
      {/* Compact Header - fixed height */}
      <div className="flex-none px-4 py-3 border-b bg-card/80 backdrop-blur">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push('/agents')}
                className="bg-card h-8 px-3"
              >
                <ArrowLeft className="w-3 h-3 mr-1" aria-hidden="true" />
                <span className="text-xs">Back</span>
              </Button>
              <div className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-primary" />
                <h1 className="text-lg font-bold text-foreground">Daily Quick Review</h1>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Progress Inline */}
              <div className="text-xs text-muted-foreground font-medium">
                <span className="text-primary font-bold">{reviewedCount}</span>/{totalTraces}
              </div>
              <div className="flex items-center gap-1 text-xs">
                <span className="bg-success/10 text-success px-2 py-0.5 rounded font-semibold">Good: {feedbackCounts.good}</span>
                <span className="bg-warning/10 text-warning px-2 py-0.5 rounded font-semibold">Okay: {feedbackCounts.okay}</span>
                <span className="bg-destructive/10 text-destructive px-2 py-0.5 rounded font-semibold">Bad: {feedbackCounts.bad}</span>
              </div>

              {/* Auto Mode Toggle */}
              <Button
                variant={isAutoMode ? "default" : "outline"}
                size="sm"
                onClick={toggleAutoMode}
                className={cn(
                  "h-8 px-3 text-xs",
                  isAutoMode && "bg-primary hover:bg-primary/80 text-white",
                  !isAutoMode && "bg-card"
                )}
              >
                {isAutoMode ? (
                  <>
                    <Pause className="w-3 h-3 mr-1" aria-hidden="true" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="w-3 h-3 mr-1" aria-hidden="true" />
                    Auto
                  </>
                )}
              </Button>

              {/* Remaining Time */}
              <div className="bg-card px-3 py-1 rounded border border-border">
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span className="font-semibold text-foreground">~{estimatedMinutes}m</span>
                </div>
              </div>

              {/* Mock Data Toggle */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setUseMockData(!useMockData)}
                className={cn(
                  "bg-card text-xs h-8 px-3",
                  useMockData && "border-primary text-primary"
                )}
              >
                {useMockData ? 'Demo' : 'Live'}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - flex container */}
      <div className="flex-1 overflow-auto px-4 py-3">
        <div className="max-w-5xl mx-auto h-full flex flex-col">
          {/* Trace Card with animation */}
          <div
            className={cn(
              "bg-card rounded-lg shadow-elevation-2 border border-border overflow-hidden transition-all duration-300 ease-out transform flex-1 flex flex-col",
              isTransitioning ? "opacity-0 scale-95 translate-x-4" : "opacity-100 scale-100 translate-x-0"
            )}
          >
            {/* Compact Card Header */}
            <div className="flex-none px-4 py-2 border-b border-border bg-gradient-to-r from-primary/10 to-primary/5">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="w-3 h-3" />
                  <span className="font-medium">{formatDate(currentTrace.timestamp)}</span>
                  <span>•</span>
                  <span>{formatDuration(currentTrace.duration_ms)}</span>
                </div>
                <div className="flex items-center gap-1 px-2 py-0.5 bg-primary rounded-full">
                  <TrendingUp className="w-3 h-3 text-white" />
                  <span className="text-xs font-bold text-white">
                    {Math.round(currentTrace.score * 100)}%
                  </span>
                </div>
              </div>
            </div>

            {/* Card Body - scrollable */}
            <div className="flex-1 overflow-auto p-4">
              <div className="grid md:grid-cols-2 gap-4 h-full">
                {/* USER INPUT Section */}
                <div className="flex flex-col">
                  <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 bg-primary rounded-full"></div>
                    USER INPUT
                  </div>
                  <div className="bg-muted rounded-lg p-3 border border-border flex-1 overflow-auto">
                    <p className="text-sm text-foreground leading-relaxed">{currentTrace.input}</p>
                  </div>
                </div>

                {/* AGENT RESPONSE Section */}
                <div className="flex flex-col">
                  <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 bg-secondary rounded-full"></div>
                    AGENT RESPONSE
                  </div>
                  <div className="bg-gradient-to-br from-muted to-card rounded-lg p-3 border border-border flex-1 overflow-auto">
                    <p className="text-xs text-foreground leading-relaxed whitespace-pre-wrap font-mono">
                      {currentTrace.output}
                    </p>
                  </div>
                </div>
              </div>

              {/* Compact Metadata */}
              <div className="mt-3 pt-3 border-t border-border">
                <p className="text-xs text-muted-foreground">
                  <span className="font-semibold">Model:</span> {currentTrace.metadata.model || 'N/A'}
                  {currentTrace.metadata.tokens && (
                    <> • <span className="font-semibold">Tokens:</span> {currentTrace.metadata.tokens}</>
                  )}
                  <span className="float-right text-muted-foreground">
                    <kbd className="px-1.5 py-0.5 bg-muted rounded border text-xs font-mono">1</kbd> Bad
                    <span className="mx-1">•</span>
                    <kbd className="px-1.5 py-0.5 bg-muted rounded border text-xs font-mono">2</kbd> Okay
                    <span className="mx-1">•</span>
                    <kbd className="px-1.5 py-0.5 bg-muted rounded border text-xs font-mono">3</kbd> Good
                  </span>
                </p>
              </div>
            </div>

            {/* Quick Notes - collapsed at bottom */}
            <div className="flex-none px-4 py-2 border-t border-border bg-muted">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value.slice(0, 500))}
                placeholder="Quick notes (optional)..."
                className="w-full h-12 px-2 py-1 text-xs border border-border rounded focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent resize-none"
                maxLength={500}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Fixed Footer with Feedback Buttons */}
      <div className="flex-none px-4 py-3 border-t bg-card">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-3 gap-3">
            <Button
              onClick={() => handleFeedback('bad')}
              disabled={submitFeedbackMutation.isPending}
              className="h-14 text-base font-bold bg-destructive hover:bg-destructive/90 text-destructive-foreground border-2 border-destructive shadow-lg hover:shadow-xl transition-all"
            >
              <div className="flex flex-col items-center">
                <div className="text-xl">❌</div>
                <div className="text-xs">Bad</div>
              </div>
            </Button>
            <Button
              onClick={() => handleFeedback('okay')}
              disabled={submitFeedbackMutation.isPending}
              className="h-14 text-base font-bold bg-warning hover:bg-warning/90 text-warning-foreground border-2 border-warning shadow-lg hover:shadow-xl transition-all"
            >
              <div className="flex flex-col items-center">
                <div className="text-xl">➖</div>
                <div className="text-xs">Okay</div>
              </div>
            </Button>
            <Button
              onClick={() => handleFeedback('good')}
              disabled={submitFeedbackMutation.isPending}
              className="h-14 text-base font-bold bg-success hover:bg-success/90 text-success-foreground border-2 border-success shadow-lg hover:shadow-xl transition-all"
            >
              <div className="flex flex-col items-center">
                <div className="text-xl">✅</div>
                <div className="text-xs">Good</div>
              </div>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Main Export
// ============================================================================

export default function ReviewPage() {
  return (
    <Suspense fallback={
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Daily Quick Review</h1>
          <p className="text-muted-foreground">Loading...</p>
        </div>
        <TableSkeleton rows={3} />
      </div>
    }>
      <ReviewPageContent />
    </Suspense>
  )
}
