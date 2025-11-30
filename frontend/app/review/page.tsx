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
    timestamp: new Date(Date.now() - 1000 * 60 * 5).toISOString(), // 5 minutes ago
    duration_ms: 2340,
    metadata: { model: 'gpt-4', tokens: 245 }
  },
  {
    id: 'trace-demo-2',
    agent_id: 'agent-demo',
    input: 'How do I center a div in CSS?',
    output: 'To center a div in CSS, you can use flexbox:\n\n```css\n.container {\n  display: flex;\n  justify-content: center;\n  align-items: center;\n  height: 100vh;\n}\n```\n\nOr use CSS Grid:\n\n```css\n.container {\n  display: grid;\n  place-items: center;\n  height: 100vh;\n}\n```',
    score: 0.92,
    timestamp: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
    duration_ms: 1850,
    metadata: { model: 'gpt-4', tokens: 180 }
  },
  {
    id: 'trace-demo-3',
    agent_id: 'agent-demo',
    input: 'Explain the difference between var, let, and const in JavaScript',
    output: 'Here\'s the difference:\n\n- var: Function-scoped, can be redeclared, hoisted\n- let: Block-scoped, cannot be redeclared, not hoisted\n- const: Block-scoped, cannot be reassigned or redeclared\n\nBest practice: Use const by default, let when you need to reassign, avoid var.',
    score: 0.78,
    timestamp: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    duration_ms: 1920,
    metadata: { model: 'gpt-3.5-turbo', tokens: 156 }
  },
  {
    id: 'trace-demo-4',
    agent_id: 'agent-demo',
    input: 'What is the purpose of async/await in JavaScript?',
    output: 'async/await is syntactic sugar for working with Promises in JavaScript. It makes asynchronous code look and behave more like synchronous code, improving readability.\n\nKey points:\n- async functions always return a Promise\n- await pauses execution until the Promise resolves\n- Error handling uses try/catch blocks\n- Makes code more maintainable than .then() chains',
    score: 0.88,
    timestamp: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
    duration_ms: 2100,
    metadata: { model: 'gpt-4', tokens: 198 }
  },
  {
    id: 'trace-demo-5',
    agent_id: 'agent-demo',
    input: 'How do I handle errors in React components?',
    output: 'In React, you can handle errors using:\n\n1. Error Boundaries (class components)\n2. Try/catch in async functions\n3. Error states in hooks\n4. Global error handlers\n\nExample with Error Boundary:\n```jsx\nclass ErrorBoundary extends React.Component {\n  componentDidCatch(error, errorInfo) {\n    // Log error\n  }\n  render() {\n    if (this.state.hasError) {\n      return <h1>Something went wrong.</h1>;\n    }\n    return this.props.children;\n  }\n}\n```',
    score: 0.81,
    timestamp: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
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

  const agentId = searchParams.get('agent_id') || 'agent-demo'

  // Core state
  const [currentIndex, setCurrentIndex] = useState(0)
  const [feedbackCounts, setFeedbackCounts] = useState({
    good: 0,
    okay: 0,
    bad: 0,
  })
  const [notes, setNotes] = useState('')
  const [isAutoMode, setIsAutoMode] = useState(false)
  const [useMockData, setUseMockData] = useState(true)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const [displayedTrace, setDisplayedTrace] = useState<TraceData | null>(null)

  const autoAdvanceTimerRef = useRef<NodeJS.Timeout | null>(null)
  const sessionStartTimeRef = useRef(new Date())

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
    : (tracesData?.traces || []).map((trace) => ({
        id: trace.id,
        agent_id: trace.source || 'unknown',
        input: trace.summary?.input_preview || '',
        output: trace.summary?.output_preview || '',
        score: trace.feedback?.rating === 'positive' ? 1 : trace.feedback?.rating === 'negative' ? -1 : 0,
        timestamp: trace.timestamp,
        duration_ms: 0,
        metadata: { step_count: trace.step_count, has_errors: trace.summary?.has_errors }
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
      agent_id: string
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
    if (!useMockData && agentId) {
      const apiRating = rating === 'good' ? 'positive' : rating === 'bad' ? 'negative' : 'neutral'
      submitFeedbackMutation.mutate({
        trace_id: currentTrace.id,
        rating: apiRating,
        agent_id: agentId,
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
    const sessionDuration = Math.round((new Date().getTime() - sessionStartTimeRef.current.getTime()) / 1000)
    const averageTimePerTrace = reviewedCount > 0 ? Math.round(sessionDuration / reviewedCount) : 0

    return (
      <div className="min-h-screen bg-[#FDF8F0] p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-4 mb-6">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/agents')}
              className="bg-white"
            >
              <ArrowLeft className="w-4 h-4 mr-2" aria-hidden="true" />
              Back
            </Button>
          </div>

          <div className="text-center bg-white rounded-xl shadow-elevation-2 p-12">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-3xl font-bold text-[#2A2D35] mb-2">Review Complete!</h2>
            <p className="text-gray-600 mb-8">
              Great job! You have reviewed all {reviewedCount} traces
              {sessionDuration > 0 ? ` in ${Math.round(sessionDuration / 60)} minutes` : ''}
            </p>

            {/* Summary Stats */}
            <div className="grid grid-cols-4 gap-4 mb-8">
              <div className="bg-green-50 rounded-lg p-4 border-2 border-green-200">
                <div className="text-3xl mb-1">✅</div>
                <div className="text-2xl font-bold text-green-700">{feedbackCounts.good}</div>
                <div className="text-xs text-green-600">Good</div>
              </div>
              <div className="bg-yellow-50 rounded-lg p-4 border-2 border-yellow-200">
                <div className="text-3xl mb-1">➖</div>
                <div className="text-2xl font-bold text-yellow-700">{feedbackCounts.okay}</div>
                <div className="text-xs text-yellow-600">Okay</div>
              </div>
              <div className="bg-red-50 rounded-lg p-4 border-2 border-red-200">
                <div className="text-3xl mb-1">❌</div>
                <div className="text-2xl font-bold text-red-700">{feedbackCounts.bad}</div>
                <div className="text-xs text-red-600">Bad</div>
              </div>
              <div className="bg-blue-50 rounded-lg p-4 border-2 border-blue-200">
                <div className="text-3xl mb-1">⏱️</div>
                <div className="text-2xl font-bold text-blue-700">{averageTimePerTrace}s</div>
                <div className="text-xs text-blue-600">Avg/Trace</div>
              </div>
            </div>

            <div className="flex items-center justify-center gap-4">
              <Button onClick={() => router.push('/agents')} className="bg-[#4ECFA5] hover:bg-[#2D9B78]">
                View Agents
              </Button>
              <Button variant="outline" onClick={() => window.location.reload()} className="bg-white">
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
      <div className="min-h-screen bg-[#FDF8F0] p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center bg-white rounded-xl shadow-elevation-2 p-12">
            <div className="text-6xl mb-4">📋</div>
            <h2 className="text-2xl font-bold text-[#2A2D35] mb-2">No Traces Available</h2>
            <p className="text-gray-600 mb-6">
              There are no traces to review at the moment.
            </p>
            <Button onClick={() => router.push('/agents')} className="bg-[#4ECFA5] hover:bg-[#2D9B78]">
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
    <div className="min-h-screen bg-[#FDF8F0] p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push('/agents')}
                className="bg-white"
              >
                <ArrowLeft className="w-4 h-4 mr-2" aria-hidden="true" />
                Back
              </Button>
            </div>

            <div className="flex items-center gap-3">
              {/* Auto Mode Toggle */}
              <Button
                variant={isAutoMode ? "default" : "outline"}
                size="sm"
                onClick={toggleAutoMode}
                className={cn(
                  isAutoMode && "bg-[#4ECFA5] hover:bg-[#2D9B78] text-white",
                  !isAutoMode && "bg-white"
                )}
              >
                {isAutoMode ? (
                  <>
                    <Pause className="w-4 h-4 mr-2" aria-hidden="true" />
                    Pause Auto
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" aria-hidden="true" />
                    Auto Mode
                  </>
                )}
              </Button>

              {/* Remaining Time */}
              <div className="text-right bg-white px-4 py-2 rounded-lg border-2 border-gray-200 shadow-sm">
                <div className="text-xs text-gray-600 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Remaining
                </div>
                <div className="font-bold text-[#2A2D35] text-sm">
                  ~{estimatedMinutes}m
                </div>
              </div>

              {/* Mock Data Toggle */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setUseMockData(!useMockData)}
                className={cn(
                  "bg-white text-xs",
                  useMockData && "border-[#4ECFA5] text-[#4ECFA5]"
                )}
              >
                {useMockData ? 'Demo Mode' : 'Live Mode'}
              </Button>
            </div>
          </div>

          {/* Title */}
          <div className="flex items-center gap-3 mb-4">
            <Zap className="w-8 h-8 text-[#4ECFA5]" />
            <div>
              <h1 className="text-3xl font-bold text-[#2A2D35]">Daily Quick Review</h1>
              <p className="text-gray-600">Rapid trace evaluation - Optimized for speed</p>
            </div>
          </div>

          {/* Progress Section */}
          <div className="bg-white rounded-xl p-5 shadow-elevation-2 border border-gray-200">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-[#2A2D35]">
                Progress: {reviewedCount}/{totalTraces} traces
              </span>
              <span className="text-sm text-gray-600 font-medium">
                {Math.round(progress)}% complete
              </span>
            </div>
            <Progress value={progress} className="mb-4" />

            {/* Stats Counters */}
            <div className="flex items-center justify-center gap-4">
              <div className="flex items-center gap-2 px-4 py-2 bg-green-50 rounded-lg border-2 border-green-200">
                <TrendingUp className="w-5 h-5 text-green-600" />
                <div>
                  <div className="text-xl font-bold text-green-700">{feedbackCounts.good}</div>
                  <div className="text-xs text-green-600 font-medium">Good</div>
                </div>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-yellow-50 rounded-lg border-2 border-yellow-200">
                <div className="w-5 h-5 flex items-center justify-center text-yellow-600 font-bold text-lg">–</div>
                <div>
                  <div className="text-xl font-bold text-yellow-700">{feedbackCounts.okay}</div>
                  <div className="text-xs text-yellow-600 font-medium">Okay</div>
                </div>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-red-50 rounded-lg border-2 border-red-200">
                <div className="w-5 h-5 flex items-center justify-center text-red-600 font-bold text-xl">✕</div>
                <div>
                  <div className="text-xl font-bold text-red-700">{feedbackCounts.bad}</div>
                  <div className="text-xs text-red-600 font-medium">Bad</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Trace Review Card */}
        <div className="bg-white rounded-xl shadow-elevation-3 border-2 border-gray-200 overflow-hidden mb-6">
          {/* Card Header */}
          <div className="bg-gradient-to-r from-[#4ECFA5]/10 to-[#8EDCC4]/10 px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Calendar className="w-4 h-4" />
                  <span className="font-medium">{formatDate(currentTrace.timestamp)}</span>
                </div>
                <div className="text-sm text-gray-600">
                  • {formatDuration(currentTrace.duration_ms)}
                </div>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-[#4ECFA5] rounded-full">
                <span className="text-xs font-medium text-white/90 mr-1">Score:</span>
                <TrendingUp className="w-4 h-4 text-white" />
                <span className="text-sm font-bold text-white">
                  {Math.round(currentTrace.score * 100)}%
                </span>
              </div>
            </div>
          </div>

          {/* Card Body */}
          <div className="p-6 space-y-6">
            {/* USER INPUT Section */}
            <div>
              <div className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-2 flex items-center gap-2">
                <div className="w-2 h-2 bg-[#4ECFA5] rounded-full"></div>
                USER INPUT
              </div>
              <div className="bg-gray-50 rounded-lg p-4 border-2 border-gray-200">
                <p className="text-[#2A2D35] leading-relaxed">{currentTrace.input}</p>
              </div>
            </div>

            {/* AGENT RESPONSE Section */}
            <div>
              <div className="text-xs font-bold text-gray-600 uppercase tracking-wider mb-2 flex items-center gap-2">
                <div className="w-2 h-2 bg-[#E8967A] rounded-full"></div>
                AGENT RESPONSE
              </div>
              <div className="bg-gradient-to-br from-gray-50 to-white rounded-lg p-4 border-2 border-gray-200">
                <p className="text-[#2A2D35] leading-relaxed whitespace-pre-wrap font-mono text-sm">
                  {currentTrace.output}
                </p>
              </div>
            </div>

            {/* Summary */}
            <div className="pt-4 border-t border-gray-200">
              <p className="text-sm text-gray-600">
                <span className="font-semibold text-gray-700">Model:</span> {currentTrace.metadata.model || 'N/A'}
                {currentTrace.metadata.tokens && (
                  <> • <span className="font-semibold text-gray-700">Tokens:</span> {currentTrace.metadata.tokens}</>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Quick Notes Section */}
        <div className="bg-white rounded-xl shadow-elevation-2 border-2 border-gray-200 p-6 mb-6">
          <div className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-3">
            Quick Notes
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value.slice(0, 500))}
            placeholder="Any observations? Issues? Context?"
            className="w-full h-24 px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#4ECFA5] focus:border-transparent resize-none text-sm"
            maxLength={500}
          />
          <div className="flex justify-between items-center mt-2">
            <div className="text-xs text-gray-600">
              Optional: Add context for this review
            </div>
            <div className={cn(
              "text-xs font-medium",
              notes.length >= 450 ? "text-red-600" : "text-gray-600"
            )}>
              {notes.length}/500
            </div>
          </div>
        </div>

        {/* Feedback Buttons */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Button
            onClick={() => handleFeedback('bad')}
            disabled={submitFeedbackMutation.isPending}
            className="h-20 text-lg font-bold bg-red-500 hover:bg-red-600 text-white border-4 border-red-600 shadow-lg hover:shadow-xl transition-all"
          >
            <div className="flex flex-col items-center gap-1">
              <div className="text-2xl">❌</div>
              <div>Bad</div>
            </div>
          </Button>
          <Button
            onClick={() => handleFeedback('okay')}
            disabled={submitFeedbackMutation.isPending}
            className="h-20 text-lg font-bold bg-amber-500 hover:bg-amber-600 text-white border-4 border-amber-600 shadow-lg hover:shadow-xl transition-all"
          >
            <div className="flex flex-col items-center gap-1">
              <div className="text-2xl">➖</div>
              <div>Okay</div>
            </div>
          </Button>
          <Button
            onClick={() => handleFeedback('good')}
            disabled={submitFeedbackMutation.isPending}
            className="h-20 text-lg font-bold bg-green-500 hover:bg-green-600 text-white border-4 border-green-600 shadow-lg hover:shadow-xl transition-all"
          >
            <div className="flex flex-col items-center gap-1">
              <div className="text-2xl">✅</div>
              <div>Good</div>
            </div>
          </Button>
        </div>

        {/* Keyboard Shortcuts */}
        <div className="bg-white rounded-xl shadow-elevation-2 border-2 border-gray-200 p-6">
          <div className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-4">
            Keyboard Shortcuts
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <kbd className="px-2 py-1 bg-gray-100 rounded border-2 border-gray-300 text-xs font-mono">1</kbd>
              <span className="text-gray-600">Bad</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="px-2 py-1 bg-gray-100 rounded border-2 border-gray-300 text-xs font-mono">2</kbd>
              <span className="text-gray-600">Okay</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="px-2 py-1 bg-gray-100 rounded border-2 border-gray-300 text-xs font-mono">3</kbd>
              <span className="text-gray-600">Good</span>
            </div>
            <div className="flex items-center gap-2">
              <kbd className="px-2 py-1 bg-gray-100 rounded border-2 border-gray-300 text-xs font-mono">A</kbd>
              <span className="text-gray-600">Toggle Auto</span>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-200">
            <p className="text-xs text-gray-600">
              <strong className="text-[#4ECFA5]">Pro tip:</strong> Use keyboard shortcuts for rapid reviewing.
              Auto mode advances automatically after each review. Current trace: {currentIndex + 1}/{totalTraces}
            </p>
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
